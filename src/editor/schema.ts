// The editor's ProseMirror schema, generated from the Flexova content profile (@flexova/core PROFILE):
// every attribute an element may carry comes from the profile, and every profile element flagged as a
// mark becomes a mark. How elements nest is mapped here once (ProseMirror can't express every profile
// rule, such as "at most one table per figure"); save.ts normalizes the rest, and core's write() checks
// the result. A coverage test fails when the profile gains an element this file doesn't handle.
import { PROFILE } from "@flexova/core";
import {
  Schema,
  type Attrs,
  type DOMOutputSpec,
  type MarkSpec,
  type Node,
  type NodeSpec,
  type Mark,
} from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const EPUB_NS = PROFILE.namespaces.epub;
const XML_NS = PROFILE.namespaces.xml;
/** Global attributes kept on every element; xml:lang is folded into lang. */
const GLOBAL = ["id", "lang", "dir", "epub:type"];
/** A private attribute name for the loader's markers, so pasted HTML can never forge them. */
export const MARKER = `data-fp-${Math.random().toString(36).slice(2, 10)}`;

type Taggable = Node | Mark;

/** The attribute names an element may carry, in profile order: globals, then its own. */
export function attributeNames(tag: string): string[] {
  const own = Object.keys(PROFILE.elements[tag]?.attributes ?? {});
  return [...GLOBAL, ...own.filter((a) => !GLOBAL.includes(a))];
}

function attrSpecs(tag: string, extra: Record<string, { default: unknown }> = {}) {
  const specs: Record<string, { default: unknown }> = {};
  for (const name of attributeNames(tag)) specs[name] = { default: null };
  return { ...specs, ...extra };
}

/** Read an element's profile attributes from the DOM. */
export function readAttrs(dom: HTMLElement, tag: string): Attrs {
  const attrs: Record<string, string | null> = {};
  for (const name of attributeNames(tag)) {
    if (name === "epub:type")
      attrs[name] = dom.getAttributeNS(EPUB_NS, "type") ?? dom.getAttribute("epub:type");
    else if (name === "lang")
      attrs[name] = dom.getAttribute("lang") ?? dom.getAttributeNS(XML_NS, "lang");
    else attrs[name] = dom.getAttribute(name);
  }
  return attrs;
}

/** Non-null profile attributes of a node or mark, for rendering. */
export function presentAttrs(item: Taggable, tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of attributeNames(tag)) {
    const value = item.attrs[name] as unknown;
    if (value !== null && value !== undefined && value !== false) out[name] = String(value);
  }
  return out;
}

const element = (
  tag: string,
  content: string,
  group: string,
  extra: Partial<NodeSpec> = {},
): NodeSpec => ({
  group,
  content,
  attrs: attrSpecs(tag),
  parseDOM: [{ tag, getAttrs: (dom) => readAttrs(dom as HTMLElement, tag) }],
  toDOM: (node): DOMOutputSpec => [tag, presentAttrs(node, tag), 0],
  ...extra,
});

// Atoms that hold a file: rendered through the asset store (see assets.ts) so the editor shows the image.
let resolveAsset: (key: string) => string = (key) => key;
export function setAssetResolver(fn: (key: string) => string): void {
  resolveAsset = fn;
}

const imageSpec = (group: string, inline: boolean): NodeSpec => ({
  group,
  inline,
  atom: true,
  draggable: true,
  attrs: attrSpecs("img"),
  parseDOM: [
    {
      tag: "img[src]",
      ...(inline ? {} : { context: "figure/", priority: 60 }),
      getAttrs: (dom) => readAttrs(dom as HTMLElement, "img"),
    },
  ],
  toDOM: (node) => [
    "img",
    { ...presentAttrs(node, "img"), src: resolveAsset(String(node.attrs.src)) },
  ],
});

