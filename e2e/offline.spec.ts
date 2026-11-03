// With the server gone, FlexPad still starts (service worker) and opens documents from its library.
import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import { serve } from "./serve.mjs";
import { rendered } from "./helpers";

test("works with the server switched off", async ({ page, browserName }, info) => {
  const port =
    4300 +
    info.parallelIndex +
    (browserName === "firefox" ? 20 : browserName === "webkit" ? 40 : 0);
  let server: Server | null = (await serve(port)) as Server;
  try {
    const base = `http://localhost:${port}`;
    await page.goto(`${base}/`);
    const hasSW = await page.evaluate(() => "serviceWorker" in navigator);
    test.skip(!hasSW, "this browser build has no service workers");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.getByRole("button", { name: "Try a sample document" }).click();
    await rendered(page);

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    await page.reload();
    await page.getByRole("button", { name: "Aurora P2 Field Manual", exact: true }).click();
    await rendered(page);
    await expect(page.locator(".doc-title")).toHaveText("Aurora P2 Field Manual");
  } finally {
    server?.close();
  }
});
