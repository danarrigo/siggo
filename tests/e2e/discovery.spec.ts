import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";

test("browse, search, filter, inspect accurate dates, and keep every active opportunity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Competitions", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar, .hero-art, .overview-strip, .context-column")).toHaveCount(
    0,
  );
  expect(
    await page
      .getByTestId("competition-card")
      .first()
      .evaluate((node) => node.getBoundingClientRect().top),
  ).toBeLessThan(480);
  await expect(page.getByTestId("competition-card")).toHaveCount(8);
  await expect(page.getByText("An Archived Competition")).toHaveCount(0);
  await expect(
    page
      .getByTestId("competition-card")
      .filter({ hasText: "Game Agent Challenge: Final Round" })
      .getByText("Registration closed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All competitions", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(8);
  await page.getByRole("textbox", { name: "Search competitions" }).fill("finance");
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Forecast the Financial Frontier", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(dialog.getByText("Registration deadline", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Not published", { exact: true })).toHaveCount(2);
  await expect(dialog.getByRole("link", { name: "Official challenge" })).toHaveAttribute(
    "href",
    "https://www.drivendata.org/competitions/2/finance/",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Hackathons", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("evalai");
  await expect(page.getByRole("heading", { name: "No matching competitions" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("save, dismiss and edit preferences, preserving them across reloads", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save Neural Arena: Multi-agent Simulation", exact: true })
    .click();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Show less like Neural Arena: Multi-agent Simulation",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Undo less relevant for Neural Arena: Multi-agent Simulation",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All competitions", exact: true }).click();
  await expect(page.getByTestId("competition-card")).toHaveCount(8);
  await page.getByRole("button", { name: "Open preferences", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Finance", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Custom interest" }).fill("Astronomy");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByLabel("Based in").fill("Indonesia");
  await dialog.getByRole("button", { name: "Apply preferences", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open preferences", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Astronomy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Finance", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("source gaps are transparent and the layout is accessible without horizontal overflow", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Competitions", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("dashboard.png"), fullPage: true });
  await page
    .getByRole("banner")
    .getByRole("button", { name: "View source coverage", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Source coverage" })).toBeVisible();
  await expect(dialog.getByText("Needs key", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Browse manually", { exact: true })).toBeVisible();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(modal.violations).toEqual([]);
});

test("sources expose provenance, date precision, and curated coverage without retired entries", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.getByRole("combobox", { name: "Filter by source" });
  await source.selectOption("zindi");
  await expect(page.getByTestId("competition-card")).toHaveCount(1);
  await expect(page.getByText("Submissions · time unlisted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Forecast River Flood Risk", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/time\/zone unlisted/)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await source.selectOption("codabench");
  await expect(
    page.getByRole("button", { name: "Language Reasoning Benchmark", exact: true }),
  ).toBeVisible();
  await expect(source.getByRole("option", { name: "CodaLab", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "View source coverage", exact: true }),
  ).toContainText("6/8");
  await page.getByRole("button", { name: "View source coverage", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "CodaLab", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Retired", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Curated feed", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(/81 public entries discovered \(directory complete\)/),
  ).toBeVisible();
  expect(await page.content()).not.toContain("attemptedAt");
  for (const name of ["Zindi", "Codabench", "Devpost"]) {
    const row = dialog
      .locator(".source-row")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(
      row.getByRole("link", { name: "MLContests open calendar (GPL-3.0)" }),
    ).toHaveAttribute("href", "https://github.com/mlcontests/mlcontests.github.io");
  }
});

test("long source-provided rewards stay compact in rows and remain readable in details", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("codabench");
  const reward = page.getByTestId("competition-card").locator(".reward-column > strong");
  const value = await reward.innerText();
  const bounds = await reward.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(bounds.height).toBeLessThanOrEqual(bounds.lineHeight * 3 + 1);
  await page.getByRole("button", { name: "Language Reasoning Benchmark", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".detail-facts").getByText(value, { exact: true }),
  ).toBeVisible();
});

test("private mutation and cron endpoints cannot be used anonymously", async ({ request }) => {
  expect((await request.get("/api/sync")).status()).toBe(401);
  expect(
    (
      await request.patch("/api/workspace", { headers: { origin: "http://127.0.0.1:3100" } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch("/api/workspace", { headers: { origin: "https://evil.example" } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put("/api/workspace", { headers: { origin: "https://evil.example" }, data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put("/api/workspace", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {},
      })
    ).status(),
  ).toBe(401);
});

test("the local preview can request a fresh catalog without database credentials", async ({
  request,
}) => {
  const response = await request.post("/api/sync", {
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(response.status()).toBe(200);
});
