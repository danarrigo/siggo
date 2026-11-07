import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";

test("preferences and challenge details are accessible and restore keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open preferences", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const preferences = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(preferences.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const title = page.getByRole("button", { name: "Forecast the Financial Frontier", exact: true });
  await title.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const details = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(details.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(title).toBeFocused();
});
