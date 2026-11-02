# ADR-0002: Storage and privacy

- **Status:** Accepted, 2026-11-02.
- **Changes** the build plan's "library in OPFS".

| Decision                                                                                                          | Why                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Library documents are ArrayBuffers in IndexedDB**, stored with their metadata, rather than OPFS files or Blobs. | Some Safari versions can't write OPFS files from the main thread (`createWritable`), and WebKit refuses Blobs in IndexedDB in private browsing. ArrayBuffers work in every engine and mode. |
| **At most 20 documents or 200 MB**, least recently opened evicted first; Remove and Clear in the UI.              | The original file stays the source of truth; the library is a cache the reader controls.                                                                                                    |
| **Reading positions are stored under SHA-256(per-install random salt ‖ document identifier).**                    | The positions store reveals nothing about which documents were read, even if the library was cleared.                                                                                       |
| **Settings (theme, text size) live in `localStorage`; trusted keys (public only) in IndexedDB.**                  | Nothing sensitive. Importing a private key is refused.                                                                                                                                      |
| **No analytics, telemetry or third-party requests.**                                                              | Field manuals can be confidential; the CSP enforces `connect-src 'self'`.                                                                                                                   |
| **Sealed documents (M8) and their keys are never stored.**                                                        | Flexova ADR-0004/0005.                                                                                                                                                                      |
