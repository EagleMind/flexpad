#!/usr/bin/env node
// Render public/icons/icon.svg to the PNG sizes the manifest lists (run after changing the icon).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const dir = join(import.meta.dirname, "..", "public", "icons");
const svg = readFileSync(join(dir, "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (file, size, padding) => {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons keep their content inside the central 80% safe zone, on a full-bleed background.
  const inner = padding
    ? `<div style="background:#0b5fff;width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace("<svg ", `<svg width="${size * 0.8}" height="${size * 0.8}" `)}</div>`
    : svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${inner}`);
  await page.screenshot({
    path: join(dir, file),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
};
await render("icon-192.png", 192, false);
await render("icon-512.png", 512, false);
await render("icon-maskable-512.png", 512, true);
await browser.close();
console.log("wrote icon-192.png, icon-512.png, icon-maskable-512.png");
