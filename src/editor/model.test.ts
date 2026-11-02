// The editor model: round trips keep content, and no sequence of edits can produce an invalid package.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXml, PROFILE, read, validate, type XmlElement } from "@flexova/core";
import {
  wrapIn,
  setBlockType,
  toggleMark,
  splitBlock,
  joinBackward,
  lift,
} from "prosemirror-commands";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { wrapInList } from "prosemirror-schema-list";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import {
  addColumnAfter,
  addRowAfter,
  deleteRow,
  mergeCells,
  tableEditing,
} from "prosemirror-tables";
import { describe, expect, it } from "vitest";
import { blankDocument, loadForEditing } from "./load";
import { save } from "./save";
import { M, schema, STRUCTURAL, T, TAG_OF } from "./schema";

const FIXTURES = join(import.meta.dirname, "..", "..", "e2e", "fixtures");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));
const MODIFIED = "2026-11-02T00:00:00Z";

const INLINE_PARENTS = new Set(["li", "td", "th", "dd"]);

/** A canonical string for a chapter body: sorted attributes, collapsed whitespace, li/td/dd > p unwrapped. */
function canon(el: XmlElement): string {
  let kids = el.children;
  const only = el.elements();
  if (
    INLINE_PARENTS.has(el.local) &&
    only.length === 1 &&
    only[0]?.local === "p" &&
    !only[0].attrs.length &&
    el.texts().every((t) => !t.trim())
  ) {
    kids = only[0].children;
  }
  const attrs = el.attrs
    .filter((a) => !(a.local === "lang" && a.ns !== "" && el.attr("lang")))
    .map((a) => `${a.local === "lang" ? "lang" : a.local}=${a.value}`)
    .sort()
    .join(" ");
  const inner = kids
    .map((c) => (typeof c === "string" ? c.replace(/\s+/g, " ") : canon(c)))
    .join("");
  return `<${el.local}${attrs ? " " + attrs : ""}>${inner}</${el.local}>`
    .replace(/\s+</g, "<")
    .replace(/>\s+/g, ">");
}

async function chapterBodies(bytes: Uint8Array): Promise<string[]> {
  const pkg = await read(bytes);
  return pkg.spine.map((path) => {
    const { root } = parseXml(pkg.entries.get(path) as Uint8Array, true);
    const body = root?.elements().find((e) => e.local === "body") as XmlElement;
    return canon(body);
  });
}

const roundTrip = async (bytes: Uint8Array) => {
  const editable = await loadForEditing(bytes);
  return save({ ...editable, modified: MODIFIED });
};

describe("editor schema", () => {
  it("covers every element of the content profile", () => {
    const represented = new Set([
      ...Object.values(TAG_OF).filter(Boolean),
      ...Object.keys(schema.marks),
      ...STRUCTURAL,
    ]);
    const missing = Object.keys(PROFILE.elements).filter((tag) => !represented.has(tag));
    expect(missing).toEqual([]);
  });

  it("takes each element's attributes from the profile", () => {
    expect(Object.keys(T.callout.spec.attrs ?? {})).toEqual(
      expect.arrayContaining(["role", "data-flexova-variant", "id", "lang"]),
    );
    expect(Object.keys(M.a.spec.attrs ?? {})).toContain("href");
    expect(Object.keys(schema.marks)).toEqual(
      expect.arrayContaining(
        Object.entries(PROFILE.elements)
          .filter(([, d]) => (d as { mark?: boolean }).mark)
          .map(([t]) => t),
      ),
    );
  });
});

describe("round trips keep content", () => {
  const files = readdirSync(join(FIXTURES, "conformance")).map((f) => `conformance/${f}`);
  it.each([...files, "aurora-manual.flexova", "long.flexova"])("%s", async (name) => {
    const original = fixture(name);
    const { bytes, warnings } = await roundTrip(original);
    expect(
      (await validate(bytes)).codes.filter(
        (c) => !c.startsWith("PRF_HEADING_SKIP") && !c.startsWith("OPF_A11Y"),
      ),
    ).toEqual([]);
    expect(warnings).toEqual([]);
    expect(await chapterBodies(bytes)).toEqual(await chapterBodies(original));
  });

  it("is stable: saving twice gives identical bytes", async () => {
    const once = (await roundTrip(fixture("aurora-manual.flexova"))).bytes;
    expect((await roundTrip(once)).bytes).toEqual(once);
  });

  it("keeps metadata, tokens and assets", async () => {
    const original = await read(fixture("conformance/tokens-full.flexova"));
    const saved = await read((await roundTrip(fixture("conformance/tokens-full.flexova"))).bytes);
    expect([saved.title, saved.language, saved.identifier, saved.tokens]).toEqual([
      original.title,
      original.language,
      original.identifier,
      original.tokens,
    ]);
    const images = await read((await roundTrip(fixture("aurora-manual.flexova"))).bytes);
    expect([...images.entries.keys()].filter((k) => k.includes("assets/")).sort()).toEqual([
      "OEBPS/assets/flow.svg",
      "OEBPS/assets/panel.png",
    ]);
  });
});