/** MathML is kept verbatim (sanitized on save) and shown as a labelled chip. */
const mathSpec = (group: string, inline: boolean): NodeSpec => ({
  group,
  inline,
  atom: true,
  attrs: { xml: { default: "" }, label: { default: "Formula" } },
  parseDOM: [
    {
      tag: "span",
      priority: 60,
      ...(inline ? {} : { context: "figure/", priority: 61 }),
      // Only the loader's placeholders (marked with the private attribute) are math.
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        if (!el.hasAttribute(`${MARKER}-math`)) return false;
        return {
          xml: el.getAttribute(`${MARKER}-math`) ?? "",
          label: el.getAttribute("title") || "Formula",
        };
      },
    },
  ],
  toDOM: (node) => [
    "span",
    { class: "fp-math", role: "img", "aria-label": `Formula: ${node.attrs.label}` },
    `∑ ${node.attrs.label}`,
  ],
});

/** <picture> is kept as an atom: its sources and fallback image round-trip unchanged. */
const pictureSpec = (group: string, inline: boolean): NodeSpec => ({
  group,
  inline,
  atom: true,
  attrs: { ...attrSpecs("picture"), sources: { default: "[]" }, img: { default: "{}" } },
  parseDOM: [
    {
      tag: "picture",
      ...(inline ? {} : { context: "figure/", priority: 60 }),
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const sources = [...el.querySelectorAll("source")].map((s) => readAttrs(s, "source"));
        const img = el.querySelector("img");
        return {
          ...readAttrs(el, "picture"),
          sources: JSON.stringify(sources),
          img: JSON.stringify(img ? readAttrs(img, "img") : {}),
        };
      },
    },
  ],
  toDOM: (node) => {
    const img = JSON.parse(String(node.attrs.img)) as Record<string, string | null>;
    return ["img", { src: resolveAsset(img.src ?? ""), alt: img.alt ?? "" }];
  },
});

const audioSpec: NodeSpec = {
  group: "block figure_item",
  atom: true,
  attrs: { ...attrSpecs("audio"), fallback: { default: "" } },
  parseDOM: [
    {
      tag: "audio",
      getAttrs: (dom) => ({
        ...readAttrs(dom as HTMLElement, "audio"),
        fallback: (dom as HTMLElement).textContent ?? "",
      }),
    },
  ],
  toDOM: (node) => ["audio", { src: resolveAsset(String(node.attrs.src)), controls: "controls" }],
};

const headingRules = [1, 2, 3, 4, 5, 6].map((level) => ({
  tag: `h${level}`,
  getAttrs: (dom: HTMLElement | string) => ({ ...readAttrs(dom as HTMLElement, "h1"), level }),
}));

const table = tableNodes({
  tableGroup: "block figure_item",
  cellContent: "block+",
  cellAttributes: {
    id: {
      default: null,
      getFromDOM: (d) => d.getAttribute("id"),
      setDOMAttr: (v, a) => v && (a.id = v),
    },
    lang: {
      default: null,
      getFromDOM: (d) => d.getAttribute("lang"),
      setDOMAttr: (v, a) => v && (a.lang = v),
    },
    dir: {
      default: null,
      getFromDOM: (d) => d.getAttribute("dir"),
      setDOMAttr: (v, a) => v && (a.dir = v),
    },
    scope: {
      default: null,
      getFromDOM: (d) => d.getAttribute("scope"),
      setDOMAttr: (v, a) => v && (a.scope = v),
    },
  },
});
// Rows remember which section they came from (thead, one of the tbodys, tfoot), so tables round-trip.
table.table_row = {
  ...table.table_row,
  attrs: { section: { default: "body" }, group: { default: 0 } },
  parseDOM: [
    {
      tag: "tr",
      getAttrs: (dom) => {
        const parent = (dom as HTMLElement).parentElement;
        const section =
          parent?.localName === "thead" ? "head" : parent?.localName === "tfoot" ? "foot" : "body";
        const groupIndex =
          parent?.localName === "tbody"
            ? [...(parent.parentElement?.children ?? [])]
                .filter((c) => c.localName === "tbody")
                .indexOf(parent)
            : 0;
        return { section, group: Math.max(0, groupIndex) };
      },
    },
  ],
};
table.table = {
  ...table.table,
  attrs: { ...attrSpecs("table"), caption: { default: "" } },
  parseDOM: [
    {
      tag: "table",
      getAttrs: (dom) => ({
        ...readAttrs(dom as HTMLElement, "table"),
        caption:
          [...(dom as HTMLElement).children]
            .find((c) => c.localName === "caption")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? "",
      }),
    },
    // The caption is read by the rule above; its text must not also become a row.
    { tag: "caption", ignore: true },
  ],
  toDOM: (node) => ["table", presentAttrs(node, "table"), ["tbody", 0]],
};

