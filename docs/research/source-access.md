# Devpost, Zindi, and Codabench access

## Conclusion

Technical feasibility and permission are different questions. Codabench's current coverage cap is a Siggo implementation limit, not evidence of a platform prohibition. Devpost has an explicit scraping restriction. Zindi has broad content-use restrictions, and no documented public competition-listing API was verified in this investigation.

This note records source evidence and the current implementation. It is not a determination that any particular collection activity is illegal, nor permission from a platform.

## Devpost

Primary source: [Devpost Terms of Service](https://info.devpost.com/terms), section 4, "Code of Conduct and Responsibility for User Content". The fetched page states "Last Updated: December 5, 2025".

The restrictions apply to how users "otherwise use the Site", not just content they submit. A prohibited manner of use includes:

> Uses manual or automated software, devices, scripts robots, or other means or processes to access, “scrape,” “crawl” or “spider” the Site, User Content (including User Profiles and Team Pages), or any related data or information;

Running a collector for a private application does not itself establish an exception to that wording. The compliant route is a specifically authorized feed/integration or permission from Devpost, rather than assuming that public visibility authorizes automated collection.

Siggo currently checks an openly licensed third-party competition calendar instead of collecting Devpost's directory. When that calendar has no matching active entries, the app directs the owner to browse Devpost manually.

## Zindi

Primary source: [Zindi Terms of Use](https://zindi.world/terms). The [zindi.africa terms](https://zindi.africa/terms) returned the same terms text during this investigation.

Under "Standards of Use", the terms restrict a manual process used to monitor or replicate website material. Under "Intellectual Property", they state:

> You must not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store or transmit any of the material on our Website, except as allowed or required by these Terms of Use.

Do not describe this as an explicit blanket robots/scraping clause identical to Devpost's. The evidence is broader content-use restrictions, not the same wording. Searches of official Zindi pages did not establish a documented public listing API or authorization for a full-directory collector; that is not proof no API or permission route exists.

Siggo's curated-calendar integration is a conservative access decision, not a claim that a direct collector is technically impossible. Clear platform permission or an explicitly authorized feed would allow reassessing it. The terms give `zindi@zindi.africa` as the contact for questions and support.

## Codabench

Primary source: [Codabench's External Competitions documentation](https://docs.codabench.org/latest/Developers_and_Administrators/External-Competitions/).

The documentation describes automatic daily API-based discovery between competition platforms. It gives `.../api/competitions/public/` as an example fetch endpoint and discusses authentication-free access, pagination, response format, and rate limits. This supports using the public API approach; it is not blanket permission to scrape all website content.

Siggo uses Codabench's public competition-listing and competition-detail API endpoints. The official [public view implementation](https://github.com/codalab/codabench/blob/develop/src/apps/api/views/competitions.py) documents the endpoint and its parameters; the [pagination implementation](https://github.com/codalab/codabench/blob/develop/src/apps/api/pagination.py) permits page sizes up to 1,000. Public list rows omit phase ends, so historical entries cannot safely be called active just because they appear in this directory.

The original collector stopped discovery and detail candidates at 40. That was Siggo's implementation choice, not a Codabench ToS requirement. The updated collector in `src/lib/sources/codabench.ts`:

- Follows the public directory at 200 entries per page, within a 100-page safety bound.
- Persists attempted/verified check timestamps and active/inactive results in the existing JSONB catalog snapshot.
- Alternates active-entry refreshes with older or unverified discoveries, resuming after interruption instead of repeatedly checking only the first page.
- Spaces all Codabench API requests at least one second apart within a four-minute default budget; other connectors retain their existing 90-second shared budget.
- Stops on access/rate limits and server errors, honors Retry-After between refreshes, and does not revive a previously API-confirmed inactive entry from a stale calendar row.
- Makes closed entries eligible for recheck after 30 days, with current calendar candidates rechecked sooner. Budget limits can delay a due recheck; this is not an exact freshness guarantee.
- Reports progress and keeps the Limited label when checks are pending or failing. Internal check state is not serialized into the browser.

A live local-browser test traversed all 1,567 published directory entries and completed 89 detail checks before its time budget. These are directory entries, not 1,567 verified active opportunities. Further refreshes continue the work. HTML scraping was not needed to remove the first-40 ceiling and would not inherently fix server-side outages.

## Scope of this investigation

The access-policy investigation used terms and official documentation. The subsequent Codabench improvement uses its existing public API integration, not a new direct scraper or undocumented full-feed integration. No permission request was sent, and Devpost/Zindi access paths were not changed. No platform-wide legal conclusion is inferred from robots rules, a publicly reachable endpoint, or an open-source code license alone.
