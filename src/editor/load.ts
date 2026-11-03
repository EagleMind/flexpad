// Open a .flexova package for editing: validated by core's read(), each chapter's XHTML is turned into
// DOM nodes in an inert document (never inserted into the page), then parsed into the editor schema.
// Asset references become asset-store keys and links between chapters become "file#id".
import { parseXml, PROFILE, read, type Tokens, type XmlElement } from "@flexova/core";
import { DOMParser as PMDOMParser, type Node as PMNode } from "prosemirror-model";
import { AssetStore } from "./assets";
import { MARKER, schema, T } from "./schema";

export interface DocMeta {
  identifier: string;
  title: string;
  language: string;
  authors: string[];
  tokens: Tokens | undefined;
}

export interface Editable {
  doc: PMNode;
  meta: DocMeta;
  assets: AssetStore;
}

const NS = PROFILE.namespaces;
const INLINE_ONLY_PARENTS = new Set(["li", "dd", "td", "th"]);
const isBlockElement = (el: XmlElement) =>
  el.ns === NS.xhtml && ["block"].includes(PROFILE.elements[el.local]?.category ?? "");

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");

/** Resolve a relative reference against a file's directory; null if it leaves the package. */
export function resolve(fromFile: string, ref: string): string | null {
  const parts = dirname(fromFile).split("/").filter(Boolean);
  for (const seg of ref.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Serialize a MathML subtree back to XML text (kept verbatim on the math node). */
export function mathXml(el: XmlElement, root = true): string {
  const attrs = el.attrs
    .filter((a) => a.ns === "" && PROFILE.mathml.attributes.includes(a.local))
    .map((a) => ` ${a.local}="${escapeXml(a.value)}"`)
    .join("");
  const xmlns = root ? ` xmlns="${NS.mathml}"` : "";
  const inner = el.children
    .map((c) => (typeof c === "string" ? escapeXml(c) : mathXml(c, false)))
    .join("");
  return `<${el.local}${xmlns}${attrs}>${inner}</${el.local}>`;
}

interface Context {
  doc: Document;
  chapterPath: string;
  opfDir: string;
  chapterFiles: Map<string, string>; // package path -> editor file name
}

function convert(el: XmlElement, ctx: Context): Node | null {
  if (el.ns === NS.mathml && el.local === "math") {
    const span = ctx.doc.createElement("span");
    span.setAttribute(`${MARKER}-math`, mathXml(el));
    span.setAttribute("title", el.attr("alttext") ?? el.text().trim().slice(0, 40));
    return span;
  }
  if (el.ns !== NS.xhtml) return null;
  const dom = ctx.doc.createElement(el.local);
  for (const a of el.attrs) {
    if (a.ns === NS.epub && a.local === "type") dom.setAttribute("epub:type", a.value);
    else if (a.ns === NS.xml && a.local === "lang") {
      if (!el.attr("lang")) dom.setAttribute("lang", a.value);
    } else if (a.ns === "") dom.setAttribute(a.local, rewrite(el.local, a.local, a.value, ctx));
  }
  let kids = el.children;
  // A figcaption holding a single paragraph is edited as inline text and saved back as a paragraph.
  const elementKids = kids.filter((c): c is XmlElement => typeof c !== "string");
  if (
    el.local === "figcaption" &&
    elementKids.length === 1 &&
    elementKids[0]?.local === "p" &&
    kids.every((c) => typeof c !== "string" || !c.trim())
  ) {
    dom.setAttribute(`${MARKER}-paragraph`, "");
    kids = elementKids[0].children;
  }
  const wrapInline =
    INLINE_ONLY_PARENTS.has(el.local) &&
    !kids.some((c) => typeof c !== "string" && isBlockElement(c));
  const target = wrapInline ? ctx.doc.createElement("p") : dom;
  if (wrapInline) {
    target.setAttribute(`${MARKER}-implicit`, "");
    dom.append(target);
  }
  for (const child of kids) {
    if (typeof child === "string") target.append(ctx.doc.createTextNode(child));
    else {
      const node = convert(child, ctx);
      if (node) target.append(node);
    }
  }
  return dom;
}

/** Asset references become store keys; links between chapters become "file#id". */
function rewrite(tag: string, attr: string, value: string, ctx: Context): string {
  if (
    (attr === "src" && (tag === "img" || tag === "audio")) ||
    (attr === "srcset" && tag === "source")
  ) {
    const path = resolve(ctx.chapterPath, value);
    return path && path.startsWith(ctx.opfDir) ? path.slice(ctx.opfDir.length) : value;
  }
  if (attr === "href" && tag === "a" && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const [file, fragment] = value.split("#", 2) as [string, string | undefined];
    if (!file) return value; // "#id" stays within the chapter
    const target = resolve(ctx.chapterPath, file);
    const name = target ? ctx.chapterFiles.get(target) : undefined;
    if (!name) return value;
    if (target === ctx.chapterPath) return fragment ? `#${fragment}` : value;
    return fragment ? `${name}#${fragment}` : name;
  }
  return value;
}

/** Turn a valid package into an editable document. Throws FlexovaError for invalid packages. */
export async function loadForEditing(bytes: Uint8Array): Promise<Editable> {
  const pkg = await read(bytes);
  const opfDir = dirname(pkg.opfPath);
  const assets = new AssetStore();
  for (const item of pkg.items) {
    const kind = AssetStore.kindOf(item.mediaType);
    const data = pkg.entries.get(item.path);
    if ((kind === "image" || kind === "audio") && data && item.path.startsWith(opfDir)) {
      assets.set(item.path.slice(opfDir.length), { data, mediaType: item.mediaType });
    }
  }
  const taken = new Set<string>();
  const chapterFiles = new Map<string, string>();
  for (const path of pkg.spine) {
    let name = path.split("/").pop() as string;
    for (let n = 2; taken.has(name); n++) name = name.replace(/(-\d+)?\.xhtml$/, `-${n}.xhtml`);
    taken.add(name);
    chapterFiles.set(path, name);
  }
  const inert = document.implementation.createHTMLDocument("");
  const parser = PMDOMParser.fromSchema(schema);
  const chapters: PMNode[] = [];
  for (const path of pkg.spine) {
    const { root } = parseXml(pkg.entries.get(path) as Uint8Array, true);
    const body = root?.elements().find((e) => e.local === "body");
    const container = inert.createElement("div");
    container.setAttribute(`${MARKER}-chapter`, "");
    const ctx: Context = { doc: inert, chapterPath: path, opfDir, chapterFiles };
    for (const child of body?.children ?? []) {
      if (typeof child === "string") container.append(inert.createTextNode(child));
      else {
        const node = convert(child, ctx);
        if (node) container.append(node);
      }
    }
    const chapter = parser.parse(container, {
      topNode: T.chapter.create({ file: chapterFiles.get(path) }),
    });
    chapters.push(chapter);
  }
  return {
    doc: T.doc.create(null, chapters),
    meta: {
      identifier: pkg.identifier,
      title: pkg.title,
      language: pkg.language,
      authors: pkg.authors,
      tokens: pkg.tokens,
    },
    assets,
  };
}

/** A new, empty document. */
export function blankDocument(language: string, title: string): Editable {
  const heading = T.heading.create({ level: 1 }, title ? schema.text(title) : null);
  const chapter = T.chapter.create({ file: "01.xhtml" }, [heading, T.paragraph.create()]);
  return {
    doc: T.doc.create(null, [chapter]),
    // No explicit title yet: the document is titled by its first heading until the author sets one.
    meta: {
      identifier: `urn:uuid:${crypto.randomUUID()}`,
      title: "",
      language,
      authors: [],
      tokens: undefined,
    },
    assets: new AssetStore(),
  };
}