describe("saving normalizes what the schema can't express", () => {
  const docWith = (blocks: PMNode[]) => {
    const blank = blankDocument("en", "T");
    return { ...blank, doc: T.doc.create(null, [T.chapter.create({ file: "01.xhtml" }, blocks)]) };
  };
  const p = (text: string, marks = [] as ReturnType<typeof M.a.create>[]) =>
    T.paragraph.create(null, text ? schema.text(text, marks) : null);

  it("adds missing ids and makes duplicates unique", async () => {
    const h = (text: string, id: string | null = null) =>
      T.heading.create({ level: 2, id }, schema.text(text));
    const { bytes } = await save({
      ...docWith([h("Intro"), h("Intro"), h("Other", "intro"), p("x")]),
      modified: MODIFIED,
    });
    expect((await validate(bytes)).valid).toBe(true);
    const body = (await chapterBodies(bytes))[0];
    expect(body).toContain(
      "<h2 id=intro>Intro</h2><h2 id=intro-2>Intro</h2><h2 id=intro-3>Other</h2>",
    );
  });

  it("unlinks links that no longer resolve, and says so", async () => {
    const link = (href: string) => M.a.create({ href });
    const { bytes, warnings } = await save({
      ...docWith([
        T.heading.create({ level: 1, id: "top" }, schema.text("Top")),
        p("ok", [link("#top")]),
        p("gone", [link("#missing")]),
        p("web", [link("https://example.org/")]),
      ]),
      modified: MODIFIED,
    });
    expect((await validate(bytes)).valid).toBe(true);
    const body = (await chapterBodies(bytes))[0] as string;
    expect(body).toContain("<a href=#top>ok</a>");
    expect(body).toContain("<p>gone</p>");
    expect(body).toContain("<a href=https://example.org/>web</a>");
    expect(warnings).toEqual([
      "A link to “#missing” no longer leads anywhere, so it was removed (the text is kept).",
    ]);
  });

  it("keeps figures within the profile's limits", async () => {
    const tableNode = () =>
      T.table.create(null, [T.table_row.create(null, [T.table_cell.create(null, p("c"))])]);
    const figure = T.figure.create(null, [
      tableNode(),
      tableNode(),
      T.figcaption.create(null, schema.text("Cap")),
    ]);
    const captionOnly = T.figure.create(null, [T.figcaption.create(null, schema.text("Lonely"))]);
    const { bytes } = await save({ ...docWith([figure, captionOnly]), modified: MODIFIED });
    expect((await validate(bytes)).valid).toBe(true);
    const body = (await chapterBodies(bytes))[0] as string;
    expect(body.match(/<table/g)).toHaveLength(2);
    expect(body).toContain("<p>Lonely</p>");
  });
});

