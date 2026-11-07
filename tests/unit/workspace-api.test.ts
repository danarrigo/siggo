import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace, maxWorkspaceSize } from "../../src/lib/model";

const server = vi.hoisted(() => ({
  currentUser: vi.fn<() => Promise<{ id: string } | null>>(),
  saveWorkspace: vi.fn(),
  markWorkspaceVisited: vi.fn(),
  acknowledgeWorkspaceDeadlineChanges: vi.fn(),
}));
vi.mock("../../src/lib/server", () => server);
import { PATCH, PUT } from "../../src/app/api/workspace/route";

function request(method: string, data?: unknown, origin = "https://siggo.example") {
  return new Request("https://siggo.example/api/workspace", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL", "");
  server.currentUser.mockResolvedValue({ id: "owner" });
  server.saveWorkspace.mockResolvedValue(undefined);
  server.markWorkspaceVisited.mockResolvedValue("2026-11-06T12:00:00.000Z");
});

describe("private workspace HTTP contract", () => {
  it("tracks a visit separately, returning only its marker", async () => {
    const response = await PATCH(request("PATCH"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ visitedAt: "2026-11-06T12:00:00.000Z" });
    expect(server.markWorkspaceVisited).toHaveBeenCalledWith("owner");
    expect(server.saveWorkspace).not.toHaveBeenCalled();
  });
  it("acknowledges explicit change versions separately from edits and visit markers", async () => {
    const response = await PATCH(
      request("PATCH", { acknowledgeDeadlineChanges: ["observed-version"] }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(server.acknowledgeWorkspaceDeadlineChanges).toHaveBeenCalledWith("owner", [
      "observed-version",
    ]);
    expect(server.markWorkspaceVisited).not.toHaveBeenCalled();
    expect(server.saveWorkspace).not.toHaveBeenCalled();
    expect((await PATCH(request("PATCH", { acknowledgeDeadlineChanges: [] }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { acknowledgeDeadlineChanges: [42] }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { other: true }))).status).toBe(400);
  });
  it("denies anonymous and cross-origin deadline acknowledgements", async () => {
    const body = { acknowledgeDeadlineChanges: ["version"] };
    expect((await PATCH(request("PATCH", body, "https://evil.example"))).status).toBe(403);
    server.currentUser.mockResolvedValue(null);
    expect((await PATCH(request("PATCH", body))).status).toBe(401);
    expect(server.acknowledgeWorkspaceDeadlineChanges).not.toHaveBeenCalled();
  });
  it("denies anonymous and cross-origin visit and edit writes", async () => {
    for (const handler of [PATCH, PUT]) {
      expect((await handler(request("PATCH", undefined, "https://evil.example"))).status).toBe(403);
      server.currentUser.mockResolvedValue(null);
      expect((await handler(request("PATCH"))).status).toBe(401);
    }
    expect(server.markWorkspaceVisited).not.toHaveBeenCalled();
    expect(server.saveWorkspace).not.toHaveBeenCalled();
  });
  it("retains the legacy client's explicit fields, so defaults cannot erase new private data", async () => {
    const legacy = { profile: defaultWorkspace.profile, saved: ["evalai:1"], dismissed: [] };
    const response = await PUT(request("PUT", legacy));
    expect(response.status).toBe(200);
    expect(server.saveWorkspace).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({ saved: ["evalai:1"], notes: {}, manualCompetitions: [] }),
      ["profile", "saved", "dismissed"],
    );
  });
  it("accepts private notes and new fields and rejects oversized or invalid workspaces", async () => {
    const data = { ...defaultWorkspace, notes: { "evalai:1": "Check the official rules" } };
    expect((await PUT(request("PUT", data))).status).toBe(200);
    expect(server.saveWorkspace).toHaveBeenCalledWith("owner", data, Object.keys(data));
    expect((await PUT(request("PUT", { ...data, notes: { x: "x".repeat(4001) } }))).status).toBe(
      400,
    );
    expect(
      (await PUT(request("PUT", { ...data, notes: { x: "x".repeat(maxWorkspaceSize + 1) } })))
        .status,
    ).toBe(413);
    expect((await PUT(request("PUT", []))).status).toBe(400);
  });
  it("reports storage failures instead of claiming a successful save", async () => {
    server.saveWorkspace.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await PUT(request("PUT", defaultWorkspace))).status).toBe(503);
    server.acknowledgeWorkspaceDeadlineChanges.mockRejectedValueOnce(new Error("Unavailable"));
    expect(
      (await PATCH(request("PATCH", { acknowledgeDeadlineChanges: ["version"] }))).status,
    ).toBe(503);
    server.markWorkspaceVisited.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await PATCH(request("PATCH"))).status).toBe(503);
  });
});
