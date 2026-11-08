import { test, expect } from "./test";
import AxeBuilder from "@axe-core/playwright";

test("Devpost metadata keeps third-party provenance, uncertain cutoff labels, and saved reminders", async ({
  page,
}, info) => {
  const devpostRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("devpost.com"))
      devpostRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("devpost");
  const card = page.getByTestId("competition-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByText("via TensorHack", { exact: true })).toBeVisible();
  await expect(card.getByText("Listed cutoff · time unlisted", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("devpost-metadata.png") });
  await page.getByRole("button", { name: "Community Builder Hack", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Provider-listed cutoff", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(/unverified type and does not establish registration/),
  ).toBeVisible();
  await expect(
    dialog.locator(".source-provenance").getByRole("link", { name: "TensorHack", exact: true }),
  ).toHaveAttribute("href", "https://tensorhack.com/hackathons/devpost-community-fixture");
  await expect(dialog.getByRole("link", { name: "Official challenge", exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByRole("link", { name: "View TensorHack listing", exact: true }),
  ).toHaveAttribute("href", "https://tensorhack.com/hackathons/devpost-community-fixture");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Save opportunity", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await expect(page.getByText("via TensorHack", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /View deadline reminders and updates/ }).click();
  await expect(page.getByRole("dialog").getByText("Listed cutoff", { exact: true })).toBeVisible();
  expect(devpostRequests).toEqual([]);
});
