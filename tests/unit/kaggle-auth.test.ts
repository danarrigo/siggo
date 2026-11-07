import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectCatalog, kaggleConfigured } from "../../src/lib/sources";

beforeEach(() => {
  for (const name of ["KAGGLE_API_TOKEN", "KAGGLE_USERNAME", "KAGGLE_KEY"]) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function fakeSources(status = 200) {
  const calls: { url: string; authorization: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) => {
    calls.push({ url, authorization: new Headers(options?.headers).get("authorization") });
    if (!url.startsWith("https://www.kaggle.com/api/v1/competitions/list"))
      return new Response("Unavailable", { status: 503 });
    if (status === 200 && new URL(url).searchParams.get("page") !== "1") return Response.json([]);
    return status === 200
      ? Response.json([
          { ref: "sample", title: "Sample challenge", deadline: "2099-12-01T00:00:00Z" },
        ])
      : new Response("Unauthorized", { status });
  });
  return calls;
}
describe("Kaggle authentication", () => {
  it("accepts an API token without a username, key, or downloaded file", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "  KGAT_synthetic_token  ");
    const calls = fakeSources();
    expect(kaggleConfigured()).toBe(true);
    const catalog = await collectCatalog();
    expect(calls.find((call) => call.url.includes("www.kaggle.com"))?.authorization).toBe(
      "Bearer KGAT_synthetic_token",
    );
    expect(
      calls
        .filter((call) => !call.url.includes("www.kaggle.com"))
        .every((call) => call.authorization === null),
    ).toBe(true);
    expect(catalog.sources.find((source) => source.id === "kaggle")?.state).toBe("healthy");
    expect(catalog.competitions.some((item) => item.id === "kaggle:sample")).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain("KGAT_synthetic_token");
  });
  it("continues past short pages instead of assuming the requested page size was honored", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "KGAT_synthetic_token");
    const requested: number[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      if (!url.startsWith("https://www.kaggle.com/api/v1/competitions/list"))
        return new Response("Unavailable", { status: 503 });
      const page = Number(new URL(url).searchParams.get("page"));
      requested.push(page);
      const count = page === 1 ? 20 : page === 2 ? 1 : 0;
      return Response.json(
        Array.from({ length: count }, (_, index) => ({
          ref: `sample-${page}-${index}`,
          title: "Sample challenge",
          deadline: "2099-12-01T00:00:00Z",
        })),
      );
    });
    const catalog = await collectCatalog();
    expect(requested).toEqual([1, 2, 3]);
    expect(catalog.sources.find((source) => source.id === "kaggle")?.count).toBe(21);
    expect(catalog.sources.find((source) => source.id === "kaggle")?.state).toBe("healthy");
  });
  it("prefers the API token when legacy credentials are also present", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "KGAT_synthetic_token");
    vi.stubEnv("KAGGLE_USERNAME", "legacy-user");
    vi.stubEnv("KAGGLE_KEY", "legacy-key");
    const calls = fakeSources();
    await collectCatalog();
    expect(calls.find((call) => call.url.includes("www.kaggle.com"))?.authorization).toBe(
      "Bearer KGAT_synthetic_token",
    );
  });
  it("keeps legacy authentication as an explicit alternative", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "   ");
    vi.stubEnv("KAGGLE_USERNAME", "legacy-user");
    vi.stubEnv("KAGGLE_KEY", "legacy-key");
    const calls = fakeSources();
    await collectCatalog();
    expect(calls.find((call) => call.url.includes("www.kaggle.com"))?.authorization).toBe(
      `Basic ${Buffer.from("legacy-user:legacy-key").toString("base64")}`,
    );
  });
  it("flags rejected tokens without leaking them or silently switching accounts", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "KGAT_rejected_token");
    vi.stubEnv("KAGGLE_USERNAME", "legacy-user");
    vi.stubEnv("KAGGLE_KEY", "legacy-key");
    const calls = fakeSources(401);
    const catalog = await collectCatalog();
    expect(calls.filter((call) => call.url.includes("www.kaggle.com"))).toHaveLength(1);
    expect(catalog.sources.find((source) => source.id === "kaggle")?.state).toBe("unavailable");
    expect(catalog.sources.find((source) => source.id === "kaggle")?.note).toContain("HTTP 401");
    expect(JSON.stringify(catalog)).not.toContain("KGAT_rejected_token");
  });
  it("treats absent or blank credentials as unconfigured", async () => {
    vi.stubEnv("KAGGLE_API_TOKEN", "  ");
    const calls = fakeSources();
    expect(kaggleConfigured()).toBe(false);
    const catalog = await collectCatalog();
    expect(calls.some((call) => call.url.includes("www.kaggle.com"))).toBe(false);
    expect(catalog.sources.find((source) => source.id === "kaggle")?.state).toBe("not-configured");
  });
});
