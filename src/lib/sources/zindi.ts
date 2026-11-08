import { setTimeout as delay } from "node:timers/promises";
import robotsParser from "robots-parser";
import type { Catalog, Competition, SourceStatus } from "../model";
import { deduplicate, isActive } from "../model";
import {
  parseZindiCalendar,
  parseZindiDirectory,
  parseZindiTimeline,
  zindiCardSelector,
} from "./parsers";
import { request, SourceHttpError, sourceFailure, sourceUserAgent } from "./request";
import { openZindiPage, type ZindiPage } from "./zindi-browser";

const directory = "https://zindi.world/competitions";
const robotsUrl = "https://zindi.world/robots.txt";

type Result = {
  items: Competition[];
  available: boolean;
  partial: boolean;
  collectionMode: NonNullable<SourceStatus["collectionMode"]>;
  note: string;
  retryAt?: string;
};

export async function collectZindi(
  checkedAt: string,
  budget: AbortSignal,
  calendarData: () => Promise<unknown>,
  previous: () => Catalog | undefined,
  openPage = openZindiPage,
): Promise<Result> {
  const old = previous();
  const oldStatus = old?.sources.find((source) => source.id === "zindi");
  const retained = (old?.competitions ?? []).filter(
    (item) => item.source === "zindi" && isActive(item),
  );
  const calendar = calendarData()
    .then((data) => parseZindiCalendar(data, checkedAt))
    .catch(() => null);
  let session: ZindiPage | undefined;
  let items: Competition[] = [];
  let directoryComplete = false;
  let timelines = 0;
  let failure: unknown;
  let blocked: SourceHttpError | undefined;
  let retryAt = oldStatus?.retryAt;
  try {
    if (retryAt && Date.parse(retryAt) > Date.now()) throw new Error("Zindi retry pause");
    retryAt = undefined;
    let robotsText = "";
    try {
      robotsText = await (await request(robotsUrl, undefined, budget)).text();
    } catch (error) {
      if (!(error instanceof SourceHttpError && [404, 410].includes(error.status))) throw error;
    }
    const robots = robotsParser(robotsUrl, robotsText);
    const allowed = (url: string) => robots.isAllowed(url, sourceUserAgent) !== false;
    if (!allowed(directory)) throw new Error("Zindi robots disallow this directory");
    const interval = Math.max(3_000, (robots.getCrawlDelay(sourceUserAgent) ?? 0) * 1000);
    if (!Number.isFinite(interval) || interval > 90_000)
      throw new Error("Zindi robots crawl delay exceeds the request budget");
    let lastNavigation = Date.now();
    session = await openPage(budget);
    const page = session.page;
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (
        ["zindi.world", "api.zindi.world"].includes(url.hostname) &&
        ([401, 403, 429].includes(response.status()) || response.status() >= 500)
      ) {
        blocked = new SourceHttpError(response.status(), response.headers()["retry-after"] ?? null);
        void page.close().catch(() => {});
      }
    });
    const navigate = async (url: string, selector: string) => {
      budget.throwIfAborted();
      if (blocked) throw blocked;
      if (!allowed(url)) throw new Error("Zindi robots disallow this page");
      await delay(Math.max(0, interval - (Date.now() - lastNavigation)), undefined, {
        signal: budget,
      });
      lastNavigation = Date.now();
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18_000 });
      if (!response?.ok())
        throw new SourceHttpError(
          response?.status() ?? 0,
          response?.headers()["retry-after"] ?? null,
        );
      if (page.url() !== url) throw new Error("Unexpected Zindi navigation");
      await page.locator(selector).first().waitFor({ timeout: 18_000 });
      if (blocked) throw blocked;
      return page.content();
    };
    await navigate(directory, "h2");
    await page
      .getByRole("heading", { name: /^Open Challenges:\s*\d+$/i })
      .waitFor({ timeout: 18_000 });
    const heading = await page
      .getByRole("heading", { name: /^Open Challenges:\s*\d+$/i })
      .textContent();
    if (!/^Open Challenges:\s*0$/i.test(heading?.trim() ?? ""))
      await page
        .locator(zindiCardSelector)
        .locator("[class*='Competition__title'] a[href]")
        .first()
        .waitFor({ timeout: 18_000 });
    let parsed = parseZindiDirectory(await page.content(), checkedAt);
    items = parsed.items;
    // Load more only inside Open Challenges, never the much larger Past section.
    for (let pages = 0; !parsed.complete && pages < 50; pages++) {
      const before = await page.locator(zindiCardSelector).count();
      let advanced = false;
      for (const button of await page.getByRole("button", { name: /^Load more$/i }).all()) {
        const inOpenSection = await button.evaluate((element) => {
          const headings = [...document.querySelectorAll("h2")].filter(
            (heading) =>
              /^(Open|Past) Challenges:/i.test(heading.textContent?.trim() ?? "") &&
              Boolean(heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
          );
          return /^Open Challenges:/i.test(headings.at(-1)?.textContent?.trim() ?? "");
        });
        if (!inOpenSection) continue;
        budget.throwIfAborted();
        await delay(Math.max(0, interval - (Date.now() - lastNavigation)), undefined, {
          signal: budget,
        });
        lastNavigation = Date.now();
        await button.click({ timeout: 5_000 });
        await page.waitForFunction(
          ({ count, selector }) => document.querySelectorAll(selector).length > count,
          { count: before, selector: zindiCardSelector },
          { timeout: 10_000 },
        );
        if (blocked) throw blocked;
        advanced = true;
        break;
      }
      if (!advanced) break;
      parsed = parseZindiDirectory(await page.content(), checkedAt);
      items = parsed.items;
    }
    directoryComplete = parsed.complete;
    const prior = new Map(retained.map((item) => [item.id.toLowerCase(), item]));
    items = items.map((item) => {
      const known = prior.get(item.id.toLowerCase());
      return known
        ? {
            ...item,
            id: known.id,
            opensAt: known.opensAt,
            registrationEndsAt: known.registrationEndsAt,
            submissionEndsAt: known.submissionEndsAt,
            challengeEndsAt: known.challengeEndsAt,
            eventEndsAt: known.eventEndsAt,
            lastSeenAt: known.lastSeenAt,
          }
        : item;
    });
    // First-visit shells have the same timestamp as successful reads. Prioritize missing
    // timeline dates, then older observations, rather than repeatedly checking the first page.
    const hasDates = (item: Competition) =>
      Boolean(
        item.opensAt ||
        item.registrationEndsAt ||
        item.submissionEndsAt ||
        item.challengeEndsAt ||
        item.eventEndsAt,
      );
    const queue = [...items].sort(
      (a, b) =>
        Number(hasDates(a)) - Number(hasDates(b)) ||
        (prior.has(a.id.toLowerCase()) ? Date.parse(a.lastSeenAt) : 0) -
          (prior.has(b.id.toLowerCase()) ? Date.parse(b.lastSeenAt) : 0),
    );
    for (const item of queue) {
      try {
        await navigate(item.url, "[class*='Timeline__container']");
        const info = page.locator("[class*='Timeline__close'] [class*='Timeline__info']").first();
        if (await info.count()) {
          await info.hover({ timeout: 2_000 });
          await page
            .locator("[class*='tooltip'], [role='tooltip']")
            .first()
            .waitFor({ state: "attached", timeout: 2_000 })
            .catch(() => {});
        }
        Object.assign(item, parseZindiTimeline(await page.content()), { lastSeenAt: checkedAt });
        timelines++;
      } catch (error) {
        failure = blocked ?? error;
        if (blocked || budget.aborted || error instanceof SourceHttpError) break;
      }
    }
  } catch (error) {
    failure = blocked ?? error;
  } finally {
    await session?.close();
  }
  if (failure instanceof SourceHttpError && failure.retryAt) retryAt = failure.retryAt;
  const direct = directoryComplete || items.length > 0;
  const complete = directoryComplete && timelines === items.length && !failure;
  if (complete)
    return {
      items,
      available: true,
      partial: false,
      collectionMode: "public-directory",
      note: `${items.length} open challenge listings and their public timelines checked.`,
    };
  const fallback = await calendar;
  // The cache reader can finish after collection starts. Recover its latest snapshot too.
  const latest = previous();
  const latestStatus = latest?.sources.find((source) => source.id === "zindi") ?? oldStatus;
  const latestRetained = (latest?.competitions ?? retained).filter(
    (item) => item.source === "zindi" && isActive(item),
  );
  const seen = new Set(items.map((item) => item.id.toLowerCase()));
  // A parsed, ended item must not be resurrected by the calendar or an older snapshot.
  const extras = [...(fallback ?? []), ...latestRetained].filter(
    (item) => !seen.has(item.id.toLowerCase()),
  );
  const reason =
    retryAt && Date.parse(retryAt) > Date.now()
      ? `Provider retry pause until ${retryAt}.`
      : failure instanceof Error && failure.message.startsWith("Zindi robots")
        ? "Public collection stopped at the site's crawler rules."
        : `${sourceFailure(failure)}.`;
  return {
    items: deduplicate([...items, ...extras]),
    available: direct || fallback !== null,
    partial: true,
    collectionMode:
      direct || latestStatus?.collectionMode === "public-directory"
        ? "public-directory"
        : "licensed-calendar",
    ...(retryAt ? { retryAt } : {}),
    note: `${reason} ${direct ? `${items.length} public open listings found; ${timelines} timelines checked. ` : ""}Showing available public metadata, licensed calendar entries and retained details; coverage is incomplete.`,
  };
}
