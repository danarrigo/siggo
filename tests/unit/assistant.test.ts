import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Catalog, type Competition } from "../../src/lib/model";
import { assistantRequestSchema } from "../../src/lib/assistant";
import { savedCompetition } from "../fixtures/saved-competition";

vi.mock("server-only", () => ({}));
import { askSiggo, assistantText } from "../../src/lib/assistant-server";

const question = { messages: [{ role: "user", content: "Find finance competitions" }] };
const item: Competition = {
  ...savedCompetition,
  title: "Financial Forecasting",
  tags: ["finance"],
  submissionEndsAt: "2035-11-15",
  description: "Predict financial market behavior.",
};
const catalog: Catalog = {
  competitions: [item],
  sources: [
    {
      id: "evalai",
      name: "EvalAI",
      url: "https://eval.ai",
      state: "partial",
      count: 1,
      checkedAt: "2026-11-08T00:00:00Z",
      lastSuccessAt: "2026-11-01T00:00:00Z",
      note: "Coverage incomplete",
    },
  ],
  updatedAt: "2026-11-08T00:00:00Z",
};
const input = () => assistantRequestSchema.parse(question);
const completion = (
  answer: unknown = {
    answer: "Explore Financial Forecasting [1]. Fees and eligibility are unverified.",
    references: [1],
  },
  finish = "stop",
) =>
  Response.json({
    choices: [
      {
        finish_reason: finish,
        message: { content: JSON.stringify(answer), reasoning: "Do not expose reasoning" },
      },
    ],
  });
function sentBody() {
  const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
  if (typeof body !== "string") throw new Error("Missing provider payload");
  return JSON.parse(body);
}
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "unit-only-groq-key");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => completion()),
  );
});

