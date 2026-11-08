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

### Follow-up: individual listings and organizer sites

A subsequent bounded inspection checked three published TensorHack detail pages, without following their Devpost destinations:

- [STEM2Connect AI Hackathon](https://tensorhack.com/hackathons/devpost-stem2connect-ai-hackathon)
- [CSC Winter Sparkathon](https://tensorhack.com/hackathons/devpost-csc-winter-sparkathon)
- [checkpoint 1 games for good](https://tensorhack.com/hackathons/devpost-checkpoint-1-games-for-good)

Each inspected page exposed an explicit `og:image` URL under its own `/opengraph-image` route. One [published preview](https://tensorhack.com/hackathons/devpost-stem2connect-ai-hackathon/opengraph-image) returned HTTP 200 and `image/png`. Visual inspection showed a TensorHack-branded text card repeating the event title, organizer and publisher-listed cutoff, not organizer artwork. Its existence is a real alternative to missing image metadata, but it has not been adopted as an official event cover. The sampled pages' JSON-LD supplied no event image; their inline image was a TensorHack listing badge. This does not establish the same result for all 189 detail pages.

Organizer checks produced one stronger candidate:

| Primary source                                                           | Evidence                                                                                                                                                        | Outcome                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [STEM2Connect's hackathon page](https://www.stem2connect.org/hackathon/) | Explicitly links to the same `stem2connect-online-hackathon.devpost.com` event and publishes its [organizer logo](https://www.stem2connect.org/assets/logo.jpg) | Event identity verified. Logo HEAD returned HTTP 200, `image/jpeg`, 9,069 bytes. It is an organizer logo, not an event-specific cover. No logo reuse terms or media-kit grant were verified. |
| [HackSussex events](https://www.hacksussex.com/events)                   | Investigated organizer page did not establish an exact 2026 GameJam identity/link match                                                                         | No artwork adopted from a different event or older edition.                                                                                                                                  |
| [Clemson Quantum Club](https://www.clemsonquantum.com/)                  | Publishes club imagery and v3 Quantathon artwork, but the inspected page did not establish an exact Devpost link match for the listed v4 event                  | No v3 artwork or generic club image adopted as a verified v4 cover.                                                                                                                          |

The bounded search did not find a qualifying first-party artwork source for CSC Winter Sparkathon. This is not proof one does not exist.

Crawler rules were checked for the inspected organizer hosts; requests used the identified user agent, pacing, no authentication, and no redirects into other sites. No Devpost competition page, API, or artwork endpoint was requested. Sponsor logos, participant portraits, older-edition art, and generated publisher cards were not substituted for verified event artwork.

The owner subsequently approved adding verified organizer logos with attribution under the same permission-unverified working assumption as Zindi. Siggo now adds the STEM2Connect logo only when the listing's canonical event URL exactly matches the verified Devpost event. Similar titles or hostnames do not qualify, and existing source artwork takes precedence. No new organizer-page crawler or Devpost request is introduced.

The logo remains an organizer logo, not an event-specific cover. Its linked source credit survives catalog/workspace serialization and is displayed beside an explicit unverified-permission notice in the detail view. The image optimizer allows only one exact, immutable file URL, not the organizer's whole asset folder or a wildcard GitHub host. Reuse permission is still unverified; the owner's approval is not a publisher license.

During final live verification, the organizer's `www` hostname had no usable DNS address and its apex hostname failed TLS hostname validation. No DNS override, insecure HTTP downgrade, or TLS-verification bypass was used.

The organizer's public [website repository](https://github.com/stem4teens-sys/stem2connect-website) provides an independent HTTPS source. Its [hackathon page source at commit `63825f2`](https://github.com/stem4teens-sys/stem2connect-website/blob/63825f28b74a318d955cba782c6088bd700da1be/hackathon/index.html) explicitly links the same Devpost event and declares `../assets/logo.jpg`. GitHub's published [pinned logo URL](https://raw.githubusercontent.com/stem4teens-sys/stem2connect-website/63825f28b74a318d955cba782c6088bd700da1be/assets/logo.jpg) returned HTTP 200, `image/jpeg`, and 9,069 bytes; visual inspection confirmed the STEM2Connect logo. Siggo uses that immutable image URL and credits the corresponding [source file](https://github.com/stem4teens-sys/stem2connect-website/blob/63825f28b74a318d955cba782c6088bd700da1be/assets/logo.jpg), rather than the currently broken hostname. No repository-wide artwork license was verified; the owner's permission-unverified assumption still applies.

### External calendar entry

The remaining Codabench-classified record linked to an organizer's separate website, not an official Codabench detail endpoint, and had no image metadata. Its external URL was not treated as a new crawler target. The placeholder remains appropriate until a supported source provides artwork.

## Licensing boundary

MIT licensing covers Siggo's original code and documentation. It does not relicense publisher thumbnails, competition data, logos, or trademarks. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
