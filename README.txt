MARK, SET, GO! — PROFILE CHOICES RESTORE

Replace ONLY:
  /public/companion-persona-safe.js
  /public/index.html

ROOT CAUSE

The last script tried to reinstall the companion choices on:
  data-action="profile"

But the actual app route is:
  data-action="profile-preferences"

Also, the Profile page is rendered dynamically after the companion script is
already loaded, so DOMContentLoaded can happen before the Profile DOM exists.

FIX

- Watches #app for dynamic page renders.
- When .profile-preferences-page appears, installs exactly ONE selector:
    Mark | Beth | Chad
- Also listens for the actual profile-preferences route.
- Keeps the existing selected companion in sync.

IMPORTANT

This package DOES NOT:
- change any image file;
- change any companion avatar/icon path;
- replace companion-chad.js;
- replace app.js;
- replace styles.css;
- touch Reader, Analyze, annotations, chat, or article logic.

It only restores the missing Profile choices.
