// The library and reading position survive reloads; the reader can remove what's kept.
import { expect, test } from "@playwright/test";
import { expectOnScreen, openFixture, rendered } from "./helpers";

test("opened documents stay in the library across reloads, until removed", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.getByRole("button", { name: "Library" }).click();
  const card = page.getByRole("button", { name: "Aurora P2 Field Manual", exact: true });
  await expect(card).toBeVisible();
  await page.reload();
  await card.click();
  await rendered(page);
  await page.getByRole("button", { name: "Library" }).click();
  await page
    .getByRole("button", { name: "Remove Aurora P2 Field Manual from this device" })
    .click();
  await expect(card).toBeHidden();
  await expect(page.getByText("Documents you open are kept here")).toBeVisible();
});

test("the reading position is restored when a document is reopened", async ({ page }) => {
  await openFixture(page, "long.flexova");
  await page.getByRole("button", { name: "Contents" }).click();
  await page
    .getByRole("dialog", { name: "Contents" })
    .getByRole("button", { name: "Chapter 20", exact: true })
    .click();
  await expectOnScreen(page, ".fx-doc:nth-of-type(20) h1");
  await page.waitForTimeout(800); // positions are saved 400 ms after scrolling stops
  await page.reload();
  await page.getByRole("button", { name: "Long manual", exact: true }).click();
  await rendered(page);
  await expectOnScreen(page, ".fx-doc:nth-of-type(20) h1");
});

test("the browser's Back button returns to the library", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Recently opened" })).toBeVisible();
});

test("settings can clear the whole library", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Remove all documents from this device" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Documents you open are kept here")).toBeVisible();
});
