# Shared visual theme 9.2.4

Presentation-only design-system layer.

- One shared navy / blue / light-blue / bright-gold palette.
- Loaded last so page-specific CSS keeps layout but no longer owns the visual palette.
- Music & Focus legacy pale-green surfaces are overridden by shared blue surfaces.
- Reader settings styling is presentation-only; reader behavior is untouched.
- `app.js` and protected reader modules are unchanged in this patch.
