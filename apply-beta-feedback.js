'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const serverPath = path.join(root, 'server.js');
const indexPath = path.join(root, 'public', 'index.html');

function patchOnce(filePath, marker, anchor, replacement) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(marker)) {
    console.log(`beta feedback: ${path.relative(root, filePath)} already patched`);
    return;
  }
  if (!content.includes(anchor)) {
    throw new Error(
      `Beta feedback install stopped: expected anchor was not found in ${path.relative(root, filePath)}. ` +
      `No changes were written by this patch.`
    );
  }
  content = content.replace(anchor, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`beta feedback: patched ${path.relative(root, filePath)}`);
}

function ensureBrowserScript() {
  let index = fs.readFileSync(indexPath, 'utf8');

  // Already installed: only refresh the beta-feedback asset version.
  if (/\<script\b[^>]*\bsrc=["']\/beta-feedback\.js\?v=[^"']+["'][^>]*\>\<\/script\>/i.test(index)) {
    const upgraded = index.replace(
      /\/beta-feedback\.js\?v=[^"']+/g,
      '/beta-feedback.js?v=1.0.5'
    );
    if (upgraded !== index) {
      fs.writeFileSync(indexPath, upgraded, 'utf8');
      console.log('beta feedback: updated browser asset version to 1.0.5');
    } else {
      console.log('beta feedback: public/index.html already patched');
    }
    return;
  }

  // Do not depend on a particular auth.js cache-buster/version. Any deferred
  // auth.js script is a valid insertion anchor.
  const authScript = /(^[ \t]*<script\b[^>]*\bsrc=["']\/auth\.js(?:\?[^"']*)?["'][^>]*><\/script>[ \t]*$)/im;
  const match = index.match(authScript);

  if (match) {
    index = index.replace(
      authScript,
      `${match[1]}\n  <script defer src="/beta-feedback.js?v=1.0.5"></script>`
    );
    fs.writeFileSync(indexPath, index, 'utf8');
    console.log('beta feedback: patched public/index.html after auth.js');
    return;
  }

  // Last safe fallback: install before </head>. This keeps the installer
  // compatible even if auth.js is later moved or bundled differently.
  if (/<\/head>/i.test(index)) {
    index = index.replace(
      /<\/head>/i,
      '  <script defer src="/beta-feedback.js?v=1.0.5"></script>\n</head>'
    );
    fs.writeFileSync(indexPath, index, 'utf8');
    console.log('beta feedback: patched public/index.html before </head>');
    return;
  }

  throw new Error(
    'Beta feedback install stopped: neither auth.js nor </head> was found in public/index.html. ' +
    'No index changes were written.'
  );
}

patchOnce(
  serverPath,
  "const installBetaFeedback = require('./beta-feedback-server');",
  "const { pool, checkDatabase, databaseConfigured, closeDatabase, query } = require('./db');",
  "const { pool, checkDatabase, databaseConfigured, closeDatabase, query } = require('./db');\n" +
  "const installBetaFeedback = require('./beta-feedback-server');"
);

patchOnce(
  serverPath,
  "installBetaFeedback({\n  app,\n  query,\n  requireAccountUser,",
  "app.get('/api/account/bootstrap', async (req, res) => {",
  "installBetaFeedback({\n" +
  "  app,\n" +
  "  query,\n" +
  "  requireAccountUser,\n" +
  "  clerkConfigured,\n" +
  "  getAuth,\n" +
  "  clerkClient\n" +
  "});\n\n" +
  "app.get('/api/account/bootstrap', async (req, res) => {"
);

ensureBrowserScript();

console.log('beta feedback: install check complete');
