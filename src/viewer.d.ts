// <flexova-viewer> in JSX, and the parts of its API FlexPad uses.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

export interface ViewerElement extends HTMLElement {
  load(input: ArrayBuffer | Uint8Array | Blob): Promise<void>;
  goTo(href: string): void;
  readonly toc: TocEntry[];
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "flexova-viewer": DetailedHTMLProps<HTMLAttributes<ViewerElement>, ViewerElement> & {
        theme?: string;
      };
    }
  }
}
