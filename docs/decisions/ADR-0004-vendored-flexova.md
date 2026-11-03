# ADR-0004: Vendored @flexova packages

- **Status:** Accepted, 2026-11-02 (temporary).

**Decision:** until `@flexova/*` 0.1.0 is on npm, FlexPad depends on `vendor/flexova-core-*.tgz` and `vendor/flexova-viewer-*.tgz`, packed from the flexova repo by `scripts/update-flexova.mjs`, which records the source commit in `vendor/flexova.json`.

**Why:** CI and Cloudflare Pages builds work without access to another repository or registry, and every FlexPad commit pins exact library code.

**When 0.1.0 ships:** replace the `file:` dependencies with `^0.1.0`, delete `vendor/`, and supersede this ADR.
