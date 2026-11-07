import { authConfigured, localPreview } from "./auth";

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (authConfigured()) return origin === new URL(process.env.BETTER_AUTH_URL!).origin;
    // Next's dev server can normalize request.url to localhost even when visited
    // through 127.0.0.1. Trust Host only in the explicit, unconfigured local mode.
    const expected =
      localPreview() && request.headers.get("host")
        ? `${new URL(request.url).protocol}//${request.headers.get("host")}`
        : new URL(request.url).origin;
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
