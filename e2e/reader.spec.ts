// Reading tools: contents, search, text size, theme, print, document info and signatures, bad documents.
import { expect, test } from "@playwright/test";
import { expectOnScreen, fixture, openFixture, watch } from "./helpers";

test("the contents drawer jumps to a chapter, and Escape returns focus", async ({ page }) => {
  await openFixture(page, "long.flexova");
  const button = page.getByRole("button", { name: "Contents" });
  await button.click();
  const drawer = page.getByRole("dialog", { name: "Contents" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await drawer.getByRole("button", { name: "Chapter 30", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expectOnScreen(page, ".fx-doc:nth-of-type(30) h1");
});

test("search finds a word deep in the document and scrolls to it", async ({ page }) => {
  await openFixture(page, "long.flexova");
  await page.getByRole("button", { name: "Search" }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("searchbox").fill("marker27word");
  await expect(dialog.getByRole("status")).toHaveText("1 match");
  await dialog.getByRole("button", { name: /Details 27/ }).click();
  await expect(dialog).toBeHidden();
  await expectOnScreen(page, ".fx-doc:nth-of-type(27) h2 ~ p:last-of-type");
  await expect(page.locator("[aria-live=polite]")).toHaveText("Showing a match in Details 27");
});

test("text size and theme change the document, and persist", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  const size = () =>
    page.evaluate(() =>
      parseFloat(
        getComputedStyle(
          document.querySelector("flexova-viewer")?.shadowRoot?.querySelector(".fx") as Element,
        ).fontSize,
      ),
    );
  const base = await size();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByRole("button", { name: "Larger text" }).click();
  expect(await size()).toBeCloseTo(base * 1.3, 0);
  await page.getByRole("button", { name: "Theme: Match system" }).click();
  await expect(page.locator("flexova-viewer")).toHaveAttribute("theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Theme: Light" }).click();
  await expect(page.locator("flexova-viewer")).toHaveAttribute("theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("printing shows only the document, every chapter", async ({ page }) => {
  await openFixture(page, "aurora-manual.flexova");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".toolbar")).toBeHidden();
  const visible = await page.evaluate(() =>
    [
      ...(document.querySelector("flexova-viewer")?.shadowRoot?.querySelectorAll(".fx-doc") ?? []),
    ].every((d) => (getComputedStyle(d).contentVisibility || "visible") === "visible"),
  );
  expect(visible).toBe(true);
});

test("document info shows the signature, verified only with keys the reader trusts", async ({
  page,
}) => {
  await openFixture(page, "aurora-signed.flexova");
  const expectInfo = async (text: string) => {
    await page.getByRole("button", { name: "Document info" }).click();
    await expect(
      page.getByRole("dialog", { name: "Document info" }).locator(".info"),
    ).toContainText(text);
    await page.keyboard.press("Escape");
  };
  await expectInfo(
    "Signed with key “aurora-publisher”. Add the publisher's public keys in Settings",
  );

  const importKeys = async (name: string) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.locator("input[type=file]").setInputFiles(fixture(name));
    await expect(settings.locator(".keys code")).toHaveText(["aurora-publisher"]);
    return settings;
  };
  await importKeys("stranger.jwks.json");
  await page.keyboard.press("Escape");
  await expectInfo("Not verified: The signature does not match the manifest and key.");

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(settings.getByText("No keys yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await importKeys("publisher.jwks.json");
  await page.keyboard.press("Escape");
  await expectInfo(
    "Verified: signed with your trusted key “aurora-publisher”, and unchanged since.",
  );
});

test("an invalid document opens with its problems listed", async ({ page }) => {
  await openFixture(page, "invalid.flexova");
  const banner = page.locator(".banner");
  await expect(banner).toContainText("This document has 1 problem.");
  await banner.getByRole("button", { name: "Show details" }).click();
  await expect(banner.locator(".problems")).toContainText("PRF_MISSING_ALT");
});

test("a hostile document is neutralized", async ({ page }) => {
  const problems = watch(page);
  await openFixture(page, "hostile.flexova");
  await expect(page.locator(".banner")).toContainText("problem");
  expect(
    await page.evaluate(() =>
      document.querySelector("flexova-viewer")?.shadowRoot?.querySelector("script"),
    ),
  ).toBeNull();
  expect(problems).toEqual([]);
});
