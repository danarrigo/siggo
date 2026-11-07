import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectCatalog } from "../../src/lib/sources";
import type { Catalog } from "../../src/lib/model";

const old: Catalog = {
  competitions: [],
  sources: [
    {
      id: "evalai",
      name: "EvalAI",
      url: "https://eval.ai",
      state: "healthy",
      count: 0,
      checkedAt: "2026-01-01T00:00:00Z",
      lastSuccessAt: "2026-01-01T00:00:00Z",
      note: "Previous successful sync",
    },
  ],
  updatedAt: "2026-01-01T00:00:00Z",
};
beforeEach(() => vi.stubEnv("KAGGLE_API_TOKEN", ""));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("failure-aware discovery", () => {
  it("reports source failures, preserves last-success time, and never requests Devpost", async () => {
    vi.stubEnv("KAGGLE_USERNAME", "");
    vi.stubEnv("KAGGLE_KEY", "");
    const fetcher = vi.fn(() => Promise.resolve(new Response("Unavailable", { status: 503 })));
    vi.stubGlobal("fetch", fetcher);
    const catalog = await collectCatalog(old);
    expect(catalog.sources.find((source) => source.id === "evalai")?.state).toBe("unavailable");
    expect(catalog.sources.find((source) => source.id === "evalai")?.lastSuccessAt).toBe(
      "2026-01-01T00:00:00Z",
    );
    expect(catalog.sources.find((source) => source.id === "kaggle")?.state).toBe("not-configured");
    expect(catalog.sources.find((source) => source.id === "devpost")?.state).toBe("manual");
    expect(fetcher.mock.calls.flat().join(" ")).not.toContain("devpost");
  });
  it("does not follow untrusted pagination targets", async () => {
    vi.stubEnv("KAGGLE_USERNAME", "");
    vi.stubEnv("KAGGLE_KEY", "");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://eval.ai"))
        return Response.json({ count: 1, results: [], next: "https://evil.example/steal" });
      return new Response("Unavailable", { status: 503 });
    });
    const catalog = await collectCatalog();
    expect(urls.some((url) => url.includes("evil.example"))).toBe(false);
    expect(catalog.sources.find((source) => source.id === "evalai")?.state).toBe("unavailable");
  });
});
