# FlexPad decision records

| ADR                                     | Decision                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](ADR-0001-stack.md)               | Vite, React and TypeScript; one stylesheet; no router or CSS framework                                                                  |
| [0002](ADR-0002-storage-and-privacy.md) | The library is IndexedDB, not OPFS; salted position keys; no telemetry                                                                  |
| [0003](ADR-0003-security.md)            | Rendering only through the viewer; strict CSP; same-origin `?src=`; invalid documents open with a warning                               |
| [0004](ADR-0004-vendored-flexova.md)    | `@flexova/*` vendored as tarballs until 0.1.0 is on npm                                                                                 |
| [0005](ADR-0005-pwa-and-hosting.md)     | PWA with an update prompt; Cloudflare Pages; installability checked through Chromium                                                    |
| [0006](ADR-0006-public-agpl.md)         | The repository is public and the code is AGPL-3.0-only; Settings offers the source; no outside PRs until a contributor agreement exists |
| [0007](ADR-0007-cloudflare-workers.md)  | Hosting on Cloudflare Workers static assets (supersedes ADR-0005's Pages hosting)                                                       |
