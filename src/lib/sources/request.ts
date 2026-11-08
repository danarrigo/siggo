export const sourceUserAgent =
  "SiggoCompetitionIndex/0.1 (personal discovery; public event metadata only)";

const headers = {
  "User-Agent": sourceUserAgent,
  Accept: "application/json, text/html",
};

export class SourceHttpError extends Error {
  readonly retryAt?: string;
  constructor(
    readonly status: number,
    retryAfter: string | null,
  ) {
    super(`Source returned HTTP ${status}`);
    if (retryAfter) {
      const time = /^\d+$/.test(retryAfter)
        ? Date.now() + Number(retryAfter) * 1000
        : Date.parse(retryAfter);
      if (Number.isFinite(time) && time > Date.now() && time <= 8.64e15)
        this.retryAt = new Date(time).toISOString();
    }
  }
}

export async function request(url: string, authorization: string | undefined, budget: AbortSignal) {
  const response = await fetch(url, {
    headers: { ...headers, ...(authorization ? { Authorization: authorization } : {}) },
    signal: AbortSignal.any([budget, AbortSignal.timeout(18_000)]),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new SourceHttpError(response.status, response.headers.get("retry-after"));
  }
  return response;
}

export function sourceFailure(error: unknown) {
  if (error instanceof Error) {
    if (/^Source returned HTTP \d+$/.test(error.message)) return error.message;
    if (error.name === "TimeoutError") return "Source request timed out";
    if (error.name === "AbortError") return "Source request interrupted";
  }
  return "Could not validate or fetch this source";
}
