// "Print or save as PDF" from the editor: the saved document, rendered by <flexova-viewer> in an overlay
// that is the only thing printed. The editor stays open underneath.
import "@flexova/viewer";
import { useEffect, useRef } from "react";
import type { ViewerElement } from "../viewer";

export function PrintView({ bytes, onDone }: { bytes: Uint8Array; onDone: () => void }) {
  const viewer = useRef<ViewerElement>(null);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const after = () => onDone();
    const onLoad = () => {
      window.addEventListener("afterprint", after, { once: true });
      window.print();
    };
    v.addEventListener("flexova-load", onLoad, { once: true });
    void v.load(bytes);
    return () => {
      v.removeEventListener("flexova-load", onLoad);
      window.removeEventListener("afterprint", after);
    };
  }, [bytes, onDone]);
  return (
    <div className="print-view">
      <flexova-viewer ref={viewer} />
    </div>
  );
}
