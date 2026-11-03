// Every way to open a document, and what FlexPad refuses.
import { expect, test } from "@playwright/test";
import { fixtureBytes, openFixture, rendered, watch } from "./helpers";

test("opens a file chosen with the file input", async ({ page }) => {
  const problems = watch(page);
  await openFixture(page, "aurora-manual.flexova");
  await expect(
    page.getByRole("heading", { level: 1, name: "Aurora P2 Field Manual" }),
  ).toBeAttached();
  expect(
    await page.evaluate(
      () =>
        document.querySelector("flexova-viewer")?.shadowRoot?.querySelectorAll(".fx-doc").length,
    ),
  ).toBe(3);
  expect(problems).toEqual([]);
});

test("opens a file dropped anywhere on the page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ({ data }) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(data)], "dropped.flexova", {
          type: "application/vnd.flexova+zip",
        }),
      );
      for (const type of ["dragenter", "dragover", "drop"]) {
        window.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    },
    { data: fixtureBytes("aurora-manual.flexova") },
  );
  await rendered(page);
  await expect(page.locator(".doc-title")).toHaveText("Aurora P2 Field Manual");
});

test("opens ?src= from the same origin, and the sample button", async ({ page }) => {
  await page.goto("/?src=/samples/aurora-manual.flexova");
  await rendered(page);
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await rendered(page);
  await expect(page.locator(".doc-title")).toHaveText("Aurora P2 Field Manual");
});

test("refuses ?src= on another origin without contacting it", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/?src=https://example.org/evil.flexova");
  await expect(page.getByRole("alert")).toContainText("only opens documents from its own site");
  expect(problems.filter((p) => p.startsWith("request"))).toEqual([]);
});

test("refuses files that are not Flexova documents", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[type=file][accept*='flexova']").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "That file isn't a Flexova document (.flexova).",
  );
});
