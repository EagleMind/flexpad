import { useState } from "react";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import { ImageError, prepareImage, type PreparedImage } from "./images";

interface Props {
  open: boolean;
  onClose: () => void;
  restoreFocus?: () => boolean;
  onInsert: (image: PreparedImage, alt: string, caption: string) => void;
}

export function ImageDialog({ restoreFocus, open, onClose, onInsert }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      title={t.editor.imageTitle}
      onClose={onClose}
      {...(restoreFocus ? { restoreFocus } : {})}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return setError(t.editor.imageRequired);
          if (!decorative && !alt.trim()) return setError(t.editor.altRequired);
          setBusy(true);
          try {
            onInsert(await prepareImage(file), decorative ? "" : alt.trim(), caption);
          } catch (err) {
            setError(err instanceof ImageError ? err.message : t.errors.generic);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-block">
          {t.editor.imageFile}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field-block">
          {t.editor.altText}
          <textarea
            rows={3}
            value={alt}
            disabled={decorative}
            onChange={(e) => setAlt(e.target.value)}
          />
        </label>
        <label className="choice">
          <input
            type="checkbox"
            checked={decorative}
            onChange={(e) => setDecorative(e.target.checked)}
          />
          {t.editor.decorative}
        </label>
        <label className="field-block">
          {t.editor.caption}
          <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t.editor.processing : t.editor.insertImage}
          </button>
        </p>
      </form>
    </Dialog>
  );
}