// --- Randomized edits ------------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("no sequence of edits produces an invalid package", () => {
  const actions: ((state: EditorState, r: () => number) => EditorState)[] = [];
  const run = (cmd: Command) => (state: EditorState) => {
    let next = state;
    cmd(state, (tr) => (next = state.apply(tr)));
    return next;
  };
  const randomSelection = (state: EditorState, r: () => number) => {
    const size = state.doc.content.size;
    const a = Math.floor(r() * size);
    const b = Math.min(size, a + Math.floor(r() * 40));
    try {
      return state.apply(
        state.tr.setSelection(TextSelection.between(state.doc.resolve(a), state.doc.resolve(b))),
      );
    } catch {
      return state;
    }
  };
  const words = ["pump", "Valve ", "<b>&amp;", "naïve", "😀", "x\u0001y", " ", "مرحبا"];
  actions.push(
    (s, r) => s.apply(s.tr.insertText(words[Math.floor(r() * words.length)] as string)),
    (s, r) =>
      run(
        toggleMark(
          [M.strong, M.em, M.code, M.s, M.sup, M.mark][Math.floor(r() * 6)] as typeof M.strong,
        ),
      )(s),
    (s, r) =>
      run(
        toggleMark(M.a, {
          href: ["#nowhere", "https://example.org", "01.xhtml#x", "mailto:a@b.c"][
            Math.floor(r() * 4)
          ],
        }),
      )(s),
    (s, r) => run(setBlockType(T.heading, { level: 1 + Math.floor(r() * 6) }))(s),
    (s) => run(setBlockType(T.paragraph))(s),
    (s) => run(setBlockType(T.code_block))(s),
    (s) => run(wrapIn(T.blockquote))(s),
    (s, r) =>
      run(
        wrapIn(T.callout, {
          "data-flexova-variant": ["note", "warning", "tip"][Math.floor(r() * 3)],
          role: "note",
        }),
      )(s),
    (s, r) => run(wrapInList(r() < 0.5 ? T.bullet_list : T.ordered_list))(s),
    (s) => run(lift)(s),
    (s) => run(splitBlock)(s),
    (s) => run(joinBackward)(s),
    (s) => s.apply(s.tr.deleteSelection()),
    (s) => s.apply(s.tr.replaceSelectionWith(T.horizontal_rule.create())),
    (s) => {
      const cell = () => T.table_cell.create(null, T.paragraph.create(null, schema.text("cell")));
      const header = T.table_row.create({ section: "head" }, [
        T.table_header.create(null, T.paragraph.create()),
        T.table_header.create(null, T.paragraph.create()),
      ]);
      return s.apply(
        s.tr.replaceSelectionWith(
          T.table.create(null, [header, T.table_row.create(null, [cell(), cell()])]),
        ),
      );
    },
    (s) => run(addRowAfter)(s),
    (s) => run(addColumnAfter)(s),
    (s) => run(deleteRow)(s),
    (s) => run(mergeCells)(s),
    (s) =>
      s.apply(
        s.tr.replaceSelectionWith(
          T.figure.create(null, [
            T.figure_image.create({ src: "assets/panel.png", alt: "Panel" }),
            T.figcaption.create(null, schema.text("Caption")),
          ]),
        ),
      ),
    (s) => s.apply(s.tr.replaceSelectionWith(T.image.create({ src: "assets/panel.png", alt: "" }))),
    (s) =>
      s.apply(
        s.tr.insert(
          s.doc.content.size,
          T.chapter.create(
            { file: "01.xhtml" },
            T.paragraph.create(null, schema.text("New chapter")),
          ),
        ),
      ),
    (s) =>
      s.apply(
        s.tr.replaceSelectionWith(
          T.details.create(null, [
            T.summary.create(null, schema.text("More")),
            T.paragraph.create(),
          ]),
        ),
      ),
    (s) =>
      s.apply(
        s.tr.replaceWith(
          0,
          s.doc.content.size,
          Fragment.from(T.chapter.create({ file: "01.xhtml" }, T.paragraph.create())),
        ),
      ),
  );

  const SEEDS = Number(process.env.FLEXPAD_SEEDS ?? 200);
  it(`${SEEDS} random sequences of 30 edits all save as valid packages`, async () => {
    const start = await loadForEditing(fixture("aurora-manual.flexova"));
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = rng(seed);
      // The editor's table plugin repairs tables after every change; the test edits through it too.
      let state = EditorState.create({ doc: start.doc, schema, plugins: [tableEditing()] });
      for (let step = 0; step < 30; step++) {
        state = randomSelection(state, r);
        const action = actions[Math.floor(r() * actions.length)] as (
          s: EditorState,
          r: () => number,
        ) => EditorState;
        try {
          state = action(state, r);
        } catch {
          // A command refusing an edit (ProseMirror throws in a few edge cases) leaves the state as it was.
        }
      }
      const { bytes } = await save({ ...start, doc: state.doc, modified: MODIFIED });
      const report = await validate(bytes);
      expect(
        report.issues.filter((i) => i.severity === "error"),
        `seed ${seed}`,
      ).toEqual([]);
    }
  }, 1_200_000);
});
