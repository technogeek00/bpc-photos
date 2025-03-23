// node lib bits
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as https from 'node:https';

// force prep environment with necessary keys and configurations
// note that all keys and configuration are loaded at runtime instead of
// being directly compiled in which means file relativity here is for the
// compiled structure which places 'config' as a sibling to the server file.
// Three configuration sources:
//  - .env - running PORT and TOKEN secrets, uses environment to allow for easy container override
//  - datasources.json - configuration for airtable and local image data
//  - presentation.json - configuration for text on site and photo ordering packages
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, 'config', '.env') });

const DATASOURCES_CONFIG: DatasourcesConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'datasources.json')).toString());
const PRESENTATION_CONFIG: PresentationConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'presentation.json')).toString());

// expressjs server components
import { default as express } from 'express';
import { renderFile as ejsRenderFile } from 'ejs';
import helmet from 'helmet';
import { glob } from 'glob';
import * as bodyParser from 'body-parser';
import * as jwt from 'jsonwebtoken';
import { default as morgan } from 'morgan';

// note auth set via environment AIRTABLE_API_KEY
import { default as Airtable } from 'airtable';

// create app and restrict general pathing
const app = express();
app.set('case sensitive routing', true);
app.set('strict routing', true);
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        }
    }
}));

// body parsers for various posts
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// make sure we log out everything for tracking
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// configure view rendering engine
app.engine('html', ejsRenderFile);
app.set('views', path.join(__dirname, 'pages'));
app.set('view engine', 'html');

// stop the robots
app.get('/robots.txt', (req, res) => {
    res.send([
        'User-agent: *',
        'User-agent: AdsBot-Google', // seems wrong it has to be explicit
        'Disallow: /',
    ].join('\n'))
});

// serve static files from `/static`, these are non-personalized and in the clear
app.use('/static', express.static(path.join(__dirname, 'static'), {
    index: false
}));

// Generates access tokens validating against generation secret
app.post('/token', (req, res) => {
    const { GENERATION_SECRET, TOKEN_SECRET } = process.env;
    let { subject, token, duration } = req.body;

    if(!GENERATION_SECRET || GENERATION_SECRET.length === 0 || !TOKEN_SECRET || TOKEN_SECRET.length === 0) {
        return res.status(500).send({
            success: false,
            reason: 'Server environment is misconfigured, cannot process request.'
        });
    }

    if(!token || !subject) {
        return res.status(400).send({
            success: false,
            reason: 'Missing parameters, token and subject required'
        });
    }

    if(GENERATION_SECRET.localeCompare(token) !== 0) {
        return res.status(401).send({
            success: false,
            reason: 'Invalid generation token'
        });
    }

    // use provided duration or default to 10 minutes
    duration = duration || 10 * 60;
    duration = parseInt(duration, 10);

    // generate access token using token secret
    let payload: BPCToken = {
        subject: subject
    };

    jwt.sign(payload, TOKEN_SECRET, { expiresIn: duration }, (err, token) => {
        if(err) {
            return res.status(500).send({
                success: false,
                reason: 'Server failed to generate token'
            });
        }

        return res.send({
            success: true,
            token: token
        })
    });
});


function validateSubjectAccess(subject: string, token: string, cb: (err?: TokenValidationFailure) => void) {
    const { TOKEN_SECRET } = process.env;

    if(!TOKEN_SECRET || TOKEN_SECRET.length === 0) {
        return cb({
            status: 500,
            reason: 'Server environment is misconfigured, cannot process request.'
        });
    }

    if(!token || token.length == 0) {
        return cb({
            status: 400,
            reason: 'Missing parameter, token required.'
        });
    }

    jwt.verify(token, TOKEN_SECRET, (err, payload: BPCToken) => {
        if(err) {
            return cb({
                status: 401,
                reason: err.message
            });
        }

        if(subject != payload.subject) {
            return cb({
                status: 401,
                reason: 'Provided token does not authorize requested resource'
            });
        }

        // token validated and subject requested matches authorization
        cb();
    });
}

// all routes with user information require the 'subject' parameter
app.param('subject', (req, res, next) => {
    let { subject } = <{subject: string}>req.params;
    let { token } = <{token: string}>req.query;
    // first we validate access to subject prior to any data load
    validateSubjectAccess(subject, token, (err) => {
        if(err) {
            return next(err);
        }

        // subject access properly validated, load up image information
        glob(`${subject}/*.jpg`, {
                cwd: DATASOURCES_CONFIG.images.directory,
                ignore: {
                    ignored: p => /\.thumb\.jpg$/.test(p.name)
                }
            }).then((files) => {
                files.sort((a, b) => a.localeCompare(b))

                // no files is an invalid person
                if(files.length == 0) {
                    return next({
                        status: 404,
                        reason: 'Subject not found.'
                    });
                }

                // we will store it in the body, ensure its initialized
                req.body = req.body || {};
                req.body.subject = {
                    id: subject,
                    images: files.map((file) => path.basename(file, '.jpg')),
                    token: token
                } as PhotoSubject
                next();
            }).catch((err) => {
                return next({
                    status: 500,
                    reason: 'Something went wrong processing the request, try again later.'
                });
            });
    });
})

