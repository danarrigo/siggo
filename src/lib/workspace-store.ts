import { type Competition, type Workspace, workspaceSchema } from "./model";
import { acknowledgeDeadlineChanges, reconcileSavedCompetitions } from "./saved-competitions";

export const workspaceStorageKey = "siggo-workspace-v1";
// Leave the old copy intact for compatibility with the previous brand.
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
type Write =
  | { type: "save"; data: Workspace }
  | { type: "visit"; markSeen?: boolean; silent?: boolean }
  | { type: "acknowledge"; ids: string[] };

// One store per mounted workspace. Browser/network work starts on subscription, never in SSR.
export function createWorkspaceStore(
  initial: Workspace,
  mode: "local" | "cloud",
  now: number,
  initialCatalog: Competition[] = [],
) {
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
  let catalog = initialCatalog;
  let lastServerWorkspace = initial;
  let waitingServerWorkspace: Workspace | null = null;
  const listeners = new Set<() => void>();
  const acknowledgedInVisit = new Set<string>();
  const pendingAcknowledgements = new Set<string>();

  function publish(changes: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  }
  function tracking(workspace: Workspace) {
    if (mode === "cloud" && waitingServerWorkspace && !pendingData) {
      const incoming = waitingServerWorkspace;
      const localNewer = new Set(
        Object.entries(workspace.savedSnapshots)
          .filter(([id, item]) => {
            const serverItem = Object.hasOwn(incoming.savedSnapshots, id)
              ? incoming.savedSnapshots[id]
              : undefined;
            return !serverItem || Date.parse(item.lastSeenAt) > Date.parse(serverItem.lastSeenAt);
          })
          .map(([id]) => id),
      );
      workspace = {
        ...workspace,
        savedSnapshots: {
          ...incoming.savedSnapshots,
          ...Object.fromEntries(
            Object.entries(workspace.savedSnapshots).filter(([id]) => localNewer.has(id)),
          ),
        },
        deadlineChanges: [
          ...incoming.deadlineChanges.filter((change) => !localNewer.has(change.competitionId)),
          ...workspace.deadlineChanges.filter((change) => localNewer.has(change.competitionId)),
        ],
        trackingLimited: incoming.trackingLimited,
      };
      lastServerWorkspace = waitingServerWorkspace;
      waitingServerWorkspace = null;
    }
    return acknowledgeDeadlineChanges(reconcileSavedCompetitions(workspace, catalog), [
      ...acknowledgedInVisit,
    ]);
  }
  function cloudWrite(write: Write) {
    if (write.type === "save") pendingData = write.data;
    if (write.type === "visit" && write.markSeen) pendingMarkSeen = true;
    if (write.type === "acknowledge") write.ids.forEach((id) => pendingAcknowledgements.add(id));
    const current = ++revision;
    if (!(write.type === "visit" && write.silent))
      publish({ status: write.type === "visit" ? "Marking listings seen…" : "Saving changes…" });
    queue = queue.then(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: write.type === "save" ? "PUT" : "PATCH",
          headers: { "Content-Type": "application/json" },
          ...(write.type === "save"
            ? { body: JSON.stringify(write.data) }
            : write.type === "acknowledge"
              ? { body: JSON.stringify({ acknowledgeDeadlineChanges: write.ids }) }
              : {}),
        });
        if (!response.ok) throw new Error("Save failed");
        if (write.type === "save" && pendingData === write.data) pendingData = null;
        if (write.type === "acknowledge")
          write.ids.forEach((id) => pendingAcknowledgements.delete(id));
        if (write.type === "visit") {
          const result = await response.json();
          if (
            typeof result.visitedAt !== "string" ||
            !Number.isFinite(Date.parse(result.visitedAt))
          )
            throw new Error("Invalid visit response");
          visitFailed = false;
          if (write.markSeen) pendingMarkSeen = false;
          publish({
            workspace: { ...snapshot.workspace, lastVisitedAt: result.visitedAt },
            ...(write.markSeen ? { since: result.visitedAt } : {}),
          });
        }
        const unsynced =
          visitFailed ||
          ((pendingData !== null || pendingAcknowledgements.size > 0) && snapshot.unsynced);
        publish({
          workspace: tracking(snapshot.workspace),
          unsynced,
          ...(current === revision
            ? {
                status: unsynced
                  ? "Changes are not synced. Retry before leaving this page."
                  : pendingData || pendingAcknowledgements.size
                    ? "Saving changes…"
                    : write.type === "visit" && write.silent
                      ? ""
                      : "Changes saved",
              }
            : {}),
        });
      } catch {
        if (write.type === "visit") visitFailed = true;
        if (write.type !== "save" || pendingData === write.data)
          publish({
            status: "Changes are not synced. Retry before leaving this page.",
            unsynced: true,
          });
      }
    });
  }
  function writeLocal(workspace: Workspace, silent = false) {
    try {
      localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
      publish({ workspace, status: silent ? "" : "Saved in this browser", unsynced: false });
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
      cloudWrite({ type: "visit", silent: true });
      return;
    }
    try {
      const stored = storedWorkspace();
      const workspace = stored ? workspaceSchema.parse(JSON.parse(stored)) : snapshot.workspace;
      publish({ workspace, since: workspace.lastVisitedAt ?? visitTime, ready: true });
      writeLocal(tracking({ ...workspace, lastVisitedAt: visitTime }), true);
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
      if (stored) publish({ workspace: tracking(workspaceSchema.parse(JSON.parse(stored))) });
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
    synchronize(items: Competition[], serverWorkspace?: Workspace) {
      start();
      catalog = items;
      if (mode === "cloud" && serverWorkspace && serverWorkspace !== lastServerWorkspace)
        waitingServerWorkspace = serverWorkspace;
      const workspace = tracking(snapshot.workspace);
      if (JSON.stringify(workspace) === JSON.stringify(snapshot.workspace)) return;
      if (mode === "local") writeLocal(workspace, true);
      else publish({ workspace });
    },
    update(change: (workspace: Workspace) => Workspace) {
      start();
      const result = workspaceSchema.safeParse(
        tracking({
          ...change(snapshot.workspace),
          lastVisitedAt: snapshot.workspace.lastVisitedAt ?? visitTime,
        }),
      );
      if (!result.success) {
        publish({
          status:
            "Workspace limit reached. Shorten notes or tasks, or remove a personal listing or plan.",
        });
        return false;
      }
      const data = result.data;
      if (mode === "local") return writeLocal(data);
      publish({ workspace: data });
      cloudWrite({ type: "save", data });
      return true;
    },
    acknowledgeChanges(ids: string[]) {
      start();
      const workspace = acknowledgeDeadlineChanges(snapshot.workspace, ids);
      if (mode === "local") {
        if (writeLocal(workspace)) ids.forEach((id) => acknowledgedInVisit.add(id));
      } else {
        ids.forEach((id) => acknowledgedInVisit.add(id));
        publish({ workspace });
        cloudWrite({ type: "acknowledge", ids });
      }
    },
    markSeen() {
      start();
      if (mode === "cloud") cloudWrite({ type: "visit", markSeen: true });
      else {
        const seenAt = new Date().toISOString();
        if (writeLocal({ ...snapshot.workspace, lastVisitedAt: seenAt }))
          publish({ since: seenAt });
      }
    },
    retry() {
      if (mode === "cloud") {
        cloudWrite({ type: "visit", markSeen: pendingMarkSeen, silent: true });
        if (pendingAcknowledgements.size)
          cloudWrite({ type: "acknowledge", ids: [...pendingAcknowledgements] });
        cloudWrite({ type: "save", data: snapshot.workspace });
      }
    },
    dismissStatus() {
      publish({ status: "" });
    },
    whenIdle: () => queue,
  };
}
