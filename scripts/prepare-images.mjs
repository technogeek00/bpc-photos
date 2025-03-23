import * as process from 'node:process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import * as dotenv from 'dotenv';
dotenv.config({ path: new URL("../config/.env", import.meta.url) });

// note auth set via environment AIRTABLE_API_KEY
import { default as Airtable } from 'airtable';

// shim in require to get that sweet json parse
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/**
 * General imagery source preparation script, note that its heavily
 * tied to my Lightroom editing flow. We assume there is an exports
 * directory of the following structure
 * - exports/
 *      - <group-name-1>/
 *          - <subject-1>/
 *              - <photo>.jpg
 *              - <photo>.thumb.jpg
 *          - <subject-2>/
 *          - group/
 *              - <groupphoto>.jpg
 *              - <groupphoto>.thumb.jpg
 *      - <group-name-2>/
 *      - <group-name-2>/
 *
 * The names of the groups, subjects, and photos do not matter, but
 * the special "group" folder name does as those will be made available
 * to all subjects. This year it will be copied all over, but next year
 * I'll explore cross-reference access, it just makes zips tricky.
 *
 * Secondarily this is tied to the structure of the Airtable where
 * I track the subjects, contacts, and photo orders. The airtable base
 * configuration is reused to get the subject data.
 *
 * Command Line execution:
 * ./prepare-images.js <prep-directory>
 */

if(process.argv.length < 3) {
    console.error('Must provide directory to prepare');
    console.error(`./prepare-images.mjs <prep-directory>`)
    process.exit(1);
}

// grab DIR_BASE argument, ensure its mainly usable
const DIR_BASE = process.argv[2];
try {
    let stats = await fs.stat(DIR_BASE);
    if(!stats.isDirectory()) {
        throw new Error('Not a directory');
    }
} catch (err) {
    console.error(`Target peparation directory issue: ${DIR_BASE}`);
    console.error(err);
    process.exit(1);
}

// couple other directory basis
const DIR_EXPORTS = path.join(DIR_BASE, "exports");
const DIR_ARRANGED = path.join(DIR_BASE, "arranged");

async function fetchSubjectData() {
    // download subject information from the airtable
    let { airtable } = require('../config/datasources');

    try {
        let base = Airtable.base(airtable.base);
        let records = await base(airtable.table.students.id)
            .select({view: airtable.table.students.viewPrepareImages})
            .all();

        return records.map((record) => {
            return {
                id: record.fields['Site UUID'],
                folder: record.fields['Folder Name'],
                name: record.fields['Student Full Name'],
                group: record.fields['Class']
            }
        });
    } catch (err) {
        console.error('Error thrown fetching subject information from Airtable:');
        console.error(err);
    }

    // failed to fetch
    return null;
}

// now we'll go through the subjects and see if their directory properly validates
async function validateFolderImages(directory) {
    let stat;
    try {
        stat = await fs.stat(directory);
    } catch (err) {
        return `Cannot locate directory: ${directory}`;
    }

    if(!stat.isDirectory()) {
        return `Path is not a directory as expected: ${directory}`;
    }

    let files;
    try {
        files = await fs.readdir(directory);
    } catch (err) {
        return `Unable to get listing of files from directory`;
    }

    let images = {
        full: new Set(),
        thumbs: new Set()
    }
    files.forEach((file) => {
        if(file.endsWith('.thumb.jpg')) {
            images.thumbs.add(file);
        } else if(file.endsWith('.jpg')) {
            images.full.add(file);
        } // ignore extra
    });

    // double check that every image has an accompanying thumbnail
    let missingThumbnails = [...images.full].filter((image) => {
        let name = path.basename(image, '.jpg');
        return !images.thumbs.has(`${name}.thumb.jpg`);
    })
    if(missingThumbnails.length > 0) {
        if(missingThumbnails.length == images.full.size) {
            return `No thumbnails found`;
        } else {
            return `Missing thumbnail subset: ${missingThumbnails.join(', ')}`;
        }
    }

    // null indicates no failures
    return null;
}

async function validateSubject(subject, base) {
    let directory = path.join(base, subject.group, subject.folder);
    return validateFolderImages(directory);
}

async function validateGroup(name, base) {
    let directory = path.join(base, name, 'group');
    return validateFolderImages(directory);
}

async function validateExports(subjects, base, excludeGroups = new Set()) {
    let errors = [];
    let groups = new Set();

    // first validate individual subject directories
    for(let i = 0; i < subjects.length; i++) {
        let subject = subjects[i];
        groups.add(subject.group);
        let issue = await validateSubject(subject, base);
        if(issue) {
            errors.push({
                title: `Subject - ${subject.name} - ${subject.group}`,
                issue: issue
            });
        }
    }

    // next validate the individual group directories
    for(const name of groups) {
        let issue = await validateGroup(name, DIR_EXPORTS);
        if(issue && !excludeGroups.has(name)) {
            errors.push({
                title: `Group - ${name}`,
                issue: issue
            });
        }
    }

    return errors;
}

