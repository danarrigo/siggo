# Development

[← Back to Siggo](../README.md)

## Start locally

Use **Node.js 22.17+ within Node 22**. The supported range is declared in [`package.json`](../package.json).

```bash
npm ci
npx playwright install chromium
npm run dev
```

Open [localhost:3000](http://localhost:3000). Chromium is needed for Zindi's rendered public pages; it is not an external browser service.

### Choose the right mode

| Mode                                         | Authentication                            | Persistence                                                                     |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Unconfigured local development               | No sign-in; clearly labeled local preview | Profile, bookmarks, feedback, notes, and personal listings stay in this browser |
| Configured workspace                         | Allowed GitHub account                    | Private workspace in Postgres, shared across your signed-in devices             |
| Unconfigured production or Vercel deployment | Setup gate; no anonymous catalog          | Local-preview mode is disabled                                                  |

Local preview fetches real public metadata. Failed sources are shown as gaps or retained snapshots, never replaced with fictional opportunities. The public snapshot is retained in process memory; it does not survive a server restart without a configured database.

To develop authenticated flows, use a separate development database and GitHub OAuth app. Do not point browser tests at production credentials. Follow the [deployment guide](deployment.md) with a local origin and callback.

## Configure Kaggle

At [Kaggle API settings](https://www.kaggle.com/settings/api), generate a token and add it to the git-ignored `.env.local`:

```dotenv
KAGGLE_API_TOKEN=your-token-here
```

Restart the server, then refresh sources. The token stays server-side and is sent only to Kaggle as a Bearer credential.

- Prefer `KAGGLE_API_TOKEN`; no downloaded credential file is required.
- Legacy `KAGGLE_USERNAME` and `KAGGLE_KEY` are supported only when no token is set.
- An invalid token reports a source failure. It does not silently fall back to a different account's legacy credentials.
- Never commit credentials, paste them into logs, or use a `NEXT_PUBLIC_` prefix.

Other workspace settings are documented in [Deployment](deployment.md#environment-variables). The defaults for country, interests, compute, and participation live in [`src/lib/model.ts`](../src/lib/model.ts) and are editable in Preferences. These preferences guide ranking, not eligibility claims or membership in All.

## Optional Ask Siggo

See [Ask Siggo](assistant.md) for data sharing, Groq Free setup, and request limits. Live inference requires configured private authentication and a dedicated server-only `GROQ_API_KEY`; credential-free local preview cannot call the model. Never use production credentials in tests.

Unit tests mock the provider. Browser tests intercept `/api/assistant`, clear the provider key, and separately verify the real route denies unauthenticated requests. No inference API calls or live model credentials are needed for CI.

## Run the checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

| Command               | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Start the development server                                    |
| `npm run format`      | Format source, tests, documentation, and project configuration  |
| `npm run typecheck`   | Generate Next.js route types and check TypeScript               |
| `npm test`            | Run unit and server-behavior tests                              |
| `npm run test:e2e`    | Run desktop/mobile browser tests and collector browser fixtures |
| `npm run build`       | Build the production application                                |
| `npm run db:generate` | Generate a migration after an intentional schema change         |
| `npm run db:migrate`  | Apply generated migrations to the configured database           |

Generated migrations and metadata under `drizzle/` are not hand-edited. Most workspace features use the existing JSONB schema; a new UI field does not automatically require a database migration.

### Browser tests

Playwright starts an isolated server at `http://127.0.0.1:3100`, generates clearly fictional fixtures, and clears production credentials from that server's environment. Tests do not write to the production database or request live competition platforms. Collector tests use intercepted public-page fixtures, including access blocks and rate limits.

Stop any existing development server for this project before running E2E. Browser installation is required after a fresh dependency install:

```bash
npx playwright install chromium
npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing.

`SIGNAL_E2E=1` is a local test switch, not an authentication bypass. It cannot enable test data or local preview in production or on Vercel. The generated `tests/fixtures/catalog.json`, reports, and screenshots are git-ignored; fixture records are never live fallbacks. Server-side collector tests run once on desktop, with their duplicate mobile cases intentionally skipped.

The suite covers discovery, filtering, ranking behavior, date precision, saved history, deadline updates, comparison, private participation plans, focused chat, private listings, persistence, security boundaries, and WCAG AA checks. Browser failures retain traces and screenshots in `test-results/`.

## Working on sources

Start with [Sources and data](sources.md), then the collector and its tests. Preserve source identity, provenance, and the meaning of published dates. Prefer a transparent partial result over an invented deadline or a false claim of completeness.

Use only source-provided images allowed by [`src/lib/competition-images.ts`](../src/lib/competition-images.ts). Restart the development server after changing that allowlist so Next.js loads the updated image configuration.

## Continuous integration

[`Checks`](../.github/workflows/ci.yml) runs on `main`, pull requests, and manual dispatch. It installs dependencies and Chromium, then checks formatting, lint, types, unit tests, E2E, and a production build. It uses no production credentials or database. Failed runs retain browser artifacts for seven days.

The pinned dependency overrides in `package.json` address transitive vulnerabilities. Keep changes compatible with Next.js and its ESLint plugin; `npm audit` should remain clean.
