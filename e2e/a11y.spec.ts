// Accessibility (axe, WCAG 2.2 AA) and layout at phone to desktop widths in both themes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openFixture } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.length}`,
  );

test("home, reader and every dialog have no axe violations", async ({ page }) => {
  await page.goto("/");
  expect(await axe(page)).toEqual([]);
  await openFixture(page, "aurora-signed.flexova");
  expect(await axe(page)).toEqual([]);
  for (const [button, dialog] of [
    ["Contents", "Contents"],
    ["Search", "Search"],
    ["Document info", "Document info"],
    ["Settings", "Settings"],
  ]) {
    await page.getByRole("button", { name: button as string }).click();
    await expect(page.getByRole("dialog", { name: dialog as string })).toBeVisible();
    if (dialog === "Search") await page.getByRole("searchbox").fill("pump");
    expect(await axe(page), dialog).toEqual([]);
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Library" }).click();
  expect(await axe(page)).toEqual([]);
});

for (const width of [320, 375, 768, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`no horizontal scrolling at ${width}px, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const overflow = () =>
        page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await openFixture(page, "aurora-manual.flexova");
      expect(await overflow()).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Contents" })).toBeVisible();
    });
  }
}
