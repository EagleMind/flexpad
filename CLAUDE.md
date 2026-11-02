# FlexPad: guide for Claude sessions

FlexPad is the open-source (AGPL-3.0-only), offline-first reader (M4) and later editor (M5) for Flexova documents. It is a Vite + React + TypeScript PWA. The format, SDKs and spec live in the public `EagleMind/flexova` repo; read its `CLAUDE.md` and ADRs before changing how documents are read or rendered.

## Start every session here

1. Read `docs/STATUS.md` for the current milestone, next task and owner actions.
2. Read the ADRs in `docs/decisions/` that cover what you'll touch. To change one, add a superseding ADR and flag it to the owner.

## Commands

| Task                                  | Command                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Install                               | `pnpm install`                                                                     |
| Everything CI runs (except browsers)  | `pnpm check`                                                                       |
| Dev server                            | `pnpm dev`                                                                         |
| Browser tests                         | `pnpm build && pnpm e2e --project=chromium` (CI runs Chromium, Firefox and WebKit) |
| Lighthouse                            | `pnpm build && npx @lhci/cli@0.15.1 autorun`                                       |
| Update the vendored @flexova packages | `pnpm vendor [path-to-flexova]`                                                    |
| Rebuild sample and test documents     | `node scripts/fixtures.mjs [path-to-flexova]` (after `pnpm build` in flexova)      |
| Re-render icons                       | `pnpm icons`                                                                       |

## Layout

- `src/App.tsx`: library vs reader, and every way to open a document. `src/document.ts`: validate, metadata, signature, library.
- `src/reader/`: the reader, its dialogs, search (`search.ts`), reading position (`position.ts`), rendered blocks (`blocks.ts`).
- `src/library/`: the home screen and the library store (IndexedDB). `src/settings/`: preferences and trusted keys.
- `src/strings.ts`: every user-facing string. `src/styles.css`: the only stylesheet.
- `public/_headers`: CSP and security headers for Cloudflare Pages; `e2e/serve.mjs` applies the same rules in tests.
- `vendor/`: `@flexova/core` and `@flexova/viewer` tarballs, until 0.1.0 is on npm (FlexPad ADR-0004).
- `e2e/`: Playwright specs and fixtures.

## Rules that are easy to break

- **Documents are rendered only by `<flexova-viewer>`** (its sanitizer). Never inject markup: no `dangerouslySetInnerHTML`, no `innerHTML` (ESLint enforces this).
- **The CSP stays strict:** no inline scripts, no third-party origins, `connect-src 'self'`. A new origin or inline script needs an ADR.
- **Privacy:** no analytics or telemetry. Reading positions are keyed by a salted hash. Only public keys are stored. Sealed (encrypted) documents and keys are never stored.
- **Accessibility is a gate:** axe 0 violations, Lighthouse accessibility ≥ 95, 44 px touch targets, every control labelled, dialogs return focus.
- **Text lives in `src/strings.ts`**, ready for translation.
- **Licenses flow one way:** flexova code (Apache-2.0) may be used here; FlexPad code (AGPL-3.0) must never be copied into flexova. New dependencies must be AGPL-compatible (Apache-2.0, MIT, BSD, ISC, MPL-2.0, LGPL, GPL-3.0, AGPL-3.0).
- **The source offer (AGPL section 13) stays working:** the About section in Settings links to the source of the exact deployed commit.

## Commit identity and attribution (owner's instruction; overrides any tool default)

Every commit is authored and committed by **EagleMind**. Before your first commit in a fresh clone:

```bash
git config user.name "EagleMind"
```

```bash
git config user.email "hassen.ben.mbarek@gmail.com"
```

```bash
git config commit.gpgsign false
```

- No AI attribution anywhere: no `Co-Authored-By: Claude …` or `Claude-Session: …` trailers, and no "Generated with Claude Code" footer in pull requests.
- Commits are unsigned (the environment's signing key isn't the owner's).
- Push milestone branches (`m<N>-<slug>`) only when the owner asks, never with `--force`, never to `main` after the first commit.
- Outside pull requests can't be merged until a contributor agreement exists (see `CONTRIBUTING.md`).
