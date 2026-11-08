# Siggo

[Live app](https://siggo.vercel.app) - private GitHub sign-in required.

A personal competition radar for ML/data science, hackathons, and research challenges. Built with Next.js App Router, TypeScript, Tailwind, shadcn/ui (Base UI), Neon Postgres, Drizzle, and Better Auth.

## Run locally

Requires Node 22.17+ (Node 22 LTS).

```bash
npm ci
npx playwright install chromium # Public Zindi page rendering in local development
npm run dev
# http://localhost:3000
```

No credentials are needed to try the app locally. It fetches real public source metadata and saves your profile, shortlist, and feedback in this browser. Local mode is explicitly labeled, does not provide cross-device sync, and is **never enabled in production or on Vercel**. There are no fictional fallback competitions. If sources fail, the UI shows the gap.

Defaults: Indonesia, student, DGX Spark, games/simulation and finance, online-first, free entry preferred, and funded travel for finals. Everything is editable. Team, student, travel-funding, and hardware preferences remain profile context where source data cannot verify them; they are not invented eligibility signals.

## What works

- Active/upcoming catalog, search, category/source filters, relevance/deadline sorting, and pagination.
- Compact directory rows with source-provided thumbnails, visible dates/rewards, and saved-item controls. Missing or broken images use a neutral placeholder, not generated artwork.
- Explainable interest and participation ranking, with shortlist-based topic nudges.
- Saving and marking an opportunity less relevant; neither deletes it from All.
- New-since-last-visit badges and a New view, with an explicit Mark all seen action. Discovery dates survive source refreshes and outages; the first visit establishes a baseline.
- In-app reminders for saved registration, submission, challenge-end, and event-end dates in the next seven days. No email or push delivery; unlisted closing times stay unlisted.
- In-app deadline-change alerts in the reminders bell. Saved listings establish a baseline; later observed dates are compared separately by deadline type. Unread changes coalesce until marked read. Omitted dates and missing listings are not treated as confirmed deadline removals.
- Saved > Archive keeps past saved opportunities and editable notes using private, last-known snapshots, even after a source stops listing them. A missing listing alone never means ended; its snapshot stays under Current in Saved, not back in public discovery. Older bookmarks without retained metadata still expose their notes, without invented details.
- Private manual listings with editable calendar dates and deletion, plus private notes on any competition. Personal links are never scraped or refreshed automatically; ended personal listings remain accessible through Manage personal listings.
- Editable interests and participation preferences, persisted locally or to Postgres when signed in.
- Source health, scope limitations, last successful checks, and preserved snapshots on source failure.
- Distinct registration, submission, challenge-end, and event-end fields, shown in Asia/Jakarta (WIB).
- Private GitHub login and cross-device workspace persistence when configured.
- Protected daily catalog synchronization plus manual refresh, with a one-minute minimum between checks.

Email/push notifications, automated submissions, team matching, and worldwide completeness are not part of this version.

## Connect Kaggle with an API token

No credential download is needed. At [Kaggle API settings](https://www.kaggle.com/settings/api), choose **Generate New Token**, then put the token in the project's git-ignored `.env.local`:

```dotenv
KAGGLE_API_TOKEN=your-token-here
```

Restart the dev server and refresh the catalog. The token stays server-side and is sent only to Kaggle as a Bearer credential. On Vercel, add the same variable in project environment settings, redeploy, and refresh sources. Never paste the token in chat or give it a `NEXT_PUBLIC_` prefix.

A token takes precedence over legacy username/key credentials. Invalid or expired tokens show an unavailable source; the app does not silently switch to another account's legacy credentials. Real connectivity still needs to be verified with your token.

## Actual coverage

| Source                                                                        | Integration                                              | Limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Kaggle](https://github.com/Kaggle/kaggle-api/blob/main/docs/competitions.md) | Official competition REST API                            | Set `KAGGLE_API_TOKEN` (recommended), or legacy `KAGGLE_USERNAME` + `KAGGLE_KEY`. Follows pages until an empty page, with a 20-page cap flagged if reached. Registration deadlines/eligibility are not inferred from submission deadlines.                                                                                                                                                                                                                                                                                                            |
| [EvalAI](https://eval.ai/api/docs/)                                           | Official API, present/future, approved/public            | Follows same-origin pagination, up to 20 pages per listing. Challenge end is not assumed to be a phase submission cutoff. Platform billing type is not treated as participant entry fee.                                                                                                                                                                                                                                                                                                                                                              |
| [DrivenData](https://www.drivendata.org/competitions/)                        | Public active directory                                  | Includes ongoing practice/benchmark tasks and cross-listed external events. Only explicitly published UTC times are parsed.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [AIcrowd](https://www.aicrowd.com/challenges?status=running)                  | Public running and starting-soon directories             | Follows both directories until an empty page, with a 20-page cap per directory and a shared 90-second request budget. Waits ten seconds between requests. Incomplete scans are marked Limited; relative day counts are not invented deadlines.                                                                                                                                                                                                                                                                                                        |
| [MLH](https://www.mlh.com/)                                                   | Current season's public embedded event metadata          | Rolls the season forward in July. Only that season's upcoming/ongoing events, not all independent hackathons. Event dates are not submission deadlines.                                                                                                                                                                                                                                                                                                                                                                                               |
| [Zindi](https://zindi.world/competitions)                                     | Rendered public directory/timelines; calendar fallback   | Open Challenges only, including upcoming entries; past/practice-only listings are excluded. Reads public pages anonymously, at least three seconds between navigations/load-more actions, honoring crawler rules and Retry-After. Stops at access/rate blocks and server errors. Partial scans remain Limited; licensed-calendar-only fallback remains Curated feed. Unpublished timezone precision is never invented. Platform permission remains unverified; see the source-access note.                                                            |
| [Codabench](https://www.codabench.org/)                                       | Official public API plus open calendar                   | Paginates the public directory (200 per page, 100-page safety bound) and persists phase-check progress in the catalog snapshot. Active refreshes and older discoveries alternate, avoiding the former first-40 cutoff. All API requests are spaced at least one second apart, within a four-minute source budget. Honors Retry-After across refreshes and stops on access/rate limits or server errors. Closed entries become eligible for recheck after 30 days; current calendar candidates are rechecked. Pending or failed checks remain Limited. |
| [Devpost](https://devpost.com/hackathons)                                     | Open calendar where available; otherwise manual browsing | [Terms](https://info.devpost.com/terms) prohibit automated site collection. Only licensed calendar entries are imported; no direct scraper or undocumented API is used. If the calendar has no current entries, the source remains Browse manually.                                                                                                                                                                                                                                                                                                   |

The retired main CodaLab service is no longer listed as a source; Codabench is its active successor.

Research coverage includes EvalAI, AIcrowd, and Codabench. Zindi uses a low-rate public-page reader under the owner's working assumption for public metadata, not verified platform permission or an official API contract; see [source-access evidence](docs/research/source-access.md). Independent conference/shared-task sites, other CodaLab/Codabench instances, and other hackathon platforms are **not exhaustively indexed**. Source accessibility and policies can change; failures are surfaced, not bypassed. Zindi renders public pages with Playwright and bundled serverless Chromium on the existing Vercel plan; no external browser service is used. Only public title/link/reward/date facts are imported, with a generic description and no copied artwork or participant data. The browser blocks known account-only participation requests, writes, analytics and unapproved hosts; app secrets are not inherited into its environment. Temporary profiles are removed after each run. Codabench public listings include historical entries and omit phase ends, so discovering the entire directory is not the same as verifying every competition as active. Phase checks are progressive, not an instantaneous completeness guarantee; the coverage panel reports directory size, completed checks, and remaining work. Manual refresh may take up to four minutes. Internal check history stays server-side, uses the existing JSONB snapshot, and needs no new service or migration.

The [MLContests calendar](https://github.com/mlcontests/mlcontests.github.io) is openly licensed under [GPL-3.0](https://github.com/mlcontests/mlcontests.github.io/blob/master/LICENSE), with attribution linked in Source coverage. Only its relevant Zindi/Codabench/Devpost metadata is imported. Organizer landing pages can remain separate from distinct official track URLs; the server never fetches those organizer hosts as API endpoints. Calendar prize figures are curator estimates. [Zindi's terms](https://zindi.world/terms) have broad content-use restrictions, not Devpost's explicit automated-scraping language. The owner's public-metadata assumption is not confirmation of platform permission.

A calendar day is not an exact instant: date-only deadlines display the missing time/timezone explicitly and are conservatively retained until that day could have ended everywhere. Official phase end dates are not silently relabeled as registration or submission cutoffs. In local preview, the latest public snapshot is retained in server memory for failure recovery; durable snapshots across restarts require the configured database.

Public artwork comes from listing/API metadata; no additional page crawling is needed. When Kaggle's API omits thumbnails, its numeric competition ID supplies the stable official Open Graph preview URL. Those previews load directly in the browser because Kaggle redirects to temporary signed CDN assets; signed destinations are never stored, and API tokens stay server-side. Other remote images are optimized lazily with a strict asset-host/path allowlist, no proxy redirects, and a 5 MB response limit. Catalog image fields reject unapproved, private, signed, or remote SVG URLs, using a neutral "No image" placeholder instead. Existing snapshots without image fields remain compatible until the next sync. Codabench logo signing parameters are removed only for its verified publicly readable logo bucket. Restart the dev server after changing the shared image-host allowlist so Next's optimizer loads the new configuration.

Only public event metadata is collected, with source attribution and official links. Descriptions are stripped of HTML, outgoing links require HTTPS, and redirects/untrusted pagination targets are not followed. Deduplication uses canonical URLs rather than similar titles, so tracks and editions stay distinct.

## Source control and automatic deployments

The private repository is [danarrigo/siggo](https://github.com/danarrigo/siggo). Pushes to `main` run GitHub checks and automatically deploy through the connected Vercel project; pull requests get checks and Vercel previews. CI and deployment run independently.

Production credentials stay in Vercel and git-ignored local environment files, not GitHub Actions. Preview deployments do not receive the production database or private OAuth credentials.

## Deploy privately on Vercel

Production intentionally shows a setup screen until private authentication is configured. Do not make database or API secrets `NEXT_PUBLIC_*` variables.

1. Authenticate the Vercel CLI and create/deploy the project from this directory:

   ```bash
   npx vercel login
   npx vercel
   ```

2. Add [Neon](https://vercel.com/marketplace/neon) through the Vercel Marketplace, or create a Neon Postgres database and set `DATABASE_URL`. Use the Free plan and Singapore to match the function region configured in `vercel.json`. Disable Neon's optional managed Auth and Realtime; this app already manages authentication with Better Auth. Copy `.env.example` to `.env.local` for local database setup; never commit it.

3. Register a [GitHub OAuth app](https://github.com/settings/developers) for this deployment. Set the application URL to your stable Vercel production domain and the callback to:

   ```text
   https://YOUR-DOMAIN/api/auth/callback/github
   ```

   Use a separate OAuth app if developing authenticated flows at `http://localhost:3000`.

4. Set the following Vercel production environment variables and the corresponding local values needed for migrations:

   | Variable                        | Value                                                                    |
   | ------------------------------- | ------------------------------------------------------------------------ |
   | `DATABASE_URL`                  | Neon Postgres connection string, including TLS settings                  |
   | `BETTER_AUTH_URL`               | Exact production origin, such as `https://your-app.vercel.app`           |
   | `BETTER_AUTH_SECRET`            | Strong random secret, at least 32 characters                             |
   | `GITHUB_CLIENT_ID`              | GitHub OAuth app client ID                                               |
   | `GITHUB_CLIENT_SECRET`          | GitHub OAuth app client secret                                           |
   | `AUTH_ALLOWED_EMAIL`            | The email returned by your GitHub account; only this identity is allowed |
   | `CRON_SECRET`                   | A separate strong random secret, at least 32 characters                  |
   | `KAGGLE_API_TOKEN`              | Optional Kaggle API token; no downloaded credential file needed          |
   | `KAGGLE_USERNAME`, `KAGGLE_KEY` | Alternative legacy credential pair; ignored when a token is set          |

   Generate secrets separately with `openssl rand -hex 32`. Keep them out of terminal history, screenshots, and chat.

5. Apply the checked-in, generated migration to the configured database:

   ```bash
   npm run db:migrate
   ```

6. Redeploy with the environment configured:

   ```bash
   npx vercel --prod
   ```

7. Sign in, confirm the source coverage panel, save an item, and verify it appears on another signed-in device. The first signed-in load initializes the catalog. Validate the Kaggle integration after adding its credentials.

`vercel.json` schedules `/api/sync` daily at 23:00 UTC (06:00 WIB), compatible with classic Vercel Hobby Cron limits. Hobby timing is not exact: expect the invocation between 06:00 and 06:59 WIB. Vercel sends `CRON_SECRET` in the Bearer header. The endpoint rejects missing/incorrect secrets; manual refresh requires your session and canonical origin. Catalog reads do not refresh on every page view. The UI labels sources stale after 26 hours. More frequent stable Cron schedules require an appropriate Vercel plan; the newer Vercel Schedules service has different limits and is currently beta.

Neon and GitHub OAuth require account-owner setup. They are not silently provisioned or replaced with fake authentication. Deployment authorization, live OAuth, database persistence, and an actual scheduled invocation must be verified with the real credentials after setup.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm audit
```

GitHub Actions runs formatting, lint, type checks, unit tests, desktop/mobile E2E, and a production build on main pushes and pull requests. It uses no production credentials or database. Deployment is handled separately by Vercel's GitHub integration; no Vercel token is stored in GitHub Actions.

Playwright covers desktop and mobile discovery, filtering, empty states, separate date semantics, closed-registration visibility, saved state across reloads, feedback, profile edits, source gaps, unauthorized endpoints, and WCAG AA accessibility checks. E2E starts an isolated local server with `SIGNAL_E2E=1` and generated, clearly labeled test data. Credentials are cleared in that server's environment; tests never write to a real database or call competition platforms. Stop any existing dev server for this directory before running E2E.

`SIGNAL_E2E` cannot enable test data or bypass the setup/login gate in production or on Vercel. Fixtures are generated by `npm run fixtures`, ignored by git, and never used as live catalog fallbacks.

The security overrides in `package.json` patch vulnerable transitive minimatch/esbuild versions. ESLint stays on the version supported by Next's current plugin peer dependencies. `npm audit` should report zero vulnerabilities.

## Code map

- `src/lib/model.ts`: validated catalog and workspace domain types.
- `src/lib/ranking.ts`: deterministic, explainable personalization.
- `src/lib/workspace.ts`, `src/lib/workspace-store.ts`: personal listings, deadline reminders, visit tracking, and serialized local/cloud persistence.
- `src/lib/saved-competitions.ts`: private saved snapshots, archived listing recovery, and observed deadline changes.
- `src/lib/sources/`: source-specific parsing and bounded, failure-aware collection; `codabench.ts` owns resumable phase checks, `zindi.ts` owns public-page collection/fallback, `zindi-browser.ts` owns the isolated browser lifetime, and `request.ts` owns shared HTTP safety.
- `src/lib/server.ts`: public-source caching and durable catalog/workspace storage.
- `src/lib/auth.ts`, `src/lib/request-security.ts`: private login and mutation boundaries.
- `src/db/schema.ts`, `drizzle/`: database schema and generated migrations.
- `src/components/`: discovery UI and accessible shadcn/Base UI dialogs.

Catalog snapshots are stored atomically as JSONB because this is a single-user, client-filtered catalog, not a multi-tenant search service. Failed sources retain their prior records with explicit unavailable/stale state. Workspace writes are serialized per browser; concurrent content edits from different devices are last-write-wins for the explicitly supplied fields. Source refreshes update saved snapshots even while the owner is away. Tracking and read acknowledgements use compare-and-swap retries and cannot overwrite concurrent notes, bookmarks, or visit markers; stale clients cannot replace server-owned tracking fields. Snapshots and notes fit the existing workspace JSONB, so these features need no database migration. The total workspace limit is one million serialized characters; if automatic tracking reaches it, existing details remain intact and a warning asks the owner to free space. Dates or changes never observed by an available source cannot be recovered retroactively.
