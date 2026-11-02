// Editing commands, keyboard shortcuts and input rules for the FlexPad editor.
import {
  baseKeymap,
  chainCommands,
  lift,
  setBlockType,
  toggleMark,
  wrapIn,
  exitCode,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { inputRules, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { MarkType, Node as PMNode } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import {
  type Command,
  type EditorState,
  NodeSelection,
  type Plugin,
  TextSelection,
} from "prosemirror-state";
import { goToNextCell, tableEditing } from "prosemirror-tables";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { slug } from "./save";
import { M, T } from "./schema";

export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "h4" | "code" | "other";

export function blockKind(state: EditorState): BlockKind {
  const { $from, to } = state.selection;
  const node = $from.parent;
  if (to > $from.end()) return "other";
  if (node.type === T.paragraph) return "paragraph";
  if (node.type === T.code_block) return "code";
  if (node.type === T.heading && node.attrs.level <= 4) return `h${node.attrs.level}` as BlockKind;
  return "other";
}

export function setBlockKind(kind: BlockKind): Command {
  if (kind === "paragraph") return setBlockType(T.paragraph);
  if (kind === "code") return setBlockType(T.code_block);
  return setBlockType(T.heading, { level: Number(kind.slice(1)) });
}

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** The link around the cursor or selection, if any. */
export function linkAt(state: EditorState): { href: string; from: number; to: number } | null {
  const { $from } = state.selection;
  const mark = M.a.isInSet($from.marks()) ?? M.a.isInSet($from.nodeAfter?.marks ?? []);
  if (!mark) return null;
  let from = $from.pos;
  let to = $from.pos;
  const parent = $from.parent;
  const start = $from.start();
  parent.forEach((child, offset) => {
    if (mark.isInSet(child.marks)) {
      const a = start + offset;
      const b = a + child.nodeSize;
      if (a <= $from.pos && b >= $from.pos) {
        from = Math.min(from, a);
        to = Math.max(to, b);
      }
    }
  });
  return { href: String(mark.attrs.href), from, to };
}

/** Make the selection (or the link around the cursor) a link to `href`, or remove the link (null). */
export function setLink(href: string | null): Command {
  return (state, dispatch) => {
    const existing = state.selection.empty ? linkAt(state) : null;
    const from = existing?.from ?? state.selection.from;
    const to = existing?.to ?? state.selection.to;
    if (from === to && !href) return false;
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, M.a);
      if (href) {
        if (from === to)
          tr.insertText(href, from).addMark(from, from + href.length, M.a.create({ href }));
        else tr.addMark(from, to, M.a.create({ href }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** External addresses: add https:// to bare domains; refuse anything that isn't web, mail or internal. */
export function normalizeHref(input: string): string | null {
  const href = input.trim();
  if (!href) return null;
  if (
    /^(https?:\/\/|mailto:)/i.test(href) ||
    href.startsWith("#") ||
    /^[A-Za-z0-9._-]+\.xhtml(#.*)?$/.test(href)
  )
    return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  if (/^[^\s/]+\.[^\s/]+/.test(href)) return `https://${href}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`;
  return null;
}

/** Every heading, for linking within the document. Headings without an id get one when linked to. */
export function headings(
  doc: PMNode,
): { pos: number; text: string; level: number; file: string; id: string | null }[] {
  const out: { pos: number; text: string; level: number; file: string; id: string | null }[] = [];
  doc.forEach((chapter, chapterOffset) => {
    chapter.descendants((node, pos) => {
      if (node.type === T.heading) {
        out.push({
          pos: chapterOffset + 1 + pos,
          text: node.textContent,
          level: Number(node.attrs.level),
          file: String(chapter.attrs.file),
          id: node.attrs.id as string | null,
        });
      }
      return node.type !== T.heading;
    });
  });
  return out;
}

/** An id for the heading at `pos` (assigning a new one if needed) and the href to it from the selection. */
export function linkToHeading(
  state: EditorState,
  pos: number,
): { href: string; tr: ReturnType<EditorState["tr"]["setNodeMarkup"]> } {
  const node = state.doc.nodeAt(pos) as PMNode;
  const $pos = state.doc.resolve(pos);
  const chapter = $pos.node(1);
  let id = node.attrs.id as string | null;
  const tr = state.tr;
  if (!id) {
    const used = new Set<string>();
    chapter.descendants((n) => {
      if (n.attrs.id) used.add(String(n.attrs.id));
      for (const m of n.marks) if (m.attrs.id) used.add(String(m.attrs.id));
      return true;
    });
    const base = slug(node.textContent || "section");
    id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    tr.setNodeMarkup(pos, null, { ...node.attrs, id });
  }
  const here = state.selection.$from.node(1);
  return { href: here === chapter ? `#${id}` : `${String(chapter.attrs.file)}#${id}`, tr };
}

export function insertTable(rows = 3, cols = 3): Command {
  return (state, dispatch) => {
    // Cells hold "implicit" paragraphs, so a cell with plain text saves as <td>text</td>.
    const para = () => T.paragraph.create({ implicit: true });
    const header = T.table_row.create(
      { section: "head" },
      Array.from({ length: cols }, () => T.table_header.create({ scope: "col" }, para())),
    );
    const body = Array.from({ length: rows - 1 }, () =>
      T.table_row.create(
        null,
        Array.from({ length: cols }, () => T.table_cell.create(null, para())),
      ),
    );
    const table = T.table.create(null, [header, ...body]);
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(table);
      let at = -1;
      tr.doc.descendants((node, pos) => {
        if (node === table) at = pos;
        return at < 0;
      });
      // Table, row, cell, paragraph: the first cell's text starts three positions in.
      if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 4));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function insertFigure(src: string, alt: string, caption: string): Command {
  return (state, dispatch) => {
    const items: PMNode[] = [T.figure_image.create({ src, alt })];
    if (caption.trim()) items.push(T.figcaption.create(null, state.schema.text(caption.trim())));
    if (dispatch)
      dispatch(state.tr.replaceSelectionWith(T.figure.create(null, items)).scrollIntoView());
    return true;
  };
}

export function wrapCallout(variant: string): Command {
  return wrapIn(T.callout, { "data-flexova-variant": variant, role: "note" });
}

export function insertDetails(): Command {
  return (state, dispatch) => {
    const details = T.details.create(null, [
      T.summary.create(null, state.schema.text("Details")),
      T.paragraph.create(),
    ]);
    if (dispatch) dispatch(state.tr.replaceSelectionWith(details).scrollIntoView());
    return true;
  };
}

export function insertRule(): Command {
  return (state, dispatch) => {
    if (dispatch)
      dispatch(state.tr.replaceSelectionWith(T.horizontal_rule.create()).scrollIntoView());
    return true;
  };
}

/** A new chapter after the current one, starting with a level-1 heading, with the cursor in it. */
export function insertChapter(title: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const after = $from.depth >= 1 ? $from.after(1) : state.doc.content.size;
    const chapter = T.chapter.create({ file: null }, [
      T.heading.create({ level: 1 }, state.schema.text(title)),
      T.paragraph.create(),
    ]);
    if (dispatch) {
      const tr = state.tr.insert(after, chapter);
      dispatch(
        tr
          .setSelection(TextSelection.create(tr.doc, after + 2, after + 2 + title.length))
          .scrollIntoView(),
      );
    }
    return true;
  };
}

export const listCommands = {
  bullet: wrapInList(T.bullet_list),
  ordered: wrapInList(T.ordered_list),
  outdent: chainCommands(liftListItem(T.list_item), lift),
  indent: sinkListItem(T.list_item),
};

const insertBreak: Command = chainCommands(exitCode, (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(T.hard_break.create()).scrollIntoView());
  return true;
});

/** Select the node at `pos` (used after inserting atoms such as images). */
export const selectNode = (state: EditorState, pos: number) => NodeSelection.create(state.doc, pos);

export function editorPlugins(): Plugin[] {
  const rules = inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,4})\s$/, T.heading, (m) => ({
        level: (m[1] as string).length,
      })),
      textblockTypeInputRule(/^```$/, T.code_block),
      wrappingInputRule(/^\s*>\s$/, T.blockquote),
      wrappingInputRule(/^\s*([-+*])\s$/, T.bullet_list),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        T.ordered_list,
        (m) => ({ start: Number(m[1]) === 1 ? null : Number(m[1]) }),
        (m, node) => node.childCount + Number(node.attrs.start ?? 1) === Number(m[1]),
      ),
    ],
  });
  return [
    rules,
    keymap({
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
      "Mod-b": toggleMark(M.strong),
      "Mod-i": toggleMark(M.em),
      "Mod-`": toggleMark(M.code),
      "Shift-Enter": insertBreak,
      Enter: splitListItem(T.list_item),
      Tab: chainCommands(goToNextCell(1), sinkListItem(T.list_item)),
      "Shift-Tab": chainCommands(goToNextCell(-1), liftListItem(T.list_item)),
    }),
    keymap(baseKeymap),
    history(),
    dropCursor(),
    gapCursor(),
    tableEditing(),
  ];
}

export { redo, undo, toggleMark, wrapIn };
