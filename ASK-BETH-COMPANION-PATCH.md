# v9.4.0 Ask Beth companion persona patch

Base: v9.3.9 target-aware Mark pointing, itself based on the uploaded v9.3.8 right-click regression fix.

## Added
- Profile-level reading companion selector: Mark or Beth.
- Choice persists in localStorage (`msg_companion_persona_v1`).
- Beth mode dynamically changes companion-specific labels across the app (Ask Mark, Discuss with Mark, Send to Ask Mark, Mark is reading, etc.) while preserving the product name **Mark, Set, Go!**.
- Beth portrait replaces known Mark companion/avatar surfaces, including home avatar, reader photo pointer, and walkthrough presenter.
- Walkthrough gets a Beth-specific portrait placement mode so the profile photo does not use Mark's fingertip geometry.
- New public/root asset: `assets/companions/beth/beth-avatar.png`.
- New root/public runtime: `companion-persona.js`.

## Preserved
- v9.3.8 right-click regression fix.
- v9.3.9 target-aware Mark pointing when Mark is selected.
- Core reader modules are untouched.

## Note
Beth currently uses the supplied photo as her visual asset. The persona system is asset-ready for dedicated Beth reading/pointing illustrations later without changing the preference architecture.
