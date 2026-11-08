import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { collectCatalog } from "../../src/lib/sources";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
const stamp = "2026-11-06T00:00:00.000Z";
const detail = (id: number) => ({
  id,
  title: `Public research challenge ${id}`,
  published: true,
  created_by: "research-lab",
  description: "Fictional competition metadata",
  reward: null,
  phases: [{ start: "2026-11-01T00:00:00Z", end: "2026-12-01T00:00:00Z" }],
});
let requested: number[];
let pages: number[];
function api(ids: number[], onDetail = (id: number) => Response.json(detail(id))) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("https://raw.githubusercontent.com/")) return Response.json({ data: [] });
      if (url.startsWith("https://www.codabench.org/api/competitions/public/")) {
        const page = Number(new URL(url).searchParams.get("page") ?? 1);
        pages.push(page);
        const rows = ids.slice((page - 1) * 40, page * 40);
        return Response.json({
          count: ids.length,
          results: rows.map((id) => ({ id })),
          next:
            page * 40 < ids.length
              ? `https://www.codabench.org/api/competitions/public/?page=${page + 1}`
              : null,
        });
      }
      const id = url.match(/^https:\/\/www\.codabench\.org\/api\/competitions\/(\d+)\/$/)?.[1];
      if (id) {
        requested.push(Number(id));
        return onDetail(Number(id));
      }
      return new Response("Unavailable", { status: 503 });
    }),
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(stamp);
  vi.clearAllMocks();
  for (const key of ["KAGGLE_API_TOKEN", "KAGGLE_USERNAME", "KAGGLE_KEY"]) vi.stubEnv(key, "");
  requested = [];
  pages = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("discovers and verifies entries beyond the former first-40 ceiling", async () => {
  const ids = Array.from({ length: 81 }, (_, i) => 81 - i);
  api(ids);
  const catalog = await collectCatalog();
  expect(pages).toEqual([1, 2, 3]);
  expect(catalog.competitions.filter((item) => item.source === "codabench")).toHaveLength(81);
  expect(catalog.competitions.some((item) => item.id === "codabench:1")).toBe(true);
  expect(catalog.sources.find((source) => source.id === "codabench")?.state).toBe("healthy");
});

it("persists interrupted checks and resumes unseen entries instead of repeating the first page forever", async () => {
  const controller = new AbortController();
  api([5, 4, 3, 2, 1], (id) => {
    if (requested.length === 2) controller.abort();
    return Response.json(detail(id));
  });
  const first = await collectCatalog(undefined, controller.signal);
  expect(requested).toEqual([5, 4]);
  expect(first.sources.find((source) => source.id === "codabench")?.state).toBe("partial");
  requested = [];
  api([5, 4, 3, 2, 1]);
  const second = await collectCatalog(first);
  expect(requested).toEqual(expect.arrayContaining([3, 2, 1]));
  expect(second.competitions.filter((item) => item.source === "codabench")).toHaveLength(5);
  expect(second.sources.find((source) => source.id === "codabench")?.state).toBe("healthy");
});

it("spaces directory and detail requests and stops after a provider rate limit", async () => {
  api([5, 4, 3, 2, 1], () => new Response("Rate limited", { status: 429 }));
  const catalog = await collectCatalog();
  expect(requested).toHaveLength(1);
  expect(delay).toHaveBeenCalledWith(
    1000,
    undefined,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(catalog.sources.find((source) => source.id === "codabench")?.note).toContain("HTTP 429");
});

it("does not resurrect a cached ended competition from a calendar fallback when details fail", async () => {
  api([1], () =>
    Response.json({
      ...detail(1),
      phases: [{ start: "2020-01-01T00:00:00Z", end: "2020-02-01T00:00:00Z" }],
    }),
  );
  const first = await collectCatalog();
  expect(first.competitions).toEqual([]);
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith("https://raw.githubusercontent.com/"))
      return Response.json({
        data: [
          {
            platform: "Codabench",
            name: "Outdated calendar entry",
            url: "https://www.codabench.org/competitions/1/",
            deadline: "7 Dec 2026",
          },
        ],
      });
    if (url.includes("/public/"))
      return Response.json({ count: 1, next: null, results: [{ id: 1 }] });
    return new Response("Unavailable", { status: 503 });
  });
  vi.stubGlobal("fetch", fetcher);
  const second = await collectCatalog(first);
  expect(second.competitions.some((item) => item.id === "codabench:1")).toBe(false);
});

