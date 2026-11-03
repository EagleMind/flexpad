// Reading position: where the reader is, saved under a salted hash of the document's identifier so the
// stored keys reveal nothing about which documents were read.
import { database, salt, type PositionRecord } from "../db";
import { blocksOf, chapters, headingBefore } from "./blocks";

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function positionKey(identifier: string, s: Uint8Array): Promise<string> {
  const id = new TextEncoder().encode(identifier);
  const data = new Uint8Array(s.length + id.length);
  data.set(s);
  data.set(id, s.length);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/** The first block whose bottom is below `top` (the toolbar's height), as chapter and block indexes. */
export function capture(
  root: ParentNode,
  top: number,
): Omit<PositionRecord, "contentHash" | "saved"> | null {
  const docs = chapters(root);
  const ci = docs.findIndex((d) => d.getBoundingClientRect().bottom > top);
  const chapter = docs[ci];
  if (!chapter) return null;
  const blocks = blocksOf(chapter);
  const bi = blocks.findIndex((b) => b.getBoundingClientRect().bottom > top);
  const block = blocks[Math.max(0, bi)];
  return {
    chapter: ci,
    block: Math.max(0, bi),
    headingId: block ? (headingBefore(chapter, block)?.id ?? null) : null,
  };
}

/** The element to scroll to: the same block if the content is unchanged, else the saved heading. */
export function locate(root: ParentNode, p: PositionRecord, contentHash: string): Element | null {
  if (p.contentHash === contentHash) {
    const chapter = chapters(root)[p.chapter];
    const block = chapter && blocksOf(chapter)[p.block];
    if (block) return block;
  }
  return p.headingId ? ((root as ShadowRoot).getElementById?.(p.headingId) ?? null) : null;
}

export async function loadPosition(identifier: string): Promise<PositionRecord | undefined> {
  return (await database()).get("positions", await positionKey(identifier, await salt()));
}

export async function savePosition(identifier: string, record: PositionRecord): Promise<void> {
  try {
    await (await database()).put("positions", record, await positionKey(identifier, await salt()));
  } catch {
    // Storage unavailable: positions are a convenience.
  }
}
