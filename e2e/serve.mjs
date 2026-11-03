#!/usr/bin/env node
// Serve dist/ like Cloudflare Workers static assets: the rules in dist/_headers, and index.html for unknown paths.
// Usage: node e2e/serve.mjs <port>      (also exported for tests that stop and restart the server)
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".flexova": "application/vnd.flexova+zip",
  ".map": "application/json",
};

function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = {
        pattern: new RegExp(
          `^${line
            .trim()
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")}$`,
        ),
        headers: [],
      };
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(":");
      current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

export function serve(port) {
  const headersFile = join(dist, "_headers");
  const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, "utf8")) : [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = normalize(join(dist, path));
    if (!file.startsWith(dist + sep) && file !== dist) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    const served =
      "/" +
      file
        .slice(dist.length + 1)
        .split(sep)
        .join("/");
    const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
    for (const rule of rules) {
      if (rule.pattern.test(path) || rule.pattern.test(served))
        for (const [k, v] of rule.headers) headers[k] = v;
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4174);
  await serve(port);
  console.log(`FlexPad on http://localhost:${port}`);
}
