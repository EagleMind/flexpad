# ADR-0007: Hosting on Cloudflare Workers static assets

- **Status:** Accepted, 2026-11-02.
- **Supersedes** ADR-0005's "Hosting: Cloudflare Pages" row. The rest of ADR-0005 (service worker, updates, manifest, installability) stands.

## Decision

FlexPad is deployed as a **Cloudflare Worker with static assets only**, configured in `wrangler.jsonc`:

- `assets.directory: ./dist`;
- `not_found_handling: single-page-application`, so unknown paths serve `index.html`.

Workers Builds runs these commands:

| Builds              | Command                                                   |
| ------------------- | --------------------------------------------------------- |
| Every build         | `pnpm build`                                              |
| Production (`main`) | `npx wrangler deploy`                                     |
| Other branches      | `npx wrangler versions upload`, which gives a preview URL |

`wrangler` is a pinned devDependency.

## Why

- Cloudflare now steers new projects to Workers, and the owner's account was set up that way.
- Workers static assets honor `public/_headers` (CSP and security headers) just as Pages did.
- There is no server code to maintain.
- The deploy credentials stay in Cloudflare's dashboard, never in this public repository.

## Consequences

- **`pnpm deploy:check`** validates the configuration and the asset list without credentials.
- **The AGPL source offer finds the deployed commit through git,** since Workers Builds clones the repository.
- **`wrangler dev` isn't used.** pnpm 10 skips the install scripts of `workerd` and `esbuild`, which only serve it, and prints an "Ignored build scripts" notice on install. The notice is expected and harmless: deploys upload static files and need neither.