const nodes: Record<string, NodeSpec> = {
  doc: { content: "chapter+" },
  chapter: {
    content: "block+",
    attrs: { file: { default: null } },
    defining: true,
    isolating: true,
    parseDOM: [{ tag: `div[${MARKER}-chapter]` }],
    toDOM: () => ["div", { class: "fp-chapter" }, 0],
  },
  paragraph: {
    ...element("p", "inline*", "block figure_item"),
    attrs: attrSpecs("p", { implicit: { default: false } }),
    parseDOM: [
      {
        tag: "p",
        getAttrs: (dom) => ({
          ...readAttrs(dom as HTMLElement, "p"),
          implicit: (dom as HTMLElement).hasAttribute(`${MARKER}-implicit`),
        }),
      },
    ],
  },
  heading: {
    group: "block",
    content: "inline*",
    defining: true,
    attrs: attrSpecs("h1", { level: { default: 2 } }),
    parseDOM: headingRules,
    toDOM: (node) => [`h${node.attrs.level}`, presentAttrs(node, "h1"), 0],
  },
  blockquote: element("blockquote", "block+", "block figure_item", { defining: true }),
  callout: element("aside", "block+", "block", {
    defining: true,
    // Imported Word callouts arrive as <aside class="warning">; ours carry data-flexova-variant.
    parseDOM: [
      {
        tag: "aside",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const attrs = readAttrs(el, "aside");
          const fromClass = ["note", "tip", "important", "warning", "caution"].find((v) =>
            el.classList.contains(v),
          );
          const variant = attrs["data-flexova-variant"] ?? fromClass ?? null;
          return {
            ...attrs,
            "data-flexova-variant": variant,
            role: variant || attrs.role ? "note" : null,
          };
        },
      },
    ],
  }),
  section: element("section", "block+", "block", { defining: true }),
  bullet_list: element("ul", "list_item+", "block"),
  ordered_list: element("ol", "list_item+", "block"),
  list_item: element("li", "block+", "", { defining: true }),
  definition_list: element("dl", "(definition_term | definition_details)+", "block"),
  definition_term: element("dt", "inline*", ""),
  definition_details: element("dd", "block+", "", { defining: true }),
  figure: element("figure", "(figure_item | figcaption)+", "block"),
  figcaption: {
    ...element("figcaption", "inline*", ""),
    attrs: attrSpecs("figcaption", { paragraph: { default: false } }),
    parseDOM: [
      {
        tag: "figcaption",
        getAttrs: (dom) => ({
          ...readAttrs(dom as HTMLElement, "figcaption"),
          paragraph: (dom as HTMLElement).hasAttribute(`${MARKER}-paragraph`),
        }),
      },
    ],
  },
  figure_image: imageSpec("figure_item", false),
  figure_picture: pictureSpec("figure_item", false),
  figure_math: mathSpec("figure_item", false),
  code_block: element("pre", "inline*", "block figure_item", {
    code: true,
    marks: "_",
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (dom) => readAttrs(dom as HTMLElement, "pre"),
      },
    ],
  }),
  horizontal_rule: {
    group: "block",
    attrs: attrSpecs("hr"),
    parseDOM: [{ tag: "hr", getAttrs: (dom) => readAttrs(dom as HTMLElement, "hr") }],
    toDOM: (node) => ["hr", presentAttrs(node, "hr")],
  },
  details: element("details", "summary block*", "block"),
  summary: element("summary", "inline*", ""),
  audio: audioSpec,
  ...table,
  text: { group: "inline" },
  image: imageSpec("inline", true),
  picture: pictureSpec("inline", true),
  math: mathSpec("inline", true),
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
};

