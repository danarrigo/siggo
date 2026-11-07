import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { currentUser, loadCatalog, refreshCatalog } from "@/lib/server";
import { authConfigured, localPreview } from "@/lib/auth";
import { sameOrigin } from "@/lib/request-security";

export const maxDuration = 300;
function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function sync() {
  if (!authConfigured())
    return Response.json({ error: "Workspace setup is incomplete" }, { status: 503 });
  try {
    const catalog = await refreshCatalog();
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ count: catalog.competitions.length, updatedAt: catalog.updatedAt });
  } catch {
    return Response.json(
      { error: "Sync failed. The previous catalog has been preserved." },
      { status: 503 },
    );
  }
}
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return sync();
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const preview = localPreview();
  if (!preview && !(await currentUser()))
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const catalog = await loadCatalog();
  if (Date.now() - Date.parse(catalog.updatedAt) < 60_000)
    return Response.json({
      message: "Sources were checked less than a minute ago. Showing the latest snapshot.",
    });
  if (preview) {
    revalidateTag("catalog", { expire: 0 });
    return Response.json({
      message: "Catalog cache cleared. Fetching the latest source listings.",
    });
  }
  return sync();
}
