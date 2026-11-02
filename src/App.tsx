// FlexPad: the library (home) and the reader, plus every way to open a document.
import { useCallback, useEffect, useRef, useState } from "react";
import { database } from "./db";
import { prepare, type OpenDoc } from "./document";
import { Home } from "./library/Home";
import { forget, listLibrary, loadFromLibrary, type LibraryEntry } from "./library/store";
import { ACCEPT, fetchDocument, fileBytes, OpenError, sameOriginUrl } from "./open/sources";
import { UpdateToast } from "./pwa/UpdateToast";
import { Reader } from "./reader/Reader";
import { loadSettings, saveSettings, type Settings } from "./settings/settings";
import { SettingsDialog } from "./settings/SettingsDialog";
import { t } from "./strings";

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
declare global {
  interface Window {
    launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void };
    showOpenFilePicker?: (options: unknown) => Promise<{ getFile(): Promise<File> }[]>;
  }
}

const SAMPLE = "/samples/aurora-manual.flexova";

export function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [storageWorks, setStorageWorks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const announce = useCallback((m: string) => {
    setMessage("");
    window.setTimeout(() => setMessage(m), 50);
  }, []);
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);
  const refreshLibrary = useCallback(() => {
    listLibrary().then(setEntries, () => setStorageWorks(false));
  }, []);

  useEffect(() => {
    database().then(refreshLibrary, () => setStorageWorks(false));
  }, [refreshLibrary]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const show = useCallback(
    async (load: () => Promise<{ bytes: Uint8Array; name: string }>) => {
      setBusy(true);
      setProblem(null);
      try {
        const { bytes, name } = await load();
        const opened = await prepare(bytes, name);
        setDoc(opened);
        if (history.state?.reading !== true) history.pushState({ reading: true }, "");
        refreshLibrary();
      } catch (e) {
        setProblem(e instanceof OpenError ? e.message : t.errors.generic);
      } finally {
        setBusy(false);
      }
    },
    [refreshLibrary],
  );

  const openFile = useCallback(
    (file: File) => {
      if (!/\.flexova$/i.test(file.name) && file.type !== "application/vnd.flexova+zip") {
        setProblem(t.errors.notFlexova);
        return;
      }
      void show(async () => ({ bytes: await fileBytes(file), name: file.name }));
    },
    [show],
  );

  const openUrl = useCallback(
    (src: string) =>
      show(async () => {
        const url = sameOriginUrl(src, location.href);
        return {
          bytes: await fetchDocument(url),
          name: decodeURIComponent(url.pathname.split("/").pop() || "document.flexova"),
        };
      }),
    [show],
  );

  const pick = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Flexova document",
              accept: { "application/vnd.flexova+zip": [".flexova"] },
            },
          ],
        });
        if (handle) openFile(await handle.getFile());
      } catch {
        // The reader cancelled the picker.
      }
    } else fileInput.current?.click();
  };

  // ?src=… (same origin only) and files the operating system hands over (File Handling API).
  const launched = useRef(false);
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    const src = new URLSearchParams(location.search).get("src");
    if (src) void Promise.resolve().then(() => openUrl(src));
    window.launchQueue?.setConsumer(async (params) => {
      const file = await params.files[0]?.getFile();
      if (file) openFile(file);
    });
  }, [openUrl, openFile]);

  // Drag and drop anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => hasFiles(e) && (depth++, setDragging(true));
    const leave = (e: DragEvent) =>
      hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false));
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFile]);

  // The browser's Back button returns from the reader to the library.
  useEffect(() => {
    const onPop = () => setDoc(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const closeDoc = () => {
    if (history.state?.reading === true) history.back();
    else setDoc(null);
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) openFile(file);
        }}
      />
      {doc ? (
        <Reader
          key={doc.hash}
          doc={doc}
          settings={settings}
          onSettings={setSettings}
          onClose={closeDoc}
          onOpenSettings={() => setSettingsOpen(true)}
          announce={announce}
        />
      ) : (
        <Home
          entries={entries}
          storageWorks={storageWorks}
          onOpen={() => void pick()}
          onSample={() => void openUrl(SAMPLE)}
          onOpenEntry={(hash) =>
            void show(async () => {
              const found = await loadFromLibrary(hash);
              if (!found) throw new OpenError(t.errors.generic);
              return { bytes: found.bytes, name: found.entry.name };
            })
          }
          onRemove={(hash) => void forget(hash).then(refreshLibrary)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {busy && (
        <p className="toast app-chrome" role="status">
          {t.loading}
        </p>
      )}
      {problem && !doc && (
        <p className="toast toast-error app-chrome" role="alert">
          {problem}
        </p>
      )}
      {dragging && (
        <div className="drop-overlay app-chrome" aria-hidden="true">
          {t.dropOverlay}
        </div>
      )}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSettings={setSettings}
        onClose={() => setSettingsOpen(false)}
        onLibraryCleared={refreshLibrary}
        announce={announce}
      />
      <UpdateToast />
      <p className="visually-hidden" role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
