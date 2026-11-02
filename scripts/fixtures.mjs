#!/usr/bin/env node
// Build FlexPad's sample and test documents with the flexova CLI from a flexova checkout.
// Usage: node scripts/fixtures.mjs [path-to-flexova]   (default: $FLEXOVA_DIR or ../flexova)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flexova = resolve(process.argv[2] ?? process.env.FLEXOVA_DIR ?? join(root, "..", "flexova"));
const cli = (...args) =>
  execFileSync("node", [join(flexova, "packages/cli/dist/cli.js"), ...args], { stdio: "inherit" });
const fixtures = join(root, "e2e", "fixtures");
const modified = ["--modified", "2026-11-02T00:00:00Z"];
const CONFORMANCE = [
  "minimal",
  "block-elements",
  "inline-elements",
  "images",
  "mathml",
  "links",
  "audio",
  "right-to-left",
  "tokens-full",
  "tables-complex",
  "nested-lists",
  "comments-cdata-pi",
  "warning-heading-skip",
];

cli(
  "build",
  join(flexova, "samples/markdown-manual"),
  "--strict",
  ...modified,
  "-o",
  join(root, "public/samples/aurora-manual.flexova"),
);
copyFileSync(
  join(root, "public/samples/aurora-manual.flexova"),
  join(fixtures, "aurora-manual.flexova"),
);

// A signed copy, the key set that verifies it, and an unrelated key set.
const tmp = mkdtempSync(join(tmpdir(), "flexpad-fixtures-"));
try {
  process.chdir(tmp);
  cli("keygen", "publisher", "--kid", "aurora-publisher");
  cli("keygen", "stranger", "--kid", "aurora-publisher");
  cli(
    "sign",
    join(fixtures, "aurora-manual.flexova"),
    "--key",
    "publisher.private.jwk.json",
    "-o",
    join(fixtures, "aurora-signed.flexova"),
  );
  copyFileSync("publisher.jwks.json", join(fixtures, "publisher.jwks.json"));
  copyFileSync("stranger.jwks.json", join(fixtures, "stranger.jwks.json"));

  // A long document: 40 chapters, each with a unique word to search for.
  const md = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    const para =
      `Chapter ${n} describes routine ${n} in detail, with steps, checks and notes for field teams. `.repeat(
        6,
      );
    return `# Chapter ${n}\n\n${para}\n\n## Details ${n}\n\n${para} The code word here is marker${n}word.\n\n${para}\n`;
  }).join("\n");
  writeFileSync(join(tmp, "long.md"), md);
  cli(
    "build",
    join(tmp, "long.md"),
    "--title",
    "Long manual",
    "--lang",
    "en",
    "--strict",
    ...modified,
    "-o",
    join(fixtures, "long.flexova"),
  );
} finally {
  process.chdir(root);
  rmSync(tmp, { recursive: true, force: true });
}

copyFileSync(
  join(flexova, "conformance/hostile/script-element.flexova"),
  join(fixtures, "hostile.flexova"),
);
copyFileSync(
  join(flexova, "conformance/invalid/image-without-alt.flexova"),
  join(fixtures, "invalid.flexova"),
);
copyFileSync(join(flexova, "samples/docx/field-guide.docx"), join(fixtures, "field-guide.docx"));
// Valid conformance packages that exercise every structure the editor must round-trip.
mkdirSync(join(fixtures, "conformance"), { recursive: true });
for (const name of CONFORMANCE) {
  copyFileSync(
    join(flexova, "conformance/valid", `${name}.flexova`),
    join(fixtures, "conformance", `${name}.flexova`),
  );
}
writeFileSync(join(fixtures, "not-flexova.txt"), "This is not a Flexova document.\n");
console.log("fixtures written");
