// The editor end to end: create, edit, format, insert, theme, import, save, export, drafts, accessibility.
// Saves go through the download path (Playwright can't drive the native save dialog) and every saved
// file is validated with @flexova/core.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { read, unpack, validate } from "@flexova/core";
import { expect, test, type Page } from "@playwright/test";
import { fixture, openFixture } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Use the download fallback for saving.
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
  });
});

const surface = (page: Page) => page.locator(".editor-surface");

async function saved(page: Page, action: () => Promise<void>): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent("download"), action()]);
  return new Uint8Array(readFileSync(await download.path()));
}

async function bodyText(bytes: Uint8Array): Promise<string> {
  const pkg = await read(bytes);
  return pkg.spine.map((p) => new TextDecoder().decode(pkg.entries.get(p))).join("\n");
}

/** Close the "Imported, with changes" notes if they are showing. */
async function dismissNotes(page: Page) {
  const notes = page.getByRole("dialog", { name: "Imported, with changes" });
  if (await notes.isVisible()) {
    await notes.getByRole("button", { name: "Close" }).click();
    await expect(notes).toBeHidden();
  }
}

async function newDocument(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();
  await expect(surface(page)).toBeVisible();
}

test("writes a new document with formatting, lists, a table and a callout, and saves it valid", async ({
  page,
}) => {
  await newDocument(page);
  const title = surface(page).locator("h1");
  await title.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.type("Field notes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Check the ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("valve");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" first.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hot surface.");
  await page.getByRole("combobox", { name: "Insert" }).selectOption({ label: "Warning callout" });
  await page.getByRole("combobox", { name: "Insert" }).selectOption({ label: "Table" });
  await page.keyboard.type("Part");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  const bytes = await saved(page, () =>
    page.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await validate(bytes)).valid).toBe(true);
  const text = await bodyText(bytes);
  expect(text).toContain('<h1 id="field-notes">Field notes</h1>');
  expect(text).toContain("Check the <strong>valve</strong> first.");
  expect(text).toMatch(
    /<ul><li>one<\/li><li>two<\/li><\/ul>|<ul><li><p>one<\/p><\/li><li><p>two<\/p><\/li><\/ul>/,
  );
  expect(text).toContain('<th scope="col">Part</th>');
  expect(text).toContain('data-flexova-variant="warning"');
  expect((await read(bytes)).title).toBe("Field notes");
  await expect(page.getByText("All changes saved")).toBeVisible();
});

test("edits an existing document and keeps its images and metadata", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(surface(page)).toContainText("The Aurora P2 is a portable water pump");
  await surface(page).locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited in FlexPad.");
  const bytes = await saved(page, () => page.keyboard.press("ControlOrMeta+s"));
  expect((await validate(bytes)).valid).toBe(true);
  const pkg = await read(bytes);
  expect(pkg.title).toBe("Aurora P2 Field Manual");
  expect([...pkg.entries.keys()].filter((k) => k.includes("/assets/")).sort()).toEqual([
    "OEBPS/assets/flow.svg",
    "OEBPS/assets/panel.png",
  ]);
  expect(await bodyText(bytes)).toContain("Edited in FlexPad.");
});

test("inserts an image only with alt text (or marked decorative), resized and re-encoded", async ({
  page,
}) => {
  await newDocument(page);
  await surface(page).locator("p").click();
  await page.getByRole("combobox", { name: "Insert" }).selectOption({ label: "Image…" });
  const dialog = page.getByRole("dialog", { name: "Insert image" });
  await dialog.getByLabel("Image file").setInputFiles(fixture("../../public/icons/icon-512.png"));
  await dialog.getByRole("button", { name: "Insert" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Describe the image, or mark it as decorative.",
  );
  await dialog.getByLabel(/alt text/).fill("FlexPad logo");
  await dialog.getByLabel("Caption (optional)").fill("The app icon");
  await dialog.getByRole("button", { name: "Insert" }).click();
  await expect(surface(page).locator("figure img")).toHaveAttribute("alt", "FlexPad logo");
  const bytes = await saved(page, () =>
    page.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await validate(bytes)).valid).toBe(true);
  const assets = [...unpack(bytes).keys()].filter((k) => k.startsWith("OEBPS/assets/"));
  expect(assets).toHaveLength(1);
  expect(assets[0]).toMatch(/\.(webp|png)$/);
  expect(await bodyText(bytes)).toMatch(
    /<figure id="[^"]+"><img src="\.\.\/assets\/icon-512\.(webp|png)" alt="FlexPad logo"\/><figcaption>The app icon<\/figcaption><\/figure>/,
  );
});

