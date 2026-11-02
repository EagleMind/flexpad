# ADR-0001: Stack

- **Status:** Accepted, 2026-11-02.

**Decision:** Vite 8, React 19 and TypeScript 6.0 (pinned like flexova); MiniSearch for search; `idb` for IndexedDB; `vite-plugin-pwa` for the service worker. One hand-written stylesheet with design tokens, no CSS framework and no router: the app has two screens and dialogs, and the browser's Back button returns from the reader to the library through the History API.

**Why:** React is what the editor (M5, Tiptap) needs anyway. Few dependencies keep the bundle at about 117 KB gzipped, including the Flexova core and viewer, and keep the CSP strict (no inline styles from a CSS-in-JS library).
