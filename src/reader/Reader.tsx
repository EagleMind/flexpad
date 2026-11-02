// The reading screen: <flexova-viewer> plus a toolbar for contents, search, text size, theme, print and info.
import "@flexova/viewer";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { positionId, type OpenDoc } from "../document";
import { stepScale, type Settings, type Theme } from "../settings/settings";
import { t } from "../strings";
import {
  BackIcon,
  InfoIcon,
  LargerIcon,
  ListIcon,
  PrintIcon,
  SearchIcon,
  SettingsIcon,
  SmallerIcon,
  ThemeIcon,
} from "../ui/icons";
import type { TocEntry, ViewerElement } from "../viewer";
import { InfoDialog } from "./InfoDialog";
import { capture, loadPosition, locate, savePosition } from "./position";
import { SearchDialog } from "./SearchDialog";
import { TocDialog } from "./TocDialog";

interface Props {
  doc: OpenDoc;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  announce: (message: string) => void;
}

type Panel = "toc" | "search" | "info" | null;
const NEXT_THEME: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };

export function Reader({ doc, settings, onSettings, onClose, onOpenSettings, announce }: Props) {
  const viewer = useRef<ViewerElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [infoOpens, setInfoOpens] = useState(0);
  const [showProblems, setShowProblems] = useState(false);
  const errors = doc.report.issues.filter((i) => i.severity === "error");
  const title = doc.info?.title || doc.name;

  const toolbarHeight = () => (toolbar.current?.getBoundingClientRect().height ?? 0) + 8;

  /** Scroll so `el` (inside the viewer's shadow root) sits just below the sticky toolbar. */
  const scrollToElement = useCallback((el: Element, block: "start" | "center" = "start") => {
    const target = () => {
      const height = el.getBoundingClientRect().height;
      const top = toolbarHeight();
      return block === "center" && height < window.innerHeight - top
        ? (window.innerHeight + top - height) / 2
        : top;
    };
    el.scrollIntoView({ block });
    window.scrollBy(0, el.getBoundingClientRect().top - target());
    // Chapters render on demand (content-visibility) and change height as they appear. Chromium's scroll
    // anchoring hides that; WebKit has none and Firefox's skips this case, so the target would drift.
    // Hold it in place for a few frames, and stop as soon as the reader scrolls.
    let frames = 0;
    let stable = 0;
    let cancelled = false;
    const cancel = () => (cancelled = true);
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const type of inputs) window.addEventListener(type, cancel, { once: true, passive: true });
    const step = () => {
      if (cancelled) return;
      const off = el.getBoundingClientRect().top - target();
      if (Math.abs(off) > 2) {
        window.scrollBy(0, off);
        stable = 0;
      } else stable++;
      if (++frames < 60 && stable < 5) requestAnimationFrame(step);
      else for (const type of inputs) window.removeEventListener(type, cancel);
    };
    requestAnimationFrame(step);
  }, []);

  // Load the document, then restore the reading position.
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    // The reader is remounted for each document (keyed by its hash), so state starts fresh here.
    let cancelled = false;
    const onLoad = async () => {
      if (cancelled) return;
      setToc(v.toc);
      setRoot(v.shadowRoot);
      setReady(true);
      const saved = await loadPosition(positionId(doc)).catch(() => undefined);
      const target = saved && v.shadowRoot ? locate(v.shadowRoot, saved, doc.hash) : null;
      if (target && !cancelled) scrollToElement(target);
      else window.scrollTo(0, 0);
    };
    const onError = (e: Event) => setError((e as CustomEvent<{ message: string }>).detail.message);
    v.addEventListener("flexova-load", onLoad);
    v.addEventListener("flexova-error", onError);
    void v.load(doc.bytes);
    return () => {
      cancelled = true;
      v.removeEventListener("flexova-load", onLoad);
      v.removeEventListener("flexova-error", onError);
    };
  }, [doc, scrollToElement]);

  // Save the reading position while scrolling, and when the page is hidden.
  useEffect(() => {
    if (!ready) return;
    let timer = 0;
    const save = () => {
      const root = viewer.current?.shadowRoot;
      const p = root && capture(root, toolbarHeight());
      if (p) void savePosition(positionId(doc), { ...p, contentHash: doc.hash, saved: Date.now() });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 400);
    };
    const onHide = () => document.visibilityState === "hidden" && save();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(timer);
      save();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [ready, doc]);

  const setScale = (direction: 1 | -1) =>
    onSettings({ ...settings, fontScale: stepScale(settings.fontScale, direction) });
  const cycleTheme = () => {
    const theme = NEXT_THEME[settings.theme];
    onSettings({ ...settings, theme });
    announce(`${t.theme}: ${t.themes[theme]}`);
  };
  const closePanel = useCallback(() => setPanel(null), []);
  const style = { "--flexova-font-scale": String(settings.fontScale) } as CSSProperties;

  return (
    <div className="reader">
      <a className="skip-link" href="#document">
        Skip to document
      </a>
      <header className="toolbar app-chrome" ref={toolbar}>
        <button type="button" className="tool" onClick={onClose}>
          <BackIcon />
          <span className="tool-label">{t.back}</span>
        </button>
        <h1 className="doc-title" title={title}>
          {title}
        </h1>
        <div className="tools" role="toolbar" aria-label="Reading tools">
          <button type="button" className="tool" onClick={() => setPanel("toc")} disabled={!ready}>
            <ListIcon />
            <span className="tool-label">{t.contents}</span>
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => setPanel("search")}
            disabled={!ready}
          >
            <SearchIcon />
            <span className="tool-label">{t.search}</span>
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={t.smaller}
            title={t.smaller}
            onClick={() => setScale(-1)}
            disabled={settings.fontScale <= 0.85}
          >
            <SmallerIcon />
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={t.larger}
            title={t.larger}
            onClick={() => setScale(1)}
            disabled={settings.fontScale >= 1.6}
          >
            <LargerIcon />
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={`${t.theme}: ${t.themes[settings.theme]}`}
            title={`${t.theme}: ${t.themes[settings.theme]}`}
            onClick={cycleTheme}
          >
            <ThemeIcon />
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={t.print}
            title={t.print}
            onClick={() => window.print()}
          >
            <PrintIcon />
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={t.info}
            title={t.info}
            onClick={() => {
              setInfoOpens((n) => n + 1);
              setPanel("info");
            }}
          >
            <InfoIcon />
          </button>
          <button
            type="button"
            className="tool icon-only"
            aria-label={t.settings}
            title={t.settings}
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="banner app-chrome" role="status">
          <p>
            <strong>{t.problems(errors.length)}</strong> {t.problemsDetail}{" "}
            <button
              type="button"
              className="link-button"
              aria-expanded={showProblems}
              onClick={() => setShowProblems(!showProblems)}
            >
              {t.showProblems}
            </button>
          </p>
          {showProblems && (
            <ul className="problems">
              {errors.map((i, n) => (
                <li key={n}>
                  <code>{i.code}</code> {i.path}: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <main id="document" tabIndex={-1} aria-busy={!ready && !error} aria-label={title}>
        {!ready && !error && <p className="loading">{t.loading}</p>}
        <flexova-viewer
          ref={viewer}
          style={style}
          {...(settings.theme === "auto" ? {} : { theme: settings.theme })}
        />
      </main>

      <TocDialog
        open={panel === "toc"}
        toc={toc}
        onClose={closePanel}
        onGo={(href) => {
          setPanel(null);
          viewer.current?.goTo(href);
          const el = viewer.current?.shadowRoot?.getElementById(href.replace(/^#/, ""));
          if (el) scrollToElement(el);
        }}
      />
      <SearchDialog
        open={panel === "search"}
        root={root}
        onClose={closePanel}
        onPick={(hit) => {
          setPanel(null);
          scrollToElement(hit.element, "center");
          hit.element.animate(
            [
              { backgroundColor: "rgba(255, 196, 0, 0.55)" },
              { backgroundColor: "rgba(255, 196, 0, 0)" },
            ],
            { duration: 2400, easing: "ease-out" },
          );
          announce(t.showing(hit.chapter));
        }}
      />
      <InfoDialog
        key={infoOpens}
        open={panel === "info"}
        doc={doc}
        onClose={closePanel}
        onManageKeys={onOpenSettings}
      />
      {error && (
        <p className="banner app-chrome" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