test("links text to a web address and to a heading", async ({ page }) => {
  await newDocument(page);
  await surface(page).locator("p").click();
  await page.keyboard.type("Visit the site.");
  await page.keyboard.press("Shift+ArrowLeft");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.getByRole("button", { name: "Link…" }).click();
  const dialog = page.getByRole("dialog", { name: "Link" });
  await dialog.getByLabel(/Web address/).fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel(/Web address/).fill("example.org");
  // Focus is back in the text as soon as Apply has run, before the dialog's "close" event (a task
  // later): keys typed in between must not reach the Link button, where a space would reopen the dialog.
  const focusedInText = await dialog
    .getByRole("button", { name: "Apply" })
    .evaluate(async (apply) => {
      (apply as HTMLButtonElement).click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return !!document.activeElement?.closest(".editor-surface");
    });
  expect(focusedInText).toBe(true);
  await page.keyboard.press("End");
  await page.keyboard.type(" Back to top");
  for (let i = 0; i < 11; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.getByRole("button", { name: "Link…" }).click();
  await page
    .getByRole("dialog", { name: "Link" })
    .getByLabel("Or link to a heading")
    .selectOption({ index: 1 });
  const bytes = await saved(page, () =>
    page.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await validate(bytes)).valid).toBe(true);
  const text = await bodyText(bytes);
  expect(text).toContain('<a href="https://example.org">site.</a>');
  expect(text).toMatch(/<a href="#[a-z][a-z0-9-]*">Back to top<\/a>/);
});

test("theme colors are checked for contrast before they apply", async ({ page }) => {
  await newDocument(page);
  await page.getByRole("button", { name: "Document settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Document settings" });
  await dialog.getByLabel(/^Title/).fill("Themed manual");
  await dialog.getByLabel("Text, Light", { exact: true }).fill("#eeeeee");
  await expect(dialog.getByText(/Text on background, Light: .*too faint to read/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.getByLabel("Text, Light", { exact: true }).fill("#202020");
  await dialog.getByLabel("Links and accents, Light", { exact: true }).fill("#7a1fa2");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Themed manual" }).first(),
  ).toBeAttached();
  const bytes = await saved(page, () =>
    page.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await validate(bytes)).valid).toBe(true);
  const pkg = await read(bytes);
  expect(pkg.title).toBe("Themed manual");
  expect(pkg.tokens?.color?.accent?.light).toBe("#7a1fa2");
});

test("imports Markdown and Word documents", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Import Markdown or Word…").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Notes\n\n> [!TIP]\n> Keep it short.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
    ),
  });
  await expect(surface(page).locator("aside")).toContainText("Keep it short.");
  await expect(surface(page).locator("table")).toBeVisible();
  await dismissNotes(page);
  let bytes = await saved(page, () =>
    page.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await validate(bytes)).valid).toBe(true);

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByLabel("Import Markdown or Word…").setInputFiles(fixture("field-guide.docx"));
  await expect(surface(page).locator("aside").first()).toContainText("Never run the pump dry");
  await expect(surface(page).locator("figure img")).toHaveCount(1);
  await dismissNotes(page);
  bytes = await saved(page, () => page.getByRole("button", { name: "Save", exact: true }).click());
  expect((await validate(bytes)).valid).toBe(true);
  expect(await bodyText(bytes)).toContain('data-flexova-variant="warning"');
});

test("exports a static web page", async ({ page }) => {
  await newDocument(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("combobox", { name: "Export" })
      .selectOption({ label: "Web page (.flexova.html)" }),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.flexova\.html$/);
  expect(readFileSync(await download.path(), "utf8")).toContain("<title>Untitled document</title>");
});

test("keeps unsaved changes as a draft and offers to restore them", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.getByRole("button", { name: "Edit" }).click();
  await surface(page).locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Draft sentence.");
  await page.waitForTimeout(2000); // drafts are kept 1.5 s after the last change
  await page.reload();
  await page.getByRole("button", { name: "Aurora P2 Field Manual", exact: true }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(surface(page)).toContainText("Draft sentence.");
});

test("the editor and its dialogs have no axe violations", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(surface(page)).toBeVisible();
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(await axe()).toEqual([]);
  await surface(page).locator("table td").first().click();
  await expect(page.getByRole("group", { name: "Table tools" })).toBeVisible();
  expect(await axe()).toEqual([]);
  for (const [open, name] of [
    [() => page.getByRole("button", { name: "Link…" }).click(), "Link"],
    [
      () => page.getByRole("combobox", { name: "Insert" }).selectOption({ label: "Image…" }),
      "Insert image",
    ],
    [() => page.getByRole("button", { name: "Document settings" }).click(), "Document settings"],
  ] as const) {
    await open();
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    expect(await axe(), name).toEqual([]);
    await page.keyboard.press("Escape");
  }
});

for (const width of [320, 375]) {
  test(`the editor fits a ${width}px screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await openFixture(page, "aurora-manual.flexova");
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(surface(page)).toBeVisible();
    await surface(page).locator("p").first().click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
}
