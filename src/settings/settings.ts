// Reader preferences: not sensitive, so they live in localStorage (wrapped: it can throw or be empty).
export type Theme = "auto" | "light" | "dark";

export interface Settings {
  theme: Theme;
  fontScale: number;
}

export const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.45, 1.6];
const DEFAULTS: Settings = { theme: "auto", fontScale: 1 };
const KEY = "flexpad.settings";

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : "auto",
      fontScale: FONT_SCALES.includes(raw.fontScale as number) ? (raw.fontScale as number) : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage disabled: settings last for this visit only.
  }
}

export function stepScale(current: number, direction: 1 | -1): number {
  const i = FONT_SCALES.indexOf(current);
  const next =
    FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + direction))];
  return next ?? 1;
}
