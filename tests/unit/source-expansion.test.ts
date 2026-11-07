import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { collectCatalog, rememberPublicCatalog } from "../../src/lib/sources";
import { competitionImageUrl } from "../../src/lib/competition-images";
import {
  parseAIcrowd,
  parseCodabenchCompetition,
  parseCodabenchPage,
  parseOpenCalendar,
  parseZindiCalendar,
} from "../../src/lib/sources/parsers";
import { type Catalog } from "../../src/lib/model";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
const checkedAt = "2026-11-06T00:00:00Z";
const phase = {
  name: "Evaluation",
  start: "2026-11-01T00:00:00Z",
  end: "2026-12-01T00:00:00Z",
};
const competition = {
  id: 11,
  title: "Language reasoning benchmark",
  published: true,
  created_by: "research-lab",
  owner_display_name: "Research lab",
  description: "A language reasoning task.",
  reward: "Research recognition",
  registration_auto_approve: false,
  phases: [phase],
};
const card = (name: string, badge = "Running") =>
  `<div class="card-challenge"><div class="card-img-overlay"><span class="badge">${badge}</span></div><h5 class="card-title"><a href="/challenges/${name}">${name}</a></h5></div>`;
const directory = (cards = "") => `<div id="challenges-div">${cards}</div>`;
const publicPage = (ids: number[], next: string | null = null) => ({
  count: 2,
  next,
  results: ids.map((id) => ({ id })),
});
beforeEach(() => {
  vi.clearAllMocks();
  rememberPublicCatalog({ competitions: [], sources: [], updatedAt: checkedAt });
  vi.stubEnv("KAGGLE_API_TOKEN", "");
  vi.stubEnv("KAGGLE_USERNAME", "");
  vi.stubEnv("KAGGLE_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("expanded public source contracts", () => {
  it("distinguishes an empty AIcrowd page from a page containing only completed rounds", () => {
    const completed = parseAIcrowd(directory(card("old", "Completed")), checkedAt);
    expect(completed.items).toEqual([]);
    expect(completed.empty).toBe(false);
    expect(parseAIcrowd(directory(), checkedAt).empty).toBe(true);
    const upcoming = parseAIcrowd(directory(card("new", "Starting soon")), checkedAt);
    expect(upcoming.items[0].tags).toContain("upcoming");
    expect(upcoming.items[0].submissionEndsAt).toBeNull();
  });

  it("validates Codabench pagination and keeps phase ends distinct from submission cutoffs", () => {
    expect(parseCodabenchPage(publicPage([11])).results).toEqual([{ id: 11 }]);
    const item = parseCodabenchCompetition(
      {
        ...competition,
        phases: [phase, { ...phase, name: "Final", end: "2026-12-15T00:00:00Z" }],
      },
      checkedAt,
    );
    expect(item?.url).toBe("https://www.codabench.org/competitions/11/");
    expect(item?.challengeEndsAt).toBe("2026-12-15T00:00:00.000Z");
    expect(item?.submissionEndsAt).toBeNull();
    expect(item?.registrationEndsAt).toBeNull();
    expect(item?.registrationOpen).toBeNull();
    expect(item?.eligibility).toMatch(/approval/i);
  });

  it("does not label private, phase-less, or finished Codabench entries as active", () => {
    expect(parseCodabenchCompetition({ ...competition, published: false }, checkedAt)).toBeNull();
    expect(parseCodabenchCompetition({ ...competition, phases: [] }, checkedAt)).toBeNull();
    expect(
      parseCodabenchCompetition(
        { ...competition, phases: [{ ...phase, end: "2026-11-05T00:00:00Z" }] },
        checkedAt,
      ),
    ).toBeNull();
    expect(
      parseCodabenchCompetition({ ...competition, phases: [{ ...phase, end: null }] }, checkedAt)
        ?.challengeEndsAt,
    ).toBeNull();
  });

  it("uses unsigned Codabench public-bucket logos without storing signed credentials", () => {
    const image = parseCodabenchCompetition(
      {
        ...competition,
        logo: "https://miniodis-rproxy.lisn.upsaclay.fr/coda-v2-prod-public/logos/example/logo.png?Signature=fixture&Expires=1",
      },
      checkedAt,
    )?.image;
    expect(image?.url).toBe(
      "https://miniodis-rproxy.lisn.upsaclay.fr/coda-v2-prod-public/logos/example/logo.png",
    );
    expect(competitionImageUrl(image?.url)).toBe(image?.url);
    expect(
      parseCodabenchCompetition(
        { ...competition, logo: "https://evil.example/logo.png?Signature=fixture" },
        checkedAt,
      )?.image,
    ).toBeNull();
  });

  it("imports only Zindi calendar records and preserves date-only precision", () => {
    const items = parseZindiCalendar(
      {
        data: [
          {
            name: "Caribbean speech recognition",
            url: "https://zindi.africa/competitions/caribbean-speech/leaderboard?ref=mlcontests",
            platform: "Zindi",
            tags: ["audio", "speech"],
            launched: "5 Nov 2026",
            deadline: "7 Dec 2026",
            "registration-deadline": "30 Nov 2026",
            sponsor: "Research partner",
            prize: "$10,000",
          },
          { name: "Other platform", url: "https://example.org", platform: "Other", sponsor: [] },
        ],
      },
      checkedAt,
    );
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://zindi.world/competitions/caribbean-speech");
    expect(items[0].submissionEndsAt).toBe("2026-12-07");
    expect(items[0].registrationEndsAt).toBe("2026-11-30");
    expect(items[0].entryFee).toBe("Unknown");
    expect(items[0].description).toContain("MLContests");
  });
});

describe("bounded, polite source collection", () => {
  it.each(["7 Dec 2026", "7 Dec 2025"])(
    "checks Devpost's licensed calendar, never its website (%s)",
    async (deadline) => {
      const urls: string[] = [];
      vi.stubGlobal("fetch", async (url: string) => {
        urls.push(url);
        return url.startsWith("https://raw.githubusercontent.com/")
          ? Response.json({
              data: [
                {
                  name: "A public AI hackathon",
                  platform: "Devpost",
                  url: "https://sample-ai-hackathon.devpost.com/",
                  deadline,
                },
              ],
            })
          : new Response("Unavailable", { status: 503 });
      });
      const catalog = await collectCatalog();
      const active = deadline.includes("2026");
      const source = catalog.sources.find((source) => source.id === "devpost");
      expect(source?.state).toBe(active ? "partial" : "manual");
      expect(catalog.competitions.filter((item) => item.source === "devpost")).toHaveLength(
        active ? 1 : 0,
      );
      expect(source?.attribution?.name).toContain("MLContests");
      expect(urls.some((url) => new URL(url).hostname.endsWith("devpost.com"))).toBe(false);
    },
  );
  it("preserves calendar groups and discovers distinct official track IDs without fetching organizer hosts", () => {
    const parsed = parseOpenCalendar(
      {
        data: [
          {
            name: "Neural interfaces challenge",
            platform: "Codabench",
            url: "https://example.org/neural-interfaces/",
            "additional-urls": [
              "https://www.codabench.org/competitions/11/",
              "https://www.codabench.org/competitions/12/#/pages-tab",
              "https://evil.example/competitions/13/",
            ],
            deadline: "7 Dec 2026",
          },
        ],
      },
      checkedAt,
      "codabench",
    );
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].url).toBe("https://example.org/neural-interfaces/");
    expect(parsed.candidates).toEqual([11, 12]);
  });

  it.each([429, 500])(
    "stops Codabench checks on HTTP %s and uses the attributed calendar fallback",
    async (status) => {
      const urls: string[] = [];
      vi.stubGlobal("fetch", async (url: string) => {
        urls.push(url);
        if (url.startsWith("https://raw.githubusercontent.com/"))
          return Response.json({
            data: [
              {
                name: "Calendar language challenge",
                platform: "Codabench",
                url: "https://www.codabench.org/competitions/11/",
                deadline: "7 Dec 2026",
              },
            ],
          });
        if (url.includes("codabench.org/api/competitions/public/"))
          return Response.json({
            count: 3,
            next: null,
            results: [11, 12, 13].map((id) => ({ id })),
          });
        return new Response("Unavailable", { status });
      });
      const catalog = await collectCatalog();
      const source = catalog.sources.find((source) => source.id === "codabench");
      expect(source?.state).toBe("partial");
      expect(source?.note).toContain(`HTTP ${status}`);
      expect(source?.attribution?.name).toContain("MLContests");
      expect(
        catalog.competitions.find((item) => item.id === "codabench:11")?.submissionEndsAt,
      ).toBe("2026-12-07");
      expect(
        urls.filter((url) => /codabench\.org\/api\/competitions\/\d+\//.test(url)),
      ).toHaveLength(1);
      expect(
        urls.filter((url) => url.startsWith("https://raw.githubusercontent.com/")),
      ).toHaveLength(1);
    },
  );
  it("paginates running and upcoming AIcrowd directories and observes the crawl delay", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (!url.startsWith("https://www.aicrowd.com/"))
        return new Response("Unavailable", { status: 503 });
      const query = new URL(url).searchParams;
      const status = query.get("status");
      const page = query.get("page");
      return new Response(
        directory(
          status === "running" && page === "1"
            ? card("old", "Completed")
            : status === "running" && page === "2"
              ? card("running")
              : status === "starting_soon" && page === "1"
                ? card("upcoming", "Starting soon")
                : "",
        ),
      );
    });
    const catalog = await collectCatalog();
    expect(catalog.sources.find((source) => source.id === "aicrowd")?.state).toBe("healthy");
    expect(catalog.competitions.filter((item) => item.source === "aicrowd")).toHaveLength(2);
    expect(urls.filter((url) => url.startsWith("https://www.aicrowd.com/"))).toHaveLength(5);
    expect(delay).toHaveBeenCalledTimes(4);
    expect(vi.mocked(delay).mock.calls.every(([ms]) => ms === 10_000)).toBe(true);
  });

  it("rebases trusted Codabench pagination to its public origin and checks every fetched phase", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://www.codabench.org/api/competitions/public/"))
        return Response.json(
          new URL(url).searchParams.get("page") === "2"
            ? publicPage([12])
            : publicPage(
                [11],
                "https://codabench-prod.lisn.upsaclay.fr/api/competitions/public/?page=2",
              ),
        );
      if (url === "https://www.codabench.org/api/competitions/11/")
        return Response.json(competition);
      if (url === "https://www.codabench.org/api/competitions/12/")
        return Response.json({
          ...competition,
          id: 12,
          phases: [{ ...phase, end: "2020-01-01T00:00:00Z" }],
        });
      return new Response("Unavailable", { status: 503 });
    });
    const catalog = await collectCatalog();
    expect(catalog.sources.find((source) => source.id === "codabench")?.state).toBe("healthy");
    expect(
      catalog.competitions.filter((item) => item.source === "codabench").map((item) => item.id),
    ).toEqual(["codabench:11"]);
    expect(urls.some((url) => url.startsWith("https://codabench-prod."))).toBe(false);
    expect(urls.some((url) => /zindi\.(africa|world)|devpost\.com|codalab\.lisn/.test(url))).toBe(
      false,
    );
  });

  it("does not follow untrusted Codabench pagination", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.includes("codabench.org/api/competitions/public/")
        ? Response.json(publicPage([11], "https://evil.example/steal"))
        : new Response("Unavailable", { status: 503 });
    });
    const catalog = await collectCatalog();
    expect(urls.some((url) => url.includes("evil.example"))).toBe(false);
    expect(catalog.sources.find((source) => source.id === "codabench")?.state).toBe("unavailable");
    expect(catalog.sources.find((source) => source.id === "codalab")).toBeUndefined();
  });

  it("does not replace a newer fallback snapshot with a late stale cache read", async () => {
    const recent: Catalog = {
      competitions: [parseCodabenchCompetition({ ...competition, id: 12 }, checkedAt)!],
      sources: [],
      updatedAt: checkedAt,
    };
    rememberPublicCatalog(recent);
    rememberPublicCatalog({
      ...recent,
      competitions: [parseCodabenchCompetition(competition, checkedAt)!],
      updatedAt: "2026-11-05T23:00:00Z",
    });
    vi.stubGlobal("fetch", async () => new Response("Unavailable", { status: 503 }));
    const catalog = await collectCatalog();
    expect(catalog.competitions.map((item) => item.id)).toEqual(["codabench:12"]);
  });

  it("retains a cached public snapshot even when it arrives after revalidation starts", async () => {
    vi.stubGlobal("fetch", async () => new Response("Unavailable", { status: 503 }));
    const pending = collectCatalog();
    rememberPublicCatalog({
      competitions: [parseCodabenchCompetition(competition, checkedAt)!],
      sources: [
        {
          id: "codabench",
          name: "Codabench",
          url: "https://www.codabench.org/",
          state: "healthy",
          count: 1,
          checkedAt,
          lastSuccessAt: checkedAt,
          note: "Previous snapshot",
        },
      ],
      updatedAt: checkedAt,
    });
    const catalog = await pending;
    expect(catalog.competitions.find((item) => item.id === "codabench:11")).toBeDefined();
    expect(catalog.sources.find((source) => source.id === "codabench")?.lastSuccessAt).toBe(
      checkedAt,
    );
  });

  it("retains failed Codabench details but removes an entry verified to have ended", async () => {
    const previous: Catalog = {
      competitions: [11, 12].map((id) =>
        parseCodabenchCompetition({ ...competition, id }, checkedAt)!,
      ),
      sources: [],
      updatedAt: checkedAt,
    };
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("codabench.org/api/competitions/public/"))
        return Response.json(publicPage([11, 12]));
      if (url.endsWith("/api/competitions/11/"))
        return Response.json({
          ...competition,
          phases: [{ ...phase, end: "2020-01-01T00:00:00Z" }],
        });
      return new Response("Unavailable", { status: 503 });
    });
    const catalog = await collectCatalog(previous);
    expect(catalog.sources.find((source) => source.id === "codabench")?.state).toBe("partial");
    expect(
      catalog.competitions.filter((item) => item.source === "codabench").map((item) => item.id),
    ).toEqual(["codabench:12"]);
  });
});
