import { describe, expect, it } from "vitest";
import { competitionImageUrl } from "../../src/lib/competition-images";
import {
  parseAIcrowd,
  parseDrivenData,
  parseEvalAI,
  parseKaggle,
  parseMLH,
} from "../../src/lib/sources/parsers";

const checkedAt = "2026-11-06T00:00:00Z";
describe("competition imagery", () => {
  it("accepts published asset URLs, including relative and protocol-relative paths", () => {
    expect(competitionImageUrl("/media/logos/challenge.png", "https://media.eval.ai")).toBe(
      "https://media.eval.ai/media/logos/challenge.png",
    );
    expect(
      competitionImageUrl(
        "//images.aicrowd.com/images/challenges/cover.jpg",
        "https://www.aicrowd.com",
      ),
    ).toBe("https://images.aicrowd.com/images/challenges/cover.jpg");
  });
  it("rejects arbitrary hosts, unrelated buckets, and unsafe media", () => {
    for (const value of [
      null,
      "",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "http://media.eval.ai/media/logos/a.png",
      "https://evil.example/cover.png",
      "https://media.eval.ai.evil.example/media/logos/a.png",
      "https://media.eval.ai:444/media/logos/a.png",
      "https://user:pass@media.eval.ai/media/logos/a.png",
      "https://media.eval.ai/media/logos/a.png?token=secret",
      "https://media.eval.ai/media/logos/a.svg",
      "https://storage.googleapis.com/unrelated-bucket/a.png",
      "https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/avatars/a.png",
      "https://zindi-public-release.s3.eu-west-2.amazonaws.com.evil.example/uploads/competition/image/1/a.png",
      "https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/1/a.png?X-Amz-Signature=secret",
    ]) {
      expect(competitionImageUrl(value)).toBeNull();
    }
  });
  it("keeps valid source artwork and treats invalid optional images as missing, not a source failure", () => {
    const page = {
      count: 1,
      next: null,
      results: [
        { id: 1, title: "Challenge", image: "https://media.eval.ai/media/logos/challenge.png" },
      ],
    };
    expect(parseEvalAI(page, checkedAt).items[0].image).toEqual({
      url: page.results[0].image,
      kind: "logo",
    });
    expect(
      parseEvalAI(
        { ...page, results: [{ id: 1, title: "Challenge", image: { invalid: true } }] },
        checkedAt,
      ).items[0].image,
    ).toBeNull();
    expect(
      parseEvalAI({ ...page, results: [{ id: 1, title: "Legacy snapshot" }] }, checkedAt).items[0]
        .image,
    ).toBeNull();
  });
  it("extracts DrivenData's CSS banner instead of confusing it with the host logo", () => {
    const html = `<div class="panel-container active-comp"><a class="image" style="background-image: url(https://drivendata-prod-public.s3.amazonaws.com/comp_images/banner.jpg )"><div class="panel-logo"><img src="https://drivendata-prod-public.s3.amazonaws.com/hosts/logo.png"></div></a><h3 class="panel-competition-title"><a href="/competitions/1/test">Test</a></h3></div>`;
    expect(parseDrivenData(html, checkedAt)[0].image).toEqual({
      url: "https://drivendata-prod-public.s3.amazonaws.com/comp_images/banner.jpg",
      kind: "cover",
    });
  });
  it("uses MLH event backgrounds, with a contained logo when no cover is available", () => {
    const event = {
      id: "1",
      name: "Hack",
      startsAt: checkedAt,
      endsAt: "2026-12-01T00:00:00Z",
      url: "/events/hack",
      formatType: "digital",
      location: "Worldwide",
      backgroundUrl: "https://mlhusercontent.com/backgrounds/events/1/cover.png",
      logoUrl: "https://mlhusercontent.com/logos/events/1/logo.png",
    };
    const html = (data: unknown) =>
      `<script data-page="app" type="application/json">${JSON.stringify({ props: { upcomingEvents: [data] } })}</script>`;
    expect(parseMLH(html(event), checkedAt)[0].image?.kind).toBe("cover");
    expect(parseMLH(html({ ...event, backgroundUrl: null }), checkedAt)[0].image).toEqual({
      url: event.logoUrl,
      kind: "logo",
    });
  });
  it("collects AIcrowd cover art, not status icons", () => {
    const html = `<div id="challenges-div"><div class="card-challenge"><div class="image-wrapper"><img class="card-img" src="https://images.aicrowd.com/images/challenges/image_file/1/banner.jpg"><a class="card-img-overlay"><span class="badge"><img src="https://assets.aicrowd.com/icon.svg">Running</span></a></div><h5 class="card-title"><a href="/challenges/test">Test</a></h5></div></div>`;
    expect(parseAIcrowd(html, checkedAt).items[0].image?.url).toBe(
      "https://images.aicrowd.com/images/challenges/image_file/1/banner.jpg",
    );
  });
  it("uses the official Kaggle preview when the listing API leaves thumbnails empty", () => {
    const [item] = parseKaggle(
      [
        {
          id: 168019,
          ref: "https://www.kaggle.com/competitions/the-pokemon-company-ptcg-ai-battle-challenge-playground",
          title: "The Pokémon Company - PTCG AI Battle Challenge Playground",
          thumbnailImageUrl: "",
          hasThumbnailImageUrl: false,
        },
      ],
      checkedAt,
    );
    expect(item.image).toEqual({
      url: "https://www.kaggle.com/open-graph/images/Competitions/168019",
      kind: "cover",
    });
    expect(competitionImageUrl(item.image?.url)).toBe(item.image?.url);
  });
  it("prefers an approved API thumbnail over the generated Kaggle preview URL", () => {
    const thumbnail = "https://storage.googleapis.com/kaggle-competitions/sample/logo.png";
    const [item] = parseKaggle(
      [{ id: 1234, ref: "sample", title: "Sample", thumbnailImageUrl: thumbnail }],
      checkedAt,
    );
    expect(item.image).toEqual({ url: thumbnail, kind: "logo" });
  });
  it("does not invent Kaggle previews without a valid numeric competition ID", () => {
    for (const id of [undefined, null, 0, -1, 1.5, "1234", { invalid: true }]) {
      const [item] = parseKaggle([{ id, ref: "sample", title: "Sample" }], checkedAt);
      expect(item.image).toBeNull();
    }
  });
  it("only accepts numeric Kaggle preview paths, without credentials or query strings", () => {
    expect(
      competitionImageUrl("https://www.kaggle.com/open-graph/images/Competitions/168019"),
    ).toBe("https://www.kaggle.com/open-graph/images/Competitions/168019");
    for (const suffix of ["0", "-1", "name.png", "168019/other", "168019?token=secret"]) {
      expect(
        competitionImageUrl(`https://www.kaggle.com/open-graph/images/Competitions/${suffix}`),
      ).toBeNull();
    }
    expect(competitionImageUrl("https://www.kaggle.com/open-graph/images/Datasets/1")).toBeNull();
  });
  it("also preserves approved image URLs from older Kaggle API responses", () => {
    const [item] = parseKaggle(
      [
        {
          ref: "sample",
          title: "Sample",
          imageUrl: "https://storage.googleapis.com/kaggle-competitions/sample/logo.png",
        },
      ],
      checkedAt,
    );
    expect(item.image?.kind).toBe("logo");
  });
});
