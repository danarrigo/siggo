import { setTimeout as delay } from "node:timers/promises";
import {
  type Catalog,
  type Competition,
  type SourceId,
  type SourceStatus,
  deduplicate,
  isActive,
  preserveDiscoveryDates,
} from "../model";
import {
  parseAIcrowd,
  parseCodabenchCompetition,
  parseCodabenchPage,
  parseDrivenData,
  parseEvalAI,
  parseKaggle,
  parseMLH,
  parseOpenCalendar,
  parseZindiCalendar,
} from "./parsers";

// Seeded by the public cache reader so local previews can retain data through a provider outage.
let lastPublicCatalog: Catalog | undefined;
export function rememberPublicCatalog(catalog: Catalog) {
  if (
    !lastPublicCatalog ||
    Date.parse(catalog.updatedAt) >= Date.parse(lastPublicCatalog.updatedAt)
  )
    lastPublicCatalog = catalog;
}

const headers = {
  "User-Agent": "SignalCompetitionRadar/0.1 (personal discovery; public event metadata only)",
  Accept: "application/json, text/html",
};
export const sourceDefinitions: {
  id: Exclude<SourceId, "codalab">;
  name: string;
  url: string;
  note: string;
  attribution?: SourceStatus["attribution"];
}[] = [
  {
    id: "kaggle",
    name: "Kaggle",
    url: "https://www.kaggle.com/competitions",
    note: "Official competition API. Set KAGGLE_API_TOKEN, or use legacy username/key credentials.",
  },
  {
    id: "evalai",
    name: "EvalAI",
    url: "https://eval.ai/web/challenges/list",
    note: "Official API. Published, approved present and future challenges.",
  },
  {
    id: "drivendata",
    name: "DrivenData",
    url: "https://www.drivendata.org/competitions/",
    note: "Public active competition directory, including ongoing practice challenges.",
  },
  {
    id: "aicrowd",
    name: "AIcrowd",
    url: "https://www.aicrowd.com/challenges?status=running",
    note: "Running and starting-soon directories, paginated until empty. Requests are spaced at least ten seconds apart. Relative day counts are not treated as exact deadlines.",
  },
  {
    id: "mlh",
    name: "MLH",
    url: "https://www.mlh.com",
    note: "Current MLH season's published upcoming and ongoing hackathons. Not all hackathons worldwide.",
  },
  {
    id: "zindi",
    name: "Zindi",
    url: "https://zindi.world/competitions",
    note: "Only Zindi competitions listed in MLContests' open calendar are imported. This is not Zindi's full catalog, so live competitions may be missing. Full coverage needs an authorized Zindi feed or permission. Closing times and timezones are unlisted; prize amounts are calendar estimates.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
  {
    id: "codabench",
    name: "Codabench",
    url: "https://www.codabench.org/",
    note: "Official public API plus MLContests' open calendar. Checks up to 40 phase candidates per sync, prioritizing current calendar listings, at no more than one detail request per second. Larger directories, curated fallbacks, and incomplete checks are marked Limited.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
  {
    id: "devpost",
    name: "Devpost",
    url: "https://devpost.com/hackathons",
    note: "Only the openly licensed MLContests calendar is checked; Devpost's website is never scraped. This curated feed is not a complete hackathon directory. Browse manually when it has no current listings.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
];

async function request(url: string, authorization: string | undefined, budget: AbortSignal) {
  const response = await fetch(url, {
    headers: { ...headers, ...(authorization ? { Authorization: authorization } : {}) },
    signal: AbortSignal.any([budget, AbortSignal.timeout(18_000)]),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Source returned HTTP ${response.status}`);
  }
  return response;
}

async function evalAI(checkedAt: string, budget: AbortSignal) {
  const items: Competition[] = [];
  for (const time of ["present", "future"]) {
    let next: string | null = `https://eval.ai/api/challenges/challenge/${time}/approved/public`;
    let pages = 0;
    while (next) {
      const target = new URL(next);
      if (target.origin !== "https://eval.ai" || !target.pathname.startsWith("/api/challenges/"))
        throw new Error("Unexpected pagination URL");
      const page = parseEvalAI(await (await request(next, undefined, budget)).json(), checkedAt);
      items.push(...page.items);
      next = page.next;
      if (++pages >= 20 && next) return { items, partial: true };
    }
  }
  return { items, partial: false };
}
function kaggleAuthorization() {
  const token = process.env.KAGGLE_API_TOKEN?.trim();
  const username = process.env.KAGGLE_USERNAME?.trim();
  const key = process.env.KAGGLE_KEY?.trim();
  return token
    ? `Bearer ${token}`
    : username && key
      ? `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}`
      : null;
}
export function kaggleConfigured() {
  return Boolean(kaggleAuthorization());
}
async function kaggle(checkedAt: string, budget: AbortSignal) {
  const authorization = kaggleAuthorization();
  if (!authorization) return null;
  const items: Competition[] = [];
  for (let page = 1; page <= 20; page++) {
    const endpoint = `https://www.kaggle.com/api/v1/competitions/list?group=general&sortBy=recentlyCreated&page=${page}`;
    const batch = parseKaggle(
      await (await request(endpoint, authorization, budget)).json(),
      checkedAt,
    );
    items.push(...batch);
    if (batch.length === 0) return { items, partial: false };
  }
  return { items, partial: true };
}

async function aicrowd(checkedAt: string, budget: AbortSignal) {
  const items: Competition[] = [];
  let requested = false;
  try {
    for (const status of ["running", "starting_soon"]) {
      let finished = false;
      for (let page = 1; page <= 20; page++) {
        if (requested) await delay(10_000, undefined, { signal: budget });
        requested = true;
        const endpoint = `https://www.aicrowd.com/challenges?status=${status}&page=${page}`;
        const batch = parseAIcrowd(
          await (await request(endpoint, undefined, budget)).text(),
          checkedAt,
        );
        items.push(...batch.items);
        if (batch.empty) {
          finished = true;
          break;
        }
      }
      if (!finished)
        return {
          items,
          partial: true,
          note: "Pagination limit reached before all directories were checked.",
        };
    }
    return { items, partial: false, note: "" };
  } catch (error) {
    if (!items.length) throw error;
    return {
      items,
      partial: true,
      note: "Some pages could not be checked within the request budget. Showing the pages that succeeded.",
    };
  }
}

function validateCodabenchNext(next: string | null, page: number) {
  if (!next) return;
  const target = new URL(next);
  if (
    ![
      "https://www.codabench.org",
      "https://codabench.org",
      "https://codabench-prod.lisn.upsaclay.fr",
    ].includes(target.origin) ||
    target.username ||
    target.password ||
    target.pathname !== "/api/competitions/public/" ||
    target.searchParams.get("page") !== String(page + 1)
  )
    throw new Error("Unexpected Codabench pagination URL");
}

function sourceFailure(error: unknown) {
  return error instanceof Error && /^Source returned HTTP \d+$/.test(error.message)
    ? error.message
    : "Could not validate or fetch this source";
}

async function codabench(
  checkedAt: string,
  budget: AbortSignal,
  calendarData: () => Promise<unknown>,
  previous?: Catalog,
) {
  let curated: Competition[] = [];
  let curatedCandidates: number[] = [];
  let calendarFailed = false;
  try {
    const parsed = parseOpenCalendar(await calendarData(), checkedAt, "codabench");
    curated = parsed.items;
    curatedCandidates = parsed.candidates;
  } catch {
    calendarFailed = true;
  }
  const publicIds = new Set<number>();
  const verified = new Set<string>();
  let apiFailure: string | null = null;
  let failed = 0;
  let total: number | null = null;
  let next: string | null = null;
  try {
    for (let page = 1; page <= 20 && publicIds.size < 40; page++) {
      const endpoint = `https://www.codabench.org/api/competitions/public/?page=${page}&page_size=40&ordering=recent`;
      const batch = parseCodabenchPage(await (await request(endpoint, undefined, budget)).json());
      validateCodabenchNext(batch.next, page);
      total = batch.count;
      next = batch.next;
      for (const row of batch.results) publicIds.add(row.id);
      if (!batch.results.length && total && !publicIds.size)
        throw new Error("Unexpected empty Codabench directory");
      if (!next || !batch.results.length) break;
    }
  } catch (error) {
    apiFailure = sourceFailure(error);
  }
  if (apiFailure && calendarFailed) throw new Error(apiFailure);

  const items = new Map(curated.map((item) => [item.id, item]));
  const candidates = [...new Set([...curatedCandidates, ...publicIds])].slice(0, 40);
  let attempted = 0;
  let consecutiveFailures = 0;
  if (!apiFailure)
    for (const id of candidates) {
      if (budget.aborted) {
        apiFailure = "Request budget reached";
        break;
      }
      try {
        if (attempted) await delay(1000, undefined, { signal: budget });
        attempted++;
        const data = await (
          await request(`https://www.codabench.org/api/competitions/${id}/`, undefined, budget)
        ).json();
        const item = parseCodabenchCompetition(data, checkedAt);
        if (item && item.id !== `codabench:${id}`)
          throw new Error("Unexpected Codabench identifier");
        const key = `codabench:${id}`;
        verified.add(key);
        consecutiveFailures = 0;
        if (!item) {
          items.delete(key);
          continue;
        }
        const calendar = items.get(key);
        items.set(
          key,
          calendar
            ? {
                ...item,
                tags: [...new Set([...item.tags, ...calendar.tags])].slice(0, 40),
                reward: item.reward || calendar.reward,
                submissionEndsAt: calendar.submissionEndsAt,
                registrationEndsAt: calendar.registrationEndsAt,
              }
            : item,
        );
      } catch (error) {
        const reason = sourceFailure(error);
        if (reason === "Source returned HTTP 404") {
          verified.add(`codabench:${id}`);
          items.delete(`codabench:${id}`);
          continue;
        }
        failed++;
        consecutiveFailures++;
        // Stop on access/rate limits and provider outages instead of hammering the remaining entries.
        if (
          /^Source returned HTTP (403|429|5\d\d)$/.test(reason) ||
          consecutiveFailures >= 3 ||
          budget.aborted
        ) {
          apiFailure = reason;
          break;
        }
      }
    }
  if (!verified.size && calendarFailed && (failed || apiFailure))
    throw new Error(apiFailure || "Could not verify Codabench phase dates");
  const partial = Boolean(
    apiFailure ||
    failed ||
    next ||
    total === null ||
    total > publicIds.size ||
    [...publicIds].some((id) => !verified.has(`codabench:${id}`)) ||
    curated.some((item) => !verified.has(item.id)),
  );
  if (partial)
    for (const item of (previous ?? lastPublicCatalog)?.competitions ?? []) {
      if (item.source !== "codabench" || verified.has(item.id) || !isActive(item)) continue;
      const current = items.get(item.id);
      items.set(item.id, current ? { ...current, image: current.image ?? item.image } : item);
    }
  return {
    items: [...items.values()],
    partial,
    note: `${verified.size} official entries checked; ${curated.length} active-dated calendar candidates. ${apiFailure ? `Official API: ${apiFailure}. ` : ""}${partial ? "Coverage is incomplete; still-active earlier discoveries are retained when a snapshot is available." : "All public entries checked."}`,
  };
}

export async function collectCatalog(previous?: Catalog): Promise<Catalog> {
  const checkedAt = new Date().toISOString();
  const budget = AbortSignal.timeout(90_000);
  let calendar: Promise<unknown> | undefined;
  const calendarData = () =>
    (calendar ??= request(
      "https://raw.githubusercontent.com/mlcontests/mlcontests.github.io/master/competitions.json",
      undefined,
      budget,
    ).then((response) => response.json()));
  const year = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 6 ? 1 : 0);
  const results = await Promise.all(
    sourceDefinitions.map(async (source) => {
      const status: SourceStatus = {
        ...source,
        state: "healthy",
        count: 0,
        checkedAt,
        lastSuccessAt: null,
      };
      try {
        let items: Competition[];
        switch (source.id) {
          case "kaggle": {
            const result = await kaggle(checkedAt, budget);
            if (!result)
              return {
                items: [],
                status: { ...status, state: "not-configured" as const, checkedAt: null },
              };
            items = result.items;
            if (result.partial) {
              status.state = "partial";
              status.note += " Pagination limit reached; some listings may be missing.";
            }
            break;
          }
          case "evalai": {
            const result = await evalAI(checkedAt, budget);
            items = result.items;
            if (result.partial) {
              status.state = "partial";
              status.note += " Pagination limit reached.";
            }
            break;
          }
          case "drivendata":
            items = parseDrivenData(
              await (await request(source.url, undefined, budget)).text(),
              checkedAt,
            );
            break;
          case "aicrowd": {
            const result = await aicrowd(checkedAt, budget);
            items = result.items;
            if (result.partial) status.state = "partial";
            if (result.note) status.note += ` ${result.note}`;
            break;
          }
          case "codabench": {
            const result = await codabench(checkedAt, budget, calendarData, previous);
            items = result.items;
            if (result.partial) status.state = "partial";
            status.note += ` ${result.note}`;
            break;
          }
          case "zindi":
            items = parseZindiCalendar(await calendarData(), checkedAt);
            status.state = "partial";
            break;
          case "devpost":
            try {
              items = parseOpenCalendar(await calendarData(), checkedAt, "devpost").items;
              status.state = items.length ? "partial" : "manual";
              if (!items.length)
                status.note +=
                  " No current entries in the calendar; use the official directory manually.";
            } catch (error) {
              const old = previous ?? lastPublicCatalog;
              if (old?.competitions.some((item) => item.source === "devpost" && isActive(item)))
                throw error;
              return {
                items: [],
                status: {
                  ...status,
                  state: "manual" as const,
                  note: `${status.note} Calendar check failed; no direct site collection was attempted.`,
                },
              };
            }
            break;
          case "mlh":
            status.url = `https://www.mlh.com/seasons/${year}/events`;
            status.note = `${year} MLH season only. Event end dates are not submission or registration deadlines.`;
            items = parseMLH(
              await (await request(status.url, undefined, budget)).text(),
              checkedAt,
            );
            break;
        }
        items = deduplicate(items.filter((item) => isActive(item)));
        status.count = items.length;
        status.lastSuccessAt = checkedAt;
        return { items, status };
      } catch (error) {
        const snapshot = previous ?? lastPublicCatalog;
        const old = snapshot?.sources.find((status) => status.id === source.id);
        const items = (snapshot?.competitions ?? []).filter(
          (item) => item.source === source.id && isActive(item),
        );
        return {
          items,
          status: {
            ...status,
            state: "unavailable" as const,
            count: items.length,
            lastSuccessAt: old?.lastSuccessAt ?? null,
            note: `${sourceFailure(error)}. ${items.length ? "Showing the previous successful snapshot." : "No verified listings available from this source."}`,
          },
        };
      }
    }),
  );
  return {
    competitions: preserveDiscoveryDates(
      deduplicate(results.flatMap((result) => result.items)),
      (previous ?? lastPublicCatalog)?.competitions,
    ),
    sources: results.map((result) => result.status),
    updatedAt: checkedAt,
  };
}
