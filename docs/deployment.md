# Private deployment

[← Back to Siggo](../README.md)

Siggo runs on **Vercel Hobby + Neon Free**, with the application and database in Singapore. GitHub OAuth provides private workspace access. No external browser service, paid notification service, or separate job runner is required.

The live instance is [siggo.vercel.app](https://siggo.vercel.app) and requires the allowed GitHub account. The source code is open source under [MIT](../LICENSE); publishing the repository does not make the hosted catalog or personal workspaces public.

## 1. Create the Vercel project

From the repository root:

```bash
npx vercel login
npx vercel
```

Use Node 22. The checked-in [`vercel.json`](../vercel.json) selects `sin1` and defines the daily sync. Keep production credentials scoped to Production; preview deployments should not inherit the production database or OAuth secrets.

An unconfigured production deployment shows a setup gate, not the local demo mode. Missing or invalid authentication must not expose the catalog or personal workspace.

## 2. Connect Neon

Add [Neon through Vercel](https://vercel.com/marketplace/neon), or create a Neon Postgres database and configure `DATABASE_URL`.

- Choose the Free plan and Singapore region.
- Use a dedicated production database.
- Leave optional Neon Auth/Realtime disabled. Better Auth already owns application identity.
- Keep the connection string in Vercel environment settings and a git-ignored local environment file when running migrations.

The schema contains four authentication tables, a public-metadata catalog snapshot, and a private workspace table. See [Architecture](architecture.md).

## 3. Register GitHub OAuth

Create a GitHub OAuth app with these values:

| Setting                    | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Homepage URL               | Your exact production origin, such as `https://your-app.vercel.app` |
| Authorization callback URL | `https://your-app.vercel.app/api/auth/callback/github`              |

Set `AUTH_ALLOWED_EMAIL` to the email GitHub returns for the permitted account. Matching is case-insensitive. Use a separate OAuth app for local authenticated development, with the corresponding localhost origin and callback.

The OAuth app, Vercel project, database, and allowed account must be configured by their account owner. Siggo does not substitute fake authentication when a provider is unavailable.

## Environment variables

The variable names and local placeholders are in [`.env.example`](../.env.example).

| Variable                        | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                  | Neon connection string with TLS                                 |
| `BETTER_AUTH_URL`               | Exact application origin                                        |
| `BETTER_AUTH_SECRET`            | Independent secret of at least 32 characters                    |
| `GITHUB_CLIENT_ID`              | GitHub OAuth client ID                                          |
| `GITHUB_CLIENT_SECRET`          | GitHub OAuth client secret                                      |
| `AUTH_ALLOWED_EMAIL`            | Permitted GitHub account email                                  |
| `CRON_SECRET`                   | Independent secret of at least 32 characters for scheduled sync |
| `KAGGLE_API_TOKEN`              | Optional server-side Kaggle Bearer token                        |
| `KAGGLE_USERNAME`, `KAGGLE_KEY` | Legacy alternative; ignored when a token is set                 |

Generate each application secret separately:

```bash
openssl rand -hex 32
```

Store values directly in the appropriate environment settings. Never commit them, include them in screenshots or logs, or prefix them with `NEXT_PUBLIC_`. Do not store production credentials in GitHub Actions.

## 4. Apply migrations and deploy

With the intended database configured in a git-ignored local environment file:

```bash
npm run db:migrate
npx vercel --prod
```

Apply the checked-in generated migrations; do not edit their SQL or metadata by hand. Saved history, notifications, source progress, and provenance use the existing JSONB records and do not need separate services.

Zindi uses bundled serverless Chromium on Vercel. Runtime assets are explicitly traced in [`next.config.ts`](../next.config.ts); a deployment must retain those files, not rely on a locally installed browser.

## Scheduled synchronization

```text
0 23 * * *  /api/sync
```

The schedule is **23:00 UTC**, or **06:00 WIB**. Vercel Hobby timing is approximate: expect a run between **06:00 and 06:59 WIB**, not an exact minute.

- Scheduled `GET /api/sync` requires `Authorization: Bearer <CRON_SECRET>`; Vercel supplies it for the configured cron.
- Manual refresh requires an authenticated session and the canonical origin, with a one-minute minimum between checks.
- Source reads do not run on every page view. A successful sync replaces the durable public snapshot only after saved-item tracking has reconciled.
- Codabench checks can take up to four minutes. The relevant routes allow up to five minutes.
- Source coverage becomes **Stale** after 26 hours without a successful check.

Verify an actual scheduled invocation separately from an authenticated manual sync. A successful manual request does not prove the scheduler ran. More frequent schedules must respect the plan's current limits.

## Release workflow

The [GitHub repository](https://github.com/danarrigo/siggo) is connected to Vercel:

- Pushes to `main` trigger GitHub checks and an automatic production deployment.
- Pull requests run checks. Preview availability depends on Vercel permissions and deployment approval; previews must not receive production credentials.
- CI and deployment are independent. A green build is not proof of a healthy deployment, and deployment does not wait for CI to succeed.

## Verification checklist

- [ ] Anonymous visitors see the sign-in gate, not catalog or workspace data.
- [ ] Only the allowed GitHub account can access the workspace.
- [ ] OAuth returns to the intended production origin.
- [ ] A real bookmark and note persist after reload and on another signed-in device.
- [ ] Kaggle works with the configured token, or accurately shows **Needs key**.
- [ ] Source coverage distinguishes partial, stale, and unavailable data.
- [ ] Anonymous cron requests return **401**; cross-origin mutations return **403**.
- [ ] Manual sync updates the durable catalog without changing profile, notes, bookmarks, or personal listings.
- [ ] A scheduled invocation appears in the provider's logs.
- [ ] Both GitHub checks and the intended Vercel production deployment succeed.

Use the owner's real sign-in for workspace verification. Do not create synthetic users or fixture records in production.