app.get('/access/:subject', (req, res) => {
    const { token } = <{token: string}>req.query;
    res.render('access', { token });
});

app.post('/access/:subject', (req, res) => {
    const { subject } = <{subject: PhotoSubject}>req.body;
    res.redirect(301, `/view/${subject.id}?token=${subject.token}`);
});

app.get('/view/:subject', (req, res) => {
    const { subject } = <{subject: PhotoSubject}>req.body;

    let config: EmbeddableConfig = {
        site: {
            packages: PRESENTATION_CONFIG.packages
        },
        subject: subject
    }

    res.render('view', { config: JSON.stringify(config) });
});

app.get('/view/:subject/images/:image.jpg', (req, res) => {
    const { image } = <{image: string}>req.params;
    const { subject } = <{subject: PhotoSubject}>req.body;

    // find the true image base, allows for sub-typing of thumbs
    let imageBase = path.basename(image, '.thumb');

    // quick validation that image is in available set
    if(subject.images.indexOf(imageBase) == -1) {
        return res.sendStatus(404);
    }

    res.set({
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, nositelinksearchbox, noimageindex, notranslate'
    });
    res.sendFile(path.join(
        DATASOURCES_CONFIG.images.directory,
        subject.id,
        `${image}.jpg`
    ));
});

// image download path
app.get('/view/:subject/images/download', (req, res, next) => {
    const { subject } = <{subject: PhotoSubject}>req.body;

    // send back the requested zip file
    res.set({
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, nositelinksearchbox, noimageindex, notranslate'
    });
    res.sendFile(path.join(
        DATASOURCES_CONFIG.images.directory,
        subject.id,
        'all.zip'
    ));
});

app.post('/order/:subject', (req, res) => {
    // perform basic order validation
    let { subject, order } = <OrderPictureBody>req.body

    // ensure all posted images are part of subject set
    let orderedImages = new Set(order.map((entry) => entry.id));
    subject.images.forEach((image) => orderedImages.delete(image));

    if(orderedImages.size > 0) {
        return res.status(400).send({
            success: false,
            reason: `Image given that is not in subject set: ${[...orderedImages].join(', ')}`
        });
    }

    // ensure all posted collections exist and are within the defined maximums
    let packageMap = new Map<string, OrderablePackageConfiguration>();
    PRESENTATION_CONFIG.packages.forEach((pkg: OrderablePackageConfiguration) => packageMap.set(pkg.name, pkg));
    let invalidRequests: string[] = [];
    order.forEach((entry) => {
        entry.packages.forEach((pkg) => {
            if(!packageMap.has(pkg.name)) {
                invalidRequests.push(`${entry.id} - Invalid package: ${pkg.name}`);
            } else if(pkg.quantity > packageMap.get(pkg.name)!.maximum) {
                invalidRequests.push(`${entry.id} - Invalid quantity for package: ${pkg.name} - ${pkg.quantity}`);
            }
        });
        if(entry.packages.length == 0) {
            invalidRequests.push(`${entry.id} - No packages specified`);
        }
    });

    if(invalidRequests.length > 0) {
        return res.status(400).send({
            success: false,
            reason: `Invalid order configuration given:\n${invalidRequests.join('\n')}`
        });
    }

    // if we've reached here, the basic checks have passed, send the data to the collection spreadsheet
    const airtable = DATASOURCES_CONFIG.airtable;
    let base = Airtable.base(airtable.base);
    base(airtable.table.students.id)
        .select({
            view: "Complete",
            filterByFormula: `{Site UUID} = '${subject.id}'`
        })
        .all()
        .then((records) => {
            if(records.length == 0 || records.length > 1) {
                throw 'Failed to find matching student';
            }
            return records[0].id;
        })
        .then((studentRecord) => {
            let entries = order.map((entry) => {
                let quantityMap = new Map<string, number>();
                entry.packages.forEach(({name, quantity}) => quantityMap.set(name, quantity));
                let fields: any = {
                    "Student Identifier": [studentRecord],
                    "Image Name": entry.id
                };
                PRESENTATION_CONFIG.packages.map((pkg) => {
                    fields[pkg.name] = quantityMap.get(pkg.name) || 0;
                });
                return {
                    "fields": fields
                };
            });

            return base(airtable.table.orders.id)
                .create(entries);
        })
        .then((data) => {
            res.send({
                success: true
            });
        })
        .catch((err) => {
            res.status(503).send({
                success: false,
                reason: 'Failure pushing data to storage'
            });
        });
});


app.use(function(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
    let message = err.status as string;
    if(err.reason) {
        message = `${message} - ${err.reason}`;
    }

    res.set({
        'Cache-Control': 'max-age=60', // force short age on errors to let cdn come back
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, nositelinksearchbox, noimageindex, notranslate'
    });
    res.status(err.status).render('error', {message: message})
});

// pull certs from local folders relative to the built folder
const options = {
    key: fs.readFileSync(path.join(__dirname, 'certs/private.key')),
    cert: fs.readFileSync(path.join(__dirname, 'certs/certificate.pem'))
};

https.createServer(options, app)
    .listen(process.env.PORT, () => {
        console.log(`Application running on ${JSON.stringify(process.env.PORT)}`);
    });