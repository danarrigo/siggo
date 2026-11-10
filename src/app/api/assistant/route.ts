import {
  assistantCooldownSeconds,
  assistantDailyLimit,
  assistantRequestSchema,
} from "@/lib/assistant";
import {
  AssistantError,
  askSiggo,
  assistantConfigured,
  assistantFocus,
  assistantText,
} from "@/lib/assistant-server";
import { sameOrigin } from "@/lib/request-security";
import { currentUser, loadAssistantCatalog, reserveAssistantRequest } from "@/lib/server";

export const maxDuration = 45;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
function failure(error: string, status: number, retryAfter?: number) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        ...privateHeaders,
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid origin", 403);
  try {
    const user = await currentUser();
    // Unlike the catalog UI, local preview never permits live, unauthenticated inference.
    if (!user) return failure("Sign in required", 401);
    if (!assistantConfigured())
      return failure("Ask Siggo is not configured yet. Add GROQ_API_KEY on the server.", 503);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      return failure("Send an application/json request.", 415);
    let json: unknown;
    try {
      json = JSON.parse(await assistantText(request.body, 32_000));
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      return failure("Invalid JSON", 400);
    }
    const parsed = assistantRequestSchema.safeParse(json);
    if (!parsed.success)
      return failure("Send a question of up to 800 characters with at most two prior turns.", 400);
    const catalog = await loadAssistantCatalog();
    assistantFocus(catalog, parsed.data.competitionId);
    if (!(await reserveAssistantRequest(user.id)))
      return failure(
        `Ask Siggo allows ${assistantDailyLimit} requests per UTC day, at least ${assistantCooldownSeconds} seconds apart. Try again later.`,
        429,
      );
    const reply = await askSiggo(parsed.data, catalog, request.signal);
    return Response.json(reply, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof AssistantError)
      return failure(error.message, error.status, error.retryAfter);
    return failure(
      "Ask Siggo is temporarily unavailable. Your saved items and notes are unchanged.",
      503,
    );
  }
}