// Marks: every profile element flagged `mark`.
const markTags = Object.entries(PROFILE.elements)
  .filter(([, def]) => (def as { mark?: boolean }).mark)
  .map(([tag]) => tag)
  // Links innermost (<sup><a>1</a></sup>), as the importers write footnote references.
  .sort((a, b) => (a === "a" ? 1 : b === "a" ? -1 : 0));

const EXTRA_PARSE: Record<string, string[]> = { strong: ["b"], em: ["i"], s: ["del", "strike"] };

const marks: Record<string, MarkSpec> = {};
for (const tag of markTags) {
  marks[tag] = {
    attrs: attrSpecs(tag),
    inclusive: tag !== "a",
    parseDOM: [tag, ...(EXTRA_PARSE[tag] ?? [])].map((t) => ({
      tag: t,
      getAttrs: (dom: HTMLElement | string) => readAttrs(dom as HTMLElement, tag),
    })),
    toDOM: (mark) => [tag, presentAttrs(mark, tag), 0],
  };
}

export const schema = new Schema({ nodes, marks });

/** The XHTML element a node type stands for (null for editor-only structure). */
export const TAG_OF: Record<string, string | null> = {
  doc: null,
  chapter: null,
  text: null,
  paragraph: "p",
  heading: null, // h1–h6 by level
  blockquote: "blockquote",
  callout: "aside",
  section: "section",
  bullet_list: "ul",
  ordered_list: "ol",
  list_item: "li",
  definition_list: "dl",
  definition_term: "dt",
  definition_details: "dd",
  figure: "figure",
  figcaption: "figcaption",
  figure_image: "img",
  figure_picture: "picture",
  figure_math: "math",
  code_block: "pre",
  horizontal_rule: "hr",
  details: "details",
  summary: "summary",
  audio: "audio",
  table: "table",
  table_row: "tr",
  table_cell: "td",
  table_header: "th",
  image: "img",
  picture: "picture",
  math: "math",
  hard_break: "br",
};

/** Profile elements the editor represents without a node of their own (document structure, table parts). */
export const STRUCTURAL = [
  "html",
  "head",
  "title",
  "meta",
  "link",
  "body",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "source",
];

const nodeType = (name: string) => {
  const t = schema.nodes[name];
  if (!t) throw new Error(`the editor schema has no node type ${name}`);
  return t;
};
const markType = (name: string) => {
  const t = schema.marks[name];
  if (!t) throw new Error(`the editor schema has no mark type ${name}`);
  return t;
};

/** Typed access to the node and mark types the editor code uses. */
export const T = {
  doc: nodeType("doc"),
  chapter: nodeType("chapter"),
  paragraph: nodeType("paragraph"),
  heading: nodeType("heading"),
  blockquote: nodeType("blockquote"),
  callout: nodeType("callout"),
  bullet_list: nodeType("bullet_list"),
  ordered_list: nodeType("ordered_list"),
  list_item: nodeType("list_item"),
  figure: nodeType("figure"),
  figcaption: nodeType("figcaption"),
  figure_image: nodeType("figure_image"),
  code_block: nodeType("code_block"),
  horizontal_rule: nodeType("horizontal_rule"),
  details: nodeType("details"),
  summary: nodeType("summary"),
  table: nodeType("table"),
  table_row: nodeType("table_row"),
  table_cell: nodeType("table_cell"),
  table_header: nodeType("table_header"),
  image: nodeType("image"),
  hard_break: nodeType("hard_break"),
};
export const M = {
  a: markType("a"),
  strong: markType("strong"),
  em: markType("em"),
  code: markType("code"),
  s: markType("s"),
  sub: markType("sub"),
  sup: markType("sup"),
  mark: markType("mark"),
};
