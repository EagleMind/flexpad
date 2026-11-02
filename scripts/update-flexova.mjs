#!/usr/bin/env node
// Pack the @flexova packages FlexPad uses from a flexova checkout into vendor/, until they are on npm.
// Usage: node scripts/update-flexova.mjs [path-to-flexova]   (default: $FLEXOVA_DIR or ../flexova)
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flexova = resolve(process.argv[2] ?? process.env.FLEXOVA_DIR ?? join(root, "..", "flexova"));
const vendor = join(root, "vendor");
const packages = ["core", "viewer"];
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

for (const f of readdirSync(vendor)) if (f.endsWith(".tgz")) rmSync(join(vendor, f));
run("pnpm", ["--filter", "@flexova/core", "--filter", "@flexova/viewer", "run", "build"], flexova);
const files = packages.map((p) =>
  run("pnpm", ["pack", "--pack-destination", vendor], join(flexova, "packages", p))
    .split("\n")
    .pop(),
);
const info = {
  $comment:
    "Written by scripts/update-flexova.mjs. Replace with npm versions once @flexova 0.1.0 is published.",
  repository: "https://github.com/EagleMind/flexova",
  branch: run("git", ["rev-parse", "--abbrev-ref", "HEAD"], flexova),
  commit: run("git", ["rev-parse", "HEAD"], flexova),
  packages: files.map((f) => f.split("/").pop()),
};
writeFileSync(join(vendor, "flexova.json"), JSON.stringify(info, null, 2) + "\n");
console.log(
  `vendored ${info.packages.join(", ")} from ${info.branch} @ ${info.commit.slice(0, 7)}`,
);
