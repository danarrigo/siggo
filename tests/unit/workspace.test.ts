import { describe, expect, it } from "vitest";
import {
  type Competition,
  defaultWorkspace,
  manualCompetitionSchema,
  preserveDiscoveryDates,
  workspaceSchema,
} from "../../src/lib/model";
import {
  deadlineReminders,
  isNewCompetition,
  withoutManualCompetition,
  workspaceCompetitions,
} from "../../src/lib/workspace";

const now = Date.parse("2026-11-06T03:00:00Z");
const stamp = new Date(now).toISOString();
const item: Competition = {
  id: "evalai:sample",
  source: "evalai",
  title: "A real-shaped test listing",
  url: "https://eval.ai/challenges/100",
  description: "Test metadata",
  category: "Research challenge",
  organizer: "Test organizer",
  tags: [],
  reward: null,
  opensAt: null,
  registrationEndsAt: null,
  submissionEndsAt: "2026-11-09T12:00:00Z",
  challengeEndsAt: null,
  eventEndsAt: null,
  registrationOpen: null,
  participation: "Online",
  location: "Online",
  entryFee: "Unknown",
  eligibility: "Unverified",
  lastSeenAt: stamp,
};
const personal = manualCompetitionSchema.parse({
  ...item,
  id: "manual:test",
  source: "manual",
  image: null,
});

describe("private workspace additions", () => {
  it("reads older saved workspaces without losing profile, bookmarks, or feedback", () => {
    const legacy = { profile: defaultWorkspace.profile, saved: [item.id], dismissed: ["other"] };
    expect(workspaceSchema.parse(legacy)).toEqual({ ...defaultWorkspace, ...legacy });
  });
  it("round-trips private notes and entries, with bounded, credential-free HTTPS input", () => {
    const workspace = {
      ...defaultWorkspace,
      notes: { [personal.id]: "Check student eligibility" },
      manualCompetitions: [personal],
    };
    expect(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)))).toEqual(workspace);
    expect(
      manualCompetitionSchema.safeParse({ ...personal, url: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      manualCompetitionSchema.safeParse({ ...personal, url: "https://user:secret@example.org/" })
        .success,
    ).toBe(false);
    expect(manualCompetitionSchema.safeParse({ ...personal, source: "kaggle" }).success).toBe(
      false,
    );
    expect(
      workspaceSchema.safeParse({ ...workspace, notes: { x: "x".repeat(4001) } }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...workspace,
        notes: Object.fromEntries(
          Array.from({ length: 70 }, (_, i) => [String(i), "x".repeat(4000)]),
        ),
      }).success,
    ).toBe(false);
  });
  it("does not let an ended personal entry hide a newly active listing at the same URL", () => {
    const expired = { ...personal, submissionEndsAt: "2020-01-01" };
    expect(
      workspaceCompetitions([item], { ...defaultWorkspace, manualCompetitions: [expired] }, now),
    ).toEqual([item]);
  });
  it("keeps personal identity and notes when a feed later discovers the same URL", () => {
    const workspace = { ...defaultWorkspace, manualCompetitions: [personal], saved: [personal.id] };
    expect(workspaceCompetitions([item], workspace, now)).toEqual([personal]);
    expect(
      withoutManualCompetition(
        {
          ...workspace,
          notes: { [personal.id]: "Draft", other: "Keep" },
          dismissed: [personal.id],
        },
        personal.id,
      ),
    ).toMatchObject({ manualCompetitions: [], saved: [], dismissed: [], notes: { other: "Keep" } });
  });
});

describe("new discoveries, not daily rechecks", () => {
  it("backfills old snapshots and preserves discovery time on refresh, retention, and ID changes", () => {
    const old = { ...item, lastSeenAt: "2026-11-01T00:00:00Z" };
    const [first] = preserveDiscoveryDates([item], [old]);
    expect(first.firstSeenAt).toBe(old.lastSeenAt);
    const [again] = preserveDiscoveryDates(
      [{ ...item, lastSeenAt: "2026-11-07T00:00:00Z" }],
      [first],
    );
    expect(again.firstSeenAt).toBe(old.lastSeenAt);
    const [renamed] = preserveDiscoveryDates([{ ...item, id: "evalai:renamed" }], [first]);
    expect(renamed.firstSeenAt).toBe(old.lastSeenAt);
    expect(isNewCompetition(again, "2026-11-05T00:00:00Z", now)).toBe(false);
  });
  it("only marks discoveries newer than the visit baseline, excluding personal and future entries", () => {
    expect(isNewCompetition(item, "2026-11-05T00:00:00Z", now)).toBe(true);
    expect(isNewCompetition(item, stamp, now)).toBe(false);
    expect(isNewCompetition(personal, "2026-11-05T00:00:00Z", now)).toBe(false);
    expect(
      isNewCompetition(
        { ...item, firstSeenAt: "2026-11-10T00:00:00Z" },
        "2026-11-05T00:00:00Z",
        now,
      ),
    ).toBe(false);
  });
});

describe("in-app deadline reminders", () => {
  it("uses saved entries and distinct deadline types inside seven days", () => {
    const entry = {
      ...item,
      registrationEndsAt: "2026-11-07T12:00:00Z",
      challengeEndsAt: "2026-11-08T12:00:00Z",
      eventEndsAt: "2026-12-01T00:00:00Z",
    };
    expect(deadlineReminders([entry], [], now)).toEqual([]);
    expect(deadlineReminders([entry], [entry.id], now).map((reminder) => reminder.label)).toEqual([
      "Registration closes",
      "Challenge ends",
      "Submissions close",
    ]);
    expect(
      deadlineReminders([{ ...entry, registrationOpen: false }], [entry.id], now).map(
        (reminder) => reminder.field,
      ),
    ).not.toContain("registrationEndsAt");
  });
  it("retains calendar precision without inventing a close time or timezone", () => {
    const entry = { ...item, submissionEndsAt: "2026-11-06" };
    expect(deadlineReminders([entry], [entry.id], now)[0].value).toBe("2026-11-06");
    expect(deadlineReminders([entry], [entry.id], Date.parse("2026-11-07T11:59:59Z"))).toHaveLength(
      1,
    );
    expect(deadlineReminders([entry], [entry.id], Date.parse("2026-11-07T12:00:00Z"))).toHaveLength(
      0,
    );
    expect(deadlineReminders([{ ...entry, submissionEndsAt: null }], [entry.id], now)).toEqual([]);
  });
});
