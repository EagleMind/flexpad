// A modal dialog on the native <dialog> element: focus moves in, Escape closes, focus returns on close.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { t } from "../strings";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /**
   * Called once, right after the dialog closes. Return true to return focus to what opened the dialog
   * (the default), or false after moving focus somewhere else yourself.
   */
  restoreFocus?: () => boolean;
}

export function Dialog({ open, title, onClose, children, className, restoreFocus }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnTo = useRef<Element | null>(null);
  // Each close() fires one "close" event later; these are the ones the owner caused.
  const ownerCloses = useRef(0);
  const restoreRef = useRef(restoreFocus);
  useEffect(() => {
    restoreRef.current = restoreFocus;
  }, [restoreFocus]);

  // Focus settles in the same task that closes the dialog. The "close" event comes a task later, and
  // keys typed in between would otherwise go to the button that opened it (a space would reopen it).
  const settleFocus = () => {
    const restore = restoreRef.current?.() ?? true;
    if (restore && returnTo.current instanceof HTMLElement) returnTo.current.focus();
  };

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      ownerCloses.current++;
      dialog.close();
      settleFocus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onDialogClose = () => {
      // Closed by the owner (open became false): focus was already settled above.
      if (ownerCloses.current > 0) {
        ownerCloses.current--;
        return;
      }
      onClose();
      settleFocus();
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
