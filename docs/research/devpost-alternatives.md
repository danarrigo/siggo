# Indirect Devpost metadata sources

## Summary

Research cutoff: **2026-11-08**. **No new source met all acceptance conditions**: free, applicable metadata/content reuse permission or published syndication, an explicit Devpost event URL on the permitted source, and reliably sourced active/upcoming event dates. The organizer review covered four candidates; supplementary feed checks are recorded below. This is a bounded negative finding, not proof that no suitable source exists. Explicit prose dates can support an attributed curated record; machine-readable event dates are an automation preference, not a user requirement.

**Original permission-verified recommendation:** keep the existing licensed MLContests/manual fallback; add no connector on a claimed TensorHack export license. Chrome for Developers is a credible licensed future lead, not a verified source of current opportunities. **TensorHack's purported CC BY exports were not verified:** the current `/data` response serves its hackathon board, and its current terms contain no metadata reuse grant. No Devpost competition page/API was fetched, nor were short links followed. This is a source-selection assessment, not a legal determination that collecting public factual metadata is prohibited.

**Subsequent owner decision:** the owner explicitly extended the low-rate, permission-unverified Zindi assumption to TensorHack public titles, links and dates. Siggo now implements that narrower indirect route, described below. This is not publisher permission, a verified license, or permission to fetch Devpost itself.

## Findings

### 1. Chrome for Developers - licensed content, insufficient current event data

