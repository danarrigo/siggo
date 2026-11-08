import { test, expect } from "./test";

test("editorial text highlights stay readable and do not change headings or layout", async ({
  page,
}, info) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Competitions", exact: true });
  const highlight = heading.locator(".text-highlight");
  await expect(highlight).toHaveText("Competitions");
  await expect(highlight).toHaveCSS("background-image", /linear-gradient/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("directory-highlights.png") });

  await page.getByRole("button", { name: "Open preferences", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(preferences.getByRole("heading").locator(".text-highlight")).toHaveText(
    "Preferences",
  );
  await page.screenshot({ path: info.outputPath("preferences-highlights.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Forecast the Financial Frontier", exact: true }).click();
  const details = page.getByRole("dialog");
  await expect(
    details
      .getByRole("heading", { name: "Why this is listed", exact: true })
      .locator(".text-highlight"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View source coverage", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Source coverage", exact: true }).locator(".text-highlight"),
  ).toHaveText("coverage");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /View deadline reminders and updates/ }).click();
  await expect(
    page
      .getByRole("heading", { name: "Reminders and updates", exact: true })
      .locator(".text-highlight"),
  ).toHaveText("updates");
});
