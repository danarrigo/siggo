import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";
import { defaultWorkspace } from "../../src/lib/model";

const finance = "Forecast the Financial Frontier";
const game = "Build Something That Plays";
const community = "Community Builder Hack";
const reasoning = "Language Reasoning Benchmark";
const reply = {
  answer:
    "This listing has a known challenge end [1]. Entry fees and eligibility still need organizer verification.",
  sources: [
    { number: 1, title: finance, url: "https://www.drivendata.org/competitions/2/finance/" },
  ],
  catalogUpdatedAt: "2026-11-08T00:00:00Z",
  selectedCount: 1,
  catalogCount: 10,
};
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toBeEnabled();
}

test("compare 2–4 listings across filters without AI usage or changing the workspace", async ({
  page,
}, testInfo) => {
  let calls = 0;
  await page.route("**/api/assistant", async (route) => {
    calls++;
    await route.abort();
  });
  await ready(page);
  const before = await page.evaluate(() => localStorage.getItem("siggo-workspace-v1"));
  await page.getByRole("button", { name: `Compare ${finance}`, exact: true }).click();
  const selection = page.getByRole("region", { name: "Comparison selection" });
  await expect(selection.getByRole("button", { name: "Compare (1)", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: `Compare ${community}`, exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search competitions" });
  await search.fill("no matching listing");
  await expect(selection.getByRole("button", { name: "Compare (2)", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  for (const title of [game, reasoning])
    await page.getByRole("button", { name: `Compare ${title}`, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Compare Seeing Beyond the Frame", exact: true }),
  ).toBeDisabled();
  const trigger = selection.getByRole("button", { name: "Compare (4)", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const comparison = dialog.getByRole("region", { name: "Competition comparison" });
  await expect(comparison.getByRole("columnheader")).toHaveCount(5);
  await expect(comparison.getByRole("row", { name: /Entry fee/ })).toContainText("Unverified");
  await expect(comparison.getByRole("row", { name: /Provider-listed cutoff/ })).toContainText(
    "time/zone unlisted",
  );
  await expect(comparison.getByRole("row", { name: /Submission deadline/ })).toContainText(
    "Not captured",
  );
  await expect(comparison.getByRole("link", { name: "TensorHack", exact: true })).toBeAttached();
  const reward = comparison.getByRole("row", { name: /Prize \/ reward/ });
  await reward.locator("summary").click();
  await expect(reward.locator("details")).toHaveAttribute("open", "");
  await expect(reward.locator("details p")).toContainText("All participants receive recognition");
  await reward.locator("summary").click();
  await comparison.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("comparison.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(calls).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("siggo-workspace-v1"))).toBe(before);
  await trigger.click();
  for (const title of [finance, community, game]) {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: `Remove ${title} from comparison`, exact: true })
      .click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Siggo", exact: true })).toBeFocused();
  await selection.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(selection).toHaveCount(0);
});

test("removing one of two comparison listings returns keyboard focus safely", async ({ page }) => {
  await ready(page);
  for (const title of [finance, game])
    await page.getByRole("button", { name: `Compare ${title}`, exact: true }).click();
  await page
    .getByRole("region", { name: "Comparison selection" })
    .getByRole("button", { name: "Compare (2)", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Remove ${finance} from comparison`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Siggo", exact: true })).toBeFocused();
});

test("Ask about this uses only the selected public ID and starts a fresh chat when scope changes", async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.route("**/api/assistant", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: reply });
  });
  await page.addInitScript(
    (workspace) => localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace)),
    {
      ...defaultWorkspace,
      notes: { "drivendata:finance": "private-note-canary" },
      participationPlans: {
        "drivendata:finance": {
          stage: "Preparing",
          tasks: [{ id: "task-1", text: "private-task-canary", done: false }],
        },
      },
    },
  );
  await ready(page);
  await page.getByRole("button", { name: finance, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.locator(".assistant-focus")).toContainText(finance);
  const question = "Which dates are known?";
  await dialog.getByRole("textbox", { name: "Your question" }).fill(question);
  await dialog.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(dialog.getByText(reply.answer, { exact: true })).toBeVisible();
  expect(bodies).toEqual([
    { competitionId: "drivendata:finance", messages: [{ role: "user", content: question }] },
  ]);
  expect(JSON.stringify(bodies)).not.toContain("private-note-canary");
  expect(JSON.stringify(bodies)).not.toContain("private-task-canary");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ask Siggo", exact: true })).toBeFocused();
  await page.getByRole("button", { name: game, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(".assistant-focus")).toContainText(game);
  await expect(dialog.getByText(reply.answer, { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "New general chat", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".assistant-focus")).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText("A little less searching.")).toBeVisible();
  expect(bodies).toHaveLength(1);
  await page.keyboard.press("Escape");
  for (const title of [finance, game])
    await page.getByRole("button", { name: `Compare ${title}`, exact: true }).click();
  await page
    .getByRole("region", { name: "Comparison selection" })
    .getByRole("button", { name: "Compare (2)", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Ask about ${finance}`, exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".assistant-focus")).toContainText(finance);
  await expect(page.getByRole("dialog").getByText(reply.answer, { exact: true })).toHaveCount(0);
  expect(bodies).toHaveLength(1);
});

test("participation progress and private tasks persist, filter Saved, and protect unadded drafts", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole("button", { name: finance, exact: true }).click();
  let dialog = page.getByRole("dialog");
  let plan = dialog.getByRole("region", { name: "Private participation plan" });
  await plan.getByRole("button", { name: "Start tracking", exact: true }).click();
  await plan
    .getByRole("combobox", { name: "Your progress", exact: true })
    .selectOption("Preparing");
  for (const text of ["Read the organizer rules", "Build a baseline model"]) {
    await plan.getByRole("textbox", { name: "New task", exact: true }).fill(text);
    await plan.getByRole("button", { name: "Add task", exact: true }).click();
  }
  await plan.getByRole("checkbox", { name: "Read the organizer rules", exact: true }).check();
  await expect(plan.getByText("1/2 tasks done", { exact: true })).toBeVisible();
  await plan.getByRole("textbox", { name: "New task", exact: true }).fill("An unadded draft");
  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("task");
    await confirmation.dismiss();
  });
  await page.keyboard.press("Escape");
  await expect(plan.getByRole("textbox", { name: "New task", exact: true })).toHaveValue(
    "An unadded draft",
  );
  await plan.getByRole("textbox", { name: "New task", exact: true }).fill("");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await plan.screenshot({ path: testInfo.outputPath("participation-plan.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Saved/ }).click();
  await page
    .getByRole("combobox", { name: "Filter saved by progress", exact: true })
    .selectOption("Submitted");
  await expect(page.getByRole("button", { name: finance, exact: true })).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filter saved by progress", exact: true })
    .selectOption("Preparing");
  await expect(page.getByRole("button", { name: finance, exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toBeEnabled();
  await page.getByRole("button", { name: finance, exact: true }).click();
  dialog = page.getByRole("dialog");
  plan = dialog.getByRole("region", { name: "Private participation plan" });
  await expect(plan.getByRole("combobox", { name: "Your progress", exact: true })).toHaveValue(
    "Preparing",
  );
  await expect(
    plan.getByRole("checkbox", { name: "Read the organizer rules", exact: true }),
  ).toBeChecked();
  await plan
    .getByRole("combobox", { name: "Your progress", exact: true })
    .selectOption("Submitted");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Saved/ }).click();
  await expect(page.getByRole("button", { name: finance, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Archive/ }).click();
  await expect(page.getByRole("button", { name: finance, exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siggo-workspace-v1") ?? "{}"),
  );
  expect(stored.participationPlans["drivendata:finance"].stage).toBe("Submitted");
});

test("saved-only progress remains editable and archived listings cannot be uploaded to chat", async ({
  page,
}) => {
  const plan = { stage: "Preparing", tasks: [{ id: "task-1", text: "Keep my work", done: false }] };
  await page.addInitScript(
    (workspace) => localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace)),
    {
      ...defaultWorkspace,
      saved: ["evalai:expired", "evalai:lost"],
      participationPlans: { "evalai:expired": plan, "evalai:lost": plan },
    },
  );
  await ready(page);
  await page.getByRole("button", { name: /^Saved/ }).click();
  await page.getByRole("button", { name: "View note and plan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Keep my work", exact: true })
    .check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Archive/ }).click();
  await page.getByRole("button", { name: "An Archived Competition", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Ask about this", exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", { name: "Keep my work", exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Remove plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep plan", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Keep my work", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove plan and tasks", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Start tracking", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siggo-workspace-v1") ?? "{}"),
  );
  expect(stored.saved).toContain("evalai:expired");
  expect(stored.participationPlans["evalai:expired"]).toBeUndefined();
  expect(stored.participationPlans["evalai:lost"].tasks[0].done).toBe(true);
});
