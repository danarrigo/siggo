import { toNextJsHandler } from "better-auth/next-js";
import { authConfigured, getAuth } from "@/lib/auth";

async function handler(request: Request) {
  if (!authConfigured())
    return Response.json({ error: "Private workspace setup is incomplete." }, { status: 503 });
  const handlers = toNextJsHandler(getAuth());
  return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
}
export const GET = handler;
export const POST = handler;
