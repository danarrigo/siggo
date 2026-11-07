import { beforeEach, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { catalogSnapshots } from "../../src/db/schema";
import {
  type Catalog,
  type Competition,
  type Workspace,
  defaultWorkspace,
} from "../../src/lib/model";
import {
  reconcileSavedCompetitions,
  toggleSavedCompetition,
} from "../../src/lib/saved-competitions";
import { savedCompetition as item } from "../fixtures/saved-competition";

const dependencies = vi.hoisted(() => ({ getDb: vi.fn(), collectCatalog: vi.fn() }));
vi.mock("../../src/db", () => ({ getDb: dependencies.getDb }));
vi.mock("../../src/lib/sources", () => ({
  collectCatalog: dependencies.collectCatalog,
  kaggleConfigured: () => false,
  rememberPublicCatalog: vi.fn(),
  sourceDefinitions: [{ id: "evalai" }],
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn() }));
import {
  acknowledgeWorkspaceDeadlineChanges,
  loadWorkspace,
  refreshCatalog,
  saveWorkspace,
} from "../../src/lib/server";

const latest = { ...item, submissionEndsAt: "2026-11-20", lastSeenAt: "2026-11-02T00:00:00Z" };
const baseline = () =>
  toggleSavedCompetition(
    {
      ...defaultWorkspace,
      notes: { [item.id]: "Keep this note" },
      lastVisitedAt: "2026-10-01T00:00:00Z",
    },
    item,
  );
const catalog = (items: Competition[] = [latest]): Catalog => ({
  competitions: items,
  sources: [],
  updatedAt: "2026-11-02T00:00:00Z",
});
const dialect = new PgDialect();
let row: Workspace | null;
let publicCatalog: Catalog;
let beforeWrite: (() => void) | null;
let predicates: ReturnType<PgDialect["sqlToQuery"]>[];

// An injected lost compare-and-swap forces the actual server updater to reread/recompute.
// SQL predicates are compiled by Drizzle, not replaced with a different merge algorithm.
beforeEach(() => {
  row = baseline();
  publicCatalog = catalog();
  beforeWrite = null;
  predicates = [];
  dependencies.collectCatalog.mockResolvedValue(publicCatalog);
  dependencies.getDb.mockReturnValue({
    select: () => ({
      from: (table: unknown) => ({
        where: async (predicate: SQL) => {
          if (table === catalogSnapshots)
            return [{ id: "current", data: structuredClone(publicCatalog) }];
          const scope = dialect.sqlToQuery(predicate).params;
          if (scope.length && scope[0] !== "owner") return [];
          return row ? [{ userId: "owner", data: structuredClone(row) }] : [];
        },
      }),
    }),
    update: () => ({
      set: (values: { data: Workspace }) => ({
        where: (predicate: SQL) => ({
          returning: async () => {
            predicates.push(dialect.sqlToQuery(predicate));
            if (beforeWrite) {
              const race = beforeWrite;
              beforeWrite = null;
              race();
              return [];
            }
            row = structuredClone(values.data);
            return [{ userId: "owner" }];
          },
        }),
      }),
    }),
    insert: (table: unknown) =>
      table === catalogSnapshots
        ? {
            values: (values: { data: Catalog }) => ({
              onConflictDoUpdate: async () => {
                publicCatalog = values.data;
              },
            }),
          }
        : {
            values: (values: { data: Workspace }) => ({
              onConflictDoNothing: () => ({
                returning: async () => {
                  if (beforeWrite) {
                    const race = beforeWrite;
                    beforeWrite = null;
                    race();
                    return [];
                  }
                  row = structuredClone(values.data);
                  return [{ userId: "owner" }];
                },
              }),
            }),
          },
  });
});

it("tracks saved deadline changes before a future source refresh removes the listing", async () => {
  await refreshCatalog();
  expect(row?.savedSnapshots[item.id]).toEqual(latest);
  expect(row?.deadlineChanges).toHaveLength(1);
  dependencies.collectCatalog.mockResolvedValue(catalog([]));
  await refreshCatalog();
  expect(row?.savedSnapshots[item.id]).toEqual(latest);
  expect(row?.deadlineChanges).toHaveLength(1);
  expect(row?.notes[item.id]).toBe("Keep this note");
});

it("preserves legacy saved details from the old catalog before a refresh drops ended listings", async () => {
  const expired = { ...item, submissionEndsAt: "2020-01-01" };
  publicCatalog = catalog([expired]);
  dependencies.collectCatalog.mockResolvedValue(catalog([]));
  row = { ...defaultWorkspace, saved: [item.id], notes: { [item.id]: "Preserve the legacy note" } };
  await refreshCatalog();
  expect(row?.savedSnapshots[item.id]).toEqual(expired);
  expect(row?.notes[item.id]).toBe("Preserve the legacy note");
  expect(publicCatalog.competitions).toEqual([]);
});

it("retries tracking against concurrent notes, visits, and bookmark edits without losing any of them", async () => {
  const original = structuredClone(row);
  beforeWrite = () => {
    row = {
      ...baseline(),
      notes: { [item.id]: "New note from another tab" },
      saved: [item.id, "evalai:another"],
      lastVisitedAt: "2026-11-06T12:00:00Z",
    };
  };
  await loadWorkspace("owner", catalog());
  expect(row).toMatchObject({
    notes: { [item.id]: "New note from another tab" },
    saved: [item.id, "evalai:another"],
    lastVisitedAt: "2026-11-06T12:00:00Z",
  });
  expect(row?.deadlineChanges).toHaveLength(1);
  expect(predicates).toHaveLength(2);
  expect(predicates[0].sql).toContain("::jsonb");
  expect(predicates[0].params).toEqual(["owner", JSON.stringify(original)]);
  expect(JSON.parse(String(predicates[1].params[1])).notes[item.id]).toBe(
    "New note from another tab",
  );
});

it("a stale client's full workspace cannot erase server-owned snapshots, updates, or the visit marker", async () => {
  row = reconcileSavedCompetitions(baseline(), [latest]);
  const previousVisit = row.lastVisitedAt;
  await saveWorkspace("owner", { ...defaultWorkspace, saved: [item.id], notes: row.notes });
  expect(row?.savedSnapshots[item.id]).toEqual(latest);
  expect(row?.deadlineChanges).toHaveLength(1);
  expect(row?.lastVisitedAt).toBe(previousVisit);
});

it("legacy clients only edit fields explicitly supplied", async () => {
  await saveWorkspace(
    "owner",
    { ...defaultWorkspace, profile: { ...defaultWorkspace.profile, country: "Indonesia updated" } },
    ["profile"],
  );
  expect(row?.profile.country).toBe("Indonesia updated");
  expect(row?.saved).toEqual([item.id]);
  expect(row?.notes[item.id]).toBe("Keep this note");
});

it("acknowledges exact versions atomically and leaves newer changes and concurrent notes intact", async () => {
  const earlier = reconcileSavedCompetitions(baseline(), [latest]);
  const newer = { ...latest, submissionEndsAt: "2026-11-25", lastSeenAt: "2026-11-03T00:00:00Z" };
  row = reconcileSavedCompetitions(earlier, [newer]);
  await acknowledgeWorkspaceDeadlineChanges(
    "owner",
    earlier.deadlineChanges.map((change) => change.id),
  );
  expect(row?.deadlineChanges).toHaveLength(1);
  const current = structuredClone(row);
  beforeWrite = () => {
    row = { ...current, notes: { [item.id]: "Changed during acknowledgement" } };
  };
  await acknowledgeWorkspaceDeadlineChanges(
    "owner",
    current.deadlineChanges.map((change) => change.id),
  );
  expect(row?.deadlineChanges).toEqual([]);
  expect(row?.notes[item.id]).toBe("Changed during acknowledgement");
  expect(row?.savedSnapshots[item.id].submissionEndsAt).toBe("2026-11-25");
});

it("keeps the old public snapshot available if saved-detail tracking cannot be persisted", async () => {
  const previous = catalog([item]);
  publicCatalog = previous;
  dependencies.collectCatalog.mockResolvedValue(catalog());
  beforeWrite = () => {
    throw new Error("Storage unavailable");
  };
  await expect(refreshCatalog()).rejects.toThrow("Storage unavailable");
  expect(publicCatalog).toEqual(previous);
  expect(row?.savedSnapshots[item.id]).toEqual(item);
  expect(row?.notes[item.id]).toBe("Keep this note");
});

it("a concurrent first insert does not replace a workspace created by a visit or another tab", async () => {
  row = null;
  beforeWrite = () => {
    row = { ...defaultWorkspace, notes: { existing: "Keep concurrent initial data" } };
  };
  await saveWorkspace(
    "owner",
    { ...defaultWorkspace, profile: { ...defaultWorkspace.profile, compute: "Updated compute" } },
    ["profile"],
  );
  const actual = await loadWorkspace("owner");
  expect(actual.profile.compute).toBe("Updated compute");
  expect(actual.notes.existing).toBe("Keep concurrent initial data");
});
