import { setTimeout as delay } from "node:timers/promises";
import robotsParser from "robots-parser";
import { canonicalUrl, deduplicate, isActive, type Catalog } from "../model";
import { parseOpenCalendar, parseTensorHack } from "./parsers";
import { request, SourceHttpError, sourceFailure, sourceUserAgent } from "./request";

const directory = "https://tensorhack.com/hackathons";
const robotsUrl = "https://tensorhack.com/robots.txt";

async function publicText(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source body missing");
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Source page exceeds size limit");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function collectDevpost(
  checkedAt: string,
  budget: AbortSignal,
  calendarData: () => Promise<unknown>,
  previous: () => Catalog | undefined,
) {
  const calendar = calendarData()
    .then((data) => parseOpenCalendar(data, checkedAt, "devpost").items)
    .catch(() => null);
  const oldStatus = previous()?.sources.find((source) => source.id === "devpost");
  let retryAt = oldStatus?.retryAt;
  let parsed: ReturnType<typeof parseTensorHack> | undefined;
  let failure: unknown;
  try {
    if (retryAt && Date.parse(retryAt) > Date.now()) throw new Error("TensorHack retry pause");
    retryAt = undefined;
    let rules = "";
    try {
      rules = await publicText(await request(robotsUrl, undefined, budget), 64_000);
    } catch (error) {
      if (!(error instanceof SourceHttpError && [404, 410].includes(error.status))) throw error;
    }
    const robots = robotsParser(robotsUrl, rules);
    if (robots.isAllowed(directory, sourceUserAgent) === false)
      throw new Error("TensorHack robots disallow the directory");
    const interval = Math.max(3000, (robots.getCrawlDelay(sourceUserAgent) ?? 0) * 1000);
    if (!Number.isFinite(interval) || interval > 90_000)
      throw new Error("TensorHack robots delay exceeds request budget");
    await delay(interval, undefined, { signal: budget });
    parsed = parseTensorHack(
      await publicText(await request(directory, undefined, budget), 2_000_000),
      checkedAt,
    );
  } catch (error) {
    failure = error;
    if (error instanceof SourceHttpError && error.retryAt) retryAt = error.retryAt;
  }
  const fallback = await calendar;
  const old = previous();
  const retained = (old?.competitions ?? []).filter(
    (item) => item.source === "devpost" && isActive(item),
  );
  const byListing = new Map(
    retained
      .filter((item) => item.metadataSource?.name === "TensorHack")
      .map((item) => [item.metadataSource!.url, item]),
  );
  const byUrl = new Map(retained.map((item) => [canonicalUrl(item.url), item]));
  const items = (parsed?.items ?? []).map((item) => {
    const known = byListing.get(item.metadataSource!.url) ?? byUrl.get(canonicalUrl(item.url));
    if (!known) return item;
    // Retain a previously published destination if it is absent from this page's JSON-LD slice.
    return {
      ...item,
      id: known.id,
      url:
        item.url === item.metadataSource!.url &&
        known.metadataSource?.url === item.metadataSource!.url
          ? known.url
          : item.url,
    };
  });
  const seen = new Set(items.map((item) => item.id));
  const recovery = retained.filter(
    (item) =>
      !seen.has(item.id) &&
      (!parsed ||
        parsed.skipped > 0 ||
        (fallback === null && item.metadataSource?.name !== "TensorHack")),
  );
  const available =
    Boolean(parsed && (parsed.items.length || !parsed.skipped)) || fallback !== null;
  const reason =
    retryAt && Date.parse(retryAt) > Date.now()
      ? `TensorHack retry pause until ${retryAt}.`
      : failure instanceof Error && failure.message.startsWith("TensorHack robots")
        ? "TensorHack collection stopped at crawler rules."
        : failure
          ? `${sourceFailure(failure)}.`
          : "";
  return {
    items: deduplicate([...items, ...(fallback ?? []), ...recovery]),
    available,
    collectionMode:
      parsed || oldStatus?.collectionMode === "public-directory"
        ? ("public-directory" as const)
        : ("licensed-calendar" as const),
    ...(retryAt ? { retryAt } : {}),
    note: `${reason} ${parsed ? `${parsed.items.length} TensorHack-listed Devpost records read${parsed.skipped ? `; ${parsed.skipped} malformed or unlinked records skipped` : ""}.` : "TensorHack metadata unavailable; using licensed calendar/retained details where available."} ${fallback === null ? "Calendar check failed." : ""} ${recovery.length ? "Some previous details retained." : ""}`.trim(),
  };
}
