import { t } from "../strings";
import { OpenIcon, SettingsIcon } from "../ui/icons";
import type { LibraryEntry } from "./store";

interface Props {
  entries: LibraryEntry[] | null;
  storageWorks: boolean;
  onOpen: () => void;
  onSample: () => void;
  onNew: () => void;
  onImport: (file: File) => void;
  onOpenEntry: (hash: string) => void;
  onRemove: (hash: string) => void;
  onOpenSettings: () => void;
}

const size = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function Home({
  entries,
  storageWorks,
  onOpen,
  onSample,
  onNew,
  onImport,
  onOpenEntry,
  onRemove,
  onOpenSettings,
}: Props) {
  return (
    <div className="home">
      <header className="home-header">
        <p className="brand">
          <img src="/icons/icon.svg" alt="" width="32" height="32" />
          {t.appName}
        </p>
        <button
          type="button"
          className="tool icon-only"
          aria-label={t.settings}
          title={t.settings}
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">{t.tagline}</h1>
          <p>
            <button type="button" className="primary" onClick={onOpen}>
              <OpenIcon />
              {t.open}
            </button>
          </p>
          <p className="hint">{t.dropHint}</p>
          <p>
            <button type="button" className="link-button" onClick={onSample}>
              {t.trySample}
            </button>
          </p>
          <p className="create">
            <button type="button" className="secondary" onClick={onNew}>
              {t.editor.newDocument}
            </button>
            <label className="secondary file-button">
              {t.editor.importDoc}
              <input
                type="file"
                accept=".md,.markdown,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onImport(file);
                }}
              />
            </label>
          </p>
        </section>
        <section className="library" aria-labelledby="library-title">
          <h2 id="library-title">{t.library}</h2>
          {!storageWorks ? (
            <p className="hint">{t.libraryUnavailable}</p>
          ) : entries && entries.length ? (
            <ul className="cards">
              {entries.map((e) => (
                <li key={e.hash} className="card">
                  <div className="card-text">
                    <button
                      type="button"
                      className="card-open"
                      onClick={() => onOpenEntry(e.hash)}
                      aria-describedby={`meta-${e.hash}`}
                    >
                      {e.title}
                    </button>
                    <span id={`meta-${e.hash}`} className="card-meta">
                      {e.name} · {size(e.size)} ·{" "}
                      {t.lastOpened(new Date(e.opened).toLocaleDateString())}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onRemove(e.hash)}
                    aria-label={t.removeFrom(e.title)}
                  >
                    {t.remove}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t.libraryEmpty}</p>
          )}
        </section>
      </main>
    </div>
  );
}
