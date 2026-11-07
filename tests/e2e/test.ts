import { readFile } from "node:fs/promises";
import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export const test = base.extend({
  page: async ({ page }, run) => {
    // Fulfill the image optimizer request in-browser: E2E never contacts asset hosts.
    await page.route("**/_next/image?**", async (route) => {
      const source = new URL(route.request().url()).searchParams.get("url");
      if (!source?.startsWith("https://media.eval.ai/media/logos/signal-e2e-"))
        return route.abort();
      await route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile("tests/fixtures/cover.svg"),
      });
    });
    // Previews bypass the optimizer. Supply final image bytes without external requests.
    await page.route("https://www.kaggle.com/open-graph/images/Competitions/1234", async (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile("tests/fixtures/cover.svg"),
      }),
    );
    await run(page);
  },
});
