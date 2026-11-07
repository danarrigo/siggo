import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { competitionSchema, defaultWorkspace } from "../../src/lib/model";
import { expect, test } from "./test";

async function financeListing() {
  const catalog = JSON.parse(await readFile("tests/fixtures/catalog.json", "utf8"));
  return competitionSchema
    .array()
    .parse(catalog.competitions)
    .find((item) => item.id === "drivendata:finance")!;
}

test("saved snapshots survive source removal, archive ended listings, and retain editable notes", async ({
  page,
}, info) => {
  const original = await financeListing();
  const ended = {
    ...original,
    id: "drivendata:past",
    title: "Retained Finance Final",
    url: "https://www.drivendata.org/competitions/9999/past/",
    challengeEndsAt: "2020-01-01",
  };
  const missing = {
    ...original,
    id: "drivendata:missing",
    title: "Unlisted but not ended",
    url: "https://www.drivendata.org/competitions/9998/missing/",
  };
  await page.addInitScript(
    (workspace) => {
      if (!localStorage.getItem("siggo-workspace-v1"))
        localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace));
    },
    {
      ...defaultWorkspace,
      saved: [ended.id, missing.id],
      savedSnapshots: { [ended.id]: ended, [missing.id]: missing },
      notes: { [ended.id]: "Keep the model ideas" },
    },
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: ended.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: missing.title, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Saved 2$/ }).click();
  await expect(page.getByRole("button", { name: /^Current 1$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: missing.title, exact: true })).toBeVisible();
  await expect(
    page.getByTestId("competition-card").getByText("Saved snapshot", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Archive 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.getByRole("button", { name: ended.title, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Saved snapshot/)).toBeVisible();
  await expect(dialog.getByLabel("Private note")).toHaveValue("Keep the model ideas");
  await dialog.getByLabel("Private note").fill("Keep the model ideas and results");
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("saved-archive.png"), fullPage: true });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: /^Saved 2$/ }).click();
  await page.getByRole("button", { name: /^Archive 1$/ }).click();
  await page.getByRole("button", { name: ended.title, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Private note")).toHaveValue("Keep the model ideas and results");
  await dialog.getByRole("button", { name: "Saved", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "No archived competitions", exact: true }),
  ).toBeVisible();
});

test("deadline updates are accurately labeled, can be read, and stay read after reload", async ({
  page,
}, info) => {
  const latest = await financeListing();
  const previous = {
    ...latest,
    challengeEndsAt: new Date(Date.parse(latest.challengeEndsAt!) - 7 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.parse(latest.lastSeenAt) - 86400000).toISOString(),
  };
  await page.addInitScript(
    (workspace) => {
      if (!localStorage.getItem("siggo-workspace-v1"))
        localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace));
    },
    { ...defaultWorkspace, saved: [latest.id], savedSnapshots: { [latest.id]: previous } },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /View deadline reminders and updates \(1\)/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Deadline changes", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Challenge end", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Extended", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Submission deadline", { exact: true })).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("deadline-changes.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Mark changes read", exact: true }).click();
  await expect(dialog.getByText("No unread deadline changes", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /View deadline reminders/ }).click();
  await expect(
    page.getByRole("dialog").getByText("No unread deadline changes", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("siggo-workspace-v1")!));
  expect(saved.deadlineChanges).toEqual([]);
  expect(saved.savedSnapshots[latest.id].challengeEndsAt).toBe(latest.challengeEndsAt);
});

test("legacy bookmarks with missing metadata keep their notes accessible without inventing an ended status", async ({
  page,
}) => {
  const id = "evalai:legacy-unavailable";
  await page.addInitScript(
    (workspace) => {
      if (!localStorage.getItem("siggo-workspace-v1"))
        localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace));
    },
    { ...defaultWorkspace, saved: [id], notes: { [id]: "A note from an older workspace" } },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByText("Saved listing unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Archive 0$/ })).toBeVisible();
  await page.getByRole("button", { name: "View note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Private note")).toHaveValue("A note from an older workspace");
  await dialog.getByLabel("Private note").fill("Preserve and update the older note");
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await page.getByRole("button", { name: "View note", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Private note")).toHaveValue(
    "Preserve and update the older note",
  );
});
