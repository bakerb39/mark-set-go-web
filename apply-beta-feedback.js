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
      `No changes were written.`
    );
  }
  content = content.replace(anchor, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`beta feedback: patched ${path.relative(root, filePath)}`);
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

patchOnce(
  indexPath,
  '<script defer src="/beta-feedback.js?v=1.0.1"></script>',
  '  <script defer src="/auth.js?v=9.0.4-no-mutation-observer"></script>',
  '  <script defer src="/auth.js?v=9.0.4-no-mutation-observer"></script>\n' +
  '  <script defer src="/beta-feedback.js?v=1.0.1"></script>'
);

console.log('beta feedback: install check complete');
