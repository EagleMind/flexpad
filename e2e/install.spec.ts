// Installability, checked with Chromium's own installability report (Lighthouse 12+ dropped its PWA audits).
import { expect, test } from "@playwright/test";

test("Chromium reports FlexPad as installable", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the installability report is a Chromium DevTools API");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  await expect
    .poll(
      async () =>
        ((await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: unknown[] })
          .installabilityErrors,
    )
    .toEqual([]);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.file_handlers[0].accept).toEqual({ "application/vnd.flexova+zip": [".flexova"] });
});
