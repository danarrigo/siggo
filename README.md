<div align="center">
  <img src="src/app/icon.svg" alt="Siggo icon" width="56" height="56" />
  <h1>Siggo</h1>
  <p><strong>Less searching. More building.</strong></p>
  <p>An open-source, private-by-default workspace for discovering and tracking ML competitions, hackathons, and research challenges.</p>
  <p>
    <a href="https://siggo.vercel.app">Open Siggo</a> ·
    <a href="#quickstart">Quickstart</a> ·
    <a href="docs/sources.md">Source coverage</a> ·
    <a href="docs/deployment.md">Deployment</a> ·
    <a href="LICENSE">MIT license</a>
  </p>
  <p><sub>Next.js · React · TypeScript · Neon Postgres · Better Auth</sub></p>
</div>

---

## Find the signal

Competition discovery should not mean checking eight tabs, losing a shortlist, or guessing what a deadline actually means. Siggo brings the catalog, the context, and your next steps into one compact directory.

| Discover                                                          | Decide                                                          | Keep track                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Search across sources, filter by category, and spot new listings. | See why an opportunity ranks for you, with unknowns called out. | Save opportunities, write private notes, and follow deadline changes. |

### Built around your shortlist

- **Four views, one workspace.** For you, All, Saved, and New keep discovery separate from what you are following. Personalization changes ranking, not membership in All.
- **Recommendations with reasons.** Interests, participation preferences, and feedback shape the order. They do not manufacture eligibility, free entry, or funded travel.
- **Dates that keep their meaning.** Registration, submission, challenge-end, and event-end dates stay distinct. Provider-listed cutoffs are labeled separately; a date without a time stays that way.
- **A shortlist that survives the source.** Saved details and notes remain available when a listing disappears. Ended opportunities move to Archive; missing does not automatically mean ended.
- **Updates without another inbox.** In-app reminders cover the next seven days, and saved deadline changes stay unread until acknowledged. No email or push notifications.
- **Compare without guessing.** Put two to four listings side by side, with distinct date types and honest unknowns. Comparison uses no AI quota. [Compare and prepare](docs/shortlist.md).
- **Track your participation.** Keep private Interested, Preparing, or Submitted progress and preparation tasks. Plans stay with saved archives and are not sent to AI.
- **Ask the catalog.** Optional Ask Siggo chat explores topics and explains dates with source links. **Ask about this** focuses on one current public listing. It is read-only, uses Groq, and excludes private notes, preferences, and plans. [Setup and privacy](docs/assistant.md).
- **Room for your own finds.** Add private listings and notes without publishing them to the shared catalog or automatically scraping their links.

The interface stays deliberately quiet: compact rows, source-provided images where available, and warm editorial highlights. A small curated set of organizer logos is matched to exact event URLs, displayed as logos rather than event covers, and linked to its source credit. Missing or unusable images retain neutral placeholders. No generated competition artwork.

## Eight integrations. Honest boundaries.

**Kaggle · EvalAI · DrivenData · AIcrowd · MLH · Zindi · Codabench · Devpost (indirect)**

Each integration exposes its scope, freshness, and failures. Codabench verification progresses across refreshes; a directory listing alone does not prove a competition is active.

**Devpost coverage is indirect.** Collectors read TensorHack metadata and the licensed MLContests calendar, never Devpost pages or APIs. Zindi and TensorHack collection, plus curated organizer-logo references, use owner-approved working assumptions, not verified publisher permission or reuse licenses. Coverage is not exhaustive.

[Explore source coverage, access assumptions, and date semantics →](docs/sources.md)

## Quickstart

Requires **Node.js 22.17+ within Node 22**.

```bash
npm ci
npx playwright install chromium
npm run dev
```

Open [localhost:3000](http://localhost:3000). Unconfigured local development uses live public sources and browser storage, with no sign-in required. Kaggle needs an optional server-side API token. No fictional records are used as live fallbacks.

**Production stays private.** Local preview is never enabled in production or on Vercel. GitHub sign-in, account restrictions, and durable cross-device storage require the [deployment setup](docs/deployment.md).

## Under the hood

| Layer                | Stack                                                                     |
| -------------------- | ------------------------------------------------------------------------- |
| Application          | Next.js App Router, React, TypeScript                                     |
| Interface            | Tailwind CSS, shadcn/ui with Base UI, IBM Plex Sans                       |
| Identity and storage | Better Auth, GitHub OAuth, Drizzle, Neon Postgres                         |
| Collection           | Bounded HTTP collectors; isolated Playwright/Chromium rendering for Zindi |
| Quality              | Vitest, Playwright, axe-core, ESLint, Prettier, GitHub Actions            |
| Hosting              | Vercel Hobby and Neon Free, Singapore region                              |

Public catalog snapshots and private workspaces are stored separately. Source refreshes reconcile saved details before publishing a new catalog; compare-and-swap retries protect tracking updates from overwriting concurrent notes or bookmarks.

[Read the architecture →](docs/architecture.md)

## Documentation

| Guide                                                              | What you will find                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [Development](docs/development.md)                                 | Local modes, Kaggle credentials, checks, and test fixtures              |
| [Compare and prepare](docs/shortlist.md)                           | Comparison, focused questions, and private participation plans          |
| [Ask Siggo](docs/assistant.md)                                     | Optional Groq chat, privacy, free-plan setup, and limits                |
| [Deployment](docs/deployment.md)                                   | Private GitHub sign-in, environment variables, Neon, and scheduled sync |
| [Sources and data](docs/sources.md)                                | Integration boundaries, provenance, image handling, and uncertainty     |
| [Architecture](docs/architecture.md)                               | Data flow, module map, persistence, and concurrency guarantees          |
| [Contributing](CONTRIBUTING.md)                                    | Development standards, source changes, and pull requests                |
| [Third-party notices](THIRD_PARTY_NOTICES.md)                      | Upstream UI notices and the separate rights for source data and images  |
| [Image coverage research](docs/research/image-coverage.md)         | Image sources, remaining placeholders, and organizer-logo provenance    |
| [Access research](docs/research/source-access.md)                  | Primary-source evidence for Devpost, Zindi, and Codabench               |
| [Indirect Devpost research](docs/research/devpost-alternatives.md) | Feed evaluation and the TensorHack working assumption                   |

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

[GitHub Actions](https://github.com/danarrigo/siggo/actions/workflows/ci.yml) runs formatting, lint, type checks, unit tests, desktop/mobile E2E, and a production build. Production credentials are not available to CI. Checks and Vercel deployments run independently.

---

Siggo's original code and documentation are open source under the [MIT License](LICENSE). The hosted workspace remains private. Third-party metadata, images, and trademarks retain their own rights; see [third-party notices](THIRD_PARTY_NOTICES.md).

Siggo helps you discover opportunities, not automate submissions or replace the organizer's rules. Source availability, eligibility, and deadlines always deserve a final check.
