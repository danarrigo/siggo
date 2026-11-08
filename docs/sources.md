# Sources and data

[← Back to Siggo](../README.md)

**Coverage should be inspectable, not assumed.** Siggo combines source metadata into a directory, preserves provenance, and calls out what it could not verify. It is not an exhaustive competition index or a substitute for organizer rules.

## Integration overview

| Source                                                                        | Collection method                                               | Important boundary                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Kaggle](https://github.com/Kaggle/kaggle-api/blob/main/docs/competitions.md) | Official competition REST API                                   | Requires server-side credentials; submission deadlines do not establish registration or eligibility  |
| [EvalAI](https://eval.ai/api/docs/)                                           | Official API for published, approved present/future challenges  | A challenge end is not automatically a phase submission cutoff                                       |
| [DrivenData](https://www.drivendata.org/competitions/)                        | Public active directory                                         | Includes ongoing practice/benchmark tasks and cross-listed external events                           |
| [AIcrowd](https://www.aicrowd.com/challenges?status=running)                  | Public running and starting-soon directories                    | Relative day counts do not become exact deadlines                                                    |
| [MLH](https://www.mlh.com/)                                                   | Current season's public embedded metadata                       | Covers that season, not every independent hackathon                                                  |
| [Zindi](https://zindi.world/competitions)                                     | Rendered Open Challenges pages and timelines; calendar fallback | Platform permission remains unverified; partial reads are not complete coverage                      |
| [Codabench](https://www.codabench.org/)                                       | Official public API and calendar supplement                     | Directory discovery and active-phase verification are separate, progressive steps                    |
| [Devpost](https://devpost.com/hackathons)                                     | Indirect TensorHack metadata and licensed calendar              | Devpost pages/APIs are never requested by collectors; TensorHack reuse permission remains unverified |

The retired main CodaLab service is not an active connector. Existing identities remain readable for saved-history compatibility. Other conference/shared-task sites, independent Codabench instances, and hackathon platforms are not exhaustively indexed.

## Access assumptions and attribution

Technical access, crawler rules, and permission are different things.

- **Zindi:** low-rate public metadata collection follows the owner's explicit working assumption, not verified platform permission or a documented listing-API contract. Its broad content-use restrictions should not be misrepresented as Devpost's explicit automated-scraping clause.
- **TensorHack:** the owner separately approved the same permission-unverified approach for public titles, published links, and dates. No metadata export or reuse license was verified. Attribution does not itself establish permission.
- **Devpost:** its terms explicitly restrict scraping. Its competition pages, APIs, and linked destinations are not fetched. Indirect records do not imply Devpost authorization or independent verification of their activity.
- **MLContests:** the [calendar](https://github.com/mlcontests/mlcontests.github.io) is licensed under [GPL-3.0](https://github.com/mlcontests/mlcontests.github.io/blob/master/LICENSE), with attribution in Source coverage. Only relevant Zindi, Codabench, and Devpost records are imported. Calendar prize figures are curator estimates.

The calendar's license does not license unrelated publisher content or Siggo's entire codebase. No blanket rights to source data are asserted.

For primary-source evidence and the distinction between verified permission and owner assumptions, see [source-access research](research/source-access.md) and [indirect Devpost research](research/devpost-alternatives.md).

## How collection stays bounded

### APIs and directories

- **Kaggle:** follows pages until an empty response, with a 20-page bound reported when reached. An invalid Bearer token does not trigger silent fallback to another account.
- **EvalAI:** follows validated same-origin pagination, with a 20-page bound per present/future listing. Platform billing type is not treated as a participant entry fee.
- **DrivenData:** parses explicitly published UTC times rather than assigning a timezone to an ambiguous clock.
- **AIcrowd:** scans both running and starting-soon directories until an empty page, up to 20 pages each. Requests are spaced at least ten seconds apart within the shared 90-second budget.
- **MLH:** advances the season in July and keeps upcoming/ongoing events from that season. Event dates remain event dates.

### Progressive Codabench verification

The public directory includes historical competitions and does not provide phase ends. Discovering a record is not enough to label it active.

The collector:

1. Paginates the directory at 200 entries per page, with a 100-page safety bound.
2. Persists attempted and verified phase-check progress in the existing catalog snapshot.
3. Alternates active refreshes with older or unverified discoveries, resuming after interruptions.
4. Spaces API requests at least one second apart within a four-minute source budget.
5. Stops at access/rate/server failures and persists valid Retry-After pauses.
6. Makes known inactive entries eligible for recheck after 30 days, with current calendar candidates rechecked sooner. Eligibility is not an exact recheck-time guarantee.

A stale calendar entry cannot resurrect a competition already confirmed inactive by the API. Pending or failed checks stay **Limited**. The UI reports progress; internal check history stays server-side.

### Zindi's public UI

Zindi requires rendered pages rather than its initial HTML. An anonymous, identified Playwright browser reads **Open Challenges**, including upcoming entries, and public timelines. Past/practice-only records are excluded.

- Check applicable crawler rules and delays before browsing.
- Space navigation and load-more actions at least three seconds apart.
- Use a 90-second budget and a 50-load-more safety bound.
- Stop on access blocks, rate limits, or server errors; persist valid Retry-After pauses.
- Prioritize missing-date and older timeline observations after an interrupted run.
- Keep licensed-calendar and previously known details as explicitly limited recovery data.

The reader imports public title, link, reward, and date facts, plus the thumbnail URL explicitly published on each challenge card. Only the official image bucket's competition-image path is allowlisted. Descriptions are generic; rules, datasets, and participant identities are not copied. Image references do not grant artwork reuse rights; images remain subject to their source terms. Known account-only participation requests are blocked before sending, not retried or authenticated.

The browser uses temporary profiles and a small environment allowlist, not application secrets. Writes, unapproved hosts, redirects, analytics, and media are blocked. Profiles are removed after each run. Vercel uses bundled serverless Chromium, not a separate browser provider.

### Indirect Devpost metadata

TensorHack collection reads only its crawler rules and canonical public hackathon board, normally two requests. It never calls the disallowed `/api/` paths, fetches individual TensorHack detail pages, or follows Devpost destinations.

Public embedded JSON is parsed as data, never executed. Devpost-prefixed records must also have a published same-origin listing link. An official event URL is used only when explicitly published in the board's JSON-LD; otherwise the record links to TensorHack. URLs are not synthesized from names or IDs.

Requests wait at least three seconds, or a greater applicable crawl delay. The shared 90-second budget, 2 MB directory-body limit, and 10,000-row safety bound limit work. Access/rate/server failures stop the read; valid Retry-After pauses persist. Partial reads retain known details and the independent licensed-calendar supplement.

Each record keeps linked metadata provenance. Unsupported rewards, fees, eligibility, format, and official timeline remain unknown. Descriptions are generic and images are neutral placeholders. Devpost coverage stays **Limited**, even after a successful board read.

## Dates keep their meaning

| Published fact                    | Siggo's treatment                                                       |
| --------------------------------- | ----------------------------------------------------------------------- |
| Registration deadline             | Separate from submission and event dates                                |
| Submission deadline               | Not an inferred registration cutoff                                     |
| Challenge or phase end            | Not automatically a submission deadline                                 |
| Event start/end                   | Event timing, not application or submission timing                      |
| Provider-listed cutoff            | Separate `listedDeadline`; type unverified and not proof an event ended |
| Calendar day without a clock/zone | Displayed as date-only, without a fabricated closing instant            |
| Explicit timestamp and timezone   | Displayed in Asia/Jakarta (WIB)                                         |

Date-only end dates are conservatively retained through their last possible timezone rather than assigned a made-up UTC deadline. Zindi's public submission-close popover is distinguished from generic Close and results-reveal labels; a browser's timezone is not evidence of the publisher's timezone.

Saved reminders and change alerts keep the corresponding date type. Omitted dates do not become removal alerts. A missing source record does not prove a saved opportunity ended, and a passed provider-listed cutoff alone never moves it to Archive.

Fees, nationality, student status, travel support, team eligibility, and hardware suitability are not invented from broad descriptions or personal preferences. **All** is not narrowed to a guessed eligibility profile.

## Freshness and failure

The coverage panel distinguishes **Connected**, **Limited**, **Curated feed**, **Needs key**, **Browse manually**, **Unavailable**, and **Stale**, with source-specific scope and last-success details.

A successful HTTP response does not establish complete coverage. Partial reads remain limited; failed reads can retain older public metadata with honest failure/freshness labels. Sources become Stale after 26 hours without a successful check. Zindi calendar-only recovery uses Curated feed, not a direct-directory success label.

Shared HTTP requests use an 18-second per-request timeout, no-store caching, and no redirects. Untrusted pagination origins and paths are rejected. Requests do not bypass access restrictions, authentication, or rate limits. Source-specific budgets can leave work for a later refresh.

Manual listings are private workspace data. Their URLs are never automatically scraped or treated as collector endpoints. Organizer links from calendar records are destinations for the reader, not additional API hosts.

## Images and record identity

Images come from source-provided listing/API metadata. Missing, broken, or rejected images use neutral placeholders, not generated artwork.

- Zindi thumbnails come from each public card's CSS `background-image`, not guessed URLs or unrelated partner logos. The collector still blocks image downloads; the UI loads allowed assets through the image optimizer.
- Remote optimization uses a strict HTTPS asset-host/path allowlist, no redirects, and a 5 MB limit. Unapproved, private, signed, and remote SVG image URLs are rejected.
- Kaggle's numeric competition ID can provide its official Open Graph preview URL. These previews load directly with no referrer because Kaggle redirects to temporary signed assets; signed destinations and API tokens are not stored in the catalog.
- Codabench signing parameters are removed only for its verified public logo bucket.
- Deduplication uses canonical URLs, not similar titles. Distinct editions, tracks, and organizer landing pages can remain separate records.

Implementation lives in [`src/lib/sources/`](../src/lib/sources/), with shared image rules in [`src/lib/competition-images.ts`](../src/lib/competition-images.ts).
