import { type Workspace, workspaceSchema } from "./model";

export const workspaceStorageKey = "siggo-workspace-v1";
// Read the former key during upgrades; leave the old copy intact as a recovery path.
const legacyWorkspaceStorageKey = "signal-workspace-v1";
function storedWorkspace() {
  return (
    localStorage.getItem(workspaceStorageKey) ?? localStorage.getItem(legacyWorkspaceStorageKey)
  );
}
type Snapshot = {
  workspace: Workspace;
  since: string;
  status: string;
  unsynced: boolean;
  ready: boolean;
};

// One store per mounted workspace. React reads stable snapshots; browser storage and network
// writes start only on subscription, never during server rendering or hydration.
export function createWorkspaceStore(initial: Workspace, mode: "local" | "cloud", now: number) {
  const visitTime = new Date(now).toISOString();
  const serverSnapshot: Snapshot = {
    workspace: workspaceSchema.parse(initial),
    since: initial.lastVisitedAt ?? visitTime,
    status: "",
    unsynced: false,
    ready: false,
  };
  let snapshot = serverSnapshot;
  let started = false;
  let queue = Promise.resolve();
  let revision = 0;
  let pendingData: Workspace | null = null;
  let visitFailed = false;
  let pendingMarkSeen = false;
  const listeners = new Set<() => void>();
  function publish(changes: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  }
  function cloudWrite(data: Workspace | null, markSeen = false, silent = false) {
    if (data) pendingData = data;
    if (markSeen) pendingMarkSeen = true;
    const current = ++revision;
    if (!silent) publish({ status: data ? "Saving changes…" : "Marking listings seen…" });
    queue = queue.then(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: data ? "PUT" : "PATCH",
          headers: { "Content-Type": "application/json" },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        if (!response.ok) throw new Error("Save failed");
        if (data && pendingData === data) pendingData = null;
        if (!data) {
          const result = await response.json();
          if (
            typeof result.visitedAt !== "string" ||
            !Number.isFinite(Date.parse(result.visitedAt))
          )
            throw new Error("Invalid visit response");
          visitFailed = false;
          if (markSeen) pendingMarkSeen = false;
          publish({
            workspace: { ...snapshot.workspace, lastVisitedAt: result.visitedAt },
            ...(markSeen ? { since: result.visitedAt } : {}),
          });
        }
        const unsynced = visitFailed || (pendingData !== null && snapshot.unsynced);
        publish({
          unsynced,
          ...(current === revision
            ? {
                status: unsynced
                  ? "Changes are not synced. Retry before leaving this page."
                  : pendingData
                    ? "Saving changes…"
                    : silent
                      ? ""
                      : "Changes saved",
              }
            : {}),
        });
      } catch {
        if (!data) visitFailed = true;
        if (!data || pendingData === data)
          publish({
            status: "Changes are not synced. Retry before leaving this page.",
            unsynced: true,
          });
      }
    });
  }
  function writeLocal(data: Workspace, silent = false) {
    try {
      localStorage.setItem(workspaceStorageKey, JSON.stringify(data));
      publish({ workspace: data, status: silent ? "" : "Saved in this browser", unsynced: false });
      return true;
    } catch {
      publish({ status: "Browser storage is unavailable. Your change could not be saved." });
      return false;
    }
  }
  function start() {
    if (started) return;
    started = true;
    if (mode === "cloud") {
      publish({ ready: true });
      // Patch just the visit marker: opening a page must never overwrite another device's edits.
      cloudWrite(null, false, true);
      return;
    }
    try {
      const stored = storedWorkspace();
      const workspace = stored ? workspaceSchema.parse(JSON.parse(stored)) : snapshot.workspace;
      publish({ workspace, since: workspace.lastVisitedAt ?? visitTime, ready: true });
      writeLocal({ ...workspace, lastVisitedAt: visitTime }, true);
    } catch {
      publish({
        ready: true,
        status: "Could not read browser data. The existing workspace was left unchanged.",
      });
    }
  }
  function onStorage(event: StorageEvent) {
    if (
      event.key !== workspaceStorageKey &&
      event.key !== legacyWorkspaceStorageKey &&
      event.key !== null
    )
      return;
    try {
      const stored = storedWorkspace();
      if (stored) publish({ workspace: workspaceSchema.parse(JSON.parse(stored)) });
    } catch {
      publish({ status: "Could not read changes from another tab." });
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      if (mode === "local") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (mode === "local") window.removeEventListener("storage", onStorage);
      };
    },
    update(change: (workspace: Workspace) => Workspace) {
      start();
      const result = workspaceSchema.safeParse({
        ...change(snapshot.workspace),
        lastVisitedAt: snapshot.workspace.lastVisitedAt ?? visitTime,
      });
      if (!result.success) {
        publish({
          status: "Workspace limit reached. Shorten a note or remove a personal listing.",
        });
        return false;
      }
      const data = result.data;
      if (mode === "local") return writeLocal(data);
      publish({ workspace: data });
      cloudWrite(data);
      return true;
    },
    markSeen() {
      if (mode === "cloud") cloudWrite(null, true);
      else {
        const seenAt = new Date().toISOString();
        if (writeLocal({ ...snapshot.workspace, lastVisitedAt: seenAt }))
          publish({ since: seenAt });
      }
    },
    retry() {
      if (mode === "cloud") {
        cloudWrite(null, pendingMarkSeen, true);
        cloudWrite(snapshot.workspace);
      }
    },
    dismissStatus() {
      publish({ status: "" });
    },
  };
}
