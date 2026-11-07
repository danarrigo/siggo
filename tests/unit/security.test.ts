import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedEmail, localPreview } from "../../src/lib/auth";
import { sameOrigin } from "../../src/lib/request-security";

afterEach(() => vi.unstubAllEnvs());
function local() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("DATABASE_URL", "");
}
describe("private workspace boundary", () => {
  it("accepts matching browser Host only in local preview", () => {
    local();
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/workspace", {
          headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
        }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/workspace", {
          headers: { host: "127.0.0.1:3100", origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(sameOrigin(new Request("http://localhost:3100/api/workspace"))).toBe(false);
  });
  it("never enables preview in production or on Vercel", () => {
    local();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SIGNAL_E2E", "1");
    expect(localPreview()).toBe(false);
    local();
    vi.stubEnv("VERCEL", "1");
    expect(localPreview()).toBe(false);
  });
  it("uses the configured canonical origin instead of a spoofed Host", () => {
    for (const key of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "AUTH_ALLOWED_EMAIL",
    ])
      vi.stubEnv(key, "configured");
    vi.stubEnv("BETTER_AUTH_URL", "https://siggo.example");
    expect(
      sameOrigin(
        new Request("http://internal/api/workspace", {
          headers: { origin: "https://siggo.example", host: "evil.example" },
        }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(
        new Request("http://internal/api/workspace", {
          headers: { origin: "https://evil.example", host: "evil.example" },
        }),
      ),
    ).toBe(false);
  });
  it("denies access by default and compares the exact allowlisted email", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAIL", "");
    expect(allowedEmail("owner@example.com")).toBe(false);
    vi.stubEnv("AUTH_ALLOWED_EMAIL", "Owner@Example.com");
    expect(allowedEmail("owner@example.com")).toBe(true);
    expect(allowedEmail("other@example.com")).toBe(false);
  });
});
