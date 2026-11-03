// Full-text search over the rendered document, built lazily (on first search) in chunks so that even a
// 1,000-page document doesn't freeze the page.
import MiniSearch from "minisearch";
import { blocksOf, chapters, headingBefore, textOf } from "./blocks";

export interface Hit {
  id: number;
  element: HTMLElement;
  chapter: string;
  snippet: string;
}

interface Doc {
  id: number;
  text: string;
}

export class SearchIndex {
  private readonly mini = new MiniSearch<Doc>({
    fields: ["text"],
    searchOptions: { prefix: true, combineWith: "AND" },
  });
  private readonly elements: HTMLElement[] = [];
  private readonly labels: string[] = [];

  static async build(root: ParentNode): Promise<SearchIndex> {
    const index = new SearchIndex();
    const docs: Doc[] = [];
    for (const chapter of chapters(root)) {
      const title = textOf(chapter.querySelector("h1,h2,h3,h4,h5,h6") ?? chapter).slice(0, 80);
      for (const block of blocksOf(chapter)) {
        const text = textOf(block);
        if (!text) continue;
        const heading = headingBefore(chapter, block);
        index.elements.push(block);
        index.labels.push(heading && heading !== block ? textOf(heading).slice(0, 80) : title);
        docs.push({ id: docs.length, text });
      }
    }
    await index.mini.addAllAsync(docs, { chunkSize: 1000 });
    return index;
  }

  get size(): number {
    return this.elements.length;
  }

  search(query: string, limit = 50): Hit[] {
    const q = query.trim();
    if (!q) return [];
    // Typos are forgiven only when nothing matches exactly: fuzzy hits would drown precise ones.
    let results = this.mini.search(q);
    if (!results.length) results = this.mini.search(q, { fuzzy: 0.2 });
    return results.slice(0, limit).map((r) => {
      const element = this.elements[r.id as number] as HTMLElement;
      return {
        id: r.id as number,
        element,
        chapter: this.labels[r.id as number] ?? "",
        snippet: snippet(textOf(element), r.terms),
      };
    });
  }
}

/** Up to ~160 characters around the first matching term. */
export function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const at = Math.min(
    ...terms.map((t) => lower.indexOf(t.toLowerCase())).filter((i) => i >= 0),
    text.length,
  );
  const start = Math.max(0, (at === text.length ? 0 : at) - 60);
  const out = text.slice(start, start + 160);
  return (start > 0 ? "…" : "") + out + (start + 160 < text.length ? "…" : "");
}
