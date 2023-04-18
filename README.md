# BPC Photos Site

# About
This repository contains a small photo viewing and ordering website that was created in support of my kids preschool. I was able to take the time to photograph all the children for their school year photo and we wanted to give parents an easy way to access digital copies and order prints while keeping the childrens imagery safe online.

This was done as a hobby project for limited use, be wary of your own use.

# Technical Overview

## General Notes
The frontend is written in [Typescript](https://typescriptlang.org/) using a MVVM pattern which is enabled by the [Quickdraw](https://github.com/hulu/quickdraw) binding library. Yes not the latest and greatest thing, but still have so much love for that little framework. The backend is a NodeJS client, also written in Typescript, using the [ExpressJS](https://expressjs.com/) framework using [Helmet](https://helmetjs.github.io/) for basic endpoint hardening.

The application is not backed by an active datastore instead relying on a structured filesystem to enable serve. This choice was made as there is no general browse or search functionality within the site, instead each family/student can only see their own pictures and there is no accompanying metadata outside the image itself meaning that a simple unique directory handles this just fine. This does have a downside as the picture orders cannot be submitted and saved to the system, so instead they are pushed into a Google Spreadsheet which is used to track the order fulfillment. Given the scale of this effort, once a year for about 80 students, this is a fine trade off.

The last general note is that this was written as quickly as possible after taking the students pictures in order to get the pictures to them. Maybe next year we'll clean up the cruft a bit.

## File / Directory Structure

| Directory | Description |
|-----------|-------------|
| `bin` | Compiled source directory, see running for more details |
| `certs` | SSL certificates `certificate.pem` and `private.key` which must be supplied and never checked in |
| `config` | Configuration files for use during runtime, see [configuration](#configuration) for more details |
| `scripts` | Helper scripts created to bridge upload gaps as I simplified to get things out the door |
| `src` | General source directory, server and client sources are combined as models are used across |
| `src.html` | HTML templates in EJS format |
| `src.static` | Static resources that can be served without protection |
| `src.ts` | Typescript source files for both server and client components |
| `src.ts.libs` | Import point for runtime libraries that need wrapping / shimming prior to use |
| `src.ts.types` | Declared typings for various objects and surfaces |
| `src.ts.viewmodels` | Constructable models used within the frontend |
| `src.ts.views` | Support code for individual views in the frontend |

## User Interaction Flow

This is a mildly atypical site as there is no general browsing or search behavior, instead it is intended for the distribution of individual photo packages with lightweight individualized security. The creation and distribution of access is not in the realm of responsibilities for this server, another entity must manage the identification and general authorization to produce an access token. The expected flow for this at the time of this writing is a simple script run against a csv of subjects which generates an individualized access token for each via `/token` and sends it to a well-known email.

Starting from the distribution of the access token, the user flow beings at `/access/:subject?token=:token`. This is a simple jump through greeting page which is meant to prevent mail crawlers from accessing and indexing any of the available pictures. Users simply click the big continue button on the page to trigger a POST request to `/access/:subject` with a body of the original `:token` which will redirect to the next flow.

Successful users going through the access flow are routed to `/view/:subject` which is a combination gallery and order page. The top of the page provides gallery access to all the images with download buttons for individual images (`/view/:subject/images/:image.jpg`) and the entire gallery (`/view/:subject/images/download`).

If a user wishes to order pictures they can select order to add an image to their cart. In the cart users select the quantity of different print packages per picture as specified by the runtime configuration. Users clicking submit will `POST` the order to `/order/:subject`, which after validation, will post the order to a Google Spreadsheet for tracking towards fulfillment.

# Configuration

There are three types of configuration used within the project and each have a varying function. Each file should be found in the `config` project folder.

## Environment Configuration

The environment configuration is located in the `config/.env` file and contains the following keys:

| Key | Description |
|-----|-------------|
| `PORT` | The port to run the server on |
| `TOKEN_SECRET` | The secret used to encrypt JWT tokens |
| `GENERATION_SECRET` | The secret that must be supplied to the `/token` endpoint to generate encrypted JWT tokens |

These are loaded with dotenv which means that supplying these parameters in the runtime environment _will take precedence_ over the values specified in this file. This file is basically for ease of deployment and development purposes and is never to be checked in.

## Datasource Configuration

The datasource configuration is located in the `config/datasources.json` file and is of the following shape:

| Object Key | Type | Description |
|------------|------|-------------|
| `googlesheet` | `object` | An object containing the googlesheet datasource configurations |
| `googlesheet.id` | `string` | The object id of the google sheet to interact with |
| `googlesheet.range` | `string` | The spreadsheet range to post data into in cell notation, ex `"'Sheet 1'!A1:J1"` |
| `googlesheet.auth` | `object` | An object containing the google api authentication information |
| `images` | `object` | An object containing the images datasource configurations |
| `images.directory` | `string` | A local file system path where the subject images are mounted |

This file must exist, but due to the sensitivity of contained information must never be checked in.

## Presentation Configuration

The presentation configuration is located in the `config/presentation.json` file and is of the following shape:

| Object Key | Type | Description |
|------------|------|-------------|
| `name` | `string` | The website title string |
| `icon` | `string` | The filename of the icon image to use, expected to be in the `src/static/images` folder |
| `text` | `object` | An object containing key/value pairs that are accessible during view rendering, see checked-in config or templates for keys |
| `packages` | `object[]` | An array of photo packages that are available for purchase |
| `packages[].name` | `string` | The name of the photo package |
| `packages[].type` | `enum<"collection"|"a-la-carte">` | The type of the photo package, either `"collection"` or `"a-la-carte"` |
| `packages[].description` | `string` | A textual description of the photo package |
| `price` | `number` | The per item pricing of the photo package |
| `maximum` | `number` | The maximum purchase quanity for the photo package for a single photo |

This file must exist and the values should be assumed to be user facing. Generally there is no identifying information so the file is safe to check in.

# Development

## Toolchain Setup / Use

The general compilation and runtime toolchain can be installed with `npm install`. Development was primarily done against Node v18.15.0, do not expect any version prior to that to work.

Basic manipulation commands are provided in the `package.json` file:

| Name | Executed Command | Description |
|------|------------------|-------------|
| `clean` | `rm -fR bin` | Wipes the compiled and arranged sources from the directory tree |
| `build` | `npm run clean && npx webpack` | Cleans and then compiles the source |
| `dev` | `npm run build && npm run start` | Builds and then auto starts the server |
| `start` | `node ./bin/server.js` | Starts the compiled server, does not auto compile |

## Expected Files

See [configuration](#configuration) for the files that should be created within the `config` folder.

The server expects to run as SSL utilizing predefined certificates placed in the `certs` folder:

| Filename | Description |
|----------|-------------|
| `certificate.pem` | The certifiate PEM file |
| `private.key` | The private key for the certificate |

Without the expected files the server will not properly start.

## Build File Manipulation

The build process is pretty rudamentry right now as its just whatever we can twist Webpack into outputing.

Webpack has two configurations, one for the frontend components and one for the backend components, both are always executed together with the results output in the `bin` folder.

### Frontend Configurations

The frontend is configured to build each page as a separate entry point, using the individual page javascript files as the entries. This does mean for pages without javascript it is targeting an empty file, but this allows us to use the same template fetch and render mechanics without complicating the config even more. Each page is rendered through the [`HtmlWebpackPlugin`](https://webpack.js.org/plugins/html-webpack-plugin/). Note that this means each source html file is run through the lodash [`_.template`](https://lodash.com/docs/4.17.15#template) at build time and then the resulting file is run through [EJS](https://ejs.co/) by ExpressJS for runtime injection, so pay attention to the double escapes!

The resulting pages are output into `bin/pages` folder. While the `js` files are still output they are unnecessary as the scripts are inlined by the templates.

### Backend Configurations

The backend is configured to build the server and perform the file copies for configuration and static files. The results are output directly in the `bin` folder.

## Final Output Structure

Post compilation the `bin` folder will have the following structure

| Path / Filename | Description |
| `bin/certs` | The cert files copied from the main directory |
| `bin/config` | The configuration files copied from the main directory |
| `bin/pages` | Fully generated view page templates |
| `bin/static` | Files that will be statically served by the server without authentication |
| `bin/server.js` | The compiled server entry point |

# Photo Data Structure

Right now the photo data structure is really rudimentry:

```
/path/to/photos/
  | subject-1/
    | all.zip               <-- zip file containing all files in the folder
    | image-1.jpg           <-- Full sized image
    | image-1.thumb.jpg     <-- Thumbnail sized version of image with same name
    | image-2.jpg
    | image-2.thumb.jpg
    ...
  | subject-2/
  | subject-3/
  ...
```

There is no expectation made about the names of the subject folders or individual images, but the zip file per directory must be called `all.zip`. The subjects are _not_ expected to be their names, instead UUIDs are preferred for the privacy of the children, again this means a secondary source must match them.

The scripts found in `scripts` operate on this expected structure

| Script | Description |
|--------|-------------|
| `generate-tokens.sh` | Iterates over the photo directory collecting subject identifiers and generating an access token for each identifier by calling the supplied token endpoint |
| `upload-prep.sh` | As I manually edit all the photos and organize by name which I don't want to use on the site, this script goes through and shuffles all the processed photos in a source directory to a staged directory using a UUID supplied per directory in `uuid.txt` as the new identifier. The zipping of files is also done by this script. |

# Future Thoughts

Future years may bring improvements, couple ideas in my head with no ordering:

- [ ] More modern UI rendering conventions / framework
- [ ] Script integration to Google Sheets for anonymization and image upload preparation
- [ ] Source organization to better split client / server
- [ ] Full dockerization of build and runtime environments
- [ ] Enable local development without SSL
- [ ] Generate zip files on request instead of prepositioning
- [ ] Generate thumbnail images on request instead of prepositioning