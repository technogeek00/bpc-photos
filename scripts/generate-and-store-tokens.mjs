// setup environment from dot file
import * as dotenv from 'dotenv';
dotenv.config({ path: new URL("../config/.env", import.meta.url) });

// note auth set via environment AIRTABLE_API_KEY
import { default as Airtable } from 'airtable';

// shim in require to get that sweet json parse
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

async function fetchSubjectData() {
    // download subject information from the airtable
    let { airtable } = require('../config/datasources');

    try {
        let base = Airtable.base(airtable.base);
        let records = await base(airtable.table.students.id)
            .select({view: airtable.table.students.viewComplete})
            .all();

        return records.map((record) => {
            return {
                id: record.fields['Site UUID'],
                folder: record.fields['Folder Name'],
                name: record.fields['Student Full Name'],
                group: record.fields['Class'],
                token: record.fields['Token'],
                record: record
            }
        });
    } catch (err) {
        console.error('Error thrown fetching subject information from Airtable:');
        console.error(err);
    }

    // failed to fetch
    return null;
}

console.log(`[LOADING] Fetching student data`);

let subjects = await fetchSubjectData();
if(subjects == null) {
    console.error('Failure to fetch subject data, see above');
    process.exit(1);
}
if(subjects.length == 0) {
    console.error('No subject data found, base reference likely wrong');
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
        console.log(`[GENERATING] ${subject.id} - ${subject.name}`);
        let token = await generateToken(subject.id);
        console.log(`[SAVING] ${subject.id} - ${subject.name}`);
        tokens.push({
            id: subject.id,
            token: token
        });
    } catch (err) {
        console.error(`    [ERROR] ${err.message}`)
    }
}

// todo save back to airtable