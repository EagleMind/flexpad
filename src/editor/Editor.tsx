// The FlexPad editor: a ProseMirror view on the profile-derived schema, with a toolbar, dialogs, saving
// (File System Access API or download), export, and drafts kept on the device between saves.
import { FlexovaError } from "@flexova/core";
import { toHtml } from "@flexova/html";

import { EditorState, type Command } from "prosemirror-state";
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  toggleHeaderRow,
} from "prosemirror-tables";
import { EditorView } from "prosemirror-view";
import { useCallback, useEffect, useRef, useState } from "react";
import { prepare } from "../document";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import type { AssetStore } from "./assets";
import {
  blockKind,
  editorPlugins,
  headings,
  insertChapter,
  insertDetails,
  insertFigure,
  insertRule,
  insertTable,
  linkAt,
  linkToHeading,
  listCommands,
  markActive,
  redo,
  setBlockKind,
  setLink,
  toggleMark,
  undo,
  wrapCallout,
  wrapIn,
  type BlockKind,
} from "./commands";
import { DocumentDialog } from "./DocumentDialog";
import { dropDraft, findDraft, keepDraft, restoreDraft } from "./drafts";
import { download, fileNameFor, saveFile, type SaveHandle } from "./files";
import { ImageDialog } from "./ImageDialog";
import { LinkDialog } from "./LinkDialog";
import type { DocMeta, Editable } from "./load";
import { save } from "./save";
import { M, setAssetResolver, T } from "./schema";

export interface EditSession {
  editable: Editable;
  name: string;
  handle: SaveHandle | null;
  /** Shown once when the editor opens (for example, what an import changed). */
  warnings?: string[];
}

interface Props {
  session: EditSession;
  onClose: (saved: { bytes: Uint8Array; name: string } | null) => void;
  onPrint: (bytes: Uint8Array, name: string) => void;
  announce: (message: string) => void;
}

type DialogName = "link" | "image" | "doc" | "warnings" | null;
const VARIANTS = ["Note", "Tip", "Important", "Warning", "Caution"];

const firstHeadingOf = (s: EditorState | undefined) => {
  let text = "";
  s?.doc.descendants((n) => {
    if (!text && n.type === T.heading) text = n.textContent.trim();
    return !text;
  });
  return text;
};

