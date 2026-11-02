import { contrast, CONTRAST_RULE, defaultColors, type Tokens } from "@flexova/core";
import { useState } from "react";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import type { DocMeta } from "./load";

interface Props {
  open: boolean;
  meta: DocMeta;
  onClose: () => void;
  restoreFocus?: () => boolean;
  onApply: (meta: DocMeta) => void;
}

const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;
type Colors = Record<string, { light: string; dark: string }>;
const expand = (hex: string) =>
  (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex).toLowerCase();

export function DocumentDialog({ restoreFocus, open, meta, onClose, onApply }: Props) {
  const defaults = defaultColors();
  const [title, setTitle] = useState(meta.title);
  const [language, setLanguage] = useState(meta.language);
  const [authors, setAuthors] = useState(meta.authors.join("\n"));
  const [colors, setColors] = useState<Colors>(() => {
    const own = (meta.tokens?.color ?? {}) as Colors;
    return Object.fromEntries(
      Object.entries(defaults).map(([name, value]) => [
        name,
        {
          light: expand(own[name]?.light ?? value.light),
          dark: expand(own[name]?.dark ?? value.dark),
        },
      ]),
    );
  });
  const customized = Object.entries(colors).some(
    ([name, v]) =>
      v.light !== expand(defaults[name]?.light ?? "") ||
      v.dark !== expand(defaults[name]?.dark ?? ""),
  );

  const checks = CONTRAST_RULE.text.flatMap((name) =>
    (["light", "dark"] as const).map((theme) => {
      const ratio = contrast(
        colors[name]?.[theme] ?? "#000000",
        colors[CONTRAST_RULE.background]?.[theme] ?? "#ffffff",
      );
      return { name, theme, ratio, ok: ratio >= CONTRAST_RULE.minimum };
    }),
  );
  const languageOk = LANG.test(language.trim());
  const ok = languageOk && checks.every((c) => c.ok);

  return (
    <Dialog
      open={open}
      title={t.editor.documentSettings}
      onClose={onClose}
      {...(restoreFocus ? { restoreFocus } : {})}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          const otherTokens = Object.fromEntries(
            Object.entries(meta.tokens ?? {}).filter(([k]) => k !== "color"),
          );
          const tokens: Tokens | undefined = customized
            ? { ...otherTokens, color: colors }
            : Object.keys(otherTokens).length
              ? otherTokens
              : undefined;
          onApply({
            ...meta,
            title: title.trim(),
            language: language.trim(),
            authors: authors
              .split("\n")
              .map((a) => a.trim())
              .filter(Boolean),
            tokens,
          });
        }}
      >
        <label className="field-block">
          {t.editor.docTitle}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field-block">
          {t.editor.language}
          <input
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-invalid={!languageOk}
          />
        </label>
        {!languageOk && (
          <p className="error" role="alert">
            {t.editor.languageInvalid}
          </p>
        )}
        <label className="field-block">
          {t.editor.authors}
          <textarea rows={2} value={authors} onChange={(e) => setAuthors(e.target.value)} />
        </label>
        <fieldset>
          <legend>{t.editor.theme}</legend>
          <table className="colors">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Color</span>
                </th>
                <th scope="col">{t.editor.light}</th>
                <th scope="col">{t.editor.dark}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(colors).map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{t.editor.colorNames[name] ?? name}</th>
                  {(["light", "dark"] as const).map((theme) => (
                    <td key={theme}>
                      <input
                        type="color"
                        aria-label={`${t.editor.colorNames[name] ?? name}, ${theme === "light" ? t.editor.light : t.editor.dark}`}
                        value={value[theme]}
                        onChange={(e) =>
                          setColors({ ...colors, [name]: { ...value, [theme]: e.target.value } })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="contrast" aria-live="polite">
            {checks.map((c) => (
              <li key={`${c.name}-${c.theme}`} className={c.ok ? "" : "error"}>
                {t.editor.contrast(
                  t.editor.colorNames[c.name] ?? c.name,
                  c.theme === "light" ? t.editor.light : t.editor.dark,
                  c.ratio.toFixed(1),
                  c.ok,
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              setColors(
                Object.fromEntries(
                  Object.entries(defaults).map(([n, v]) => [
                    n,
                    { light: expand(v.light), dark: expand(v.dark) },
                  ]),
                ),
              )
            }
          >
            {t.editor.resetTheme}
          </button>
        </fieldset>
        <p className="actions">
          <button type="submit" className="primary" disabled={!ok}>
            {t.editor.apply}
          </button>
        </p>
      </form>
    </Dialog>
  );
}
