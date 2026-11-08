import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { type Catalog, type CodabenchSyncState, type Competition, isActive } from "../model";
import { parseCodabenchCompetition, parseCodabenchPage, parseOpenCalendar } from "./parsers";
import { request, sourceFailure, SourceHttpError } from "./request";

const stateSchema = z.object({
  checks: z
    .record(
      z.string().regex(/^[1-9]\d*$/),
      z.object({
        attemptedAt: z.iso.datetime({ offset: true }).nullable(),
        verifiedAt: z.iso.datetime({ offset: true }).nullable(),
        active: z.boolean().nullable(),
      }),
    )
    .refine((checks) => Object.keys(checks).length <= 50_000),
  directoryCount: z.number().int().nonnegative().optional(),
  directoryCheckedAt: z.iso.datetime({ offset: true }).optional(),
  retryAt: z.iso.datetime({ offset: true }).optional(),
});
const numericId = (id: string) => {
  const value = Number(id.match(/^codabench:(\d+)$/)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

function validateNext(next: string | null, page: number) {
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

// Full directory discovery and fair, resumable phase verification, behind one source interface.
export async function collectCodabench(
  checkedAt: string,
  budget: AbortSignal,
  calendarData: () => Promise<unknown>,
  previous: () => Catalog | undefined,
) {
  const now = Date.parse(checkedAt);
  const parsed = stateSchema.safeParse(previous()?.codabench);
  const state: CodabenchSyncState = parsed.success
    ? { ...parsed.data, checks: { ...parsed.data.checks } }
    : { checks: {} };
  let curated: Competition[] = [];
  let curatedCandidates: number[] = [];
  let calendarAvailable = false;
  try {
    const calendar = parseOpenCalendar(await calendarData(), checkedAt, "codabench");
    curated = calendar.items;
    curatedCandidates = calendar.candidates;
    calendarAvailable = true;
  } catch {
    /* The official API remains usable without the supplementary calendar. */
  }

  let requested = false;
  const json = async (url: string) => {
    if (requested) await delay(1000, undefined, { signal: budget });
    budget.throwIfAborted();
    requested = true;
    return (await request(url, undefined, budget)).json();
  };
  const failure = (error: unknown) => {
    if (error instanceof SourceHttpError && error.retryAt && [429, 503].includes(error.status))
      state.retryAt = error.retryAt;
    return budget.aborted ? "Request budget reached" : sourceFailure(error);
  };
  const publicIds = new Set<number>();
  let directoryComplete = false;
  let directoryAvailable = false;
  let apiFailure: string | null = null;
  let total: number | null = null;
  if (state.retryAt && Date.parse(state.retryAt) > now)
    apiFailure = `Provider retry pause until ${state.retryAt}`;
  else {
    delete state.retryAt;
    try {
      // The public API supports up to 1,000 per page. Use a moderate size and respect its next link.
      for (let page = 1; page <= 100; page++) {
        const batch = parseCodabenchPage(
          await json(
            `https://www.codabench.org/api/competitions/public/?page=${page}&page_size=200&ordering=recent`,
          ),
        );
        validateNext(batch.next, page);
        directoryAvailable = true;
        total = batch.count;
        const before = publicIds.size;
        for (const row of batch.results) publicIds.add(row.id);
        if ((batch.count && !batch.results.length) || (batch.next && before === publicIds.size))
          throw new Error("Codabench directory did not advance");
        if (!batch.next) {
          directoryComplete = publicIds.size >= batch.count;
          break;
        }
      }
    } catch (error) {
      apiFailure = failure(error);
    }
  }
  if (total !== null) state.directoryCount = total;
  if (directoryComplete) state.directoryCheckedAt = checkedAt;

  const previousItems = (previous()?.competitions ?? []).filter(
    (item) => item.source === "codabench" && isActive(item, now),
  );
  const items = new Map(previousItems.map((item) => [item.id, item]));
  for (const item of curated) {
    const old = items.get(item.id);
    items.set(
      item.id,
      old
        ? {
            ...old,
            tags: [...new Set([...old.tags, ...item.tags])].slice(0, 40),
            reward: old.reward ?? item.reward,
            submissionEndsAt: item.submissionEndsAt,
            registrationEndsAt: item.registrationEndsAt,
            lastSeenAt: checkedAt,
          }
        : item,
    );
  }
  const previouslyActive = new Set(
    previousItems.flatMap((item) => {
      const id = numericId(item.id);
      return id ? [id] : [];
    }),
  );
  const candidates = new Set([...publicIds, ...curatedCandidates, ...previouslyActive]);
  if (!directoryComplete) for (const id of Object.keys(state.checks)) candidates.add(Number(id));
  else
    for (const id of Object.keys(state.checks))
      if (!candidates.has(Number(id))) delete state.checks[id];
  for (const id of candidates) {
    state.checks[id] ??= { attemptedAt: null, verifiedAt: null, active: null };
    // A failed refresh must not revive an entry the API already verified as closed/unpublished.
    if (state.checks[id].active === false) items.delete(`codabench:${id}`);
  }
  const priority = (a: number, b: number) =>
    Date.parse(state.checks[a].attemptedAt ?? "1970-01-01T00:00:00Z") -
    Date.parse(state.checks[b].attemptedAt ?? "1970-01-01T00:00:00Z");
  const active: number[] = [],
    discovery: number[] = [];
  for (const id of candidates) {
    const check = state.checks[id];
    if (check.verifiedAt && Date.parse(check.verifiedAt) >= now) continue;
    if (previouslyActive.has(id) || check.active === true || curatedCandidates.includes(id))
      active.push(id);
    else if (!check.verifiedAt || now - Date.parse(check.verifiedAt) >= 30 * 86400000)
      discovery.push(id);
  }
  active.sort(priority);
  discovery.sort(priority);
  const queue: number[] = [];
  // Neither active refreshes nor older, not-yet-verified discoveries can starve the other lane.
  for (let index = 0; index < Math.max(active.length, discovery.length); index++) {
    if (active[index] !== undefined) queue.push(active[index]);
    if (discovery[index] !== undefined) queue.push(discovery[index]);
  }
  let verified = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  if (!apiFailure)
    for (const id of queue) {
      if (budget.aborted) {
        apiFailure = "Request budget reached";
        break;
      }
      const key = `codabench:${id}`;
      try {
        const data = await json(`https://www.codabench.org/api/competitions/${id}/`);
        if (data?.id !== id) throw new Error("Unexpected Codabench identifier");
        const item = parseCodabenchCompetition(data, checkedAt);
        state.checks[id] = { attemptedAt: checkedAt, verifiedAt: checkedAt, active: Boolean(item) };
        verified++;
        consecutiveFailures = 0;
        if (!item) {
          items.delete(key);
          continue;
        }
        const calendar = curated.find((entry) => entry.id === key);
        items.set(
          key,
          calendar
            ? {
                ...item,
                tags: [...new Set([...item.tags, ...calendar.tags])].slice(0, 40),
                reward: item.reward ?? calendar.reward,
                submissionEndsAt: calendar.submissionEndsAt,
                registrationEndsAt: calendar.registrationEndsAt,
              }
            : item,
        );
      } catch (error) {
        state.checks[id] = { ...state.checks[id], attemptedAt: checkedAt };
        if (error instanceof SourceHttpError && error.status === 404) {
          state.checks[id] = { attemptedAt: checkedAt, verifiedAt: checkedAt, active: false };
          items.delete(key);
          verified++;
          consecutiveFailures = 0;
          continue;
        }
        failures++;
        consecutiveFailures++;
        if (
          (error instanceof SourceHttpError && [401, 403, 429].includes(error.status)) ||
          (error instanceof SourceHttpError && error.status >= 500) ||
          consecutiveFailures >= 3 ||
          budget.aborted
        ) {
          apiFailure = failure(error);
          break;
        }
      }
    }
  const pending = queue.filter((id) => state.checks[id].verifiedAt !== checkedAt).length;
  const unverified = [...candidates].filter((id) => !state.checks[id].verifiedAt).length;
  const supplementary = curated.some((item) => numericId(item.id) === null);
  const partial = Boolean(
    apiFailure || failures || !directoryComplete || pending || unverified || supplementary,
  );
  const discovered = total ?? state.directoryCount ?? publicIds.size;
  return {
    items: [...items.values()],
    state,
    partial,
    available: directoryAvailable || calendarAvailable || verified > 0,
    note: `${discovered} public entries discovered${directoryComplete ? " (directory complete)" : " (directory incomplete or cached)"}; ${verified} phase checks this refresh; ${unverified} known IDs not yet verified; ${pending} due checks pending. ${apiFailure ? `Official API: ${apiFailure}. ` : ""}Checks resume across refreshes, alternating active listings and older discoveries. Closed/unavailable entries become eligible for recheck after 30 days; current calendar candidates are rechecked. ${partial ? "Coverage remains limited while checks are pending or a provider fails; retained listings are not necessarily freshly phase-verified." : "All due public phase checks completed."}`,
  };
}
