'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const serverPath = path.join(root, 'server.js');
const routesPath = path.join(root, 'cloud-content-routes.js');
const runtimePath = path.join(root, '.server-cloud-runtime.js');

function fatal(message, error) {
  console.error(`[cloud-sync bootstrap] ${message}`);
  if (error?.stack) console.error(error.stack);
  else if (error) console.error(error);
  process.exitCode = 1;
}

try {
  console.log('[cloud-sync bootstrap] Starting additive cloud-content bootstrap.');

  if (!fs.existsSync(serverPath)) {
    throw new Error(`server.js was not found at ${serverPath}`);
  }
  if (!fs.existsSync(routesPath)) {
    throw new Error(`cloud-content-routes.js was not found at ${routesPath}`);
  }

  let source = fs.readFileSync(serverPath, 'utf8');

  const installer = "require('./cloud-content-routes')({ app, query, requireAccountUser });";

  if (!source.includes(installer)) {
    // Find the wildcard SPA fallback without depending on its exact whitespace
    // or callback formatting. New account routes must be registered BEFORE it.
    const fallbackPattern = /app\.get\(\s*(['"`])\*\1\s*,/g;
    const matches = [...source.matchAll(fallbackPattern)];
    const fallback = matches.at(-1);

    if (!fallback || !Number.isInteger(fallback.index)) {
      throw new Error(
        'Could not locate the wildcard SPA fallback in server.js. ' +
        'The original server.js has been left untouched.'
      );
    }

    console.log(
      `[cloud-sync bootstrap] SPA fallback found at character ${fallback.index.toLocaleString()}.`
    );

    source =
      source.slice(0, fallback.index) +
      "\n\n/* Cloud learning-data routes — additive bootstrap */\n" +
      installer +
      "\n\n" +
      source.slice(fallback.index);
  } else {
    console.log('[cloud-sync bootstrap] Cloud-content installer already exists in server source.');
  }

  // Generate a sibling runtime so all relative require() calls and __dirname
  // continue to resolve exactly as they do from the repository root.
  fs.writeFileSync(runtimePath, source, 'utf8');

  console.log('[cloud-sync bootstrap] Generated patched runtime.');
  console.log('[cloud-sync bootstrap] Starting existing server with cloud-content routes.');

  require(runtimePath);
} catch (error) {
  fatal('Startup failed before the application could listen on its port.', error);
}
