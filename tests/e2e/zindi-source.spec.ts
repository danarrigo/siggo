import { test, expect } from "./test";
import type { Catalog } from "../../src/lib/model";
import { collectZindi } from "../../src/lib/sources/zindi";
import { openZindiPage } from "../../src/lib/sources/zindi-browser";

// This exercises the server-side renderer, not either dashboard viewport.
test.skip(({ isMobile }) => Boolean(isMobile), "Server-side source checks run once on desktop");
test.setTimeout(60_000);
const stamp = "2031-01-01T00:00:00.000Z";
const card = (slug: string) =>
  `<div class="Competition__container___fixture"><div class="Competition__image___fixture" style="width:80px;height:50px;background-image:url('https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/1234/siggo-e2e-flood.png')"></div><div class="Competition__title___fixture"><a href="/competitions/${slug}">${slug} AI challenge</a></div><div class="Competition__reward___fixture">$5 000 USD</div></div>`;
const directory = `<h2>Open Challenges: 2</h2>${card("one")}${card("two")}<h2>Past Challenges: 500</h2>${card("past")}<button>Load more</button>`;
const timeline = `<div class="Timeline__container___fixture"><div class="Timeline__child___fixture"><div class="Timeline__title___fixture">Start</div><div class="Timeline__date___fixture">05 Nov 35</div></div><div class="Timeline__child___fixture Timeline__close___fixture"><div class="Timeline__title___fixture">Close<span class="Timeline__info___fixture" onmouseenter="console.log('public-timeline-hover')">i</span></div><div class="Timeline__date___fixture">01 Dec 35</div></div></div><div class="__react_component_tooltip">Submission close = 30 November 2035 at 23:59<br>Submission selection close = 01 December 2035 at 00:29</div>`;
type PublicPage = { body: string; status?: number; retryAfter?: string };
let originalFetch: typeof fetch;

test.beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    expect(String(input)).toBe("https://zindi.world/robots.txt");
    return new Response("Not found", { status: 404 });
  };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function fixtureBrowser(
  pages: Record<string, PublicPage>,
  paths: string[],
  failed: string[] = [],
  hovered: string[] = [],
  closedDuringResponse?: string[],
) {
  return async (signal: AbortSignal) => {
    const session = await openZindiPage(signal);
    if (closedDuringResponse) {
      let responding = false;
      session.page.on("response", () => {
        responding = true;
        queueMicrotask(() => {
          responding = false;
        });
      });
      const close = session.page.close.bind(session.page);
      session.page.close = (options) => {
        if (responding) closedDuringResponse.push(session.page.url());
        return close(options);
      };
    }
    session.page.on("requestfailed", (request) => {
      failed.push(request.url());
    });
    session.page.on("console", (message) => {
      if (message.text() === "public-timeline-hover") hovered.push(message.text());
    });
    await session.page.route("https://zindi.world/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      paths.push(path);
      const page = pages[path];
      await route.fulfill({
        status: page?.status ?? (page ? 200 : 404),
        contentType: "text/html",
        body: page?.body ?? "Missing fixture",
        headers: page?.retryAfter ? { "Retry-After": page.retryAfter } : {},
      });
    });
    return session;
  };
}

test("serverless browser reads paginated public metadata without past or account-only requests", async () => {
  const paths: string[] = [],
    failed: string[] = [],
    hovered: string[] = [];
  const initial = `<h2>Open Challenges: 2</h2><div class="PinnedCompetition__container___fixture">Practice banner</div>${card("one")}<div id="next"></div><button onclick="document.getElementById('next').innerHTML=${JSON.stringify(card("two")).replaceAll('"', "&quot;")};this.remove()">Load more</button><h2>Past Challenges: 500</h2>${card("past")}<button>Load more</button><script>fetch('https://api.zindi.world/v1/participations').catch(()=>{});fetch('https://169.254.169.254/').catch(()=>{});</script>`;
  const vercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const result = await collectZindi(
      stamp,
      AbortSignal.timeout(45_000),
      async () => ({ data: [] }),
      () => undefined,
      fixtureBrowser(
        {
          "/competitions": { body: initial },
          "/competitions/one": { body: timeline },
          "/competitions/two": { body: timeline },
        },
        paths,
        failed,
        hovered,
      ),
    );
    expect(result.partial).toBe(false);
    expect(result.collectionMode).toBe("public-directory");
    expect(result.items.map((item) => item.id)).toEqual(["zindi:one", "zindi:two"]);
    expect(result.items[0]).toMatchObject({
      image: {
        url: "https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/1234/siggo-e2e-flood.png",
        kind: "cover",
      },
      submissionEndsAt: "2035-11-30",
      challengeEndsAt: null,
      registrationEndsAt: null,
      entryFee: "Unknown",
    });
    expect(paths).toEqual(["/competitions", "/competitions/one", "/competitions/two"]);
    expect(failed).toContain("https://api.zindi.world/v1/participations");
    expect(failed).toContain("https://169.254.169.254/");
    expect(failed).toContain(
      "https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/1234/siggo-e2e-flood.png",
    );
    expect(hovered).toHaveLength(2);
  } finally {
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  }
});

