import { beforeEach, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { workspaces } from "../../src/db/schema";
import { defaultWorkspace, type Catalog } from "../../src/lib/model";
import { savedCompetition } from "../fixtures/saved-competition";

const dependencies = vi.hoisted(() => ({ getDb: vi.fn(), collectCatalog: vi.fn() }));
vi.mock("../../src/db", () => ({ getDb: dependencies.getDb }));
vi.mock("../../src/lib/sources", () => ({
  sourceDefinitions: [{ id: "evalai" }],
  collectCatalog: dependencies.collectCatalog,
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn() }));
import { loadAssistantCatalog, reserveAssistantRequest } from "../../src/lib/server";

const db = drizzle.mock();
const insert = (values: { userId: string; data: SQL }) => db.insert(workspaces).values(values);
type Conflict = Parameters<ReturnType<typeof insert>["onConflictDoUpdate"]>[0];
let compiled: ReturnType<ReturnType<typeof insert>["toSQL"]>;
let reserved: { userId: string }[];
let snapshot: { data: Catalog }[];
beforeEach(() => {
  reserved = [{ userId: "owner" }];
  snapshot = [
    {
      data: {
        competitions: [savedCompetition, { ...savedCompetition, source: "manual" }],
        sources: [],
        updatedAt: "2026-11-08T00:00:00Z",
      },
    },
  ];
  dependencies.getDb.mockReturnValue({
    select: () => ({ from: () => ({ where: async () => snapshot }) }),
    insert: () => ({
      values: (values: { userId: string; data: SQL }) => ({
        onConflictDoUpdate: (options: Conflict) => ({
          returning: async () => {
            compiled = insert(values)
              .onConflictDoUpdate(options)
              .returning({ userId: workspaces.userId })
              .toSQL();
            return reserved;
          },
        }),
      }),
    }),
  });
});
it("reserves atomically with a conditional upsert, database UTC clock, daily and cross-midnight spacing guards", async () => {
  expect(await reserveAssistantRequest("owner")).toBe(true);
  expect(compiled.sql).toContain('on conflict ("user_id") do update');
  expect(compiled.sql).toContain("at time zone 'UTC'");
  expect(compiled.sql).toContain("'{assistantUsage,count}'");
  expect(compiled.sql).toContain("'{assistantUsage,lastRequestAt}'");
  expect(compiled.sql).toContain("is distinct from");
  expect(compiled.sql).toContain("jsonb_set");
  expect(compiled.sql).toMatch(/where .* or .*\) and /);
  expect(compiled.params).toContain("owner");
  expect(compiled.params).toContain(20);
  expect(compiled.params).toContain(15);
  expect(compiled.params).toContain(JSON.stringify(defaultWorkspace));
  expect(compiled.sql).not.toContain('"notes" =');
  reserved = [];
  expect(await reserveAssistantRequest("owner")).toBe(false);
});
it("reads only the durable catalog and cannot collect sources or include personal listings", async () => {
  const catalog = await loadAssistantCatalog();
  expect(catalog.competitions).toEqual([savedCompetition]);
  expect(dependencies.collectCatalog).not.toHaveBeenCalled();
  snapshot = [];
  await expect(loadAssistantCatalog()).rejects.toThrow("Catalog snapshot is unavailable");
  expect(dependencies.collectCatalog).not.toHaveBeenCalled();
});
