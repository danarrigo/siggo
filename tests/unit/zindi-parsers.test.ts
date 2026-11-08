import { describe, expect, it } from "vitest";
import { parseZindiDirectory, parseZindiTimeline } from "../../src/lib/sources/parsers";

const stamp = "2026-11-06T00:00:00.000Z";
const card = (slug: string, title: string) =>
  `<div class="Competition__container___hash"><div class="Competition__title___hash"><a href="/competitions/${slug}">${title}</a></div><div class="Competition__reward___hash">$10 000 USD</div><button>Join</button></div>`;
const timeline = (close = "13 Dec 26") =>
  `<div class="Timeline__container___hash"><div class="Timeline__child___hash Timeline__start___hash"><div class="Timeline__title___hash">Start<span class="Timeline__info___hash">i</span></div><div class="Timeline__date___hash">05 Nov 26</div></div><div class="Timeline__child___hash Timeline__close___hash"><div class="Timeline__title___hash">Close<span class="Timeline__info___hash">i</span></div><div class="Timeline__date___hash">${close}</div></div><div class="Timeline__child___hash"><div class="Timeline__title___hash">Reveal</div><div class="Timeline__date___hash">14 Dec 26</div></div></div>`;

describe("public Zindi page metadata", () => {
  it("reads only the Open section, not past/practice challenges or participant links", () => {
    const parsed = parseZindiDirectory(
      `<h2>Open Challenges: 2</h2>${card("finance-ai", "Finance AI")}${card("Game-AI", "Game AI")}<h2>Past Challenges: 500</h2>${card("past", "Past task")}`,
      stamp,
    );
    expect(parsed.items.map((item) => item.id)).toEqual(["zindi:finance-ai", "zindi:Game-AI"]);
    expect(parsed.expected).toBe(2);
    expect(parsed.complete).toBe(true);
    expect(parsed.items[0]).toMatchObject({
      reward: "$10 000 USD",
      image: null,
      registrationEndsAt: null,
      submissionEndsAt: null,
      entryFee: "Unknown",
      registrationOpen: null,
    });
  });
  it("distinguishes a genuinely empty directory from a missing/changed page structure", () => {
    expect(
      parseZindiDirectory("<h2>Open Challenges: 0</h2><h2>Past Challenges: 1</h2>", stamp).items,
    ).toEqual([]);
    expect(() => parseZindiDirectory("<div>Sign in</div>", stamp)).toThrow();
    expect(
      parseZindiDirectory(`<h2>Open Challenges: 2</h2>${card("one", "One challenge")}`, stamp)
        .complete,
    ).toBe(false);
  });
  it("never follows a card link to a different host or private route", () => {
    const html = `<h2>Open Challenges: 1</h2>${card("one", "One challenge").replace("/competitions/one", "https://evil.example/competitions/one")}`;
    expect(() => parseZindiDirectory(html, stamp)).toThrow();
  });
  it("preserves published calendar dates without inventing closing times or submission deadlines", () => {
    expect(parseZindiTimeline(timeline())).toEqual({
      opensAt: "2026-11-05",
      registrationEndsAt: null,
      submissionEndsAt: null,
      challengeEndsAt: "2026-12-13",
      eventEndsAt: null,
    });
  });
  it("retains an explicit timezone-bearing datetime, and ignores results-reveal dates", () => {
    const html = timeline('<time datetime="2026-12-13T23:59:00Z">13 Dec 26</time>');
    expect(parseZindiTimeline(html).challengeEndsAt).toBe("2026-12-13T23:59:00.000Z");
    expect(parseZindiTimeline(html).eventEndsAt).toBeNull();
  });
  it("uses the public submission-close popover without inventing its missing timezone", () => {
    const html = `${timeline("01 Dec 26")}<div class="__react_component_tooltip">Submission close = 30 November 2026 at 23:59<br>Submission selection close = 01 December 2026 at 00:29</div>`;
    expect(parseZindiTimeline(html)).toMatchObject({
      submissionEndsAt: "2026-11-30",
      challengeEndsAt: null,
      registrationEndsAt: null,
    });
  });
  it("ignores the pinned practice banner, even though its class contains Competition__container", () => {
    const html = `<h2>Open Challenges: 1</h2><div class="PinnedCompetition__container___hash">Practise here</div>${card("one", "One challenge")}`;
    expect(parseZindiDirectory(html, stamp).complete).toBe(true);
  });
  it("rejects impossible or relative closing dates instead of guessing", () => {
    expect(() => parseZindiTimeline(timeline("31 Feb 26"))).toThrow();
    expect(() => parseZindiTimeline(timeline("About two weeks left"))).toThrow();
  });
});
