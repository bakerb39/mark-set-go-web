'use strict';

/*
  Cloud-content preload v5.

  The normal server.js remains the actual program.

  Registration order:
    1. existing express.json/urlencoded
    2. existing Clerk middleware
    3. NEW account content routes
    4. existing private-beta /api middleware
    5. all existing application routes

  The three cloud-content endpoints perform their own beta allowlist check using:
    - the authenticated Clerk user ID already available on the request
    - the account email already stored in app_users
    - BETA_ALLOWED_USER_IDS / BETA_ALLOWED_EMAILS

  This avoids the existing beta middleware's extra Clerk users.getUser() network
  request, which was returning "Unable to verify beta access."
*/

try {
  console.log('[cloud-sync preload] Waiting for existing private-beta /api middleware.');

  const express = require('express');
  const installCloudContentRoutes = require('./cloud-content-routes');

  const originalUse = express.application.use;
  let installed = false;

  express.application.use = function markSetGoCloudContentUseHook(...args) {
    const isExistingApiGate =
      !installed &&
      args[0] === '/api' &&
      args.length >= 2;

    if (isExistingApiGate) {
      installed = true;

      // Restore Express before registering anything.
      express.application.use = originalUse;

      console.log(
        '[cloud-sync preload] Private-beta /api gate reached; registering sync routes immediately before it.'
      );

      installCloudContentRoutes(this);

      // Now register the application's original beta middleware exactly as server.js intended.
      return originalUse.apply(this, args);
    }

    return originalUse.apply(this, args);
  };

  process.once('beforeExit', () => {
    if (!installed) {
      console.warn(
        '[cloud-sync preload] Process is exiting before the expected private-beta /api middleware was observed.'
      );
    }
  });
} catch (error) {
  console.error('[cloud-sync preload] Initialization failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
