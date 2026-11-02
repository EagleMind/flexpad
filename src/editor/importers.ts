// Start a document from Markdown (via @flexova/import) or Word (via mammoth, loaded only when needed).
// Word's HTML is parsed by the editor schema, so only profile content survives; images are taken out of
// their data: URLs into the asset store, and anything else is dropped.
import { write } from "@flexova/core";
import { fromMarkdown } from "@flexova/import";
import { DOMParser as PMDOMParser, Fragment, type Node as PMNode } from "prosemirror-model";
import { AssetStore } from "./assets";
import { loadForEditing, type Editable } from "./load";
import { T, schema } from "./schema";

export interface Imported extends Editable {
  warnings: string[];
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const stem = (name: string) => name.replace(/\.[^.]*$/, "") || "Document";
const RASTER = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const VARIANTS = ["Note", "Tip", "Important", "Warning", "Caution"];

export async function importMarkdown(file: File): Promise<Imported> {
  const result = fromMarkdown([{ path: file.name, text: await file.text() }]);
  const bytes = await write({
    ...result,
    title: result.title === "Untitled document" ? stem(file.name) : result.title,
    identifier: `urn:uuid:${crypto.randomUUID()}`,
    modified: now(),
  });
  return { ...(await loadForEditing(bytes)), warnings: result.warnings };
}

/** Split a chapter at its top-level level-1 headings, one chapter each. */
export function splitChapters(content: Fragment): PMNode[] {
  const groups: PMNode[][] = [[]];
  content.forEach((block) => {
    const current = groups[groups.length - 1] as PMNode[];
    if (block.type === T.heading && block.attrs.level === 1 && current.length) groups.push([block]);
    else current.push(block);
  });
  return groups
    .filter((g) => g.length)
    .map((g, i) => T.chapter.create({ file: `${String(i + 1).padStart(2, "0")}.xhtml` }, g));
}

function dataUrlBytes(url: string): { data: Uint8Array; mediaType: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  const bin = atob(m[2] as string);
  return {
    data: Uint8Array.from(bin, (c) => c.charCodeAt(0)),
    mediaType: (m[1] as string).toLowerCase(),
  };
}

export async function importDocx(file: File): Promise<Imported> {
  const mammoth = (await import("mammoth")).default;
  const styleMap = VARIANTS.flatMap((v) => [
    `p[style-name='${v}'] => aside.${v.toLowerCase()} > p:fresh`,
    `p[style-name='${v} Text'] => aside.${v.toLowerCase()} > p:fresh`,
  ]);
  const { value: html, messages } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    { styleMap },
  );
  const warnings = messages
    .filter((m) => m.type === "warning")
    .slice(0, 10)
    .map((m) => m.message);
  // An inert document: nothing in it runs or loads.
  const page = new DOMParser().parseFromString(html, "text/html");
  const assets = new AssetStore();
  let dropped = 0;
  for (const img of [...page.querySelectorAll("img")]) {
    const parsed = dataUrlBytes(img.getAttribute("src") ?? "");
    if (!parsed || !RASTER.has(parsed.mediaType)) {
      dropped++;
      img.replaceWith(page.createTextNode(img.getAttribute("alt") ?? ""));
      continue;
    }
    const ext = parsed.mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const key = assets.freeKey(`image.${ext}`);
    assets.set(key, parsed);
    img.setAttribute("src", key);
    img.setAttribute("alt", img.getAttribute("alt") ?? "");
    // A paragraph holding only an image becomes a figure.
    const p = img.parentElement;
    if (p?.localName === "p" && p.childNodes.length === 1) {
      const figure = page.createElement("figure");
      figure.append(img);
      p.replaceWith(figure);
    }
  }
  if (dropped)
    warnings.unshift(
      `${dropped} image(s) in a format Flexova can't use (such as EMF or TIFF) were replaced by their alt text.`,
    );
  const parsed = PMDOMParser.fromSchema(schema).parse(page.body, {
    topNode: T.chapter.create({ file: "01.xhtml" }),
  });
  const chapters = splitChapters(parsed.content);
  const doc = T.doc.create(
    null,
    chapters.length ? chapters : [T.chapter.create({ file: "01.xhtml" }, T.paragraph.create())],
  );
  let title = "";
  doc.descendants((n) => {
    if (!title && n.type === T.heading) title = n.textContent.trim();
    return !title;
  });
  return {
    doc,
    meta: {
      identifier: `urn:uuid:${crypto.randomUUID()}`,
      title: title || stem(file.name),
      language: "en",
      authors: [],
      tokens: undefined,
    },
    assets,
    warnings,
  };
}