export function Editor({ session, onClose, onPrint, announce }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const assets = useRef<AssetStore>(session.editable.assets);
  const handle = useRef<SaveHandle | null>(session.handle);
  const lastSaved = useRef<{ bytes: Uint8Array; name: string } | null>(null);
  const draftTimer = useRef(0);
  // The editor state lives in React state too, so the toolbar re-renders with every change.
  const [initialState] = useState(() =>
    EditorState.create({ doc: session.editable.doc, plugins: editorPlugins() }),
  );
  const [state, setState] = useState<EditorState>(initialState);
  const [meta, setMeta] = useState<DocMeta>(session.editable.meta);
  const metaRef = useRef(meta);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(session.warnings?.length ? "warnings" : null);
  const [dialogKey, setDialogKey] = useState(0);
  const [warnings, setWarnings] = useState<{ title: string; items: string[] }>({
    title: t.editor.importWarningsTitle,
    items: session.warnings ?? [],
  });
  const [draft, setDraft] = useState<{ saved: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scheduleDraft = useCallback(() => {
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const v = view.current;
      if (v)
        void keepDraft(
          v.state.doc,
          metaRef.current,
          assets.current,
          fileNameFor(metaRef.current.title || firstHeadingOf(view.current?.state)),
        );
    }, 1500);
  }, []);

  // Create the editor view once.
  useEffect(() => {
    if (!mount.current) return;
    setAssetResolver((key) => assets.current.url(key));
    const v = new EditorView(mount.current, {
      state: initialState,
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": t.editor.label,
        spellcheck: "true",
        class: "editor-surface",
      },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr);
        v.updateState(next);
        setState(next);
        if (tr.docChanged) {
          setDirty(true);
          scheduleDraft();
        }
      },
    });
    view.current = v;
    void findDraft(session.editable.meta.identifier).then((d) => d && setDraft(d));
    return () => {
      window.clearTimeout(draftTimer.current);
      v.destroy();
      view.current = null;
    };
  }, [session, scheduleDraft, initialState]);

  useEffect(() => {
    metaRef.current = meta;
    view.current?.dom.setAttribute("lang", meta.language);
  }, [meta]);

  const run = (cmd: Command) => {
    const v = view.current;
    if (!v) return;
    cmd(v.state, v.dispatch, v);
    v.focus();
  };

  const build = async () => {
    const v = view.current;
    if (!v) return null;
    try {
      return await save({ doc: v.state.doc, meta: metaRef.current, assets: assets.current });
    } catch (e) {
      setError(
        e instanceof FlexovaError ? `${t.editor.saveFailed} ${e.message}` : t.editor.saveFailed,
      );
      return null;
    }
  };

  const persist = async (saveAs: boolean) => {
    setError(null);
    const result = await build();
    if (!result) return;
    const name =
      handle.current?.name ??
      fileNameFor(metaRef.current.title || firstHeadingOf(view.current?.state));
    const outcome = await saveFile(
      result.bytes,
      saveAs ? fileNameFor(metaRef.current.title || firstHeadingOf(view.current?.state)) : name,
      saveAs ? null : handle.current,
    );
    if (outcome.cancelled) return;
    handle.current = outcome.handle;
    await prepare(result.bytes, outcome.handle?.name ?? name);
    lastSaved.current = { bytes: result.bytes, name: outcome.handle?.name ?? name };
    setDirty(false);
    void dropDraft(metaRef.current.identifier);
    announce(t.editor.saved);
    if (result.warnings.length) {
      setWarnings({ title: t.editor.warningsTitle, items: result.warnings });
      setDialog("warnings");
    }
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void persistRef.current(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportAs = async (kind: string) => {
    const result = await build();
    if (!result) return;
    const name = fileNameFor(metaRef.current.title || firstHeadingOf(view.current?.state));
    if (kind === "html") {
      const { html } = await toHtml(result.bytes);
      download(html, name.replace(/\.flexova$/, ".flexova.html"), "text/html");
    } else if (kind === "print") onPrint(result.bytes, name);
  };

  const close = () => {
    if (dirty && view.current) {
      void keepDraft(
        view.current.state.doc,
        metaRef.current,
        assets.current,
        fileNameFor(metaRef.current.title || firstHeadingOf(view.current?.state)),
      );
      announce(t.editor.draftKept);
    }
    onClose(lastSaved.current);
  };

  const openDialog = (name: DialogName) => {
    setDialogKey((k) => k + 1);
    setDialog(name);
  };
  // After a dialog's action (insert, apply), focus goes back to the text instead of the toolbar button.
  const focusText = useRef(false);
  const keepFocusInDialogOpener = useCallback(() => !focusText.current, []);
  const closeDialog = useCallback(() => {
    setDialog(null);
    if (focusText.current) {
      focusText.current = false;
      view.current?.focus();
    }
  }, []);
  const finishDialog = () => {
    focusText.current = true;
    setDialog(null);
  };

  const kind: BlockKind = blockKind(state);
  const displayTitle = meta.title || firstHeadingOf(state) || t.editor.untitled;
  const inTable = isInTable(state);
  const mark = (type: typeof M.strong) => markActive(state, type);
  const markButton = (label: string, type: typeof M.strong) => (
    <button
      type="button"
      className="tool"
      aria-pressed={mark(type)}
      onClick={() => run(toggleMark(type))}
    >
      {label}
    </button>
  );

  return (
    <div className="editor">
      <div className="editor-chrome app-chrome">
        <header className="toolbar editor-bar">
          <button type="button" className="tool" onClick={close}>
            {t.editor.done}
          </button>
          <h1 className="doc-title" title={displayTitle}>
            {displayTitle}
          </h1>
          <span className="save-state" role="status">
            {dirty ? t.editor.unsaved : t.editor.allSaved}
          </span>
          <button type="button" className="tool" onClick={() => openDialog("doc")}>
            {t.editor.documentSettings}
          </button>
          <label className="tool select-tool">
            <span className="visually-hidden">{t.editor.exportLabel}</span>
            <select value="" onChange={(e) => void exportAs(e.target.value)}>
              <option value="">{t.editor.exportLabel}</option>
              <option value="html">{t.editor.exportHtml}</option>
              <option value="print">{t.editor.exportPrint}</option>
            </select>
          </label>
          <button type="button" className="tool" onClick={() => void persist(true)}>
            {t.editor.saveAs}
          </button>
          <button type="button" className="primary" onClick={() => void persist(false)}>
            {t.editor.save}
          </button>
        </header>

        <div className="formatting" role="toolbar" aria-label={t.editor.toolbar}>
          <button type="button" className="tool" onClick={() => run(undo)} disabled={!undo(state)}>
            {t.editor.undo}
          </button>
          <button type="button" className="tool" onClick={() => run(redo)} disabled={!redo(state)}>
            {t.editor.redo}
          </button>
          <label className="tool select-tool">
            <span className="visually-hidden">{t.editor.blockType}</span>
            <select value={kind} onChange={(e) => run(setBlockKind(e.target.value as BlockKind))}>
              {kind === "other" && (
                <option value="other" disabled>
                  {t.editor.mixed}
                </option>
              )}
              <option value="paragraph">{t.editor.paragraph}</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={`h${n}`}>
                  {t.editor.heading(n)}
                </option>
              ))}
              <option value="code">{t.editor.codeBlock}</option>
            </select>
          </label>
          {markButton(t.editor.bold, M.strong)}
          {markButton(t.editor.italic, M.em)}
          {markButton(t.editor.inlineCode, M.code)}
          {markButton(t.editor.strike, M.s)}
          <button
            type="button"
            className="tool"
            aria-pressed={mark(M.a)}
            onClick={() => openDialog("link")}
          >
            {t.editor.link}
          </button>
          <button type="button" className="tool" onClick={() => run(listCommands.bullet)}>
            {t.editor.bullets}
          </button>
          <button type="button" className="tool" onClick={() => run(listCommands.ordered)}>
            {t.editor.numbers}
          </button>
          <button type="button" className="tool" onClick={() => run(listCommands.outdent)}>
            {t.editor.outdent}
          </button>
          <button type="button" className="tool" onClick={() => run(wrapIn(T.blockquote))}>
            {t.editor.quote}
          </button>
          <label className="tool select-tool">
            <span className="visually-hidden">{t.editor.insert}</span>
            <select
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (value === "image") openDialog("image");
                else if (value === "table") run(insertTable());
                else if (value === "details") run(insertDetails());
                else if (value === "rule") run(insertRule());
                else if (value === "chapter") run(insertChapter(t.editor.chapter));
                else if (value.startsWith("callout:")) run(wrapCallout(value.slice(8)));
              }}
            >
              <option value="">{t.editor.insert}</option>
              <option value="image">{t.editor.image}</option>
              <option value="table">{t.editor.table}</option>
              {VARIANTS.map((v) => (
                <option key={v} value={`callout:${v.toLowerCase()}`}>
                  {t.editor.callout(v)}
                </option>
              ))}
              <option value="details">{t.editor.details}</option>
              <option value="rule">{t.editor.rule}</option>
              <option value="chapter">{t.editor.chapter}</option>
            </select>
          </label>
          {inTable && (
            <span className="table-tools" role="group" aria-label={t.editor.tableTools}>
              <button type="button" className="tool" onClick={() => run(addRowAfter)}>
                {t.editor.addRow}
              </button>
              <button type="button" className="tool" onClick={() => run(addColumnAfter)}>
                {t.editor.addColumn}
              </button>
              <button type="button" className="tool" onClick={() => run(deleteRow)}>
                {t.editor.deleteRow}
              </button>
              <button type="button" className="tool" onClick={() => run(deleteColumn)}>
                {t.editor.deleteColumn}
              </button>
              <button type="button" className="tool" onClick={() => run(toggleHeaderRow)}>
                {t.editor.headerRow}
              </button>
              <button type="button" className="tool" onClick={() => run(deleteTable)}>
                {t.editor.deleteTable}
              </button>
            </span>
          )}
        </div>
      </div>

      {draft && (
        <div className="banner app-chrome" role="status">
          <p>
            {t.editor.draftFound(new Date(draft.saved).toLocaleString())}{" "}
            <button
              type="button"
              className="link-button"
              onClick={async () => {
                const restored = await restoreDraft(meta.identifier);
                setDraft(null);
                const v = view.current;
                if (!restored || !v) return;
                assets.current = restored.assets;
                setMeta(restored.meta);
                const next = EditorState.create({ doc: restored.doc, plugins: editorPlugins() });
                v.updateState(next);
                setState(next);
                setDirty(true);
              }}
            >
              {t.editor.restore}
            </button>{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setDraft(null);
                void dropDraft(meta.identifier);
              }}
            >
              {t.editor.discard}
            </button>
          </p>
        </div>
      )}
      {error && (
        <p className="banner error app-chrome" role="alert">
          {error}
        </p>
      )}

      <main id="document" className="editor-page">
        <div ref={mount} />
      </main>

      <LinkDialog
        key={`link-${dialogKey}`}
        open={dialog === "link"}
        current={linkAt(state)?.href ?? null}
        headings={headings(state.doc)}
        onClose={closeDialog}
        restoreFocus={keepFocusInDialogOpener}
        onApply={(href) => {
          finishDialog();
          run(setLink(href));
        }}
        onHeading={(pos) => {
          const v = view.current;
          if (!v) return;
          const { href, tr } = linkToHeading(v.state, pos);
          v.dispatch(tr);
          finishDialog();
          run(setLink(href));
        }}
        onRemove={() => {
          finishDialog();
          run(setLink(null));
        }}
      />
      <ImageDialog
        key={`image-${dialogKey}`}
        open={dialog === "image"}
        restoreFocus={keepFocusInDialogOpener}
        onClose={closeDialog}
        onInsert={(image, alt, caption) => {
          const key = assets.current.freeKey(image.name);
          assets.current.set(key, { data: image.data, mediaType: image.mediaType });
          finishDialog();
          run(insertFigure(key, alt, caption));
        }}
      />
      <DocumentDialog
        key={`doc-${dialogKey}`}
        open={dialog === "doc"}
        meta={meta}
        onClose={closeDialog}
        onApply={(next) => {
          setMeta(next);
          metaRef.current = next;
          setDirty(true);
          scheduleDraft();
          setDialog(null);
        }}
      />
      <Dialog open={dialog === "warnings"} title={warnings.title} onClose={closeDialog}>
        <p>{t.editor.warningsIntro}</p>
        <ul>
          {warnings.items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
