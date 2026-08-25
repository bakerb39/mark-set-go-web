'use strict';

/*
  Mark, Set, Go! server bootstrap with additive cloud-content routes.

  This deliberately DOES NOT replace server.js. It reads the exact server.js
  present in the deployment, injects the account-content route installer before
  the existing SPA catch-all, and compiles that source as server.js.
*/

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const filename = path.join(__dirname, 'server.js');
let source = fs.readFileSync(filename, 'utf8');

const spaFallback = "app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));";
const installLine = "require('./cloud-content-routes')({ app, query, requireAccountUser });";

if (!source.includes(spaFallback)) {
  throw new Error(
    'Cloud-content bootstrap could not find the current SPA fallback in server.js. ' +
    'The original server.js was not started because route ordering could not be guaranteed.'
  );
}

if (!source.includes(installLine)) {
  source = source.replace(spaFallback, `${installLine}\n\n${spaFallback}`);
}

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(__dirname);
compiled._compile(source, filename);
