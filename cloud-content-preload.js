'use strict';

/*
  Mark, Set, Go! stable beta-gate preload v6.

  server.js remains the real application and remains UNMODIFIED.

  The beta middleware currently declared in server.js performs a fresh Clerk
  user-profile network lookup for every protected /api request. If that lookup
  intermittently fails, server.js responds:

      Unable to verify beta access.

  This preload intercepts ONLY the existing app.use('/api', betaMiddleware)
  registration point. At that exact point it:

    1. restores Express.prototype.use immediately
    2. registers account content-sync routes
    3. registers a replacement private-beta gate
    4. intentionally DOES NOT register the old beta middleware

  The replacement gate uses:
    - the already-authenticated Clerk request user id
    - BETA_ALLOWED_USER_IDS directly, OR
    - the user's email already stored in app_users
    - BETA_ALLOWED_EMAILS

  No second Clerk user-profile network request is made by the beta gate.

  Public endpoints that server.js defines before this point remain public:
    /api/auth/config
    /api/auth/session
    /api/account
    /api/health

  All application API routes registered after this point remain protected.
*/

try {
  console.log('[stable-beta preload] Waiting for existing private-beta /api middleware.');

  const express = require('express');
  const { getAuth } = require('@clerk/express');
  const { query, databaseConfigured } = require('./db');
  const installCloudContentRoutes = require('./cloud-content-routes');

  const BETA_ACCESS_ENABLED = /^(1|true|yes|on)$/i.test(
    String(process.env.BETA_ACCESS_ENABLED || '').trim()
  );

  const CLERK_PUBLISHABLE_KEY = String(
    process.env.CLERK_PUBLISHABLE_KEY || ''
  ).trim();

  const CLERK_SECRET_KEY = String(
    process.env.CLERK_SECRET_KEY || ''
  ).trim();

  const clerkConfigured = Boolean(
    CLERK_PUBLISHABLE_KEY && CLERK_SECRET_KEY
  );

  const BETA_ALLOWED_EMAILS = new Set(
    String(process.env.BETA_ALLOWED_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );

  const BETA_ALLOWED_USER_IDS = new Set(
    String(process.env.BETA_ALLOWED_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  async function stableBetaGate(req, res, next) {
    if (!BETA_ACCESS_ENABLED) return next();

    if (!clerkConfigured) {
      return res.status(503).json({
        error:'Beta access requires Clerk authentication.'
      });
    }

    const auth = getAuth(req);

    if (!auth?.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        error:'Sign in is required during the private beta.'
      });
    }

    const authSubject = String(auth.userId || '').trim();

    if (BETA_ALLOWED_USER_IDS.has(authSubject)) {
      return next();
    }

    if (!databaseConfigured()) {
      return res.status(503).json({
        error:'The account database is not configured.'
      });
    }

    try {
      const result = await query(
        `select email
         from app_users
         where auth_subject = $1
         limit 1`,
        [authSubject]
      );

      const account = result.rows[0];

      if (!account) {
        return res.status(409).json({
          error:'Account session must be initialized before beta access can be verified.'
        });
      }

      const email = String(account.email || '').trim().toLowerCase();

      if (email && BETA_ALLOWED_EMAILS.has(email)) {
        return next();
      }

      return res.status(403).json({
        error:'This account is not approved for the private beta.'
      });
    } catch (error) {
      console.error('[stable-beta preload] Database beta access check failed:', error);

      return res.status(500).json({
        error:'Unable to verify beta access from the account database.'
      });
    }
  }

  const originalUse = express.application.use;
  let installed = false;

  express.application.use = function markSetGoStableBetaUseHook(...args) {
    const isExistingApiGate =
      !installed &&
      args[0] === '/api' &&
      args.length >= 2;

    if (!isExistingApiGate) {
      return originalUse.apply(this, args);
    }

    installed = true;

    express.application.use = originalUse;

    console.log(
      '[stable-beta preload] Existing private-beta /api gate reached.'
    );

    installCloudContentRoutes(this);

    originalUse.call(this, '/api', stableBetaGate);

    console.log(
      '[stable-beta preload] Stable private-beta gate registered; old Clerk profile lookup gate skipped.'
    );

    // Intentionally do not register the middleware function supplied in args;
    // that is server.js's old beta gate.
    return this;
  };

  process.once('beforeExit', () => {
    if (!installed) {
      console.warn(
        '[stable-beta preload] Process exited before the expected private-beta /api middleware was observed.'
      );
    }
  });
} catch (error) {
  console.error('[stable-beta preload] Initialization failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
