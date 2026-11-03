import { describe, expect, it } from "vitest";
import { toEvict, type LibraryEntry } from "./library/store";
import { OpenError, sameOriginUrl } from "./open/sources";
import { blocksOf, chapters, headingBefore } from "./reader/blocks";
import { capture, locate, positionKey } from "./reader/position";
import { SearchIndex, snippet } from "./reader/search";
import { KeyImportError, parseKeys } from "./settings/keys";
import { loadSettings, stepScale } from "./settings/settings";

const entry = (hash: string, opened: number, size = 1000): LibraryEntry => ({
  hash,
  name: `${hash}.flexova`,
  title: hash,
  identifier: null,
  size,
  opened,
});

describe("library eviction", () => {
  it("keeps the most recently opened documents within the count and size limits", () => {
    const entries = [entry("a", 1), entry("b", 3), entry("c", 2), entry("d", 4)];
    expect(toEvict(entries, { count: 2, bytes: 1e9 }).sort()).toEqual(["a", "c"]);
    expect(
      toEvict([entry("big", 2, 900), entry("small", 1, 200)], { count: 9, bytes: 1000 }),
    ).toEqual(["small"]);
    expect(toEvict(entries)).toEqual([]);
  });
});

describe("opening by address", () => {
  it("accepts same-origin URLs only", () => {
    expect(sameOriginUrl("/samples/a.flexova", "https://flexpad.app/").href).toBe(
      "https://flexpad.app/samples/a.flexova",
    );
    expect(() => sameOriginUrl("https://evil.example/a.flexova", "https://flexpad.app/")).toThrow(
      OpenError,
    );
    expect(() => sameOriginUrl("http://flexpad.app/a.flexova", "https://flexpad.app/")).toThrow(
      OpenError,
    );
    expect(() => sameOriginUrl("http://[bad", "https://flexpad.app/")).toThrow(OpenError);
  });
});

describe("trusted keys", () => {
  const key = {
    kty: "OKP",
    crv: "Ed25519",
    kid: "k1",
    x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  };

  it("reads a JWKS, a single JWK, or a list, keeping only Ed25519 signing keys", () => {
    expect(parseKeys(JSON.stringify({ keys: [key, { kty: "RSA", kid: "r" }] }))).toEqual([
      { kid: "k1", x: key.x },
    ]);
    expect(parseKeys(JSON.stringify(key))).toHaveLength(1);
    expect(parseKeys(JSON.stringify([key, { ...key, kid: "k2", use: "enc" }]))).toHaveLength(1);
  });

  it("refuses private keys, non-JSON and files without usable keys", () => {
    expect(() => parseKeys(JSON.stringify({ ...key, d: "secret" }))).toThrow(/private key/);
    expect(() => parseKeys("not json")).toThrow(KeyImportError);
    expect(() => parseKeys(JSON.stringify({ keys: [] }))).toThrow(KeyImportError);
  });
});

describe("settings", () => {
  it("steps the text size within its range and ignores bad stored values", () => {
    expect(stepScale(1, 1)).toBe(1.15);
    expect(stepScale(1.6, 1)).toBe(1.6);
    expect(stepScale(0.85, -1)).toBe(0.85);
    localStorage.setItem("flexpad.settings", JSON.stringify({ theme: "neon", fontScale: 7 }));
    expect(loadSettings()).toEqual({ theme: "auto", fontScale: 1 });
    localStorage.setItem("flexpad.settings", "{");
    expect(loadSettings()).toEqual({ theme: "auto", fontScale: 1 });
  });
});

/** A rendered document like <flexova-viewer>'s shadow root, built from trusted test markup. */
function renderedDocument(): ShadowRoot {
  const chapter = (n: number) =>
    `<section class="fx-doc"><h1 id="c${n}">Chapter ${n}</h1><p>Intro ${n} pump.</p>` +
    `<ul><li><p>Nested paragraph ${n}</p></li><li>Plain item ${n}</li></ul>` +
    `<h2 id="d${n}">Details ${n}</h2><table><tbody><tr><td>Cell ${n} strainer</td></tr></tbody></table></section>`;
  const parsed = new DOMParser().parseFromString(
    `<article class="fx">${chapter(1)}${chapter(2)}</article>`,
    "text/html",
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  root.append(...parsed.body.childNodes);
  return root;
}

describe("rendered blocks", () => {
  it("finds chapters and innermost text blocks, and the heading before a block", () => {
    const [first] = chapters(renderedDocument()) as [HTMLElement];
    expect(blocksOf(first).map((b) => b.textContent)).toEqual([
      "Chapter 1",
      "Intro 1 pump.",
      "Nested paragraph 1",
      "Plain item 1",
      "Details 1",
      "Cell 1 strainer",
    ]);
    expect(headingBefore(first, blocksOf(first)[5] as HTMLElement)?.id).toBe("d1");
  });

  it("searches the rendered text, with prefixes, and labels hits by heading", async () => {
    const index = await SearchIndex.build(renderedDocument());
    expect(index.size).toBe(12);
    expect(index.search("strain").map((h) => [h.chapter, h.snippet])).toEqual([
      ["Details 1", "Cell 1 strainer"],
      ["Details 2", "Cell 2 strainer"],
    ]);
    expect(index.search("   ")).toEqual([]);
  });

  it("makes short snippets around the first match", () => {
    const s = snippet(`${"a ".repeat(100)}target ${"b ".repeat(100)}`, ["target"]);
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain("target");
    expect(s.length).toBeLessThanOrEqual(162);
  });
});

describe("reading position", () => {
  it("keys positions by a salted hash", async () => {
    const salt = new Uint8Array(32).fill(7);
    const a = await positionKey("urn:uuid:1", salt);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await positionKey("urn:uuid:1", salt)).toBe(a);
    expect(await positionKey("urn:uuid:1", new Uint8Array(32))).not.toBe(a);
    expect(await positionKey("urn:uuid:2", salt)).not.toBe(a);
  });

  it("restores the same block when the content is unchanged, else the saved heading", () => {
    const root = renderedDocument();
    const saved = { contentHash: "h1", chapter: 1, block: 2, headingId: "d2", saved: 0 };
    expect(locate(root, saved, "h1")?.textContent).toBe("Nested paragraph 2");
    expect((locate(root, saved, "other") as HTMLElement).id).toBe("d2");
    expect(capture(document.createElement("div"), 0)).toBeNull();
  });
});
