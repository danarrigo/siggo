import {
  type Competition,
  type DeadlineChange,
  type Workspace,
  canonicalUrl,
  deduplicate,
  isDateOnly,
  isActive,
  workspaceSchema,
} from "./model";

export const deadlineLabels = {
  registrationEndsAt: "Registration deadline",
  submissionEndsAt: "Submission deadline",
  challengeEndsAt: "Challenge end",
  eventEndsAt: "Event end",
} as const;
const fields = Object.keys(deadlineLabels) as DeadlineChange["field"][];

function sameDeadline(a: string | null, b: string | null) {
  if (a === b) return true;
  return (
    a !== null && b !== null && !isDateOnly(a) && !isDateOnly(b) && Date.parse(a) === Date.parse(b)
  );
}

export function deadlineChangeLabel(change: DeadlineChange) {
  if (!change.before) return "Deadline added";
  if (isDateOnly(change.before) !== isDateOnly(change.after)) return "Deadline details updated";
  return Date.parse(change.after) > Date.parse(change.before) ? "Extended" : "Moved earlier";
}

// Last-known details belong to the private workspace, not the public source catalog.
// Absence from a directory is never treated as proof that a competition ended.
export function reconcileSavedCompetitions(
  workspace: Workspace,
  catalog: Competition[],
): Workspace {
  const saved = new Set(workspace.saved);
  const current = [...workspace.manualCompetitions, ...catalog];
  const byId = new Map(current.map((item) => [item.id, item]));
  const byUrl = new Map(current.map((item) => [canonicalUrl(item.url), item]));
  const snapshots = new Map<string, Competition>();
  const changes = new Map(
    workspace.deadlineChanges
      .filter((change) => saved.has(change.competitionId))
      .map((change) => [`${change.competitionId}:${change.field}`, change]),
  );
  for (const id of saved) {
    const previous = Object.hasOwn(workspace.savedSnapshots, id)
      ? workspace.savedSnapshots[id]
      : undefined;
    const candidate =
      byId.get(id) ?? (previous ? byUrl.get(canonicalUrl(previous.url)) : undefined);
    if (!candidate) {
      if (previous) snapshots.set(id, previous);
      continue;
    }
    if (
      previous &&
      candidate.source !== "manual" &&
      Date.parse(candidate.lastSeenAt) < Date.parse(previous.lastSeenAt)
    ) {
      snapshots.set(id, previous);
      continue;
    }
    const item = { ...candidate, id };
    if (previous && item.source !== "manual") {
      for (const field of fields) {
        const after = item[field];
        // A partial response with an omitted date is not a confirmed deadline removal.
        if (!after || sameDeadline(previous[field], after)) continue;
        const key = `${id}:${field}`;
        const existing = changes.get(key);
        const before = existing ? existing.before : previous[field];
        if (sameDeadline(before, after)) changes.delete(key);
        else
          changes.set(key, {
            id: JSON.stringify([id, field, before, after, item.lastSeenAt]),
            competitionId: id,
            field,
            before,
            after,
            observedAt: item.lastSeenAt,
          });
      }
    }
    // Keep earlier known dates if a partial response omits them. These are explicitly
    // presented as saved details whenever the listing is no longer in the live catalog.
    snapshots.set(id, {
      ...item,
      registrationEndsAt: item.registrationEndsAt ?? previous?.registrationEndsAt ?? null,
      submissionEndsAt: item.submissionEndsAt ?? previous?.submissionEndsAt ?? null,
      challengeEndsAt: item.challengeEndsAt ?? previous?.challengeEndsAt ?? null,
      eventEndsAt: item.eventEndsAt ?? previous?.eventEndsAt ?? null,
    });
  }
  const next = {
    ...workspace,
    savedSnapshots: Object.fromEntries(snapshots),
    deadlineChanges: [...changes.values()],
    trackingLimited: false,
  };
  const parsed = workspaceSchema.safeParse(next);
  if (!parsed.success)
    return workspace.trackingLimited ? workspace : { ...workspace, trackingLimited: true };
  return JSON.stringify(parsed.data) === JSON.stringify(workspace) ? workspace : parsed.data;
}

export function competitionLibrary(catalog: Competition[], workspace: Workspace, now = Date.now()) {
  const savedByUrl = new Map(
    Object.values(workspace.savedSnapshots).map((item) => [canonicalUrl(item.url), item]),
  );
  const current = catalog.map((item) => {
    const snapshot = savedByUrl.get(canonicalUrl(item.url));
    if (snapshot?.source !== item.source) return item;
    return Date.parse(snapshot.lastSeenAt) > Date.parse(item.lastSeenAt)
      ? snapshot
      : { ...item, id: snapshot.id };
  });
  const currentIds = new Set([...workspace.manualCompetitions, ...current].map((item) => item.id));
  const all = [
    ...workspace.manualCompetitions,
    ...current,
    ...Object.values(workspace.savedSnapshots).filter(
      (item) => workspace.saved.includes(item.id) && !currentIds.has(item.id),
    ),
  ];
  // An ended personal edition must not hide a currently active source listing.
  return [
    ...deduplicate(all.filter((item) => isActive(item, now))),
    ...deduplicate(all.filter((item) => !isActive(item, now))),
  ];
}

export function toggleSavedCompetition(workspace: Workspace, item: Competition): Workspace {
  const saved = workspace.saved.includes(item.id)
    ? workspace.saved.filter((id) => id !== item.id)
    : [...workspace.saved, item.id];
  const savedSnapshots = saved.includes(item.id)
    ? { ...workspace.savedSnapshots, [item.id]: item }
    : workspace.savedSnapshots;
  return reconcileSavedCompetitions({ ...workspace, saved, savedSnapshots }, []);
}

export function acknowledgeDeadlineChanges(workspace: Workspace, ids: string[]): Workspace {
  const acknowledged = new Set(ids);
  const changes = workspace.deadlineChanges.filter((change) => !acknowledged.has(change.id));
  return changes.length === workspace.deadlineChanges.length
    ? workspace
    : { ...workspace, deadlineChanges: changes };
}