**Claim / direct evidence (high confidence):** the [official RSS endpoint](https://developer.chrome.com/static/blog/feed.xml) returns RSS 2.0 with channel `title`, `link`, `description`, `lastBuildDate`, and item `title`, `link`, `guid`, `pubDate`, `description`. The inspected response contains ten recent articles and `lastBuildDate` **2026-10-07T09:21:14Z**; it has no event entries or event-date fields. `pubDate` is article publication, **not** registration opening, event start, or submission close. No pagination link or rate-limit contract was present; historical completeness is unverified.

**Claim / direct evidence (high confidence):** the [2025 announcement](https://developer.chrome.com/blog/ai-challenge-2025) and [2025 winners article](https://developer.chrome.com/blog/ai-challenge-winners-2025) bear the page-content **CC BY 4.0** notice. The [Google Developers site policy](https://developers.google.com/terms/site-policies) expressly permits reuse of pages carrying that notice, with attribution. This is content permission, not merely a software repository license. It excludes trademarks and does not license linked external content; do not import artwork or Devpost content under Google's license.

**Explicit Devpost evidence:** the winners article's own HTML links the event title to `https://googlechromeai2025.devpost.com/`. That URL was read as an attribute on Google's page, not fetched. The launch announcement instead uses `goo.gle` links; their destinations were not inferred or resolved.

**Verified historical metadata examples (not current opportunities):**

| Organizer-published title                | Published event date fact                                 | Precision and provenance                                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Chrome Built-in AI Challenge 2025 | Runs until October 31, 2025, 11:45 PM **PST**, as printed | [Announcement](https://developer.chrome.com/blog/ai-challenge-2025); prose only. Preserve the printed timezone; do not silently substitute PDT. Event Devpost URL independently explicit in Google's [winners article](https://developer.chrome.com/blog/ai-challenge-winners-2025). |
| Google Chrome Built-in AI Challenge      | Runs until December 3, 2024, 11:45 PM PST                 | [2024 announcement](https://developer.chrome.com/blog/ai-challenge); prose only, with CC BY 4.0 footer. Its registration URL is shortened, so this investigation does **not** establish its Devpost destination.                                                                     |

**Interpretation (high confidence):** licensed organizer-page facts could support a small attributed curated record, but neither historical example satisfies the active/upcoming requirement. The RSS dates cannot supply missing event dates. No verified 2026 Devpost-linked Chrome event was found in the targeted search/current feed. Do not treat that as an exhaustive archive audit.

### 2. Firebase Blog - expressly published RSS, no qualifying event

**Claim / direct evidence (high confidence):** the [homepage](https://firebase.blog/) explicitly links an RSS feed, labeled “Open the Firebase Blog's RSS Feed,” at [`/rss.xml`](https://firebase.blog/rss.xml). Items expose `title`, `link`, `guid` (`isPermaLink="true"`), `pubDate`, and sometimes `description`; this is a published syndication endpoint, not a reverse-engineered API. The inspected feed extends back to historical posts and has no pagination link or published rate-limit contract in its payload.

**Freshness:** its first item is “Better Notifications with FCM AndroidConfigV2,” with `pubDate` **2026-11-03T00:00:00Z**. The [article](https://firebase.blog/posts/2026/11/fcm-android-config-v2) additionally exposes JSON-LD `BlogPosting.datePublished` and `dateModified`; both describe the article, not an event. No `devpost` URL occurs in the fetched RSS. Targeted searches did not verify a 2026 Firebase organizer announcement for the upcoming #BuildHybridAI lead that surfaced in third-party search results.

**Interpretation (medium confidence):** the explicit RSS publication supports consuming feed entries as syndication, but it does not establish blanket permission to crawl/relicense linked article bodies. No CC notice was found on the inspected homepage/article. With neither an explicit Devpost event URL nor machine-readable event dates in this feed, it is not a qualifying Siggo source. Do not import third-party search summaries to fill those gaps.

### 3. Google Developers Blog - fresh feed, publication metadata only

**Claim / direct evidence (high confidence):** the [official feed endpoint](https://developers.googleblog.com/feeds/posts/default?alt=rss) returns RSS 2.0. Observed fields: channel `title`, `link`, `description`, `atom:link[rel=self]`, `language`, `lastBuildDate`; item `title`, `link`, `description`, `guid`. Channel build time is **2026-11-08T06:45:59Z**. The inspected response has no item `pubDate`, explicit Devpost URL, or hackathon entry. No feed pagination/rate-limit contract was verified.

The [organizer's hackathon search](https://developers.googleblog.com/en/search/?query=hackathon) displays 22 results, with a `page=2` next link. Its first result is a completed Tunix/Kaggle hackathon retrospective dated May 28, 2026. The [article](https://developers.googleblog.com/en/how-the-community-trained-gemma-to-think-with-tunix-and-tpus/) has JSON-LD `datePublished: "2026-05-28"`: a calendar-day article date, not a competition deadline. It contains no Devpost URL or CC notice. Google's general page policy is conditional on a notice; it must not be presumed to license this different site's entire archive.

**Interpretation (medium confidence):** published RSS is useful for discovery, not an authorized structured event catalog. No active/upcoming Devpost-linked event with machine-readable event dates was verified. Reject for implementation now.

### 4. TensorHack - current publisher permission not verified

**Claim / direct evidence (high confidence):** a direct request to [`https://tensorhack.com/data`](https://tensorhack.com/data) returns HTTP 308 with `Location: /hackathons`. Retrieval following that canonical redirect returns the hackathon board, titled “upcoming hackathons 2026, sorted by deadline”; its HTML canonical URL is `https://tensorhack.com/hackathons`. The visible board says **619 hackathons**, “updated 8 nov.” Neither representation contains a data-export license, CC BY notice or attribution instructions. The current HTML does not document JSON/CSV/ICS export endpoints. This inspection does not establish whether a differently published export endpoint exists; no guessed endpoints or event destinations were requested.

**Explicit Devpost link evidence:** the fetched board's JSON-LD `CollectionPage.mainEntity.itemListElement[].item` includes `name`, `url` (TensorHack record), `about.name` (organization), `significantLink` (external destination), and `keywords`. For example, “STEM2Connect AI Hackathon” has `significantLink: "https://stem2connect-online-hackathon.devpost.com/"`; “CSC Winter Sparkathon” has `significantLink: "https://csc-winter-sparkathon.devpost.com/"`. These are publisher-supplied link attributes, not destination fetches or independently verified event facts. No dates/prizes/eligibility for these examples are adopted here. The displayed inventory count does not verify every record's activity or accuracy. Technical export/schema/count validation is separate from this permission review.

**Publisher terms:** the [current terms](https://tensorhack.com/terms), marked “Terms reviewed on 4 November 2026,” say:

> Do not submit malicious links, impersonate an organizer, scrape in a way that disrupts the service, evade rate limits or use the forms for spam. Access may be limited when needed to protect the site.

They also say listings are provided as is, without warranties of accuracy, completeness or availability, and third-party sites' terms govern interactions there. No data/metadata redistribution license, CC version, export syndication permission, numerical request allowance or required attribution was found in the fetched terms, including raw HTML.

The [methodology](https://tensorhack.com/methodology) describes automated ingestion from official/platform sources and human review of public submissions. It explicitly says publication does not mean TensorHack contacted the organizer, and automation is not evidence of human review. Its site-wide full audit is dated **2026-11-03**, expressly not a per-record human-verification date. This is provenance/freshness information, **not** permission to redistribute TensorHack's dataset or evidence of upstream authorization.

**Interpretation (high confidence):** a prohibition on disruptive scraping is not the requested affirmative metadata reuse/export grant. Machine-readable embedded HTML likewise does not establish licensed syndication. **No verified permission:** do not implement a TensorHack collector on the purported CC BY basis. Applicable attribution conditions cannot be confirmed without the actual reuse grant; adding a TensorHack credit alone does not establish permission. The terms list `manav@tensorboy.com` for questions; no permission request was sent.

### Subsequent TensorHack implementation and live verification

The [public crawler rules](https://tensorhack.com/robots.txt) returned HTTP 200, allowing the board but disallowing `/api/`. The collector reads that file and the canonical [hackathon board](https://tensorhack.com/hackathons) only, using the identified Siggo user agent, no credentials, no redirects, and at least three seconds between requests (or a greater applicable crawl delay). It never requests `/api/`, individual TensorHack details, or any Devpost destination. Access/rate/server failures stop collection; valid Retry-After pauses persist. The existing shared 90-second budget bounds the work; directory bodies are limited to 2 MB and 10,000 embedded rows.

A live run at **2026-11-08T07:56:29.194Z** imported **189 Devpost-prefixed records** from 619 embedded board records, using exactly those two requests. The HTML's public Next.js serialization supplies `id`, `name` and `deadline`; JSON is parsed, never evaluated as executable code. Each accepted ID must also have a published same-origin listing anchor. JSON-LD supplies explicit official Devpost links for **10** records; the remaining **179** link to their TensorHack listing. Official event URLs are never synthesized from IDs/titles. Known previously published destinations and bookmark IDs survive later JSON-LD slices.

All 189 imported deadlines were calendar days, with **unverified deadline types**. Siggo stores them separately as `listedDeadline`, displays **Listed cutoff**, and does not infer registration, submission, or event-end meaning, a closing clock, or timezone. A passed listed cutoff alone never marks a listing ended or moves a bookmark to Archive. Saved reminders and change alerts retain that separate label. Provider presence is not independent activity verification: Devpost stays **Limited**, not a complete/verified directory.

Every record retains linked TensorHack provenance. Only titles, published links and these dates are adopted; rewards, fees, eligibility, format and official timeline remain unknown. Descriptions are Siggo-authored, and no rules, datasets or participant information are copied. Images stay neutral except for independently verified, attributed organizer-logo references added under the owner's subsequent permission-unverified approval; see the [image investigation](image-coverage.md). The licensed MLContests calendar remains an independent supplement; previous public details are retained honestly on partial/failing reads. No new service, dependency, secret or database migration is needed. Reuse permission remains **unverified**.

## Supplementary feed checks

- **Hack Club:** its [published API documentation](https://github.com/hackclub/hackathons/blob/main/components/api.mdx) explicitly offers a JSON API and requires credit to “Hack Club Hackathons” linked to `https://hackathons.hackclub.com/`. This is a concrete API-use allowance, not an inference from its software license. The documented frontend [upcoming endpoint](https://hackathons.hackclub.com/api/events/upcoming/) returned 14 records, none with a Devpost `website` URL. Its `start`/`end` fields describe event dates, not submission cutoffs. The canonical endpoint needs the trailing slash. The separate backend's [robots file](https://dash.hackathons.hackclub.com/robots.txt) disallows crawling; that backend API was not queried. Do not silently add this high-school-focused directory as a new source when the request is specifically Devpost coverage.
- **MLH:** the already-used [2027 season directory](https://www.mlh.com/seasons/2027/events) exposed 24 upcoming events in its embedded metadata, with no explicit Devpost references. A Devpost destination cannot be constructed from an event title or assumed from MLH membership.
- **MLContests:** the existing [licensed calendar](https://raw.githubusercontent.com/mlcontests/mlcontests.github.io/master/competitions.json) returned 409 rows and ten Devpost references, all with past deadlines (the latest in August 2026). They must not be resurrected as current opportunities.
- **Hackalist:** its [README](https://github.com/hackalist/hackalist.github.io) expressly says the site is no longer actively updated. Although it offers public API use, its repository's latest event data is from 2025. No connector to this retired feed is justified for current discovery.
- **DEV Community:** its published [hackathon RSS](https://dev.to/feed/tag/hackathon) returned 12 posts and no explicit Devpost event URLs. Article publication dates cannot supply event deadlines. Its [site terms](https://dev.to/terms) grant personal transitory viewing, not a blanket content-republication license; no new permission is inferred from the API software documentation.

## Contradictions and missing evidence

- **TensorHack discovery/primary-content discrepancy:** a search/source-check result labels `/data` “TensorHack data exports” and summarizes JSON/CSV/RSS/iCal exports; the fetched original page instead serves the board with no license/export documentation. The earlier CC BY lead is therefore unverified, not silently accepted or treated as disproven for all time. An older indexed page or changed route is possible, but unproven.
- Recent article/feed timestamps and old event examples coexist; feed freshness does not imply fresh event coverage.
- Search results suggested a November 2026 #BuildHybridAI event, but no matching licensed first-party feed entry/announcement was verified. Its dates, prizes, eligibility and Devpost destination are deliberately **not** adopted as facts here.
- None of the three Google feeds provides a verified `Event.startDate`/`endDate`, JSON event timestamps, or ICS `DTSTART`/`DTEND` for a qualifying current Devpost event. Article publication/modification/build timestamps are not substitutes.
- No source-specific numeric rate allowance or service guarantee was verified. Absence of a stated limit is not unlimited permission.
- `source_check` returned “unclear” because automated semantic assessment was unavailable. Chrome licensing was manually checked against the fetched policy and actual HTML footer; TensorHack's original `/data`, terms and methodology were manually inspected rather than relying on summaries.

## Smallest honest implementation / next step

**For a permission-verified route**, obtain the publisher's actual export documentation and metadata license or explicit written permission, including attribution, permitted fields, upstream-rights exclusions and access limits. If confirmed, prefer the published export only, retain TensorHack and original source provenance, and keep Devpost outbound-only; do not copy descriptions/artwork or infer upstream rights from a publisher's software license. Technical endpoint availability alone does not resolve permission.

If a future licensed organizer announcement explicitly supplies the Devpost event URL and event dates, begin with one attributed curated record rather than a generic scraper. Preserve organizer URL, literal published date/time and precision, field provenance, observation time, license URL and attribution; leave fees, eligibility and unsupported fields unknown. A curated prose-derived date must be labeled as such, not advertised as a structured feed date.

Revisit the permission-verified route once a qualifying current sample and permission exist; the owner-assumption collector above does not satisfy that permission condition. Any eventual feed reader should cache and refresh conservatively, fetch only permitted sources, honor access/rate responses, and never follow a redirect into Devpost. Feed pagination/archive guarantees and permission for linked article extraction would need separate validation.

## Sources kept / deprioritized

- **Kept:** official Chrome RSS, announcement/winners pages and Google site policy linked above - actual content license, feed schema and explicit event destination evidence.
- **Kept:** Firebase homepage/RSS/current article - explicit syndication, freshness and date semantics.
- **Kept:** Developers Blog RSS/search/article - current feed, pagination evidence and publication-date semantics.
- **Kept:** TensorHack `/data`, `/terms` and `/methodology` - actual current publisher content, access restrictions, absent verified reuse grant and provenance caveats.
- **Deprioritized:** TensorHack search-result export/license claims - current original-source content does not substantiate them.
- **Deprioritized:** third-party #BuildHybridAI listings and generic hackathon aggregators - no verified data license or organizer-source chain; no competition-page fetches performed. Repository code licenses alone were not accepted as metadata licenses.
