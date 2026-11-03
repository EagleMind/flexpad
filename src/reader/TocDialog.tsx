import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import type { TocEntry } from "../viewer";

interface Props {
  open: boolean;
  toc: TocEntry[];
  onClose: () => void;
  onGo: (href: string) => void;
}

export function TocDialog({ open, toc, onClose, onGo }: Props) {
  return (
    <Dialog open={open} title={t.contents} onClose={onClose} className="drawer">
      {toc.length ? (
        <nav aria-label={t.contents}>
          <ol className="toc">
            {toc.map((entry, i) => (
              <li key={i} style={{ paddingInlineStart: `${entry.depth}rem` }}>
                <button type="button" className="toc-link" onClick={() => onGo(entry.href)}>
                  {entry.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <p>{t.noContents}</p>
      )}
    </Dialog>
  );
}
