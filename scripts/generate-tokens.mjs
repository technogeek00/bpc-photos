import * as fs from 'node:fs/promises';
import { google } from 'googleapis';

// shim in require to get that sweet json parse
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// setup environment from dot file, resolve with require for the fun path stuff
import * as dotenv from 'dotenv';
dotenv.config({ path: require.resolve('../config/.env')});

if(process.argv.length < 3) {
    console.error('Must provide token output file');
    console.error('./generate-tokens.mjs <output-file>');
    process.exit(1);
}

// establish the output file now
const OUTPUT_FILE = process.argv[2];

async function fetchSubjectData() {
    // download subject information from the googlesheet
    let { googlesheet } = require('../config/datasources');

    const googleAuth = new google.auth.GoogleAuth({
        credentials: googlesheet.auth,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({
        version: 'v4',
        auth: googleAuth
    });

    try {
        let query = await sheets.spreadsheets.values.get({
            spreadsheetId: googlesheet.id,
            range: googlesheet.ranges.information
        });

        let values = query.data.values || [];
        return values.map((row) => {
            return {
                id: row[0],
                folder: row[1],
                name: {
                    first: row[3],
                    last: row[2]
                },
                group: row[4]
            }
        });
    } catch (err) {
        console.error('Error thrown fetching subject information from Google Sheet:');
        console.error(err);
    }

    // failed to fetch
    return null;
}

console.log(`[LOADING] Fetching subject data`);

let subjects = await fetchSubjectData();
if(subjects == null) {
    console.error('Failure to fetch subject data, see above');
    process.exit(1);
}
if(subjects.length == 0) {
    console.error('No subject data found, spreadsheet reference likely wrong');
    process.exit(1);
}

console.log(`[GENERATING] Creating tokens for all subjects`);

async function generateToken(id) {
    let uri = `${process.env.PHOTO_HOST}/token`;
    let body = {
        token: process.env.GENERATION_SECRET,
        subject: id,
        duration: 30 * 24 * 60
    };

    let response = await fetch(uri, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if(!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
    }

    let result = await response.json();
    if(!result.success) {
        throw new Error(`Token generation provided error: ${result.reason}`);
    }
    return result.token;
}

let tokens = [];
for(let subject of subjects) {
    try {
        console.log(`[GENERATING] ${subject.id} - ${subject.name.first} ${subject.name.last}`);
        let token = await generateToken(subject.id);
        tokens.push({
            id: subject.id,
            token: token
        });
    } catch (err) {
        console.error(`    [ERROR] ${err.message}`)
    }
}

console.log(`[STORING] Writing tokens to ${OUTPUT_FILE}`);

// generate csv of tokens
let output = tokens.map((token) => `"${token.id}","${token.token}"`).join('\n');
output = `ID,Token\n${output}`;
await fs.writeFile(OUTPUT_FILE, output);

console.log(`[COMPLETE]`);