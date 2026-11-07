import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogSnapshots, workspaces } from "@/db/schema";
import { authConfigured, getAuth, allowedEmail, localPreview } from "./auth";
import {
  collectCatalog,
  kaggleConfigured,
  rememberPublicCatalog,
  sourceDefinitions,
} from "./sources";
import {
  type Catalog,
  type Workspace,
  catalogForSources,
  defaultWorkspace,
  isActive,
  sourceIds,
  workspaceSchema,
} from "./model";

const enabledSourceIds = sourceDefinitions.map((source) => source.id);

export async function currentUser() {
  if (!authConfigured()) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user && allowedEmail(session.user.email) ? session.user : null;
}

async function publicCatalog() {
  // Adding credentials must not reuse the anonymous catalog. Never put the secret in cache keys.
  const snapshot = await unstable_cache(
    () => collectCatalog(),
    [
      "public-competition-catalog",
      // Schema IDs preserve compatible cached data; removed registrations are pruned on read.
      sourceIds.join(","),
      kaggleConfigured() ? "kaggle-enabled" : "public-only",
    ],
    { revalidate: 3600, tags: ["catalog"] },
  )();
  const catalog = catalogForSources(snapshot, enabledSourceIds);
  rememberPublicCatalog(catalog);
  return catalog;
}

export async function loadCatalog(): Promise<Catalog> {
  if (localPreview() && process.env.SIGNAL_E2E === "1") {
    const { readFile } = await import("node:fs/promises");
    return catalogForSources(
      JSON.parse(await readFile(`${process.cwd()}/tests/fixtures/catalog.json`, "utf8")),
      enabledSourceIds,
    );
  }
  if (process.env.DATABASE_URL && authConfigured()) {
    const [snapshot] = await getDb()
      .select()
      .from(catalogSnapshots)
      .where(eq(catalogSnapshots.id, "current"));
    if (
      snapshot &&
      sourceDefinitions.every((source) =>
        snapshot.data.sources.some((status) => status.id === source.id),
      )
    ) {
      const catalog = catalogForSources(snapshot.data, enabledSourceIds);
      return { ...catalog, competitions: catalog.competitions.filter((item) => isActive(item)) };
    }
    return refreshCatalog();
  }
  return publicCatalog();
}

export async function refreshCatalog(): Promise<Catalog> {
  const db = getDb();
  const [old] = await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.id, "current"));
  const catalog = await collectCatalog(old?.data);
  const updatedAt = new Date(catalog.updatedAt);
  await db
    .insert(catalogSnapshots)
    .values({ id: "current", data: catalog, updatedAt })
    .onConflictDoUpdate({
      target: catalogSnapshots.id,
      set: { data: catalog, updatedAt },
      setWhere: sql`${catalogSnapshots.updatedAt} <= ${updatedAt}`,
    });
  return catalog;
}

export async function loadWorkspace(userId: string): Promise<Workspace> {
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.userId, userId));
  return workspace ? workspaceSchema.parse(workspace.data) : defaultWorkspace;
}
export async function saveWorkspace(userId: string, data: Workspace, fields = Object.keys(data)) {
  // Older open tabs do not know about notes/personal listings. Merge only fields they sent.
  const edits = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "lastVisitedAt" && fields.includes(key)),
  );
  await getDb()
    .insert(workspaces)
    .values({ userId, data: { ...data, lastVisitedAt: null } })
    .onConflictDoUpdate({
      target: workspaces.userId,
      // Visit tracking is independent of edits and must not be rolled back by a stale form.
      set: {
        data: sql`${workspaces.data} || ${JSON.stringify(edits)}::jsonb`,
        updatedAt: new Date(),
      },
    });
}

export async function markWorkspaceVisited(userId: string) {
  const visitedAt = new Date().toISOString();
  const [result] = await getDb()
    .insert(workspaces)
    .values({ userId, data: { ...defaultWorkspace, lastVisitedAt: visitedAt } })
    .onConflictDoUpdate({
      target: workspaces.userId,
      set: {
        data: sql`jsonb_set(${workspaces.data}, '{lastVisitedAt}', to_jsonb(greatest(coalesce(${workspaces.data}->>'lastVisitedAt', ''), ${visitedAt})::text))`,
        updatedAt: new Date(),
      },
    })
    .returning({ data: workspaces.data });
  return result.data.lastVisitedAt!;
}
