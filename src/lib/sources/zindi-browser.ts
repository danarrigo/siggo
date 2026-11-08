import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { sourceUserAgent } from "./request";

export type ZindiPage = { page: Page; close: () => Promise<void> };
// Fluid invocations share /tmp; do not race two extractions of the same binary.
let executable: Promise<string> | undefined;

export async function openZindiPage(budget: AbortSignal): Promise<ZindiPage> {
  budget.throwIfAborted();
  const profile = await mkdtemp(join(tmpdir(), "siggo-zindi-"));
  let context: BrowserContext | undefined;
  try {
    const { chromium } = await import("playwright-core");
    const serverless = process.env.VERCEL ? (await import("@sparticuz/chromium")).default : null;
    if (serverless) serverless.setGraphicsMode = false;
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      timeout: 20_000,
      ...(serverless
        ? {
            executablePath: await (executable ??= serverless.executablePath().catch((error) => {
              executable = undefined;
              throw error;
            })),
            // Keep normal HTTPS and same-origin protections; no stealth/anti-bot overrides.
            args: serverless.args.filter(
              (arg) =>
                !["--disable-web-security", "--allow-running-insecure-content"].includes(arg),
            ),
          }
        : {}),
      // Do not inherit the app's database, OAuth, or cron secrets into Chromium.
      env: {
        ...Object.fromEntries(
          [
            "PATH",
            "SystemRoot",
            "WINDIR",
            "PATHEXT",
            "LD_LIBRARY_PATH",
            "FONTCONFIG_PATH",
            "FONTCONFIG_FILE",
          ].flatMap((name) => {
            const value = process.env[name];
            return value === undefined ? [] : [[name, value]];
          }),
        ),
        HOME: profile,
        TMPDIR: tmpdir(),
        LANG: "en_US.UTF-8",
        TZ: "UTC",
      },
      userAgent: sourceUserAgent,
      locale: "en-US",
      timezoneId: "UTC",
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    const opened = context;
    await opened.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const allowed =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        [
          "zindi.world",
          "api.zindi.world",
          "zindi-app.lon1.digitaloceanspaces.com",
          "ajax.googleapis.com",
        ].includes(url.hostname) &&
        ["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        // The public app also probes account-only participation. Never request that data.
        !(
          url.hostname === "api.zindi.world" && /^\/v1\/participations(?:\/|$)/.test(url.pathname)
        ) &&
        !["image", "font", "media"].includes(request.resourceType());
      if (!allowed) {
        await route.abort().catch(() => {});
        return;
      }
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: 18_000 });
        // Redirects must not escape the host allowlist or lead to a sign-in/access gate.
        if (response.status() >= 300 && response.status() < 400) await route.abort();
        else await route.fulfill({ response });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    budget.throwIfAborted();
    let closing: Promise<void> | undefined;
    const close = () =>
      (closing ??= (async () => {
        budget.removeEventListener("abort", abort);
        try {
          await opened.close();
        } finally {
          await rm(profile, { recursive: true, force: true });
        }
      })());
    const abort = () => {
      void close().catch(() => {});
    };
    budget.addEventListener("abort", abort, { once: true });
    return { page: opened.pages()[0] ?? (await opened.newPage()), close };
  } catch (error) {
    try {
      await context?.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
    throw error;
  }
}
