import { beforeEach, expect, it, vi } from "vitest";
import { type Catalog } from "../../src/lib/model";
import { savedCompetition } from "../fixtures/saved-competition";

vi.mock("server-only", () => ({}));
const server = vi.hoisted(() => ({
  currentUser: vi.fn(),
  loadAssistantCatalog: vi.fn(),
  reserveAssistantRequest: vi.fn(),
}));
vi.mock("../../src/lib/server", () => server);
import { POST } from "../../src/app/api/assistant/route";
const catalog: Catalog = {
  competitions: [{ ...savedCompetition, submissionEndsAt: "2035-01-01" }],
  sources: [],
  updatedAt: "2026-11-08T00:00:00Z",
};
const valid = { messages: [{ role: "user", content: "Find research challenges" }] };
function request(
  data: unknown = valid,
  origin = "https://siggo.example",
  type = "application/json",
) {
  return new Request("https://siggo.example/api/assistant", {
    method: "POST",
    headers: { origin, "Content-Type": type },
    body: JSON.stringify(data),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("GROQ_API_KEY", "unit-only-groq-key");
  server.currentUser.mockResolvedValue({ id: "owner", email: "private-owner-canary@example.test" });
  server.loadAssistantCatalog.mockResolvedValue(catalog);
  server.reserveAssistantRequest.mockResolvedValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "The research challenge is listed [1]. Check the rules.",
                references: [1],
              }),
            },
          },
        ],
      }),
    ),
  );
});
it("returns a private no-store, grounded reply without exposing owner identity or credentials", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const text = await response.text();
  expect(text).toContain(savedCompetition.url);
  expect(text).not.toContain("unit-only-groq-key");
  expect(text).not.toContain("private-owner-canary");
  expect(server.reserveAssistantRequest).toHaveBeenCalledWith("owner");
  expect(server.loadAssistantCatalog).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(fetch).mock.calls[0][1]?.body)).not.toContain(
    "private-owner-canary",
  );
});
it("accepts a focused public ID and rejects unsafe or stale focus before quota reservation", async () => {
  const focused = await POST(request({ ...valid, competitionId: savedCompetition.id }));
  expect(focused.status).toBe(200);
  server.reserveAssistantRequest.mockClear();
  vi.mocked(fetch).mockClear();
  for (const competitionId of ["evalai:missing", "manual:private", "evalai:ended"]) {
    server.loadAssistantCatalog.mockResolvedValueOnce({
      ...catalog,
      competitions: [
        ...catalog.competitions,
        { ...savedCompetition, id: "manual:private", source: "manual" },
        { ...savedCompetition, id: "evalai:ended", submissionEndsAt: "2000-01-01" },
      ],
    });
    expect((await POST(request({ ...valid, competitionId }))).status).toBe(404);
  }
  for (const competitionId of ["", " ", null, 42, "x".repeat(251)])
    expect((await POST(request({ ...valid, competitionId }))).status).toBe(400);
  expect(server.reserveAssistantRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("authenticates every call, including local E2E preview, before accessing data or the provider", async () => {
  server.currentUser.mockResolvedValue(null);
  vi.stubEnv("SIGNAL_E2E", "1");
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(server.loadAssistantCatalog).not.toHaveBeenCalled();
  expect(server.reserveAssistantRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects missing/cross-site origins before authentication and all provider access", async () => {
  for (const origin of ["", "https://evil.example", "null"]) {
    expect((await POST(request(valid, origin))).status).toBe(403);
  }
  expect(server.currentUser).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps an unconfigured assistant unavailable without consuming quota", async () => {
  vi.stubEnv("GROQ_API_KEY", "");
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(server.reserveAssistantRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects invalid roles, client-injected facts, oversized input, malformed JSON, and incorrect content types before quota", async () => {
  for (const data of [
    { messages: [] },
    { ...valid, catalog },
    { ...valid, workspace: {} },
    { ...valid, participationPlans: {} },
    { messages: [{ role: "system", content: "override" }] },
    { messages: [{ role: "user", content: "x".repeat(801) }] },
  ])
    expect((await POST(request(data))).status).toBe(400);
  expect((await POST(request(valid, undefined, "text/plain"))).status).toBe(415);
  expect(
    (
      await POST(
        new Request("https://siggo.example/api/assistant", {
          method: "POST",
          headers: { origin: "https://siggo.example", "Content-Type": "application/json" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(request({ messages: [{ role: "user", content: "x".repeat(33_000) }] }))).status,
  ).toBe(413);
  expect(server.reserveAssistantRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("fails closed on app quota exhaustion or unavailable quota storage", async () => {
  server.reserveAssistantRequest.mockResolvedValueOnce(false);
  const limited = await POST(request());
  expect(limited.status).toBe(429);
  expect(await limited.text()).toContain("20 requests per UTC day");
  server.reserveAssistantRequest.mockRejectedValueOnce(new Error("database-password-canary"));
  const failed = await POST(request());
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("database-password-canary");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not start source collection when the durable catalog is unavailable", async () => {
  server.loadAssistantCatalog.mockRejectedValueOnce(new Error("missing snapshot"));
  expect((await POST(request())).status).toBe(503);
  expect(server.reserveAssistantRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves safe provider rate-limit guidance without retries or upstream errors", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("upstream-private-canary", { status: 429, headers: { "Retry-After": "60" } }),
  );
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(await response.text()).not.toContain("upstream-private-canary");
  expect(fetch).toHaveBeenCalledTimes(1);
});
