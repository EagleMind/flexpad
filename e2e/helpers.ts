import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", name);
export const fixtureBytes = (name: string) => [...readFileSync(fixture(name))];

/** Wait until <flexova-viewer> has rendered the document's chapters. */
export async function rendered(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!document.querySelector("flexova-viewer")?.shadowRoot?.querySelector(".fx-doc"),
  );
}

/** Open a fixture through the file input, as the "Open a document" button does without a picker API. */
export async function openFixture(page: Page, name: string): Promise<void> {
  if (!page.url().startsWith("http")) await page.goto("/");
  await page.locator("input[type=file][accept*='flexova']").setInputFiles(fixture(name));
  await rendered(page);
}

/** Collect anything a hostile or broken document must never cause. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("dialog", (d) => {
    problems.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (url.hostname !== "localhost") problems.push(`request: ${r.url()}`);
  });
  return problems;
}

/** The top of an element inside the viewer, relative to the viewport. */
export async function topOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((s) => {
    const el = document.querySelector("flexova-viewer")?.shadowRoot?.querySelector(s);
    return el ? el.getBoundingClientRect().top : Number.NaN;
  }, selector);
}

/** The element is on screen, below the sticky toolbar. */
export async function expectOnScreen(page: Page, selector: string): Promise<void> {
  await expect
    .poll(async () => {
      const top = await topOf(page, selector);
      const viewport = page.viewportSize()?.height ?? 720;
      return top > 0 && top < viewport;
    })
    .toBe(true);
}
