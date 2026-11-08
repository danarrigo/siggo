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
import { parseAIcrowd, parseDrivenData, parseEvalAI, parseKaggle, parseMLH } from "./parsers";
import { collectCodabench } from "./codabench";
import { collectZindi } from "./zindi";
import { collectDevpost } from "./devpost";
import { request, sourceFailure } from "./request";

// Seeded by the public cache reader so local previews can retain data through a provider outage.
let lastPublicCatalog: Catalog | undefined;
export function rememberPublicCatalog(catalog: Catalog) {
  if (
    !lastPublicCatalog ||
    Date.parse(catalog.updatedAt) >= Date.parse(lastPublicCatalog.updatedAt)
  )
    lastPublicCatalog = catalog;
}

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
    note: "Public Open Challenges directory and timelines, read anonymously with navigations at least three seconds apart. Honors crawler rules and stops at access blocks. Past/practice-only entries are excluded. Calendar dates do not imply a closing time or timezone. The licensed calendar and previous snapshots are fallbacks.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
  {
    id: "codabench",
    name: "Codabench",
    url: "https://www.codabench.org/",
    note: "Official public API plus MLContests' open calendar. Follows directory pages and resumes phase checks across refreshes, with requests spaced at least one second apart. Incomplete or failed checks are marked Limited.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
  {
    id: "devpost",
    name: "Devpost",
    url: "https://devpost.com/hackathons",
    note: "Third-party public titles, links and dates via TensorHack, plus the licensed MLContests calendar. Devpost itself is never requested. TensorHack permission is assumed, not confirmed. Listed cutoffs have unverified deadline types and do not prove an event ended. Coverage remains incomplete.",
    attribution: {
      name: "MLContests open calendar (GPL-3.0)",
      url: "https://github.com/mlcontests/mlcontests.github.io",
    },
  },
];

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

export async function collectCatalog(
  previous?: Catalog,
  codabenchBudget = AbortSignal.timeout(240_000),
): Promise<Catalog> {
  const checkedAt = new Date().toISOString();
  const budget = AbortSignal.timeout(90_000);
  let codabenchState = (previous ?? lastPublicCatalog)?.codabench;
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
            const result = await collectCodabench(
              checkedAt,
              codabenchBudget,
              calendarData,
              () => previous ?? lastPublicCatalog,
            );
            const old = previous ?? lastPublicCatalog;
            codabenchState = result.state;
            items = deduplicate(result.items.filter((item) => isActive(item)));
            return {
              items,
              status: {
                ...status,
                count: items.length,
                state: !result.available
                  ? ("unavailable" as const)
                  : result.partial
                    ? ("partial" as const)
                    : ("healthy" as const),
                lastSuccessAt: result.available
                  ? checkedAt
                  : (old?.sources.find((source) => source.id === "codabench")?.lastSuccessAt ??
                    null),
                note: `${status.note} ${result.note}`,
              },
            };
          }
          case "zindi": {
            const result = await collectZindi(
              checkedAt,
              budget,
              calendarData,
              () => previous ?? lastPublicCatalog,
            );
            items = deduplicate(result.items.filter((item) => isActive(item)));
            return {
              items,
              status: {
                ...status,
                count: items.length,
                state: !result.available
                  ? ("unavailable" as const)
                  : result.partial
                    ? ("partial" as const)
                    : ("healthy" as const),
                collectionMode: result.collectionMode,
                ...(result.retryAt ? { retryAt: result.retryAt } : {}),
                lastSuccessAt: result.available
                  ? checkedAt
                  : ((previous ?? lastPublicCatalog)?.sources.find(
                      (source) => source.id === "zindi",
                    )?.lastSuccessAt ?? null),
                note: `${status.note} ${result.note}`,
              },
            };
          }
          case "devpost": {
            const result = await collectDevpost(
              checkedAt,
              budget,
              calendarData,
              () => previous ?? lastPublicCatalog,
            );
            items = deduplicate(result.items.filter((item) => isActive(item)));
            return {
              items,
              status: {
                ...status,
                count: items.length,
                state: items.length
                  ? result.available
                    ? ("partial" as const)
                    : ("unavailable" as const)
                  : ("manual" as const),
                collectionMode: result.collectionMode,
                ...(result.retryAt ? { retryAt: result.retryAt } : {}),
                lastSuccessAt: result.available
                  ? checkedAt
                  : ((previous ?? lastPublicCatalog)?.sources.find(
                      (source) => source.id === "devpost",
                    )?.lastSuccessAt ?? null),
                note: `${status.note} ${result.note}`,
              },
            };
          }
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
    ...(codabenchState ? { codabench: codabenchState } : {}),
  };
}