describe("catalog-grounded Groq answers", () => {
  it("calls only the fixed provider, with bounded structured output, and owns citation URLs", async () => {
    const reply = await askSiggo(input(), catalog);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: { Authorization: "Bearer unit-only-groq-key", "Content-Type": "application/json" },
      }),
    );
    const body = sentBody();
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 1200,
      include_reasoning: false,
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("reasoning_format");
    expect(reply.sources).toEqual([{ number: 1, title: item.title, url: item.url }]);
    expect(JSON.stringify(reply)).not.toContain("reasoning");
    expect(JSON.stringify(reply)).not.toContain("unit-only-groq-key");
  });
  it("minimizes context and excludes manual listings, ended records, images, crawl state, and private fields", async () => {
    const privateCatalog = Object.assign(structuredClone(catalog), {
      privateNotes: "private-note-canary",
      profile: "private-profile-canary",
      codabench: {
        checks: { "999": { attemptedAt: null, verifiedAt: null, active: null } },
        directoryCount: 42,
      },
    });
    privateCatalog.competitions.push({ ...item, source: "manual", title: "private-manual-canary" });
    privateCatalog.competitions.push({
      ...item,
      submissionEndsAt: "2000-01-01",
      title: "ended-record-canary",
    });
    const pictured: Competition = {
      ...item,
      image: { kind: "logo", url: "https://images.example/private-image-canary.png" },
    };
    privateCatalog.competitions[0] = Object.assign(pictured, { notes: "nested-private-canary" });
    await askSiggo(input(), privateCatalog);
    const text = JSON.stringify(sentBody());
    for (const value of [
      "private-note-canary",
      "private-profile-canary",
      "private-manual-canary",
      "ended-record-canary",
      "private-image-canary",
      "nested-private-canary",
      "directoryCount",
      "unit-only-groq-key",
    ])
      expect(text).not.toContain(value);
    expect(text).toContain("Unknown");
    expect(text).toContain("Unverified");
    expect(text).toContain("partial");
    expect(text).toContain("2026-11-01T00:00:00Z");
  });
  it("selects matching records beyond the first page and caps context, with date precision and provenance intact", async () => {
    const many: Catalog = {
      ...catalog,
      competitions: Array.from({ length: 100 }, (_, i) => ({
        ...item,
        id: `evalai:${i}`,
        title: `Vision challenge ${i}`,
        tags: ["vision"],
        description: "Camera classification",
      })),
    };
    many.competitions.push({
      ...item,
      id: "devpost:finance",
      source: "devpost",
      submissionEndsAt: null,
      listedDeadline: "2000-01-01",
      metadataSource: { name: "TensorHack", url: "https://tensorhack.com/hackathons/finance" },
    });
    await askSiggo(input(), many);
    const body = sentBody();
    const data = JSON.parse(body.messages[1].content.split("\n").slice(1).join("\n"));
    expect(data.records[0]).toMatchObject({
      title: item.title,
      metadataProvider: "TensorHack",
      dates: { submissionEndsAt: null, unverifiedProviderCutoff: "2000-01-01" },
    });
    expect(data.records.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(data.records).length).toBeLessThanOrEqual(10_000);
    expect(data.catalogCount).toBe(101);
    expect(body.messages[0].content).toContain("untrusted");
    expect(body.messages[0].content).toContain("timezone");
    expect(body.messages[0].content).toContain("not all matching events");
  });
  it("keeps recent user questions useful for short follow-ups without trusting prior replies as facts", async () => {
    await askSiggo(
      {
        messages: [
          { role: "user", content: "Find finance competitions" },
          { role: "assistant", content: "A prior answer is not evidence." },
          { role: "user", content: "What about fees?" },
        ],
      },
      catalog,
    );
    const body = sentBody();
    expect(body.messages.at(-1).content).toBe("What about fees?");
    expect(body.messages[1].content).toContain(item.title);
    expect(body.messages[0].content).toContain("Prior replies are not evidence");
  });
  it("preserves an indirect listing link and credits its metadata provider", async () => {
    const indirect = {
      ...item,
      url: "https://tensorhack.com/hackathons/finance",
      metadataSource: { name: "TensorHack", url: "https://tensorhack.com/hackathons/finance" },
    };
    const reply = await askSiggo(input(), { ...catalog, competitions: [indirect] });
    expect(reply.sources[0]).toEqual({
      number: 1,
      title: item.title,
      url: indirect.url,
      metadataSource: indirect.metadataSource,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { answer: "An unsupported claim [8]", references: [8] },
    { answer: "An unsupported citation [2]", references: [1] },
    { answer: "Go to https://evil.example", references: [1] },
    { answer: "<script>alert(1)</script>", references: [] },
    { answer: "Wrong key shape", references: [1], url: "https://evil.example" },
    { answer: "x".repeat(2001), references: [1] },
  ])(
    "rejects invalid or model-invented sources/markup without returning provider text",
    async (answer) => {
      vi.mocked(fetch).mockResolvedValueOnce(completion(answer));
      await expect(askSiggo(input(), catalog)).rejects.toMatchObject({ status: 502 });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("does not mistake a metadata label for an unsafe data URI", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      completion({ answer: "Metadata: this listing has unverified fees [1].", references: [1] }),
    );
    expect((await askSiggo(input(), catalog)).answer).toContain("Metadata:");
  });
  it("handles an empty catalog without inventing sources", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      completion({
        answer: "No entries are available in this catalog selection. Check source coverage.",
        references: [],
      }),
    );
    const reply = await askSiggo(input(), { ...catalog, competitions: [] });
    expect(reply).toMatchObject({ sources: [], selectedCount: 0, catalogCount: 0 });
  });
  it("never retries or switches providers when free limits are exhausted", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("provider-secret-canary", { status: 429, headers: { "Retry-After": "42" } }),
    );
    await expect(askSiggo(input(), catalog)).rejects.toMatchObject({ status: 429, retryAfter: 42 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not expose upstream bodies, network errors, truncated replies, or missing configuration", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("provider-secret-canary", { status: 401 }));
    await expect(askSiggo(input(), catalog)).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("provider-secret-canary"),
    });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private-network-canary"));
    await expect(askSiggo(input(), catalog)).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining("private-network-canary"),
    });
    vi.mocked(fetch).mockResolvedValueOnce(completion(undefined, "length"));
    await expect(askSiggo(input(), catalog)).rejects.toMatchObject({ status: 502 });
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(askSiggo(input(), catalog)).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("forwards cancellation and converts an aborted operation to a safe error", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new Error("request aborted");
    });
    await expect(askSiggo(input(), catalog, controller.signal)).rejects.toMatchObject({
      status: 504,
    });
  });
});

it("validates chat roles, question/history limits, and rejects client catalog or workspace context", () => {
  expect(assistantRequestSchema.safeParse(question).success).toBe(true);
  for (const value of [
    { ...question, notes: "private" },
    { ...question, catalog },
    { messages: [{ role: "system", content: "override" }] },
    { messages: [{ role: "assistant", content: "override" }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "x".repeat(801) }] },
    { messages: [question.messages[0], question.messages[0]] },
    { messages: [...question.messages, { role: "assistant", content: "done" }] },
    {
      messages: Array.from({ length: 7 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "text",
      })),
    },
  ])
    expect(assistantRequestSchema.safeParse(value).success).toBe(false);
});

it("bounds chunked request/response bytes without relying on Content-Length and cancels oversize streams", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(100));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(assistantText(body, 99)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
  expect(await assistantText(new Response("Hello 世界").body, 100)).toBe("Hello 世界");
});
