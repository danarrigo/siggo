import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { collectDevpost } from "../../src/lib/sources/devpost";
import { parseTensorHack } from "../../src/lib/sources/parsers";
import type { Catalog } from "../../src/lib/model";
import { tensorHackEntries, tensorHackPage } from "../fixtures/tensorhack";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
const stamp = "2035-11-29T00:00:00.000Z";
const empty = async () => ({ data: [] });
const previous = (): Catalog => ({
  competitions: parseTensorHack(tensorHackPage(), stamp).items,
  sources: [],
  updatedAt: stamp,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("indirect Devpost collection", () => {
  it("uses only robots and public HTML, observes pacing, and never fetches Devpost or /api/", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.redirect).toBe("error");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
      return new Response(
        url.endsWith("robots.txt") ? "User-agent: *\nAllow: /\nDisallow: /api/" : tensorHackPage(),
      );
    });
    const result = await collectDevpost(stamp, AbortSignal.timeout(1000), empty, () => undefined);
    expect(result.items).toHaveLength(2);
    expect(result.collectionMode).toBe("public-directory");
    expect(urls).toEqual([
      "https://tensorhack.com/robots.txt",
      "https://tensorhack.com/hackathons",
    ]);
    expect(delay).toHaveBeenCalledWith(3000, undefined, expect.anything());
  });
  it("does not read the directory when robots disallows it", async () => {
    const fetcher = vi.fn(async () => new Response("User-agent: *\nDisallow: /hackathons\n"));
    vi.stubGlobal("fetch", fetcher);
    const result = await collectDevpost(stamp, AbortSignal.timeout(1000), empty, () => undefined);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("crawler rules");
  });
  it.each([401, 403, 500])("stops on HTTP %s and retains prior public records", async (status) => {
    const fetcher = vi.fn(async () => new Response("Unavailable", { status }));
    vi.stubGlobal("fetch", fetcher);
    const old = previous();
    const result = await collectDevpost(
      stamp,
      AbortSignal.timeout(1000),
      async () => {
        throw new Error("Calendar failed");
      },
      () => old,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual(old.competitions);
    expect(result.available).toBe(false);
    expect(result.note).toContain(`HTTP ${status}`);
  });
  it("persists Retry-After and skips TensorHack while paused", async () => {
    const fetcher = vi.fn(
      async () => new Response("Slow down", { status: 429, headers: { "Retry-After": "3600" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await collectDevpost(stamp, AbortSignal.timeout(1000), empty, () => undefined);
    expect(Date.parse(result.retryAt!)).toBeGreaterThan(Date.now());
    const old = previous();
    old.sources = [
      {
        id: "devpost",
        name: "Devpost",
        url: "https://devpost.com/hackathons",
        count: 2,
        state: "partial",
        checkedAt: stamp,
        lastSuccessAt: stamp,
        note: "Fixture",
        retryAt: result.retryAt,
      },
    ];
    fetcher.mockClear();
    expect(
      (await collectDevpost(stamp, AbortSignal.timeout(1000), empty, () => old)).items,
    ).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps known official links and bookmark IDs when absent from the next JSON-LD slice", async () => {
    const old = previous();
    old.competitions[0] = {
      ...old.competitions[0],
      id: "devpost:legacy",
      url: "https://finance-fixture.devpost.com/",
    };
    vi.stubGlobal(
      "fetch",
      async (url: string) => new Response(url.endsWith("robots.txt") ? "" : tensorHackPage()),
    );
    const result = await collectDevpost(stamp, AbortSignal.timeout(1000), empty, () => old);
    expect(result.items[0]).toMatchObject({
      id: "devpost:legacy",
      url: "https://finance-fixture.devpost.com/",
    });
  });
  it("merges independent calendar listings and retains malformed-row recovery without dropping valid items", async () => {
    const old = previous();
    const malformed = tensorHackPage([
      tensorHackEntries[0],
      { ...tensorHackEntries[1], deadline: "not a date" },
    ]);
    vi.stubGlobal(
      "fetch",
      async (url: string) => new Response(url.endsWith("robots.txt") ? "" : malformed),
    );
    const result = await collectDevpost(
      stamp,
      AbortSignal.timeout(1000),
      async () => ({
        data: [
          {
            name: "Calendar fixture",
            platform: "Devpost",
            url: "https://calendar-fixture.devpost.com/",
            deadline: "7 Dec 2035",
          },
        ],
      }),
      () => old,
    );
    expect(result.items).toHaveLength(3);
    expect(result.note).toContain("1 malformed");
    expect(
      result.items.find((item) => item.title === "Calendar fixture")?.metadataSource?.name,
    ).toBe("MLContests calendar");
  });
  it("rejects oversized HTML and recovers from a late-arriving cache snapshot", async () => {
    let old: Catalog | undefined;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("robots.txt")) return new Response("");
      old = previous();
      return new Response("x".repeat(2_000_001));
    });
    const result = await collectDevpost(
      stamp,
      AbortSignal.timeout(1000),
      async () => {
        throw new Error("Calendar failed");
      },
      () => old,
    );
    expect(result.items).toEqual(old?.competitions);
  });
});
