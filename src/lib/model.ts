import { z } from "zod";

export const sourceIds = [
  "kaggle",
  "evalai",
  "drivendata",
  "aicrowd",
  "mlh",
  "zindi",
  "codabench",
  // Legacy identity for reading existing snapshots, not an active connector.
  "codalab",
  "devpost",
] as const;
export type SourceId = (typeof sourceIds)[number];
export const categories = ["ML / Data science", "Hackathon", "Research challenge"] as const;
export type Category = (typeof categories)[number];

const dateValue = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const date = dateValue.nullable();
export const maxWorkspaceSize = 1_000_000;
export const deadlineChangeSchema = z.object({
  id: z.string().min(1).max(900),
  competitionId: z.string().min(1).max(250),
  field: z.enum([
    "registrationEndsAt",
    "submissionEndsAt",
    "challengeEndsAt",
    "eventEndsAt",
    "listedDeadline",
  ]),
  before: date,
  after: dateValue,
  observedAt: z.iso.datetime({ offset: true }),
});
export type DeadlineChange = z.infer<typeof deadlineChangeSchema>;
export const competitionSchema = z.object({
  id: z.string().min(1),
  source: z.enum([...sourceIds, "manual"]),
  title: z.string().min(1).max(500),
  url: z.url({ protocol: /^https$/ }),
  description: z.string().max(2000),
  // Optional so existing stored catalog snapshots remain readable.
  image: z
    .object({ url: z.url({ protocol: /^https$/ }), kind: z.enum(["cover", "logo"]) })
    .nullish(),
  category: z.enum(categories),
  tags: z.array(z.string().max(100)).max(40),
  organizer: z.string(),
  reward: z.string().nullable(),
  opensAt: date,
  registrationEndsAt: date,
  submissionEndsAt: date,
  challengeEndsAt: date,
  eventEndsAt: date,
  // Third-party cutoffs whose registration/submission/event meaning is not verified.
  listedDeadline: date.optional(),
  metadataSource: z
    .object({
      name: z.string().min(1).max(100),
      url: z
        .url({ protocol: /^https$/ })
        .max(2048)
        .refine((value) => {
          try {
            const url = new URL(value);
            return !url.username && !url.password;
          } catch {
            return false;
          }
        }),
    })
    .optional(),
  registrationOpen: z.boolean().nullable(),
  participation: z.enum(["Online", "In person", "Hybrid", "Check format"]),
  location: z.string(),
  entryFee: z.enum(["Free", "Paid", "Unknown"]),
  eligibility: z.string(),
  lastSeenAt: z.iso.datetime({ offset: true }),
  firstSeenAt: z.iso.datetime({ offset: true }).optional(),
});
export type Competition = z.infer<typeof competitionSchema>;

export const manualCompetitionSchema = competitionSchema.extend({
  id: z.string().startsWith("manual:").max(250),
  source: z.literal("manual"),
  image: z.null().optional(),
  url: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password;
    }, "Links must not contain credentials"),
});
export type ManualCompetition = z.infer<typeof manualCompetitionSchema>;

export type SourceStatus = {
  id: SourceId;
  name: string;
  url: string;
  state: "healthy" | "partial" | "unavailable" | "not-configured" | "manual" | "retired";
  attribution?: { name: string; url: string };
  collectionMode?: "public-directory" | "licensed-calendar";
  retryAt?: string;
  count: number;
  checkedAt: string | null;
  lastSuccessAt: string | null;
  note: string;
};
export type CodabenchSyncState = {
  checks: Record<
    string,
    { attemptedAt: string | null; verifiedAt: string | null; active: boolean | null }
  >;
  directoryCount?: number;
  directoryCheckedAt?: string;
  retryAt?: string;
};
export type Catalog = {
  competitions: Competition[];
  sources: SourceStatus[];
  updatedAt: string;
  // Public-source crawl state is persisted in the existing snapshot, never sent to the browser.
  codabench?: CodabenchSyncState;
};

export function catalogForSources(catalog: Catalog, enabledIds: readonly SourceId[]): Catalog {
  const enabled = new Set(enabledIds);
  return {
    ...catalog,
    competitions: catalog.competitions.filter(
      (item) => item.source !== "manual" && enabled.has(item.source),
    ),
    sources: catalog.sources.filter((source) => enabled.has(source.id)),
  };
}

export const profileSchema = z.object({
  country: z.string().trim().min(1).max(80),
  student: z.boolean(),
  compute: z.string().trim().max(120),
  interests: z.array(z.string().trim().min(1).max(60)).max(16),
  remoteOnly: z.boolean(),
  preferFree: z.boolean(),
  fundedFinals: z.boolean(),
  team: z.enum(["Both", "Solo", "Team"]),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  country: "Indonesia",
  student: true,
  compute: "DGX Spark",
  interests: ["Games & simulation", "Finance"],
  remoteOnly: true,
  preferFree: true,
  fundedFinals: true,
  team: "Both",
};
export const workspaceSchema = z
  .object({
    profile: profileSchema,
    saved: z.array(z.string().max(250)).max(2000),
    dismissed: z.array(z.string().max(250)).max(2000),
    notes: z
      .record(z.string().min(1).max(250), z.string().max(4000))
      .refine((notes) => Object.keys(notes).length <= 200)
      .default({}),
    manualCompetitions: z.array(manualCompetitionSchema).max(100).default([]),
    lastVisitedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    savedSnapshots: z
      .record(z.string().min(1).max(250), competitionSchema)
      .refine(
        (snapshots) => Object.entries(snapshots).every(([id, item]) => id === item.id),
        "Saved snapshot identity does not match its key",
      )
      .default({}),
    deadlineChanges: z.array(deadlineChangeSchema).max(2000).default([]),
    trackingLimited: z.boolean().default(false),
  })
  .refine(
    (workspace) => JSON.stringify(workspace).length <= maxWorkspaceSize,
    "Workspace is too large",
  );
export type Workspace = z.infer<typeof workspaceSchema>;
export const defaultWorkspace: Workspace = workspaceSchema.parse({
  profile: defaultProfile,
  saved: [],
  dismissed: [],
});

export function endDate(item: Competition) {
  return item.submissionEndsAt ?? item.challengeEndsAt ?? item.eventEndsAt;
}
// An uncertain provider cutoff can be displayed/sorted, but never proves an event ended.
export function displayDeadline(item: Competition) {
  return endDate(item) ?? item.listedDeadline ?? null;
}
export function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
export function deadlineTime(value: string) {
  // Keep an uncertain calendar day through its last possible timezone, without displaying a made-up time.
  return Date.parse(isDateOnly(value) ? `${value}T23:59:59.999-12:00` : value);
}
export function isActive(item: Competition, now = Date.now()) {
  const end = endDate(item);
  return !end || deadlineTime(end) > now;
}

export function canonicalUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "ref") parsed.searchParams.delete(key);
  }
  return parsed.toString().replace(/\/$/, "");
}

// Preserve discovery time across refreshes, failures, and compatible parser ID changes.
export function preserveDiscoveryDates(items: Competition[], previous: Competition[] = []) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const byUrl = new Map(previous.map((item) => [canonicalUrl(item.url), item]));
  return items.map((item) => {
    const old = byId.get(item.id) ?? byUrl.get(canonicalUrl(item.url));
    return {
      ...item,
      firstSeenAt: old?.firstSeenAt ?? old?.lastSeenAt ?? item.firstSeenAt ?? item.lastSeenAt,
    };
  });
}

// Canonical URLs, not similar titles: editions and tracks must stay distinct.
export function deduplicate(items: Competition[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