test("access/rate block stops further timeline visits and retains Retry-After", async () => {
  const paths: string[] = [],
    closedDuringResponse: string[] = [];
  const result = await collectZindi(
    stamp,
    AbortSignal.timeout(30_000),
    async () => ({ data: [] }),
    () => undefined,
    fixtureBrowser(
      {
        "/competitions": { body: directory },
        "/competitions/one": { body: "Slow down", status: 429, retryAfter: "300" },
        "/competitions/two": { body: timeline },
      },
      paths,
      [],
      [],
      closedDuringResponse,
    ),
  );
  expect(result.partial).toBe(true);
  expect(result.available).toBe(true);
  expect(result.items).toHaveLength(2);
  expect(result.note).toContain("retry pause");
  expect(Date.parse(result.retryAt!)).toBeGreaterThan(Date.now());
  expect(paths).toEqual(["/competitions", "/competitions/one"]);
  // Closing from the response event can dispose a still-in-flight navigation reply.
  expect(closedDuringResponse).toEqual([]);
});

test("a public rendering request block interrupts DOM waits without racing navigation cleanup", async () => {
  const paths: string[] = [],
    closedDuringResponse: string[] = [];
  const budget = AbortSignal.timeout(20_000);
  const result = await collectZindi(
    stamp,
    budget,
    async () => ({ data: [] }),
    () => undefined,
    fixtureBrowser(
      {
        "/competitions": {
          body: "<h2>Loading public challenges</h2><script>setTimeout(()=>fetch('/public-fixture-block'),20)</script>",
        },
        "/public-fixture-block": { body: "Slow down", status: 429, retryAfter: "300" },
      },
      paths,
      [],
      [],
      closedDuringResponse,
    ),
  );
  expect(budget.aborted).toBe(false);
  expect(result.partial).toBe(true);
  expect(Date.parse(result.retryAt!)).toBeGreaterThan(Date.now());
  expect(paths).toEqual(["/competitions", "/public-fixture-block"]);
  expect(closedDuringResponse).toEqual([]);
});

test("an interrupted refresh prioritizes older timeline checks next time", async () => {
  const paths: string[] = [];
  const pages = {
    "/competitions": { body: directory },
    "/competitions/one": { body: timeline },
    "/competitions/two": { body: "Provider failed", status: 500 },
  };
  const old: Catalog = { competitions: [], sources: [], updatedAt: "2030-01-01T00:00:00.000Z" };
  const first = await collectZindi(
    stamp,
    AbortSignal.timeout(30_000),
    async () => ({ data: [] }),
    () => old,
    fixtureBrowser(pages, paths),
  );
  expect(first.partial).toBe(true);
  expect(first.items.find((item) => item.id === "zindi:two")?.lastSeenAt).toBe(stamp);
  pages["/competitions/two"] = { body: timeline, status: 200 };
  paths.length = 0;
  const next = await collectZindi(
    "2031-01-02T00:00:00.000Z",
    AbortSignal.timeout(30_000),
    async () => ({ data: [] }),
    () => ({ ...old, competitions: first.items }),
    fixtureBrowser(pages, paths),
  );
  expect(next.partial).toBe(false);
  expect(paths).toEqual(["/competitions", "/competitions/two", "/competitions/one"]);
});
