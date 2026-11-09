# Ask Siggo

[← Back to Siggo](../README.md)

Ask Siggo is an **optional, read-only catalog assistant** using GroqCloud. Open **Ask Siggo** beside the directory heading to explore topics, compare listings, or ask what a date means. It does not submit entries, browse the web, refresh sources, or edit your workspace.

## What it knows

The server reads the existing durable catalog, selects at most eight non-ended public-source listings using keyword matching across recent questions, then asks Groq's `openai/gpt-oss-120b` model for a concise answer. This is Groq-hosted inference, not the paid OpenAI API.

- The selection is capped at 10,000 serialized record characters. Long descriptions and rewards are shortened for context.
- Recent questions help select records for follow-ups. This is keyword retrieval, not semantic search or an exhaustive catalog query. Event titles, topics, and source names work best; unrelated wording or another language can miss relevant listings.
- Each reply reports its selection size and catalog snapshot time. A snapshot time does not prove every source was verified then.
- Source links come from the server's selected catalog records, never model-invented destinations. Indirect metadata keeps its provider credit and listing link.
- Registration, submissions, challenge ends, event ends, and unverified provider cutoffs remain distinct. Date-only values have no invented closing time or timezone.
- Unknown fees, eligibility, travel support, and other rules remain unknown. AI can still make factual mistakes: check the linked listing and organizer rules before entering.

No source requests, including Devpost requests, are introduced by chat. An unavailable durable snapshot fails closed rather than triggering collection.

## Privacy

The browser sends only your current question and up to two recent question/reply pairs to Siggo's authenticated endpoint. The server adds a small, explicit projection of catalog facts. No account identity, notes, saved/dismissed lists, personal listings, preferences, images, or internal collector progress is included automatically.

**Anything you type into chat is sent to Groq**, including personal information you choose to put in the question. Avoid secrets or sensitive information. Catalog text and conversation history are treated as untrusted data, not instructions to gain privileges.

Chat history lives only in the current page's memory: at most six turns are displayed, and **Clear chat** or a reload removes them. Closing/reopening the dialog preserves this in-memory history. There is no durable chat history, browser-storage copy, analytics integration, or shared response cache. User questions and provider errors are not logged by this feature.

Groq's [Services Agreement](https://console.groq.com/docs/legal/services-agreement) prohibits training on inputs/outputs without customer permission. Its [data documentation](https://console.groq.com/docs/your-data) describes temporary reliability/abuse retention and legal exceptions. Enable **Zero Data Retention** in your account and confirm it is available and enabled. Groq processes remotely; this does not run on your DGX Spark or guarantee Singapore-only processing. See the [provider research](research/ai-api-options.md).

## Enable it

1. Create your own [Groq account/API key](https://console.groq.com/keys). Use a dedicated Siggo key and keep the organization on the **Free** plan. Do not upgrade billing or add a paid fallback. Confirm model availability and current limits in the account's [Limits page](https://console.groq.com/settings/limits).
2. Enable Zero Data Retention in [Data Controls](https://console.groq.com/settings/data-controls), and review the provider's current terms.
3. Set **`GROQ_API_KEY`** as a server-only variable. For hosted Siggo, scope it to Vercel **Production only**, then redeploy. For authenticated local development, use a git-ignored `.env.local` and restart the server.
4. Use the existing permitted GitHub sign-in. Credential-free local preview cannot make inference calls, even if a key is present. An unconfigured assistant explains setup; the directory remains usable without AI.

Never paste a key into chat, Git, screenshots, logs, `NEXT_PUBLIC_*`, or GitHub Actions. Do not reuse harness keys, OAuth secrets, or another provider's credentials.

Siggo cannot determine your billing plan from the API key. Remaining on Groq Free is an owner configuration requirement, not an application-level guarantee that a key from a paid organization cannot incur charges. Free availability and quotas may change.

## Limits and failures

- Questions: **800 characters**; request history: at most five alternating user/assistant messages and 7,000 content characters; streamed request bodies: 32,000 bytes maximum.
- App allowance: **20 request attempts per permitted user per UTC day**, at least **15 seconds apart**. Provider failures and stopped requests can still consume an attempt. The app allowance is independent of Groq's organization-level token/request quotas.
- A single conditional Postgres upsert reserves each attempt across devices and serverless instances. Only operational counters are stored under server-owned `assistantUsage` in the existing workspace JSONB; no question text is persisted or sent back through workspace APIs. No migration or new service is required.
- One provider request per question, at most 1,200 completion tokens including model reasoning, and a 25-second provider timeout. Context limits do not override the account's token allowance.
- Quota exhaustion, provider errors, cancellation, and invalid/truncated answers are shown honestly. The question is kept for a manual retry; there are no automatic retry loops, model/provider fallbacks, or fake generated answers.
- Replies are plain text. References are validated against the selected records; model URLs/HTML and out-of-range citations are rejected. JSON schema validation does not establish factual correctness.

## Development and verification

`tests/unit/assistant*.test.ts` covers request validation, context minimization, citation checks, provider failures, authentication, origins, snapshot-only reads, and atomic quota SQL. `tests/e2e/assistant.spec.ts` covers desktop/mobile accessibility, sources, private-data exclusion, cancellation, ephemeral history, quota errors, and the real unauthenticated API gate.

Tests use mocked Groq responses and fictional catalog data. Playwright clears `GROQ_API_KEY`; its local fixture UI does not bypass the endpoint's sign-in requirement. Live model access, Free-plan settings, Zero Data Retention, and a real answer require separate owner-account verification after setup.
