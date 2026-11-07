import { describe, expect, it } from "vitest";
import {
  iso,
  parseAIcrowd,
  parseDrivenData,
  parseDrivenDeadline,
  parseEvalAI,
  parseKaggle,
  parseMLH,
  text,
} from "../../src/lib/sources/parsers";

const checkedAt = "2026-11-06T00:00:00Z";
describe("source contracts", () => {
  it("strips untrusted markup and refuses ambiguous date strings", () => {
    expect(text("<script>alert(1)</script><p>Game &amp; simulation</p>")).toBe("Game & simulation");
    expect(iso("06/11/2026")).toBeNull();
    expect(iso("2026-11-06T10:00:00Z")).toBe("2026-11-06T10:00:00.000Z");
  });
  it("keeps EvalAI challenge end separate from submission and registration", () => {
    const { items } = parseEvalAI(
      {
        count: 1,
        next: null,
        results: [
          {
            id: 2,
            title: "A challenge",
            short_description: "A task",
            start_date: checkedAt,
            end_date: "2026-12-01T00:00:00Z",
            is_registration_open: false,
            challenge_usage_type: "paid",
          },
        ],
      },
      checkedAt,
    );
    expect(items[0].registrationOpen).toBe(false);
    expect(items[0].submissionEndsAt).toBeNull();
    expect(items[0].challengeEndsAt).toBe("2026-12-01T00:00:00.000Z");
    // Platform billing type is NOT the participant's entry fee.
    expect(items[0].entryFee).toBe("Unknown");
  });
  it("keeps useful full descriptions when a source summary omits the topic", () => {
    const { items } = parseEvalAI(
      {
        count: 1,
        next: null,
        results: [
          {
            id: 3,
            title: "Navigation task",
            short_description: "Submit your model",
            description: "<p>A reinforcement learning simulator for embodied navigation.</p>",
          },
        ],
      },
      checkedAt,
    );
    expect(items[0].description).toContain("reinforcement learning simulator");
  });
  it("validates source shapes instead of silently yielding an empty feed", () => {
    expect(() => parseEvalAI({ results: "changed" }, checkedAt)).toThrow();
    expect(() => parseDrivenData("<html>temporarily unavailable</html>", checkedAt)).toThrow();
    expect(() => parseMLH("<html>changed</html>", checkedAt)).toThrow();
    expect(() => parseAIcrowd("<html>changed</html>", checkedAt)).toThrow();
  });
  it("parses exact DrivenData UTC dates, not relative weeks left", () => {
    expect(parseDrivenDeadline("Dec. 3, 2026, 10 p.m. UTC")).toBe("2026-12-03T22:00:00.000Z");
    expect(parseDrivenDeadline("April 3, 2028, 11:59 p.m. UTC")).toBe("2028-04-03T23:59:00.000Z");
    expect(parseDrivenDeadline("3 weeks left")).toBeNull();
    const html = `<div class="panel-container active-comp" data-total_prize_purse="1000"><h3 class="panel-competition-title"><a href="/competitions/1/test/">Test</a></h3><span class="end-date" title="Dec. 3, 2026, 10 p.m. UTC"></span></div><div class="panel-container completed-comp"><h3 class="panel-competition-title"><a href="/competitions/2/old/">Old</a></h3></div>`;
    const items = parseDrivenData(html, checkedAt);
    expect(items).toHaveLength(1);
    expect(items[0].reward).toBe("$1,000");
    expect(items[0].registrationEndsAt).toBeNull();
  });
  it("preserves Kaggle submission deadlines without inventing an entry cutoff", () => {
    const [item] = parseKaggle(
      [{ ref: "sample", title: "Sample", deadline: "2026-12-01T23:59:00Z", reward: "$10,000" }],
      checkedAt,
    );
    expect(item.submissionEndsAt).toBe("2026-12-01T23:59:00.000Z");
    expect(item.registrationEndsAt).toBeNull();
  });
  it.each([
    "sample",
    "/competitions/sample",
    "https://www.kaggle.com/competitions/sample",
    "https://kaggle.com/competitions/sample/",
    "https://www.kaggle.com/c/sample?tracking=yes#overview",
  ])("normalizes Kaggle reference %s without changing saved-item IDs", (ref) => {
    const [item] = parseKaggle([{ ref, title: "Sample" }], checkedAt);
    expect(item.url).toBe("https://www.kaggle.com/competitions/sample");
    expect(item.id).toBe(`kaggle:${ref}`);
  });
  it.each([
    "https://evil.example/competitions/sample",
    "https://www.kaggle.com.evil.example/competitions/sample",
    "https://www.kaggle.com:444/competitions/sample",
    "https://user:pass@www.kaggle.com/competitions/sample",
    "https://www.kaggle.com/datasets/sample",
    "javascript:alert(1)",
  ])("rejects an untrusted Kaggle reference: %s", (ref) => {
    expect(() => parseKaggle([{ ref, title: "Sample" }], checkedAt)).toThrow();
  });
  it("treats MLH end dates as event dates, not submission deadlines", () => {
    const data = {
      props: {
        upcomingEvents: [
          {
            id: "1",
            name: "Hack",
            startsAt: checkedAt,
            endsAt: "2026-11-08T00:00:00Z",
            url: "/events/hack/prizes",
            formatType: "digital",
            location: "Worldwide",
            customFields: { hackathon_focus: ["AI"] },
          },
        ],
      },
    };
    const [item] = parseMLH(
      `<script data-page="app" type="application/json">${JSON.stringify(data)}</script>`,
      checkedAt,
    );
    expect(item.eventEndsAt).toBe("2026-11-08T00:00:00.000Z");
    expect(item.submissionEndsAt).toBeNull();
    expect(item.participation).toBe("Online");
  });
  it("rejects unsafe outgoing source links", () => {
    const html = `<div class="panel-container active-comp"><h3 class="panel-competition-title"><a href="javascript:alert(1)">Bad</a></h3></div>`;
    expect(() => parseDrivenData(html, checkedAt)).toThrow();
  });
});
