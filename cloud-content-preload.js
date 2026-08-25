'use strict';

/*
  Mark, Set, Go! cloud-content preload v4

  The real server.js remains the entry script.
  This preload only watches for the existing app.use('/api', ...) middleware.
  Immediately AFTER that middleware is registered, it installs the cloud-content
  routes and restores Express's original .use implementation.

  Resulting order:
    express.json / urlencoded
    Clerk middleware
    existing beta /api middleware
    NEW cloud-content routes
    existing account/application routes
    static files
    existing SPA fallback
    app.listen(...)
*/

try {
  console.log('[cloud-sync preload] Waiting for existing /api middleware.');

  const express = require('express');
  const installCloudContentRoutes = require('./cloud-content-routes');

  const originalUse = express.application.use;
  let installed = false;

  express.application.use = function markSetGoCloudContentUseHook(...args) {
    const result = originalUse.apply(this, args);

    if (!installed && args[0] === '/api') {
      installed = true;

      // Restore Express before adding our routes.
      express.application.use = originalUse;

      console.log('[cloud-sync preload] Existing /api middleware reached; registering account content routes.');
      installCloudContentRoutes(this);
    }

    return result;
  };

  process.once('beforeExit', () => {
    if (!installed) {
      console.warn(
        '[cloud-sync preload] Process is exiting before the expected /api middleware was observed.'
      );
    }
  });
} catch (error) {
  console.error('[cloud-sync preload] Initialization failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
