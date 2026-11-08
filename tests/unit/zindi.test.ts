import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, SourceStatus } from "../../src/lib/model";
import { sourceState } from "../../src/components/source-coverage";
import { collectZindi } from "../../src/lib/sources/zindi";
import { parseZindiCalendar } from "../../src/lib/sources/parsers";

const checkedAt = "2026-11-06T00:00:00.000Z";
const data = {
  data: [
    {
      name: "Calendar task",
      platform: "Zindi",
      url: "https://zindi.world/competitions/calendar-task",
      deadline: "7 Dec 2035",
    },
  ],
};
const source: SourceStatus = {
  id: "zindi",
  name: "Zindi",
  url: "https://zindi.world/competitions",
  state: "partial",
  count: 1,
  checkedAt,
  lastSuccessAt: checkedAt,
  note: "Test source",
};
const snapshot = (): Catalog => ({
  competitions: parseZindiCalendar(data, checkedAt),
  sources: [source],
  updatedAt: checkedAt,
});
const noBrowser = () =>
  vi.fn(async () => {
    throw new Error("Must not launch a browser");
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zindi access and recovery", () => {
  it("stops at robots rules, without launching a browser or guessing platform permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("User-agent: *\nDisallow: /competitions\n")),
    );
    const open = noBrowser();
    const result = await collectZindi(
      checkedAt,
      AbortSignal.timeout(1000),
      async () => data,
      () => undefined,
      open,
    );
    expect(open).not.toHaveBeenCalled();
    expect(result.collectionMode).toBe("licensed-calendar");
    expect(result.partial).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.note).toContain("crawler rules");
  });
  it("does not overflow Node timers or launch a browser for an unworkable crawl delay", async () => {
    vi.stubGlobal("fetch", async () => new Response("User-agent: *\nCrawl-delay: 999999999999\n"));
    const open = noBrowser();
    const result = await collectZindi(
      checkedAt,
      AbortSignal.timeout(1000),
      async () => data,
      () => undefined,
      open,
    );
    expect(open).not.toHaveBeenCalled();
    expect(result.note).toContain("crawler rules");
  });
  it.each([401, 403, 500])(
    "does not open the directory after robots returns HTTP %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Unavailable", { status })),
      );
      const open = noBrowser();
      const result = await collectZindi(
        checkedAt,
        AbortSignal.timeout(1000),
        async () => data,
        () => undefined,
        open,
      );
      expect(open).not.toHaveBeenCalled();
      expect(result.note).toContain(`HTTP ${status}`);
      expect(result.available).toBe(true);
    },
  );
  it("persists Retry-After and does not contact Zindi again while paused", async () => {
    const fetcher = vi.fn(
      async () => new Response("Slow down", { status: 429, headers: { "Retry-After": "3600" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const open = noBrowser();
    const first = await collectZindi(
      checkedAt,
      AbortSignal.timeout(1000),
      async () => data,
      () => undefined,
      open,
    );
    expect(Date.parse(first.retryAt!)).toBeGreaterThan(Date.now());
    const previous = snapshot();
    previous.sources[0] = { ...source, retryAt: first.retryAt };
    fetcher.mockClear();
    const next = await collectZindi(
      checkedAt,
      AbortSignal.timeout(1000),
      async () => data,
      () => previous,
      open,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(next.retryAt).toBe(first.retryAt);
  });
  it("retains a snapshot which arrives after collection starts when both reads fail", async () => {
    let previous: Catalog | undefined;
    vi.stubGlobal("fetch", async () => {
      previous = snapshot();
      return new Response("Unavailable", { status: 503 });
    });
    const result = await collectZindi(
      checkedAt,
      AbortSignal.timeout(1000),
      async () => {
        throw new Error("Calendar unavailable");
      },
      () => previous,
      noBrowser(),
    );
    expect(result.available).toBe(false);
    expect(result.items.map((item) => item.id)).toEqual(["zindi:calendar-task"]);
  });
  it("labels partial direct collection Limited, without losing legacy calendar labels", () => {
    const now = Date.parse(checkedAt) + 1000;
    expect(sourceState({ ...source, collectionMode: "public-directory" }, now)).toBe("Limited");
    expect(
      sourceState({ ...source, collectionMode: "public-directory", state: "healthy" }, now),
    ).toBe("Connected");
    expect(sourceState(source, now)).toBe("Curated feed");
    expect(sourceState({ ...source, collectionMode: "licensed-calendar" }, now)).toBe(
      "Curated feed",
    );
  });
});
