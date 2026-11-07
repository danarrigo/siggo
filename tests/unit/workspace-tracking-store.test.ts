import { beforeEach, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../../src/lib/model";
import {
  reconcileSavedCompetitions,
  toggleSavedCompetition,
} from "../../src/lib/saved-competitions";
import { createWorkspaceStore, workspaceStorageKey } from "../../src/lib/workspace-store";
import { savedCompetition as item } from "../fixtures/saved-competition";

const now = Date.parse("2026-11-06T00:00:00Z");
const visitedAt = new Date(now).toISOString();
const latest = { ...item, submissionEndsAt: "2026-11-20", lastSeenAt: "2026-11-02T00:00:00Z" };
const baseline = () => toggleSavedCompetition(defaultWorkspace, item);
const changed = () => reconcileSavedCompetitions(baseline(), [latest]);
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
});

it("persists local snapshots and acknowledgements across reloads", () => {
  values.set(workspaceStorageKey, JSON.stringify(baseline()));
  const store = createWorkspaceStore(defaultWorkspace, "local", now, [latest]);
  store.subscribe(() => {});
  expect(store.getSnapshot().workspace.deadlineChanges).toHaveLength(1);
  store.acknowledgeChanges(
    store.getSnapshot().workspace.deadlineChanges.map((change) => change.id),
  );
  const reload = createWorkspaceStore(defaultWorkspace, "local", now + 1000, []);
  reload.subscribe(() => {});
  expect(reload.getSnapshot().workspace.deadlineChanges).toEqual([]);
  expect(reload.getSnapshot().workspace.savedSnapshots[item.id]).toEqual(latest);
});

it("merges refreshed cloud tracking without overwriting an in-flight note or the visit baseline", async () => {
  const request = vi.fn(async () => Response.json({ ok: true, visitedAt }));
  vi.stubGlobal("fetch", request);
  const initial = { ...baseline(), lastVisitedAt: "2026-10-01T00:00:00Z" };
  const store = createWorkspaceStore(initial, "cloud", now, [item]);
  store.subscribe(() => {});
  store.update((workspace) => ({
    ...workspace,
    notes: { [item.id]: "Unsaved elsewhere, keep this newest note" },
  }));
  store.synchronize([], changed()); // The newer listing has already ended and left the public feed.
  await store.whenIdle();
  expect(store.getSnapshot().workspace.notes[item.id]).toBe(
    "Unsaved elsewhere, keep this newest note",
  );
  expect(store.getSnapshot().workspace.savedSnapshots[item.id]).toEqual(latest);
  expect(store.getSnapshot().workspace.deadlineChanges).toHaveLength(1);
  expect(store.getSnapshot().since).toBe(initial.lastVisitedAt);
  expect(request.mock.calls).toHaveLength(2);
});

it("a successful visit or note save cannot hide a failed deadline acknowledgement, and retry is explicit", async () => {
  let failAcknowledgement = true;
  const request = vi.fn(async (_url: string, options: RequestInit) => {
    if (options.body && "acknowledgeDeadlineChanges" in JSON.parse(String(options.body)))
      return failAcknowledgement
        ? new Response("Unavailable", { status: 503 })
        : Response.json({ ok: true });
    return Response.json({ ok: true, visitedAt });
  });
  vi.stubGlobal("fetch", request);
  const initial = changed();
  const ids = initial.deadlineChanges.map((change) => change.id);
  const store = createWorkspaceStore(initial, "cloud", now, [latest]);
  store.subscribe(() => {});
  store.acknowledgeChanges(ids);
  store.update((workspace) => ({ ...workspace, notes: { [item.id]: "A saved note" } }));
  store.markSeen();
  await store.whenIdle();
  expect(store.getSnapshot().unsynced).toBe(true);
  expect(store.getSnapshot().workspace.notes[item.id]).toBe("A saved note");
  failAcknowledgement = false;
  store.retry();
  await store.whenIdle();
  expect(store.getSnapshot().unsynced).toBe(false);
  expect(store.getSnapshot().workspace.deadlineChanges).toEqual([]);
  const acknowledgementRequests = request.mock.calls.filter(
    ([, options]) =>
      options.body && "acknowledgeDeadlineChanges" in JSON.parse(String(options.body)),
  );
  expect(acknowledgementRequests).toHaveLength(2);
  store.synchronize([latest], { ...initial });
  expect(store.getSnapshot().workspace.deadlineChanges).toEqual([]);
});

it("an older server response cannot roll back retained details or resurrect read changes after a listing leaves the feed", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ok: true, visitedAt }));
  const older = changed();
  const newest = { ...latest, submissionEndsAt: "2026-11-25", lastSeenAt: "2026-11-03T00:00:00Z" };
  const current = reconcileSavedCompetitions(older, [newest]);
  const store = createWorkspaceStore(current, "cloud", now, []);
  store.subscribe(() => {});
  store.acknowledgeChanges(current.deadlineChanges.map((change) => change.id));
  await store.whenIdle();
  store.synchronize([], older);
  expect(store.getSnapshot().workspace.savedSnapshots[item.id]).toEqual(newest);
  expect(store.getSnapshot().workspace.deadlineChanges).toEqual([]);
});

it("an older acknowledgement never clears a newer observed change", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ok: true, visitedAt }));
  const initial = changed();
  const store = createWorkspaceStore(initial, "cloud", now, [latest]);
  store.subscribe(() => {});
  store.acknowledgeChanges(initial.deadlineChanges.map((change) => change.id));
  const newer = { ...latest, submissionEndsAt: "2026-11-25", lastSeenAt: "2026-11-03T00:00:00Z" };
  const server = reconcileSavedCompetitions(initial, [newer]);
  store.synchronize([newer], server);
  await store.whenIdle();
  expect(store.getSnapshot().workspace.deadlineChanges).toEqual(server.deadlineChanges);
});
