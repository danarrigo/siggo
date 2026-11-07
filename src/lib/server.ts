import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
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
  sourceIds,
  workspaceSchema,
} from "./model";
import {
  acknowledgeDeadlineChanges as acknowledgeChanges,
  reconcileSavedCompetitions,
} from "./saved-competitions";

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
      return catalog;
    }
    return refreshCatalog();
  }
  return publicCatalog();
}

export async function refreshCatalog(): Promise<Catalog> {
  const db = getDb();
  const [old] = await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.id, "current"));
  const catalog = await collectCatalog(old?.data);
  // Preserve legacy bookmarks from the old snapshot before ended records disappear.
  // If tracking fails, keep that public snapshot available for a safe retry.
  const trackingCatalog = {
    ...catalog,
    competitions: [...(old?.data.competitions ?? []), ...catalog.competitions],
  };
  const owners = await db
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(sql`jsonb_array_length(coalesce(${workspaces.data}->'saved', '[]'::jsonb)) > 0`);
  for (const owner of owners) await loadWorkspace(owner.userId, trackingCatalog);
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

async function updateWorkspace(userId: string, update: (workspace: Workspace) => Workspace) {
  const db = getDb();
  for (let attempt = 0; attempt < 4; attempt++) {
    const [stored] = await db.select().from(workspaces).where(eq(workspaces.userId, userId));
    const current = stored ? workspaceSchema.parse(stored.data) : defaultWorkspace;
    const next = update(current);
    if (next === current) return current;
    const data = workspaceSchema.parse(next);
    const written = stored
      ? await db
          .update(workspaces)
          // Preserve fields unknown to an older deployment still handling an in-flight request.
          .set({ data: { ...stored.data, ...data }, updatedAt: new Date() })
          .where(
            and(
              eq(workspaces.userId, userId),
              sql`${workspaces.data} = ${JSON.stringify(stored.data)}::jsonb`,
            ),
          )
          .returning({ userId: workspaces.userId })
      : await db
          .insert(workspaces)
          .values({ userId, data })
          .onConflictDoNothing()
          .returning({ userId: workspaces.userId });
    if (written.length) return data;
  }
  throw new Error("Workspace changed concurrently. Retry the operation.");
}

export async function loadWorkspace(userId: string, catalog?: Catalog): Promise<Workspace> {
  if (catalog)
    return updateWorkspace(userId, (workspace) =>
      reconcileSavedCompetitions(workspace, catalog.competitions),
    );
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.userId, userId));
  return workspace ? workspaceSchema.parse(workspace.data) : defaultWorkspace;
}
export async function saveWorkspace(userId: string, data: Workspace, fields = Object.keys(data)) {
  const managed = new Set([
    "lastVisitedAt",
    "savedSnapshots",
    "deadlineChanges",
    "trackingLimited",
  ]);
  // Older tabs can edit content, but cannot erase newer tracking state or other absent fields.
  const edits = Object.fromEntries(
    Object.entries(data).filter(([key]) => !managed.has(key) && fields.includes(key)),
  );
  const [catalog] = await getDb()
    .select()
    .from(catalogSnapshots)
    .where(eq(catalogSnapshots.id, "current"));
  await updateWorkspace(userId, (current) => {
    const next = { ...current, ...edits };
    const snapshots = new Map(Object.entries(current.savedSnapshots));
    for (const id of next.saved)
      if (!snapshots.has(id) && Object.hasOwn(data.savedSnapshots, id))
        snapshots.set(id, data.savedSnapshots[id]);
    return reconcileSavedCompetitions(
      { ...next, savedSnapshots: Object.fromEntries(snapshots) },
      catalog?.data.competitions ?? [],
    );
  });
}
export async function acknowledgeWorkspaceDeadlineChanges(userId: string, ids: string[]) {
  await updateWorkspace(userId, (workspace) => acknowledgeChanges(workspace, ids));
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
