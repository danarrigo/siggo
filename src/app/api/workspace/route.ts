import { currentUser, markWorkspaceVisited, saveWorkspace } from "@/lib/server";
import { workspaceSchema } from "@/lib/model";
import { sameOrigin } from "@/lib/request-security";

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    return Response.json({ visitedAt: await markWorkspaceVisited(user.id) });
  } catch {
    return Response.json({ error: "Could not record this visit" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.text();
  if (body.length > 250_000)
    return Response.json({ error: "Workspace is too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!json || typeof json !== "object" || Array.isArray(json))
    return Response.json({ error: "Invalid workspace settings" }, { status: 400 });
  const parsed = workspaceSchema.safeParse(json);
  if (!parsed.success)
    return Response.json({ error: "Invalid workspace settings" }, { status: 400 });
  try {
    await saveWorkspace(user.id, parsed.data, Object.keys(json));
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not save. Your changes have not been synced." },
      { status: 503 },
    );
  }
}
