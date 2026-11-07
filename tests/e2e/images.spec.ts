import { expect, test } from "./test";

test("shows source images and neutral placeholders without generated filler", async ({
  page,
}, info) => {
  await page.goto("/");
  const cards = page.getByTestId("competition-card");
  await expect(cards).toHaveCount(8);
  await expect(cards.getByTestId("competition-cover")).toHaveCount(8);
  const arena = cards.filter({ hasText: "Neural Arena: Multi-agent Simulation" });
  const image = arena.getByRole("img", {
    name: "Organizer artwork for Neural Arena: Multi-agent Simulation",
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("loading", "eager");
  await expect(
    cards.filter({ hasText: "Seeing Beyond the Frame" }).getByRole("img"),
  ).toHaveAttribute("loading", "lazy");
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
  const finance = cards.filter({ hasText: "Forecast the Financial Frontier" });
  await expect(finance.getByTestId("competition-cover")).toHaveAttribute(
    "data-visual-kind",
    "placeholder",
  );
  await expect(finance.getByText("No image", { exact: true })).toBeVisible();
  await expect(finance.locator("img")).toHaveCount(0);
  await expect(page.locator('img[src^="/artwork/"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview Neural Arena: Multi-agent Simulation", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("img", { name: "Organizer artwork for Neural Arena: Multi-agent Simulation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("competition-covers.png"), fullPage: true });
});

test("Kaggle previews load directly without using the image proxy", async ({ page }) => {
  const preview = "https://www.kaggle.com/open-graph/images/Competitions/1234";
  let requestedPreview = false;
  let sentAuthorization = false;
  page.on("request", (request) => {
    if (request.url() === preview) {
      requestedPreview = true;
      sentAuthorization ||= Boolean(request.headers().authorization);
    }
  });
  await page.goto("/");
  const card = page.getByTestId("competition-card").filter({ hasText: "Seeing Beyond the Frame" });
  await card.scrollIntoViewIfNeeded();
  const image = card.getByRole("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", preview);
  await expect(image).not.toHaveAttribute("srcset");
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
  expect(requestedPreview).toBe(true);
  expect(sentAuthorization).toBe(false);
  await card.getByRole("button", { name: "Preview Seeing Beyond the Frame", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img")).toHaveAttribute("src", preview);
  await expect(dialog.getByRole("heading", { name: "Seeing Beyond the Frame" })).toBeInViewport();
  await expect.poll(() => dialog.evaluate((node) => node.scrollTop)).toBe(0);
});

test("broken images show a compact placeholder without hiding competition actions", async ({
  page,
}) => {
  await page.route("**/_next/image?**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    if (source?.endsWith("signal-e2e-cover.png")) return route.abort();
    return route.fallback();
  });
  await page.goto("/");
  const arena = page
    .getByTestId("competition-card")
    .filter({ hasText: "Neural Arena: Multi-agent Simulation" });
  await expect(arena.getByTestId("competition-cover")).toHaveAttribute(
    "data-visual-kind",
    "placeholder",
  );
  await expect(arena.getByText("No image", { exact: true })).toBeVisible();
  await expect(arena.locator("img")).toHaveCount(0);
  const bounds = await arena.getByTestId("competition-cover").boundingBox();
  expect(bounds?.height).toBeGreaterThan(60);
  await arena
    .getByRole("button", { name: "Save Neural Arena: Multi-agent Simulation", exact: true })
    .click();
  await expect(
    arena.getByRole("button", { name: "Unsave Neural Arena: Multi-agent Simulation", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the image optimizer rejects private network and unapproved image hosts", async ({
  request,
}) => {
  for (const url of ["http://127.0.0.1:3100/api/sync", "https://evil.example/cover.png"]) {
    const response = await request.get(`/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`);
    expect(response.status()).toBe(400);
  }
});
