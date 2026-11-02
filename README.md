# FlexPad

The offline-first reader for [Flexova](https://github.com/EagleMind/flexova) (`.flexova`) documents: a web app you can install on phones, tablets and desktops.

- Open documents from the file picker, by drag and drop, from the operating system (desktop Chromium), or by same-origin link (`?src=`).
- Read with a table of contents, full-text search, adjustable text size, light and dark themes, and printing.
- Reopen recent documents offline, at the place you left off.
- See who signed a document, verified against publisher keys you trust.

## License

FlexPad is free software under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`):

- you may use, study, change and share it;
- if you run a modified FlexPad for other people to use over a network, you must offer them its source code.

It reads documents with the [Flexova SDK](https://github.com/EagleMind/flexova) (Apache-2.0). See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Status and next steps: [`docs/STATUS.md`](docs/STATUS.md).

## Development

Requires Node 22.18+ (via corepack) and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm check
```

```bash
pnpm build && pnpm e2e --project=chromium
```