async function arrangeServerDirectory(subject, sourceBase, targetBase, excludeGroups = new Set()) {
    let subjectDir = path.join(sourceBase, subject.group, subject.folder);
    let sharedDir = path.join(sourceBase, subject.group, 'group');
    let targetDir = path.join(targetBase, subject.id);

    // create uuid based directory for server arrangement
    try {
        await fs.mkdir(targetDir);
    } catch (err) {
        // we do allow exists, this is used to collapse multiple subjects to one upload
        if(err.code !== 'EEXIST') {
            return `Failed to create target directory: ${targetDir} - ${err.code}`;
        }
    }

    // get all files from source directory
    let subjectFiles;
    try {
        subjectFiles = await fs.readdir(subjectDir);
        subjectFiles = subjectFiles.map((file) => path.join(subjectDir, file));
    } catch (err) {
        return `Failed to read file list in source directory: ${subjectDir} - ${err.code}`;
    }

    // get group files that will be shared as well
    let groupFiles = [];
    try {
        groupFiles = await fs.readdir(sharedDir);
        groupFiles = groupFiles.map((file) => path.join(sharedDir, file));
    } catch (err) {
        if(!excludeGroups.has(subject.group)) {
            return `Failed to read file list from shared directory: ${sharedDir} - ${err.code}`;
        }
    }

    // filter to just jpegs and copy over
    let sourceFiles = subjectFiles.concat(groupFiles).filter((file) => file.endsWith('.jpg'));
    let results = await Promise.allSettled(sourceFiles.map((file) => {
        let basename = path.basename(file);
        let target = path.join(targetDir, basename);
        return fs.copyFile(file, target);
    }));

    let failures = results.reduce((failures, result, idx) => {
        let source = sourceFiles[idx];
        if(result.status == 'rejected') {
            failures.push(`${source} - Failed copy operation: ${result.reason}`);
        }
        return failures;
    }, []);

    if(failures.length > 0) {
        return failures.join('\n');
    }

    // if there are no failures, we do need to zip the files too
    console.log(`        Zipping ${sourceFiles.length / 2} JPGs`);
    try {
        execSync(`find ${targetDir}/ -type f -not -name "*.thumb.jpg" | zip -j ${targetDir}/all.zip -@`);
    } catch (err) {
        return `Failure zipping folder: ${err}`;
    }

    // null response indicates no errors
    return null;
}

async function arrangeForServer(subjects, sourceBase, targetBase, excludeGroups = new Set()) {
    let errors = [];

    for(let i = 0; i < subjects.length; i++) {
        let subject = subjects[i];
        console.log(`    Arranging ${subject.id} - ${subject.name}`);
        let error = await arrangeServerDirectory(subject, sourceBase, targetBase, excludeGroups);
        if(error) {
            errors.push({
                title: `Subject - ${subject.name} - ${subject.id}`,
                issue: error
            });
        }
    };

    return errors;
}

console.log(`[LOADING] Fetching subject data`);

let subjects = await fetchSubjectData();
if(subjects == null) {
    console.error('Failure to fetch subject data, see above');
    process.exit(1);
}
if(subjects.length == 0) {
    console.error('No subject data found, base reference likely wrong');
    process.exit(1);
}

console.log(`[VALIDATION] Starting export validation`);

// exclude teacher groups from nested copying
let excludeGroups = new Set(['teachers']);

let errors = await validateExports(subjects, DIR_EXPORTS, excludeGroups);
if(errors.length > 0) {
    console.error('Issues present in the prepared folders');
    errors.forEach(({title, issue}) => {
        console.error(`    ${title}`);
        console.error(`        ${issue}`);
    });
    process.exit(1);
}

console.log(`[VALIDATION] All validations successful`);
console.log(`[ARRANGEMENT] Arranging files for upload`);

try {
    let stats = await fs.stat(DIR_ARRANGED);
    console.error(`Arrangement directory appears to already exist: ${DIR_ARRANGED}`);
    console.error('Script will not overwrite, terminating');
    process.exit(1);
} catch(err) {
    if(err.code !== 'ENOENT') {
        console.error(`Arrangement directory path has resolution error: ${DIR_ARRANGED}`);
        console.error(err);
        process.exit(1);
    }
    // otherwise it doesnt exist and thats good
}

console.log(`[ARRANGEMENT] Creating arrangement directory: ${DIR_ARRANGED}`);

try {
    await fs.mkdir(DIR_ARRANGED);
} catch (err) {
    console.error(`Failed when attempting to make arrangement directory`);
    console.error(err);
    process.exit(1);
}

let arrangeErrors = await arrangeForServer(subjects, DIR_EXPORTS, DIR_ARRANGED, excludeGroups);
if(arrangeErrors.length > 0) {
    console.error('Issues when arranging folders');
    arrangeErrors.forEach(({title, issue}) => {
        console.error(`    ${title}`);
        console.error(`        ${issue}`);
    });
    process.exit(1);
}

console.log(`[ARRANGEMENT] All server directories ready to upload`);
