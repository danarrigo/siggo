import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";

const reply = {
  answer:
    "Forecast the Financial Frontier is a finance listing [1]. Its entry fee and Indonesian eligibility are unverified. Check the linked organizer rules before entering.",
  sources: [
    {
      number: 1,
      title: "Forecast the Financial Frontier",
      url: "https://www.drivendata.org/competitions/2/finance/",
    },
  ],
  catalogUpdatedAt: "2026-11-08T00:00:00Z",
  selectedCount: 8,
  catalogCount: 10,
};

test("Ask Siggo is accessible, read-only, source-linked, and only sends chat text", async ({
  page,
}, testInfo) => {
  const bodies: unknown[] = [];
  await page.route("**/api/assistant", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: reply });
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toBeEnabled();
  // Existing private state must not accidentally become AI context.
  await page.evaluate(() => {
    const key = "siggo-workspace-v1";
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    stored.notes = { "drivendata:finance": "private-note-canary" };
    stored.saved = ["drivendata:finance"];
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Search competitions" })).toBeEnabled();
  // A real workspace toast must not cover modal controls, particularly on mobile.
  await page
    .getByRole("button", { name: "Save Neural Arena: Multi-agent Simulation", exact: true })
    .click();
  await expect(page.getByText("Saved in this browser", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem("siggo-workspace-v1"));
  expect(before).toContain("private-note-canary");
  const trigger = page.getByRole("button", { name: "Ask Siggo", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ask Siggo" })).toBeVisible();
  await expect(dialog.getByText("Notes, saved lists,", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Find finance competitions I can explore." }).click();
  await expect(dialog.getByRole("textbox", { name: "Your question" })).toHaveValue(
    "Find finance competitions I can explore.",
  );
  await dialog.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(dialog.getByText(reply.answer, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await expect(
    dialog.getByRole("link", { name: /Forecast the Financial Frontier/ }),
  ).toHaveAttribute("href", reply.sources[0].url);
  await expect(
    dialog.getByText("8 of 10 catalog listings selected", { exact: false }),
  ).toBeVisible();
  expect(bodies).toEqual([
    { messages: [{ role: "user", content: "Find finance competitions I can explore." }] },
  ]);
  expect(await page.evaluate(() => localStorage.getItem("siggo-workspace-v1"))).toBe(before);
  await dialog.getByRole("textbox", { name: "Your question" }).fill("What about fees?");
  await dialog.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(dialog.getByText(reply.answer, { exact: true })).toHaveCount(2);
  expect(bodies[1]).toEqual({
    messages: [
      { role: "user", content: "Find finance competitions I can explore." },
      { role: "assistant", content: reply.answer },
      { role: "user", content: "What about fees?" },
    ],
  });
  expect(JSON.stringify(bodies)).not.toContain("private-note-canary");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ask-siggo.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByText(reply.answer, { exact: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Clear chat" }).click();
  await expect(dialog.getByText(reply.answer, { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await page.reload();
  await trigger.click();
  await expect(dialog.getByText("A little less searching.")).toBeVisible();
});

test("quota failures keep the question without retrying or fabricating a reply", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/assistant", async (route) => {
    calls++;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "30" },
      json: {
        error:
          "Groq's free quota is busy or exhausted. Try again later; no paid fallback was used.",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ask Siggo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const question = dialog.getByRole("textbox", { name: "Your question" });
  await question.fill("Find finance competitions");
  await dialog.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("no paid fallback");
  await expect(question).toHaveValue("Find finance competitions");
  expect(calls).toBe(1);
  await expect(dialog.getByRole("list", { name: "Catalog sources" })).toHaveCount(0);
});

test("clearing a pending request cannot resurrect late chat content", async ({ page }) => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/assistant", async (route) => {
    await waiting;
    await route.fulfill({ json: reply }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ask Siggo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Your question" }).fill("Find finance competitions");
  const submitted = page.waitForRequest("**/api/assistant");
  await dialog.getByRole("button", { name: "Ask", exact: true }).click();
  await submitted;
  await expect(dialog.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Clear chat" }).click();
  release?.();
  await expect(dialog.getByText("A little less searching.")).toBeVisible();
  await expect(dialog.getByText(reply.answer, { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Your question" })).toHaveValue("");
});

test("the real API does not allow credential-free inference even in test preview", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Find finance competitions" }] }),
    });
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      data: await response.json(),
    };
  });
  expect(result).toEqual({
    status: 401,
    cache: "private, no-store",
    data: { error: "Sign in required" },
  });
});
