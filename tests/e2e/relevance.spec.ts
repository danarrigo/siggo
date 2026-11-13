import { expect, test } from "./test";
import { defaultWorkspace } from "../../src/lib/model";
import AxeBuilder from "@axe-core/playwright";

test("less relevant requires confirmation, supports undo, and resets only feedback", async ({
  page,
}) => {
  await page.goto("/");
  const title = "Neural Arena: Multi-agent Simulation";
  await page.getByRole("button", { name: `Save ${title}`, exact: true }).click();
  const dismiss = page.getByRole("button", { name: `Show less like ${title}`, exact: true });
  await dismiss.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Mark as less relevant?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dismiss).toHaveAttribute("aria-pressed", "false");
  await dismiss.click();
  await dialog.getByRole("button", { name: "Mark less relevant", exact: true }).click();
  const undo = page.getByRole("button", { name: `Undo less relevant for ${title}`, exact: true });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(dismiss).toHaveAttribute("aria-pressed", "false");
  await dismiss.click();
  await dialog.getByRole("button", { name: "Mark less relevant", exact: true }).click();
  await page.reload();
  const reset = page.getByRole("button", { name: "Reset relevance feedback", exact: true });
  await reset.click();
  await expect(dialog.getByRole("heading", { name: "Reset relevance feedback?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(undo).toBeVisible();
  await reset.click();
  await dialog.getByRole("button", { name: "Reset feedback", exact: true }).click();
  await expect(dismiss).toHaveAttribute("aria-pressed", "false");
  await expect(reset).toHaveCount(0);
  await page.reload();
  await expect(dismiss).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
});

test("feedback notice offers immediate undo and the feedback view supports individual restore", async ({
  page,
}) => {
  await page.goto("/");
  const title = "Neural Arena: Multi-agent Simulation";
  const dismiss = page.getByRole("button", { name: `Show less like ${title}`, exact: true });
  await dismiss.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mark less relevant", exact: true })
    .click();
  const notice = page.getByRole("status").filter({ hasText: "Marked less relevant" });
  await expect(notice).toContainText(title);
  await notice.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(dismiss).toHaveAttribute("aria-pressed", "false");
  await dismiss.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mark less relevant", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Catalog view" })
    .getByRole("button", { name: /^Less relevant/ })
    .click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Catalog view" })
    .getByRole("button", { name: /^Less relevant/ })
    .click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.getByRole("button", { name: `Undo less relevant for ${title}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "No relevance feedback" })).toBeVisible();
});

test("feedback for listings missing from the catalog can still be restored", async ({ page }) => {
  await page.addInitScript(
    (workspace) => {
      if (!localStorage.getItem("siggo-workspace-v1"))
        localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace));
    },
    { ...defaultWorkspace, dismissed: ["kaggle:no-longer-listed"] },
  );
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Catalog view" })
    .getByRole("button", { name: /^Less relevant/ })
    .click();
  await expect(
    page.getByText("These marked listings are no longer in the catalog.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore feedback for kaggle:no-longer-listed", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "No relevance feedback" })).toBeVisible();
});

test("topics dropdown is searchable, multi-select, and removable without replacing text search", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".browse-topics")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Filter by topics", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: "Filter topics", exact: true });
  const search = popup.getByRole("textbox", { name: "Search topics", exact: true });
  await expect(search).toBeFocused();
  await search.fill("fin");
  await expect(popup.getByRole("checkbox")).toHaveCount(1);
  await popup.getByRole("checkbox", { name: "finance", exact: true }).check();
  await search.fill("climate");
  await popup.getByRole("checkbox", { name: "climate", exact: true }).check();
  await search.fill("no-such-topic");
  await expect(popup.getByText("No topics found.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("2");
  await expect(page.getByTestId("competition-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search competitions" }).fill("finance");
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove topic: climate", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toHaveValue("finance");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /^Remove topic:/ })).toHaveCount(0);
  await trigger.click();
  await expect(search).toHaveValue("");
  await expect(popup.getByRole("checkbox", { name: "finance", exact: true })).not.toBeChecked();
  await popup.getByRole("checkbox", { name: "finance", exact: true }).check();
  await popup.getByRole("button", { name: "Clear topics", exact: true }).click();
  await expect(popup.getByRole("checkbox", { name: "finance", exact: true })).not.toBeChecked();
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test("topic picker is accessible, stays within the viewport, and dismisses on outside click", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Filter by topics", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Filter topics", exact: true });
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("topic-picker.png") });
  await page.getByRole("heading", { name: "Competitions", exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test("clickable card tags apply topic filters without duplicating selections", async ({ page }) => {
  await page.goto("/");
  const tag = page.locator(".competition-tags button").first();
  const topic = await tag.innerText();
  await tag.click();
  const chip = page.getByRole("button", { name: `Remove topic: ${topic}`, exact: true });
  await expect(chip).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toHaveValue("");
  await page.locator(".competition-tags button").filter({ hasText: topic }).first().click();
  await expect(chip).toHaveCount(1);
  await chip.click();
  await expect(page.getByTestId("competition-card")).toHaveCount(10);
});
