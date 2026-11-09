# Free API options for Ask Siggo

Research date: **2026-11-09**. This note records provider selection; see [Ask Siggo](../assistant.md) for the implementation and setup. No provider key or live inference request was used during this research.

## Recommendation

Start with **GroqCloud's Free plan** for a small, authenticated, read-only Ask Siggo feature. Keep the account on Free, do not enable paid billing or automatic paid-provider fallback, and treat quota exhaustion as a normal temporary-unavailable state. Existing Vercel/Neon infrastructure is sufficient; no vector database or external agent service is needed for an initial catalog-grounded assistant.

A candidate model is `openai/gpt-oss-120b`, listed as a production model in Groq's [supported models](https://console.groq.com/docs/models). It is hosted through Groq, not the paid OpenAI API. Actual access and free quotas must be confirmed in the owner's account before deployment; this research is not a live connectivity test.

## Groq: primary-source findings

- **Free versus paid:** the [billing FAQ](https://console.groq.com/docs/billing-faqs) distinguishes Free from Developer. Upgrading requires a valid payment method and enables usage billing. Remaining on Free is essential to the zero-budget plan; do not interpret “no immediate charge” on upgrade as free Developer usage.
- **Limits:** [rate limits](https://console.groq.com/docs/rate-limits) apply at organization level and can include requests and tokens per minute/day. The provider explicitly says the account's [Limits page](https://console.groq.com/settings/limits) is authoritative. Exceeding a limit returns HTTP 429; Retry-After can indicate when to retry. Do not advertise an unlimited service or freeze a generic documentation table as a guaranteed personal allowance.
- **No training by default:** section 4.2 of the [Services Agreement](https://console.groq.com/docs/legal/services-agreement) says Groq is not permitted to use inputs or outputs for model training or fine-tuning unless the customer explicitly permits or instructs it.
- **Retention is not the same as training:** [Your Data in GroqCloud](https://console.groq.com/docs/your-data) says inference data is not retained by default, but reliability/abuse investigations may retain inputs and outputs for up to 30 days, with legal exceptions. Usage metadata is always collected and excludes input/output content.
- **Privacy control:** the data documentation says all customers can enable Zero Data Retention in [Data Controls](https://console.groq.com/settings/data-controls). Enable it for this use case. The Services Agreement refers to eligible customers, so confirm the actual account control rather than promising a setting is already enabled.
- **Data location:** the same data documentation says retained customer data is held in US GCP buckets. This is remote processing, not inference on the user's DGX Spark or data confined to the application's Singapore region.
- **Model choice:** the [GPT-OSS 120B page](https://console.groq.com/docs/model/openai/gpt-oss-120b) documents a 131,072-token context window and reasoning support. A large context window does not override the account's much smaller rate/token allowances; send a compact relevant catalog subset, not the entire catalog every turn.
- **Credentials:** the [quickstart](https://console.groq.com/docs/quickstart) uses `GROQ_API_KEY`. Create a dedicated key through the owner's console and store it server-side. Do not reuse harness credentials, GitHub tokens, Better Auth secrets, or the Kaggle key.

A provider community FAQ about free-plan charging appeared in search results, but its fetched representation did not preserve the original answer. It is not used as the basis for pricing or billing guarantees here. The primary billing documentation and account settings remain the authority.

## Alternatives

| Option                        | Current evidence                                                                                                                                                                                                                                                                                                                                                 | Assessment                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini API unpaid tier        | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) offers limited free input/output for eligible models. [Terms](https://ai.google.dev/gemini-api/terms) say unpaid inputs/responses may be used to improve products and reviewed by humans; they warn against sensitive, confidential, or personal information. Regional and age restrictions also apply. | A possible public-data alternative, but a weaker default for a private personal-workspace assistant. Paid-service privacy terms should not be assumed for an unpaid account.                                                                    |
| GitHub Models                 | The [official retirement notice](https://docs.github.com/en/github-models) states the service, including its inference API, was fully retired on July 30, 2026.                                                                                                                                                                                                  | Not a current free API option. Existing GitHub sign-in does not provide a usable replacement API entitlement.                                                                                                                                   |
| Self-hosting on the DGX Spark | Uses existing hardware rather than a paid model API.                                                                                                                                                                                                                                                                                                             | Could offer local control, but would require secure connectivity from Vercel, model serving, and an available machine. Not the simplest first deployment, and not zero operational cost. No tunnel or public GPU endpoint has been provisioned. |

## Initial implementation requirements

1. Require the existing permitted-user session and same-origin checks before any model request.
2. Keep the provider key in server-only environment variables, never `NEXT_PUBLIC_*`, Git, HTML, or logs.
3. Ground answers in selected catalog facts with source links and freshness. Unknown fees, eligibility, travel support, and date precision must remain unknown.
4. Treat source text and chat messages as untrusted input, not tool instructions. Begin without arbitrary browsing, code execution, submissions, or workspace mutations. Do not introduce a Devpost fetch through the AI feature.
5. Do not automatically send notes, saved lists, account identity, or the full workspace. Personal preferences remain excluded; no profile-sharing option is included. Warn that the question itself is sent to the provider.
6. Keep chat responses out of shared caches. Start without durable chat history unless requested.
7. Bound question length, context, reply tokens, and request duration. Handle rate limits without automatic paid fallback or retry loops.
8. Test with mocked provider responses and no live keys in CI. Verify model access, exact Free-plan limits, privacy controls, and live connectivity separately with the owner's dedicated key.

The API account, Free-plan settings, privacy controls, and key require owner setup and separate live verification. This research makes no claim of perpetual free availability or a production SLA.
