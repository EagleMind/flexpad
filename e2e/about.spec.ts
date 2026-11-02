// AGPL-3.0 section 13: every user can get the source of the version they are using.
import { expect, test } from "@playwright/test";

test("settings offer the source code and license of this build", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const about = page.getByRole("dialog", { name: "Settings" }).locator(".about");
  await expect(about).toContainText("GNU Affero General Public License v3.0");
  await expect(about.getByRole("link", { name: "Source code" })).toHaveAttribute(
    "href",
    /^https:\/\/github\.com\/EagleMind\/flexpad\/tree\/[0-9a-f]{40}$/,
  );
  await expect(about.getByRole("link", { name: "License (AGPL-3.0)" })).toHaveAttribute(
    "href",
    /^https:\/\/github\.com\/EagleMind\/flexpad\/blob\/[0-9a-f]{40}\/LICENSE$/,
  );
});
