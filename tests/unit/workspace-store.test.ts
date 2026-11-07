import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../../src/lib/model";
import { createWorkspaceStore, workspaceStorageKey } from "../../src/lib/workspace-store";

const now = Date.parse("2026-11-06T12:00:00Z");
const visitedAt = new Date(now).toISOString();
let values: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  values = new Map();
  setItem = vi.fn((key: string, value: string) => {
    values.set(key, value);
  });
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("workspace persistence and visits", () => {
  it("does not touch browser state or the network while server rendering", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const store = createWorkspaceStore(defaultWorkspace, "cloud", now);
    expect(store.getServerSnapshot().workspace.saved).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
  it("hydrates legacy local data, captures the previous visit once, and retains it during this visit", () => {
    const previous = "2026-11-01T00:00:00Z";
    values.set(
      workspaceStorageKey,
      JSON.stringify({
        profile: defaultWorkspace.profile,
        saved: ["one"],
        dismissed: [],
        lastVisitedAt: previous,
      }),
    );
    const store = createWorkspaceStore(defaultWorkspace, "local", now);
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toMatchObject({
      since: previous,
      workspace: { saved: ["one"], lastVisitedAt: visitedAt, notes: {} },
    });
    store.update((workspace) => ({ ...workspace, notes: { one: "Private note" } }));
    expect(store.getSnapshot().since).toBe(previous);
    expect(JSON.parse(values.get(workspaceStorageKey)!)).toMatchObject({
      saved: ["one"],
      notes: { one: "Private note" },
    });
    unsubscribe();
    store.subscribe(() => {});
    expect(store.getSnapshot().since).toBe(previous);
    const nextVisit = createWorkspaceStore(defaultWorkspace, "local", now + 1000);
    nextVisit.subscribe(() => {});
    expect(nextVisit.getSnapshot().since).toBe(visitedAt);
  });
  it("leaves invalid stored data untouched and reports unavailable storage without losing edits silently", () => {
    values.set(workspaceStorageKey, "invalid JSON");
    const store = createWorkspaceStore(defaultWorkspace, "local", now);
    store.subscribe(() => {});
    expect(values.get(workspaceStorageKey)).toBe("invalid JSON");
    setItem.mockImplementation(() => {
      throw Error("Storage denied");
    });
    expect(store.update((workspace) => ({ ...workspace, saved: ["one"] }))).toBe(false);
    expect(store.getSnapshot().workspace.saved).toEqual([]);
    expect(store.getSnapshot().status).toMatch(/unavailable/);
  });
  it("patches visits without replacing user data, then serializes rapid cloud edits", async () => {
    const request = vi.fn(async (_url: string, options: RequestInit) =>
      options.method === "PATCH" ? Response.json({ visitedAt }) : Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", request);
    const store = createWorkspaceStore(defaultWorkspace, "cloud", now);
    store.subscribe(() => {});
    store.update((workspace) => ({ ...workspace, saved: ["one"] }));
    store.update((workspace) => ({ ...workspace, notes: { one: "Idea" } }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
    expect(request.mock.calls[0][1].body).toBeUndefined();
    expect(JSON.parse(String(request.mock.calls[2][1].body))).toMatchObject({
      saved: ["one"],
      notes: { one: "Idea" },
    });
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("Changes saved"));
  });
  it("does not let a successful visit acknowledgment hide an unsaved note", async () => {
    const request = vi.fn(async (_url: string, options: RequestInit) =>
      options.method === "PATCH"
        ? Response.json({ visitedAt })
        : new Response("Unavailable", { status: 503 }),
    );
    vi.stubGlobal("fetch", request);
    const store = createWorkspaceStore(defaultWorkspace, "cloud", now);
    store.subscribe(() => {});
    await vi.waitFor(() => expect(store.getSnapshot().workspace.lastVisitedAt).toBe(visitedAt));
    store.update((workspace) => ({ ...workspace, notes: { one: "Unsaved note" } }));
    await vi.waitFor(() => expect(store.getSnapshot().unsynced).toBe(true));
    store.markSeen();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(store.getSnapshot().unsynced).toBe(true);
    expect(store.getSnapshot().workspace.notes.one).toBe("Unsaved note");
  });
  it("keeps failed changes available for retry and clears new markers only on confirmed acknowledgment", async () => {
    let fail = false;
    const request = vi.fn(async (_url: string, options: RequestInit) =>
      fail
        ? new Response("Unavailable", { status: 503 })
        : options.method === "PATCH"
          ? Response.json({ visitedAt })
          : Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", request);
    const previous = "2026-11-01T00:00:00Z";
    const store = createWorkspaceStore(
      { ...defaultWorkspace, lastVisitedAt: previous },
      "cloud",
      now,
    );
    store.subscribe(() => {});
    await vi.waitFor(() => expect(store.getSnapshot().workspace.lastVisitedAt).toBe(visitedAt));
    fail = true;
    store.update((workspace) => ({ ...workspace, saved: ["one"] }));
    await vi.waitFor(() => expect(store.getSnapshot().unsynced).toBe(true));
    expect(store.getSnapshot().workspace.saved).toEqual(["one"]);
    store.markSeen();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(store.getSnapshot().since).toBe(previous);
    fail = false;
    store.retry();
    await vi.waitFor(() => expect(store.getSnapshot().unsynced).toBe(false));
    store.markSeen();
    await vi.waitFor(() => expect(store.getSnapshot().since).toBe(visitedAt));
    expect(store.getSnapshot().workspace.saved).toEqual(["one"]);
  });
});
