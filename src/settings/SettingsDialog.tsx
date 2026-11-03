import { useEffect, useState } from "react";
import { FLEXOVA_COMMIT, LICENSE_URL, SOURCE_URL, COMMIT, VERSION } from "../build-info";
import type { TrustedKey } from "../db";
import { forgetAll } from "../library/store";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import { distrust, KeyImportError, parseKeys, trust, trustedKeys } from "./keys";
import { FONT_SCALES, type Settings, type Theme } from "./settings";

interface Props {
  open: boolean;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClose: () => void;
  onLibraryCleared: () => void;
  announce: (message: string) => void;
}

export function SettingsDialog({
  open,
  settings,
  onSettings,
  onClose,
  onLibraryCleared,
  announce,
}: Props) {
  const [keys, setKeys] = useState<TrustedKey[]>([]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const refresh = () => void trustedKeys().then(setKeys, () => setKeys([]));

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const importKeys = async (file: File | undefined) => {
    if (!file) return;
    setKeyError(null);
    try {
      const n = await trust(parseKeys(await file.text()));
      announce(t.imported(n));
      refresh();
    } catch (e) {
      setKeyError(e instanceof KeyImportError ? e.message : t.errors.generic);
    }
  };

  return (
    <Dialog open={open} title={t.settings} onClose={onClose}>
      <fieldset>
        <legend>{t.theme}</legend>
        {(["auto", "light", "dark"] as Theme[]).map((theme) => (
          <label key={theme} className="choice">
            <input
              type="radio"
              name="theme"
              checked={settings.theme === theme}
              onChange={() => onSettings({ ...settings, theme })}
            />
            {t.themes[theme]}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Text size
        <select
          value={settings.fontScale}
          onChange={(e) => onSettings({ ...settings, fontScale: Number(e.target.value) })}
        >
          {FONT_SCALES.map((s) => (
            <option key={s} value={s}>
              {Math.round(s * 100)}%
            </option>
          ))}
        </select>
      </label>
      <section aria-labelledby="keys-title">
        <h3 id="keys-title">{t.trustedKeys}</h3>
        <p className="hint">{t.trustedKeysHelp}</p>
        {keys.length ? (
          <ul className="keys">
            {keys.map((k) => (
              <li key={k.id}>
                <code>{k.kid}</code>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void distrust(k.id).then(refresh)}
                >
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.noKeys}</p>
        )}
        <label className="file-button">
          {t.importKeys}
          <input
            type="file"
            accept=".json,application/json,application/jwk-set+json"
            onChange={(e) => void importKeys(e.target.files?.[0])}
          />
        </label>
        {keyError && (
          <p className="error" role="alert">
            {keyError}
          </p>
        )}
      </section>
      <p>
        <button
          type="button"
          className="danger"
          onClick={() =>
            void forgetAll().then(() => {
              onLibraryCleared();
              announce(t.cleared);
            })
          }
        >
          {t.clearLibrary}
        </button>
      </p>
      <section aria-labelledby="about-title" className="about">
        <h3 id="about-title">{t.about}</h3>
        <p>
          {t.aboutVersion(VERSION, COMMIT)} {t.aboutLicense}
        </p>
        <p>
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            {t.sourceCode}
          </a>
          {" · "}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
            {t.license}
          </a>
        </p>
        <p className="hint">{t.aboutFlexova(FLEXOVA_COMMIT)}</p>
      </section>
    </Dialog>
  );
}
