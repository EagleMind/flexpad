# Status

**Current milestone:** M4, FlexPad web reader (in review, branch `m4-reader`)
**Next task:** M5.1, the editor (Tiptap with a schema generated from the Flexova profile)

## Owner actions

- [ ] **Decide on a contributor agreement** before accepting outside pull requests (needed to keep dual licensing possible; see ADR-0006).
- [ ] **Turn on private vulnerability reporting:** GitHub → flexpad → Settings → Security → Private vulnerability reporting.
- [ ] **Deploy on Cloudflare Workers** (ADR-0007). Connect FlexPad, not the flexova SDK repository:
  - Workers & Pages → Create → Import a repository → `EagleMind/flexpad`, with name `flexpad`.
  - Build command: `pnpm build`. Deploy command: `npx wrangler deploy`. Non-production branch deploy command: `npx wrangler versions upload`.
  - Settings → Build → Branch control: production branch `main`; turn on **Builds for non-production branches** (that's how `m4-reader` gets a preview URL before it merges).
  - Delete the earlier Worker connected to `EagleMind/flexova`.
- [ ] **Test on real devices** using the `m4-reader` preview URL (shown in the Worker's build log and Deployments tab):
  - iPhone (Safari) and Android (Chrome): open the sample, use Contents, Search, text size and theme;
  - install to the home screen, open a `.flexova` file from Files/Downloads;
  - switch to airplane mode, reopen FlexPad, open a document from the library;
  - note anything that feels wrong in `docs/STATUS.md` or tell a Claude session.
- [ ] After `@flexova/*` 0.1.0 is on npm: switch from `vendor/` to npm versions (ADR-0004).

## Milestones

### M4: Web reader · in review

- [x] Opening: file picker (`showOpenFilePicker` with an input fallback), drag and drop, File Handling API (`launchQueue`), same-origin `?src=`, a sample document
- [x] Reader on `<flexova-viewer>`: contents drawer, full-text search (lazy MiniSearch index), text size, theme, print, document info
- [x] Signatures: shown in Info; verified against publisher keys imported in Settings (public keys only)
- [x] Invalid documents open safely with their problems listed; hostile documents are neutralized
- [x] Library: last 20 documents or 200 MB on the device (IndexedDB), with Remove and Clear
- [x] Reading position restored per document (salted keys)
- [x] PWA: precached shell, update prompt, manifest with file handlers, icons; CSP and security headers
- [x] Public repository under AGPL-3.0-only, with the source offer in Settings → About (ADR-0006)
- [x] Tests:
  - 10 unit tests;
  - 28 browser tests on Chromium: opening, every tool, signatures, bad documents, library and position persistence, offline with the server stopped, axe (0 violations) on every screen and dialog, 4 widths × 2 themes with no horizontal scrolling, installability, the AGPL source link;
  - Lighthouse (local run): performance 100, accessibility 100, best practices 100.
- [x] Chromium, Firefox and WebKit green in CI, along with Lighthouse. Two fixes were needed: library documents are now stored as ArrayBuffers (WebKit refuses Blobs in IndexedDB in private browsing), and a jump's target is held in place while chapters render (no scroll anchoring for this in WebKit or Firefox).
- [ ] Known flake: in Firefox, one test per run can time out on its first page load and pass on retry (CI retries once). The cause isn't identified yet; the Playwright trace is in the run's `playwright-report-firefox` artifact.
- [ ] Real-device check (owner)

### M5: Editor (L)

Tiptap/ProseMirror with a schema generated from `profile-1.0.json`, images (WebP), theme editor with contrast checks, DOCX import (mammoth.js), save to `.flexova`, export `.flexova.html` and PDF.

### M6: Pilot release

Docs site, production deployment, IANA registration, pilot feedback.
