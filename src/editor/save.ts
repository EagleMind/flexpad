// Save the edited document as a .flexova package. Serialization produces profile XHTML per chapter and
// normalizes what the editor schema can't express (required and unique ids, links that no longer
// resolve, at most one table/pre/blockquote/audio/math per figure, definition lists missing a term or
// definition). core's write() then validates the result, so a saved package is always valid.
import {
  parseXml,
  PROFILE,
  write,
  type Asset,
  type Chapter,
  type Tokens,
  type XmlElement,
} from "@flexova/core";
import type { Mark, Node as PMNode } from "prosemirror-model";
import type { AssetStore } from "./assets";
import { mathXml } from "./load";
import { attributeNames } from "./schema";

export interface SaveInput {
  doc: PMNode;
  meta: {
    identifier: string;
    title: string;
    language: string;
    authors: string[];
    tokens: Tokens | undefined;
  };
  assets: AssetStore;
  /** dcterms:modified; defaults to now. */
  modified?: string;
}

export interface SaveResult {
  bytes: Uint8Array;
  /** Things that were changed to keep the document valid, for the author to review. */
  warnings: string[];
}

// Characters XML 1.0 forbids, including lone surrogates.
const ILLEGAL =
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const esc = (s: string) =>
  s.replace(ILLEGAL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");
const clean = (s: string) => s.replace(ILLEGAL, "").trim();
const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/;
const EXTERNAL = /^(https?:|mailto:)/i;
const BOOLEAN_ATTRS: Record<string, string> = { reversed: "reversed", controls: "controls" };
const FIGURE_SINGLES = new Set(["table", "code_block", "blockquote", "audio", "figure_math"]);

/** An ASCII id from text, like the importers make. */
export function slug(text: string): string {
  const ascii = text
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  if (!ascii) return "section";
  return /^[a-z]/.test(ascii) ? ascii : `s-${ascii}`;
}

function attrString(
  tag: string,
  attrs: Record<string, unknown>,
  overrides: Record<string, string | null> = {},
): string {
  let out = "";
  for (const name of attributeNames(tag)) {
    const value = name in overrides ? overrides[name] : attrs[name];
    if (value === null || value === undefined || value === false || value === "") continue;
    out += ` ${name}="${escAttr(BOOLEAN_ATTRS[name] ?? String(value))}"`;
  }
  return out;
}

interface ChapterContext {
  ids: Map<PMNode, string>;
  /** Ids already written in this chapter, so a mark repeated elsewhere doesn't duplicate its id. */
  emitted: Set<string>;
  /** Ids per chapter file, for checking links. */
  allIds: Map<string, Set<string>>;
  file: string;
  assets: AssetStore;
  usedAssets: Set<string>;
  warnings: string[];
}

/** Plan ids for one chapter: keep valid unique ones, add missing required ones, rename duplicates. */
function planIds(chapter: PMNode): { ids: Map<PMNode, string>; markIds: Set<string> } {
  const ids = new Map<PMNode, string>();
  const used = new Set<string>();
  // Ids on marks (such as a footnote reference's <a id>) are kept as they are; nodes avoid them.
  const markIds = new Set<string>();
  chapter.descendants((node) => {
    for (const mark of node.marks) {
      const id = mark.attrs.id as string | null | undefined;
      if (id && ID_PATTERN.test(id)) markIds.add(id);
    }
    return true;
  });
  for (const id of markIds) used.add(id);
  const take = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  chapter.descendants((node) => {
    const own = node.attrs.id as string | null | undefined;
    const required =
      node.type.name === "heading" || node.type.name === "figure" || node.type.name === "table";
    if (own && ID_PATTERN.test(own)) ids.set(node, take(own));
    else if (required) {
      const text =
        node.type.name === "table"
          ? String(node.attrs.caption || "table")
          : node.textContent || node.type.name;
      ids.set(node, take(slug(text)));
    }
    return true;
  });
  return { ids, markIds };
}

/** The opening tag and element name for a mark, or null to leave it out. */
function markOpen(mark: Mark, ctx: ChapterContext): { html: string; tag: string } | null {
  let tag = mark.type.name;
  const id = mark.attrs.id as string | null | undefined;
  const keepId = !!id && ID_PATTERN.test(id) && !ctx.emitted.has(id);
  if (tag === "a" && !linkResolves(String(mark.attrs.href ?? ""), ctx)) {
    // An unlinked link keeps its id (something may point at it) as a span.
    if (!keepId) return null;
    tag = "span";
    ctx.emitted.add(id);
    return { html: `<span id="${escAttr(id)}">`, tag };
  }
  if (keepId) ctx.emitted.add(id);
  return { html: `<${tag}${attrString(tag, mark.attrs, { id: keepId ? id : null })}>`, tag };
}

function linkResolves(href: string, ctx: ChapterContext): boolean {
  if (EXTERNAL.test(href)) return true;
  const [file, fragment] = href.split("#", 2) as [string, string | undefined];
  const target = file || ctx.file;
  const ids = ctx.allIds.get(target);
  if (!ids) return false;
  return !fragment || ids.has(fragment);
}

/** Inline content with marks opened and closed in schema order (outer marks first). */
function inline(parent: PMNode, ctx: ChapterContext): string {
  let out = "";
  let open: { mark: Mark; tag: string | null }[] = [];
  const close = (to: number) => {
    while (open.length > to) {
      const top = open.pop();
      if (top?.tag) out += `</${top.tag}>`;
    }
  };
  parent.forEach((child) => {
    const marks = child.marks;
    let keep = 0;
    while (keep < open.length && keep < marks.length && open[keep]?.mark.eq(marks[keep] as Mark))
      keep++;
    close(keep);
    for (let i = keep; i < marks.length; i++) {
      const mark = marks[i] as Mark;
      const tag = markOpen(mark, ctx);
      if (mark.type.name === "a" && (!tag || tag.tag !== "a")) {
        const warning = `A link to “${String(mark.attrs.href)}” no longer leads anywhere, so it was removed (the text is kept).`;
        if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
      }
      if (tag) out += tag.html;
      open.push({ mark, tag: tag?.tag ?? null });
    }
    out += leaf(child, ctx);
  });
  close(0);
  open = [];
  return out;
}

function image(node: PMNode, ctx: ChapterContext): string {
  const key = String(node.attrs.src ?? "");
  if (!ctx.assets.has(key)) return "";
  ctx.usedAssets.add(key);
  return `<img${attrString("img", node.attrs, { src: `../${key}`, alt: null, id: ctx.ids.get(node) ?? (node.attrs.id as string | null) })} alt="${escAttr(String(node.attrs.alt ?? ""))}"/>`;
}

function picture(node: PMNode, ctx: ChapterContext): string {
  const sources = JSON.parse(String(node.attrs.sources)) as Record<string, string | null>[];
  const img = JSON.parse(String(node.attrs.img)) as Record<string, string | null>;
  const key = img.src ?? "";
  if (!ctx.assets.has(key)) return "";
  ctx.usedAssets.add(key);
  let out = `<picture${attrString("picture", node.attrs)}>`;
  for (const s of sources) {
    const k = s.srcset ?? "";
    if (!ctx.assets.has(k)) continue;
    ctx.usedAssets.add(k);
    out += `<source${attrString("source", s, { srcset: `../${k}` })}/>`;
  }
  out += `<img${attrString("img", img, { src: `../${key}`, alt: null })} alt="${escAttr(img.alt ?? "")}"/>`;
  return `${out}</picture>`;
}

/** MathML is re-checked against the profile before it is written. */
function math(node: PMNode): string {
  const { root, error } = parseXml(new TextEncoder().encode(String(node.attrs.xml)), false);
  if (!root || error) return "";
  const allowed = new Set(PROFILE.mathml.elements);
  const ok = (el: XmlElement): boolean =>
    el.ns === PROFILE.namespaces.mathml && allowed.has(el.local) && el.elements().every(ok);
  return ok(root) && root.local === "math" ? mathXml(root) : "";
}

function leaf(node: PMNode, ctx: ChapterContext): string {
  switch (node.type.name) {
    case "text":
      return esc(node.text ?? "");
    case "image":
      return image(node, ctx);
    case "picture":
      return picture(node, ctx);
    case "math":
      return math(node);
    case "hard_break":
      return "<br/>";
    default:
      return "";
  }
}

const idOf = (node: PMNode, ctx: ChapterContext) => ({ id: ctx.ids.get(node) ?? null });

/** li, dd, td and th: inline content directly when the loader wrapped it, blocks otherwise. */
function flow(node: PMNode, ctx: ChapterContext): string {
  const only = node.childCount === 1 ? node.firstChild : null;
  if (
    only &&
    only.type.name === "paragraph" &&
    only.attrs.implicit &&
    attributeNames("p").every((a) => !only.attrs[a])
  ) {
    return inline(only, ctx);
  }
  return blocks(node, ctx);
}

function blocks(parent: PMNode, ctx: ChapterContext): string {
  let out = "";
  parent.forEach((child) => (out += block(child, ctx)));
  return out;
}

function table(node: PMNode, ctx: ChapterContext): string {
  // Merging cells can leave a row with no cells of its own, which the profile forbids: drop such rows
  // and shrink the row spans that covered them.
  const all: PMNode[] = [];
  node.forEach((row) => all.push(row));
  const empty = all.map((row) => row.childCount === 0);
  const emptyBetween = (from: number, to: number) => empty.slice(from, to).filter(Boolean).length;
  const rows: { section: string; group: number; html: string }[] = [];
  all.forEach((row, r) => {
    if (empty[r]) return;
    let cells = "";
    row.forEach((cell) => {
      const tag = cell.type.name === "table_header" ? "th" : "td";
      const rowspan = Number(cell.attrs.rowspan) || 1;
      const effectiveRowspan = rowspan - emptyBetween(r + 1, r + rowspan);
      const span = (n: number) => (n > 1 ? String(n) : null);
      const attrs = attrString(tag, cell.attrs, {
        colspan: span(Number(cell.attrs.colspan) || 1),
        rowspan: span(effectiveRowspan),
        id: ctx.ids.get(cell) ?? (cell.attrs.id as string | null),
      });
      cells += `<${tag}${attrs}>${flow(cell, ctx)}</${tag}>`;
    });
    rows.push({
      section: String(row.attrs.section),
      group: Number(row.attrs.group) || 0,
      html: `<tr>${cells}</tr>`,
    });
  });
  const head = rows.filter((r) => r.section === "head");
  const foot = rows.filter((r) => r.section === "foot");
  let body = rows.filter((r) => r.section !== "head" && r.section !== "foot");
  let headHtml = head.map((r) => r.html).join("");
  if (!body.length) {
    body = head; // a table needs a tbody
    headHtml = "";
  }
  let bodies = "";
  let current = Number.NaN;
  for (const r of body) {
    if (r.group !== current) {
      if (bodies) bodies += "</tbody>";
      bodies += "<tbody>";
      current = r.group;
    }
    bodies += r.html;
  }
  bodies += "</tbody>";
  const caption = String(node.attrs.caption || "").trim();
  return (
    `<table${attrString("table", node.attrs, { ...idOf(node, ctx), caption: null })}>` +
    (caption ? `<caption>${esc(caption)}</caption>` : "") +
    (headHtml ? `<thead>${headHtml}</thead>` : "") +
    bodies +
    (foot.length ? `<tfoot>${foot.map((r) => r.html).join("")}</tfoot>` : "") +
    "</table>"
  );
}

/** A figure within the profile's limits; anything extra follows the figure. */
function figure(node: PMNode, ctx: ChapterContext): string {
  const inside: string[] = [];
  const after: string[] = [];
  const seen = new Set<string>();
  const captions: PMNode[] = [];
  let items = 0;
  node.forEach((child) => {
    const name = child.type.name;
    if (name === "figcaption") {
      captions.push(child);
      return;
    }
    if (FIGURE_SINGLES.has(name)) {
      if (seen.has(name)) {
        after.push(name === "figure_math" ? `<p>${math(child)}</p>` : block(child, ctx));
        return;
      }
      seen.add(name);
    }
    const html =
      name === "figure_image"
        ? image(child, ctx)
        : name === "figure_picture"
          ? picture(child, ctx)
          : name === "figure_math"
            ? math(child)
            : block(child, ctx);
    if (html) {
      inside.push(html);
      items++;
    }
  });
  const caption = captions
    .map((c) => inline(c, ctx))
    .filter(Boolean)
    .join(" ");
  if (!items) return (caption ? `<p>${caption}</p>` : "") + after.join("");
  const captionAttrs = captions[0] ? attrString("figcaption", captions[0].attrs) : "";
  return (
    `<figure${attrString("figure", node.attrs, idOf(node, ctx))}>${inside.join("")}` +
    (caption
      ? `<figcaption${captionAttrs}>${captions[0]?.attrs.paragraph ? `<p>${caption}</p>` : caption}</figcaption>`
      : "") +
    `</figure>${after.join("")}`
  );
}

function definitionList(node: PMNode, ctx: ChapterContext): string {
  let terms = 0;
  let details = 0;
  node.forEach((c) => (c.type.name === "definition_term" ? terms++ : details++));
  if (!terms || !details) {
    // A definition list needs both; keep the content as paragraphs and blocks instead.
    let out = "";
    node.forEach(
      (c) =>
        (out += c.type.name === "definition_term" ? `<p>${inline(c, ctx)}</p>` : blocks(c, ctx)),
    );
    return out;
  }
  let out = `<dl${attrString("dl", node.attrs)}>`;
  node.forEach((c) => {
    out +=
      c.type.name === "definition_term"
        ? `<dt${attrString("dt", c.attrs)}>${inline(c, ctx)}</dt>`
        : `<dd${attrString("dd", c.attrs)}>${flow(c, ctx)}</dd>`;
  });
  return `${out}</dl>`;
}

function block(node: PMNode, ctx: ChapterContext): string {
  const a = (tag: string, extra: Record<string, string | null> = {}) =>
    attrString(tag, node.attrs, {
      id: ctx.ids.get(node) ?? (node.attrs.id as string | null),
      ...extra,
    });
  switch (node.type.name) {
    case "paragraph":
      return `<p${a("p")}>${inline(node, ctx)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 2));
      return `<h${level}${a("h1")}>${inline(node, ctx)}</h${level}>`;
    }
    case "code_block":
      return `<pre${a("pre")}>${inline(node, ctx)}</pre>`;
    case "blockquote":
      return `<blockquote${a("blockquote")}>${blocks(node, ctx)}</blockquote>`;
    case "callout": {
      const variant = node.attrs["data-flexova-variant"] as string | null;
      return `<aside${a("aside", { role: variant || node.attrs.role ? "note" : null })}>${blocks(node, ctx)}</aside>`;
    }
    case "section":
      return `<section${a("section")}>${blocks(node, ctx)}</section>`;
    case "bullet_list":
    case "ordered_list": {
      const tag = node.type.name === "bullet_list" ? "ul" : "ol";
      let items = "";
      node.forEach(
        (li) =>
          (items += `<li${attrString("li", li.attrs, { id: ctx.ids.get(li) ?? (li.attrs.id as string | null) })}>${flow(li, ctx)}</li>`),
      );
      const raw = node.attrs.start as unknown;
      const start =
        tag === "ol" &&
        raw !== null &&
        raw !== undefined &&
        /^\d{1,6}$/.test(String(raw)) &&
        Number(raw) !== 1
          ? String(Number(raw))
          : null;
      return `<${tag}${a(tag, tag === "ol" ? { start } : {})}>${items}</${tag}>`;
    }
    case "definition_list":
      return definitionList(node, ctx);
    case "figure":
      return figure(node, ctx);
    case "table":
      return table(node, ctx);
    case "horizontal_rule":
      return `<hr${a("hr")}/>`;
    case "details": {
      let out = `<details${a("details")}>`;
      node.forEach(
        (c) =>
          (out +=
            c.type.name === "summary"
              ? `<summary${attrString("summary", c.attrs)}>${inline(c, ctx)}</summary>`
              : block(c, ctx)),
      );
      return `${out}</details>`;
    }
    case "audio": {
      const key = String(node.attrs.src ?? "");
      if (!ctx.assets.has(key)) return "";
      ctx.usedAssets.add(key);
      return `<audio${a("audio", { src: `../${key}`, controls: "controls" })}>${esc(String(node.attrs.fallback || ""))}</audio>`;
    }
    case "figure_image":
      return `<p>${image(node, ctx)}</p>`;
    case "figure_picture":
      return `<p>${picture(node, ctx)}</p>`;
    case "figure_math":
      return `<p>${math(node)}</p>`;
    default:
      return "";
  }
}

/** Ids every chapter will have after saving, so links can be checked across chapters. */
function collectIds(doc: PMNode): {
  plans: Map<PMNode, Map<PMNode, string>>;
  all: Map<string, Set<string>>;
} {
  const plans = new Map<PMNode, Map<PMNode, string>>();
  const all = new Map<string, Set<string>>();
  doc.forEach((chapter) => {
    const { ids, markIds } = planIds(chapter);
    plans.set(chapter, ids);
    all.set(String(chapter.attrs.file), new Set([...ids.values(), ...markIds]));
  });
  return { plans, all };
}

/** Chapter files: keep valid unique names, otherwise number them. */
export function chapterFiles(doc: PMNode): string[] {
  const used = new Set<string>();
  const files: string[] = [];
  doc.forEach((chapter, _offset, index) => {
    let file = String(chapter.attrs.file ?? "");
    if (!/^[A-Za-z0-9._-]+\.xhtml$/.test(file) || used.has(file) || ["nav.xhtml"].includes(file)) {
      let n = index + 1;
      do file = `${String(n++).padStart(2, "0")}.xhtml`;
      while (used.has(file));
    }
    used.add(file);
    files.push(file);
  });
  return files;
}

export function chapterTitle(chapter: PMNode, index: number): string {
  let title = "";
  chapter.descendants((node) => {
    if (title) return false;
    if (node.type.name === "heading") title = node.textContent.trim();
    return !title;
  });
  return title || `Chapter ${index + 1}`;
}

/** Serialize the document into write() input (exported for tests). */
export function toChapters(
  doc: PMNode,
  assets: AssetStore,
): { chapters: Chapter[]; assets: Asset[]; warnings: string[] } {
  const files = chapterFiles(doc);
  // Chapters are saved under their final names; links written as "file#id" follow them.
  const renamed = new Map<string, string>();
  doc.forEach((chapter, _o, i) => renamed.set(String(chapter.attrs.file), files[i] as string));
  const { plans, all } = collectIds(doc);
  const allByFinal = new Map<string, Set<string>>();
  for (const [file, ids] of all) allByFinal.set(renamed.get(file) ?? file, ids);
  const warnings: string[] = [];
  const usedAssets = new Set<string>();
  const chapters: Chapter[] = [];
  doc.forEach((chapter, _offset, index) => {
    const ctx: ChapterContext = {
      ids: plans.get(chapter) as Map<PMNode, string>,
      emitted: new Set(),
      allIds: allByFinal,
      file: files[index] as string,
      assets,
      usedAssets,
      warnings,
    };
    chapters.push({
      title: clean(chapterTitle(chapter, index)) || `Chapter ${index + 1}`,
      body: blocks(chapter, ctx),
      file: files[index] as string,
    });
  });
  const out: Asset[] = [...usedAssets].sort().map((key) => {
    const a = assets.get(key) as { data: Uint8Array; mediaType: string };
    return { path: key, mediaType: a.mediaType, data: a.data };
  });
  return { chapters, assets: out, warnings };
}

export async function save(input: SaveInput): Promise<SaveResult> {
  const { chapters, assets, warnings } = toChapters(input.doc, input.assets);
  const modified = input.modified ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const bytes = await write({
    identifier: input.meta.identifier,
    title: clean(input.meta.title) || chapters[0]?.title || "Untitled document",
    authors: input.meta.authors.map(clean).filter(Boolean),
    language: input.meta.language || "en",
    modified,
    chapters,
    assets,
    ...(input.meta.tokens ? { tokens: input.meta.tokens } : {}),
  });
  return { bytes, warnings };
}
