import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";
import { defaultWorkspace } from "../../src/lib/model";

test("Siggo branding preserves the previous browser workspace", async ({ page }) => {
  const previous = {
    ...defaultWorkspace,
    saved: ["drivendata:finance"],
    notes: { "drivendata:finance": "Keep this private note" },
  };
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("signal-workspace-v1"))
      localStorage.setItem("signal-workspace-v1", JSON.stringify(workspace));
  }, previous);
  await page.goto("/");
  await expect(page).toHaveTitle("Siggo | Competition index");
  await expect(page.getByRole("link", { name: "Siggo home" })).toHaveText("siggo");
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await page.getByRole("button", { name: "Forecast the Financial Frontier", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Private note")).toHaveValue(
    "Keep this private note",
  );
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siggo-workspace-v1")!),
  );
  expect(migrated.saved).toEqual(previous.saved);
  expect(migrated.notes).toEqual(previous.notes);
});

test("filters cannot lose an interaction before hydration", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  const source = page.getByRole("combobox", { name: "Filter by source" });
  await expect(source).toBeDisabled();
  release();
  await expect(source).toBeEnabled();
  await source.selectOption("zindi");
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
});

const futureDay = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test("new discoveries use the previous visit, can be marked seen, and do not remove other listings", async ({
  page,
}) => {
  await page.addInitScript(
    (workspace) => {
      if (!localStorage.getItem("siggo-workspace-v1"))
        localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace));
    },
    { ...defaultWorkspace, lastVisitedAt: new Date(Date.now() - 86400000).toISOString() },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^New 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Neural Arena: Multi-agent Simulation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark all seen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No new competitions", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^New 0$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(0);
  await page.getByRole("button", { name: "All competitions", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(10);
});

test("saved event dates produce in-app reminders without relabeling submission deadlines", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save Build Something That Plays", exact: true }).click();
  await page.getByRole("button", { name: /View deadline reminders/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Upcoming deadlines" })).toBeVisible();
  await expect(dialog.getByText("Event ends", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Submissions close", { exact: true })).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await dialog.getByRole("button", { name: /Build Something That Plays/ }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Build Something That Plays", exact: true }),
  ).toBeVisible();
});

test("add, note, reload, edit, remind, and delete a private manual competition", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add competition", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Personal Finance Sprint");
  await dialog
    .getByLabel("Official URL", { exact: true })
    .fill("https://example.org/contests/personal-finance");
  await dialog.getByLabel("Participation", { exact: true }).selectOption("Online");
  await dialog.getByLabel("Registration deadline", { exact: true }).fill(futureDay(2));
  await dialog.getByLabel("Submission deadline", { exact: true }).fill(futureDay(3));
  const addAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(addAudit.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Add and save competition", exact: true }).click();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await expect(
    page.getByTestId("competition-card").getByText("Added by you", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personal Finance Sprint", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Private note", { exact: true })
    .fill("Check Indonesia eligibility. Ask a teammate about the finance track.");
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Save note", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("manual");
  await page.getByRole("button", { name: "Personal Finance Sprint", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Private note", { exact: true })).toHaveValue(
    "Check Indonesia eligibility. Ask a teammate about the finance track.",
  );
  await expect(dialog.getByText(/time\/zone unlisted/)).toHaveCount(2);
  await dialog.getByRole("button", { name: "Edit listing", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Personal Finance Sprint Updated");
  await dialog.getByRole("button", { name: "Save listing", exact: true }).click();
  await page.getByRole("button", { name: /View deadline reminders/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Personal Finance Sprint Updated/ })).toHaveCount(
    2,
  );
  await expect(dialog.getByText(/time\/zone unlisted/)).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("manual-reminders.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Personal Finance Sprint Updated", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit listing", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete listing", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(page.getByTestId("competition-card")).toHaveCount(0);
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siggo-workspace-v1")!),
  );
  expect(workspace.manualCompetitions).toEqual([]);
  expect(workspace.notes).toEqual({});
  expect(workspace.saved).toEqual([]);
});

test("existing links are saved instead of duplicated, and unsaved notes require confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add competition", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Duplicate finance listing");
  await dialog
    .getByLabel("Official URL", { exact: true })
    .fill("https://www.drivendata.org/competitions/2/finance/?utm_source=manual");
  await dialog.getByRole("button", { name: "Add and save competition", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Forecast the Financial Frontier", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Private note", { exact: true }).fill("Unfinished draft");
  page.once("dialog", (prompt) => prompt.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Private note", { exact: true })).toHaveValue("Unfinished draft");
  page.once("dialog", (prompt) => prompt.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siggo-workspace-v1")!),
  );
  expect(workspace.manualCompetitions).toEqual([]);
  expect(workspace.saved).toEqual(["drivendata:finance"]);
});

test("personal listings remain manageable after they end", async ({ page }) => {
  const manual = {
    id: "manual:ended",
    source: "manual",
    title: "Ended personal listing",
    url: "https://example.org/ended",
    description: "",
    category: "Hackathon",
    organizer: "",
    reward: null,
    image: null,
    tags: [],
    opensAt: null,
    registrationEndsAt: null,
    submissionEndsAt: null,
    challengeEndsAt: null,
    eventEndsAt: "2020-01-01",
    registrationOpen: null,
    participation: "Check format",
    location: "Check format",
    entryFee: "Unknown",
    eligibility: "Unverified",
    lastSeenAt: new Date().toISOString(),
  };
  await page.addInitScript(
    (workspace) => localStorage.setItem("siggo-workspace-v1", JSON.stringify(workspace)),
    { ...defaultWorkspace, manualCompetitions: [manual] },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Ended personal listing", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add competition", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Manage your 1 personal listing/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ended personal listing/ })
    .click();
  await page.getByRole("dialog").getByLabel("Event ends", { exact: true }).fill(futureDay(4));
  await page.getByRole("dialog").getByRole("button", { name: "Save listing", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ended personal listing", exact: true }),
  ).toBeVisible();
});