it.each(["120", "Fri, 06 Nov 2026 00:02:00 GMT"])(
  "persists and honors Retry-After (%s) across refreshes",
  async (retryAfter) => {
    api(
      [1],
      () => new Response("Rate limited", { status: 429, headers: { "retry-after": retryAfter } }),
    );
    const first = await collectCatalog();
    expect(first.codabench?.retryAt).toBe("2026-11-06T00:02:00.000Z");
    pages = [];
    requested = [];
    vi.setSystemTime("2026-11-06T00:01:00Z");
    api([1]);
    const paused = await collectCatalog(first);
    expect(pages).toEqual([]);
    expect(requested).toEqual([]);
    expect(paused.sources.find((source) => source.id === "codabench")?.note).toContain(
      "retry pause",
    );
    vi.setSystemTime("2026-11-06T00:02:01Z");
    const resumed = await collectCatalog(paused);
    expect(requested).toEqual([1]);
    expect(resumed.codabench?.retryAt).toBeUndefined();
  },
);

it("balances active refreshes and older discoveries across repeated interrupted runs", async () => {
  const ids = Array.from({ length: 9 }, (_, i) => 9 - i);
  let previous: Awaited<ReturnType<typeof collectCatalog>> | undefined;
  const discovered = new Set<number>();
  for (let run = 0; run < 5; run++) {
    vi.setSystemTime(Date.parse(stamp) + run * 86400000);
    const controller = new AbortController();
    requested = [];
    api(ids, (id) => {
      discovered.add(id);
      if (requested.length === 4) controller.abort();
      return Response.json(detail(id));
    });
    previous = await collectCatalog(previous, controller.signal);
  }
  expect([...discovered].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

it("rechecks cached inactive entries after their expiry and rediscovers reopened phases", async () => {
  api([1], (id) => Response.json({ ...detail(id), phases: [] }));
  const first = await collectCatalog();
  requested = [];
  vi.setSystemTime(Date.parse(stamp) + 29 * 86400000);
  api([1], (id) =>
    Response.json({
      ...detail(id),
      phases: [{ start: "2026-11-01T00:00:00Z", end: "2027-01-01T00:00:00Z" }],
    }),
  );
  const cached = await collectCatalog(first);
  expect(requested).toEqual([]);
  vi.setSystemTime(Date.parse(stamp) + 31 * 86400000);
  const reopened = await collectCatalog(cached);
  expect(requested).toEqual([1]);
  expect(reopened.competitions.some((item) => item.id === "codabench:1")).toBe(true);
});

it("retains check history when a later directory page fails instead of restarting the scan", async () => {
  const ids = Array.from({ length: 81 }, (_, i) => 81 - i);
  api(ids, (id) => Response.json({ ...detail(id), phases: [] }));
  const first = await collectCatalog();
  const stub = vi.mocked(fetch);
  const normal = stub.getMockImplementation()!;
  stub.mockImplementation((...args) =>
    String(args[0]).includes("/public/") &&
    new URL(String(args[0])).searchParams.get("page") === "2"
      ? Promise.resolve(new Response("Unavailable", { status: 503 }))
      : normal(...args),
  );
  const partial = await collectCatalog(first);
  expect(Object.keys(partial.codabench?.checks ?? {})).toHaveLength(81);
  expect(partial.sources.find((source) => source.id === "codabench")?.state).toBe("partial");
});

it("does not let a malformed entry permanently block the older unverified entries", async () => {
  const controller = new AbortController();
  api([4, 3, 2, 1], (id) => {
    if (requested.length === 2) controller.abort();
    return id === 4 ? Response.json({ id }) : Response.json(detail(id));
  });
  const first = await collectCatalog(undefined, controller.signal);
  requested = [];
  vi.setSystemTime(Date.parse(stamp) + 86400000);
  api([4, 3, 2, 1], (id) => (id === 4 ? Response.json({ id }) : Response.json(detail(id))));
  const second = await collectCatalog(first);
  expect(requested.indexOf(2)).toBeLessThan(requested.indexOf(4));
  expect(second.competitions.some((item) => item.id === "codabench:1")).toBe(true);
  expect(second.sources.find((source) => source.id === "codabench")?.state).toBe("partial");
});

it("never marks an entry inactive using a response for a different competition", async () => {
  api([1]);
  const first = await collectCatalog();
  vi.setSystemTime(Date.parse(stamp) + 86400000);
  api([1], () => Response.json({ ...detail(999), phases: [] }));
  const second = await collectCatalog(first);
  expect(second.competitions.some((item) => item.id === "codabench:1")).toBe(true);
  expect(second.codabench?.checks["1"].active).toBe(true);
  expect(second.codabench?.checks["1"].verifiedAt).toBe(stamp);
  expect(second.sources.find((source) => source.id === "codabench")?.state).toBe("partial");
});

it("prunes cache state for removed public IDs only after a complete directory scan", async () => {
  api([2, 1], (id) => Response.json({ ...detail(id), phases: [] }));
  const first = await collectCatalog();
  api([2]);
  const second = await collectCatalog(first);
  expect(Object.keys(second.codabench?.checks ?? {})).toEqual(["2"]);
  expect(requested.filter((id) => id === 2)).toHaveLength(1);
});
