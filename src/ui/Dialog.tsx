// A modal dialog on the native <dialog> element: focus moves in, Escape closes, focus returns on close.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "../strings";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, title, onClose, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onDialogClose = () => {
      onClose();
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
    dialog.addEventListener("close", onDialogClose);
    return () => dialog.removeEventListener("close", onDialogClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={className ? `dialog ${className}` : "dialog"}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // a click on the backdrop
      }}
      onKeyDown={(e) => {
        // Escape always closes, even from a search field (where browsers would only clear the text).
        if (e.key === "Escape") {
          e.preventDefault();
          ref.current?.close();
        }
      }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t.close}
            onClick={() => ref.current?.close()}
          >
            <CloseIcon />
          </button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}
