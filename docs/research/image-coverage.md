# Official image coverage

Investigation date: **2026-11-08**.

## Findings

The pre-change durable catalog contained **388 records**, with image URLs on **193**. URL presence is not proof of successful image loading. The missing metadata was concentrated in **189 indirect Devpost records**, **five Zindi records**, and **one externally hosted calendar entry classified under Codabench**.

This was primarily a collection-scope gap, not a broken image renderer. Existing browser tests reproduced neutral placeholders, and new collector/dashboard tests failed when expecting a published Zindi thumbnail.

### Zindi: published thumbnails were being discarded

The rendered [Open Challenges directory](https://zindi.world/competitions) publishes a per-card `Competition__image` element whose inline `background-image` points to:

```text
https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/<id>/<published filename>
```

All five open/upcoming cards observed during inspection supplied explicit thumbnail URLs. The parser previously returned `image: null`, and the shared image allowlist did not include this bucket. No URL derivation, additional challenge-page crawl, or backing-API client is necessary.

Representative publisher-linked assets:

- [GenAI for Good thumbnail](https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/775/thumb_ab7522ce-d479-443b-a8bc-dae9bc950fa3.png)
- [Underwater Vessel Noise thumbnail](https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/768/thumb_fd87d3b5-5766-40b3-acce-85ade99894f2.png)

Both representative HEAD requests returned HTTP 200 and `image/png`. A later asset check hit a transport reset, and that inspection stopped rather than bypassing or repeatedly retrying it. Availability is not guaranteed by a published URL.

The owner requested improved official-image coverage. Siggo now keeps the published thumbnail URL under the same permission-unverified working assumption described in [source-access research](source-access.md). This is not a verified artwork reuse license; [Zindi's terms](https://zindi.world/terms) and the original rights still apply.

Implementation boundaries:

- Read only the challenge card's declared image, not unrelated sponsor/partner logos.
- Allow only the exact official bucket's `/uploads/competition/image/` path.
- Keep the collector's image downloads blocked; only metadata is extracted.
- Let the UI's existing image optimizer load allowed assets, with no redirects and a 5 MB limit.
- Continue rejecting HTTP, credentials, query-bearing/signed URLs, remote SVGs, unrelated buckets, and private-network targets.
- Keep the neutral fallback when an image is absent, rejected, or fails to load.

### TensorHack / Devpost: no image field in the imported record schema

The [public TensorHack board](https://tensorhack.com/hackathons) supplied 189 Devpost-prefixed embedded records during inspection. Their fields included `id`, `name`, `org`, prize fields, `deadline`, `mode`, `location`, and `tags`, but no image field.

The board contains some images for other platform records. That does not establish an image source for every Devpost entry or permission to fetch Devpost artwork. This is a bounded finding about the board metadata, not proof that no individual organizer has published an image elsewhere.

Siggo keeps these records neutral rather than guessing image URLs, using generic generated covers, or requesting Devpost pages/APIs. [Indirect-source research](devpost-alternatives.md) retains the separate metadata reuse assumption and provenance.

### External calendar entry

The remaining Codabench-classified record linked to an organizer's separate website, not an official Codabench detail endpoint, and had no image metadata. Its external URL was not treated as a new crawler target. The placeholder remains appropriate until a supported source provides artwork.

## Licensing boundary

MIT licensing covers Siggo's original code and documentation. It does not relicense publisher thumbnails, competition data, logos, or trademarks. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
