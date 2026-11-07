import {
  type Competition,
  type Workspace,
  canonicalUrl,
  deadlineTime,
  isActive,
  isDateOnly,
} from "./model";
import { competitionLibrary, reconcileSavedCompetitions } from "./saved-competitions";

export function workspaceCompetitions(catalog: Competition[], workspace: Workspace, now: number) {
  const currentUrls = new Set(catalog.map((item) => canonicalUrl(item.url)));
  // Private fallbacks stay in Saved, never resurrecting source-removed records in discovery.
  return competitionLibrary(catalog, workspace, now).filter(
    (item) =>
      isActive(item, now) && (item.source === "manual" || currentUrls.has(canonicalUrl(item.url))),
  );
}

export function isNewCompetition(item: Competition, since: string, now: number) {
  const discovered = Date.parse(item.firstSeenAt ?? item.lastSeenAt);
  return item.source !== "manual" && discovered > Date.parse(since) && discovered <= now;
}

const deadlineFields = [
  ["registrationEndsAt", "Registration closes"],
  ["submissionEndsAt", "Submissions close"],
  ["challengeEndsAt", "Challenge ends"],
  ["eventEndsAt", "Event ends"],
] as const;

export function deadlineReminders(items: Competition[], saved: string[], now: number) {
  const savedIds = new Set(saved);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return items
    .filter((item) => savedIds.has(item.id))
    .flatMap((item) =>
      deadlineFields.flatMap(([field, label]) => {
        const value = item[field];
        if (!value || (field === "registrationEndsAt" && item.registrationOpen === false))
          return [];
        const time = deadlineTime(value);
        // Calendar days are compared as days, not fabricated closing instants.
        const days = isDateOnly(value)
          ? (Date.parse(value) - Date.parse(today)) / 86400000
          : (time - now) / 86400000;
        return time > now && days <= 7 ? [{ item, field, label, value }] : [];
      }),
    )
    .sort((a, b) => deadlineTime(a.value) - deadlineTime(b.value));
}

export function withoutManualCompetition(workspace: Workspace, id: string): Workspace {
  const notes = { ...workspace.notes };
  delete notes[id];
  return reconcileSavedCompetitions(
    {
      ...workspace,
      manualCompetitions: workspace.manualCompetitions.filter((item) => item.id !== id),
      saved: workspace.saved.filter((value) => value !== id),
      dismissed: workspace.dismissed.filter((value) => value !== id),
      notes,
    },
    [],
  );
}
