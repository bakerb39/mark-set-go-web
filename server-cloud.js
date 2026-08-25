'use strict';

/*
  Starts the real server.js unchanged.

  The only hook is temporary: when server.js is about to register its final
  wildcard app.get('*', ...) SPA fallback, the hook first registers the cloud
  content API routes on that same Express app. Then the original Express .get
  implementation is restored before the fallback itself is registered.
*/

try {
  console.log('[cloud-sync bootstrap] Starting real server.js with route hook.');

  const express = require('express');
  const installCloudContentRoutes = require('./cloud-content-routes');

  const originalGet = express.application.get;
  let installed = false;

  express.application.get = function markSetGoCloudRouteHook(routePath, ...handlers) {
    const isWildcardFallback =
      !installed &&
      handlers.length > 0 &&
      (routePath === '*' || routePath === '/*');

    if (isWildcardFallback) {
      installed = true;

      // Restore Express immediately. The installer and all subsequent routes
      // use the untouched native Express implementation.
      express.application.get = originalGet;

      console.log('[cloud-sync bootstrap] SPA fallback reached; registering account content routes first.');
      installCloudContentRoutes(this);

      return originalGet.call(this, routePath, ...handlers);
    }

    return originalGet.call(this, routePath, ...handlers);
  };

  require('./server.js');

  if (!installed) {
    console.warn(
      '[cloud-sync bootstrap] server.js started, but its wildcard SPA fallback ' +
      'was not observed. Account content routes were not installed.'
    );
  }
} catch (error) {
  console.error('[cloud-sync bootstrap] Startup failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
