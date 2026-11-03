// Readable blocks of a rendered document, from <flexova-viewer>'s open shadow root. Shared by search and
// reading position. Chapters are `.fx-doc` sections; a block is the innermost element that holds text.
const SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,figcaption,pre,caption,summary";

export function chapters(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".fx-doc")];
}

/** Text blocks in document order, skipping containers whose text is in a nested block (li > p). */
export function blocksOf(chapter: ParentNode): HTMLElement[] {
  return [...chapter.querySelectorAll<HTMLElement>(SELECTOR)].filter(
    (el) => !el.querySelector(SELECTOR),
  );
}

export const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** The nearest heading at or before `el` in its chapter, for a readable location. */
export function headingBefore(chapter: HTMLElement, el: Element): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const h of chapter.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")) {
    if (h === el || h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
    else break;
  }
  return found;
}
