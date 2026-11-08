import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./test";

test("verified organizer logos are contained, credited, and kept distinct from event artwork", async ({
  page,
}, info) => {
  const devpostRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("devpost.com"))
      devpostRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("devpost");
  const card = page.getByTestId("competition-card").filter({ hasText: "STEM2Connect logo test" });
  const image = card.getByRole("img", {
    name: "Organizer logo for STEM2Connect logo test",
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
  await page.screenshot({ path: info.outputPath("organizer-logo-row.png") });
  await card.getByRole("button", { name: "STEM2Connect logo test", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: "Organizer logo for STEM2Connect logo test", exact: true }),
  ).toBeVisible();
  const credit = dialog.locator(".source-provenance").filter({ hasText: "Organizer logo via" });
  await expect(credit.getByRole("link", { name: "STEM2Connect", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/stem4teens-sys/stem2connect-website/blob/63825f28b74a318d955cba782c6088bd700da1be/assets/logo.jpg",
  );
  await expect(credit).toContainText("Reuse permission is unverified");
  await expect(dialog.getByRole("link", { name: "TensorHack", exact: true })).toHaveAttribute(
    "href",
    "https://tensorhack.com/hackathons/devpost-stem2connect-ai-hackathon",
  );
  await expect(
    dialog.getByRole("link", { name: "Official challenge", exact: true }),
  ).toHaveAttribute("href", "https://stem2connect-online-hackathon.devpost.com/");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("organizer-logo-credit.png") });
  await dialog.getByRole("button", { name: "Save opportunity", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /^Saved 1$/ }).click();
  await page.getByRole("button", { name: "STEM2Connect logo test", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "STEM2Connect", exact: true }),
  ).toBeVisible();
  expect(devpostRequests).toEqual([]);
});
