import { useState } from "react";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import { normalizeHref } from "./commands";

interface Props {
  open: boolean;
  current: string | null;
  headings: { pos: number; text: string; level: number }[];
  onClose: () => void;
  restoreFocus?: () => boolean;
  onApply: (href: string) => void;
  onHeading: (pos: number) => void;
  onRemove: () => void;
}

export function LinkDialog({
  open,
  restoreFocus,
  current,
  headings,
  onClose,
  onApply,
  onHeading,
  onRemove,
}: Props) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      title={t.editor.linkTitle}
      onClose={onClose}
      {...(restoreFocus ? { restoreFocus } : {})}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const href = normalizeHref(value);
          if (!href) setError(t.editor.linkInvalid);
          else onApply(href);
        }}
      >
        <label className="field-block">
          {t.editor.linkAddress}
          <input
            type="text"
            inputMode="url"
            value={value}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {headings.length > 0 && (
          <label className="field-block">
            {t.editor.linkTo}
            <select value="" onChange={(e) => e.target.value && onHeading(Number(e.target.value))}>
              <option value="">{t.editor.linkChoose}</option>
              {headings.map((h) => (
                <option key={h.pos} value={h.pos}>
                  {" ".repeat(Math.max(0, h.level - 1))}
                  {h.text || "…"}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="actions">
          <button type="submit" className="primary">
            {t.editor.apply}
          </button>
          {current && (
            <button type="button" className="danger" onClick={onRemove}>
              {t.editor.linkRemove}
            </button>
          )}
        </p>
      </form>
    </Dialog>
  );
}
