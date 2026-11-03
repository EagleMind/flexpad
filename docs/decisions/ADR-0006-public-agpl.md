# ADR-0006: Public repository, AGPL-3.0

- **Status:** Accepted, 2026-11-02.
- **Supersedes** the "proprietary FlexPad in a private repository" part of the build plan and of flexova ADR-0009 (see flexova ADR-0016).

## Decision

FlexPad's repository is public, and its code is licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`).

## Consequences

| Consequence                                                                                                    | How it's handled                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone who runs a modified FlexPad for others over a network must offer them its source (section 13).          | FlexPad itself complies: Settings → About links to the source of the exact deployed commit (from `CF_PAGES_COMMIT_SHA`, `GITHUB_SHA` or git), plus the license. An e2e test guards it. |
| Dual licensing (AGPL plus a commercial license) stays possible only if the owner holds the rights to all code. | No outside pull requests until a contributor agreement exists (`CONTRIBUTING.md`; owner action).                                                                                       |
| Dependencies must be AGPL-compatible.                                                                          | Today: Apache-2.0 (`@flexova/*`), MIT and ISC. `CLAUDE.md` lists the allowed licenses.                                                                                                 |
| Code must not flow from FlexPad into flexova (Apache-2.0).                                                     | Recorded in both repos' `CLAUDE.md`. Flexova code may be used here.                                                                                                                    |
| Everything in the repository is public.                                                                        | There were never secrets in it: Cloudflare Pages is connected from the dashboard, and CI needs no tokens. Security reports go through GitHub's private vulnerability reporting.        |
| GitHub Actions minutes are free for public repositories.                                                       | The private-repository minutes note is gone from STATUS.                                                                                                                               |

"AGPL-3.0-only", not "or later", leaves any move to a future AGPL version to the owner.
