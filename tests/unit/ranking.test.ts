import { describe, expect, it } from "vitest";
import {
  type Catalog,
  type Competition,
  catalogForSources,
  competitionSchema,
  defaultWorkspace,
  deduplicate,
  isActive,
} from "../../src/lib/model";
import { formatDate, rankCompetition, relativeDeadline, topicMatches } from "../../src/lib/ranking";

const now = Date.parse("2026-11-06T00:00:00Z");
const game: Competition = {
  id: "evalai:1",
  source: "evalai",
  title: "Multi-agent Game Simulation",
  description: "Train reinforcement learning agents.",
  url: "https://eval.ai/challenges/1",
  category: "Research challenge",
  tags: ["simulation"],
  organizer: "Research lab",
  reward: null,
  opensAt: null,
  registrationEndsAt: null,
  submissionEndsAt: null,
  challengeEndsAt: "2026-12-01T00:00:00Z",
  eventEndsAt: null,
  registrationOpen: null,
  participation: "Online",
  location: "Online",
  entryFee: "Unknown",
  eligibility: "Unverified",
  lastSeenAt: "2026-11-06T00:00:00Z",
};
describe("honest, explainable recommendations", () => {
  it("matches interests and explains online fit without claiming eligibility", () => {
    const rank = rankCompetition(game, defaultWorkspace, [game], now);
    expect(rank.label).toBe("Strong signal");
    expect(rank.reasons).toContain("Matches games & simulation");
    expect(rank.cautions).toContain("Entry fee unverified");
    expect(rank.reasons.join(" ")).not.toMatch(/eligible|free entry|hardware/i);
  });
  it("uses word boundaries, not misleading substring matches", () => {
    expect(
      topicMatches({ ...game, title: "Marketing platform", description: "", tags: [] }, [
        "Finance",
      ]),
    ).toEqual([]);
    expect(
      topicMatches({ ...game, title: "Financial forecasting", description: "", tags: [] }, [
        "Finance",
      ]),
    ).toEqual(["Finance"]);
  });
  it("demotes closed registration and feedback without deleting opportunities", () => {
    const closed = rankCompetition(
      { ...game, registrationOpen: false },
      defaultWorkspace,
      [game],
      now,
    );
    expect(closed.cautions).toContain("Registration closed");
    expect(closed.label).not.toBe("Strong signal");
    const dismissed = rankCompetition(
      game,
      { ...defaultWorkspace, dismissed: [game.id] },
      [game],
      now,
    );
    expect(dismissed.score).toBeLessThan(
      rankCompetition(game, defaultWorkspace, [game], now).score,
    );
    expect(isActive(game, now)).toBe(true);
  });
  it("uses confirmed in-person format as a soft preference", () => {
    const rank = rankCompetition(
      { ...game, participation: "In person" },
      defaultWorkspace,
      [game],
      now,
    );
    expect(rank.cautions).toContain("Requires in-person participation");
    expect(rank.label).toBe("Explore");
  });
  it("puts actionable timelines ahead of distant benchmark placeholders", () => {
    const timely = { ...game, challengeEndsAt: "2026-12-01T00:00:00Z" };
    const distant = { ...game, challengeEndsAt: "2099-01-01T00:00:00Z" };
    expect(rankCompetition(timely, defaultWorkspace, [timely], now).score).toBeGreaterThan(
      rankCompetition(distant, defaultWorkspace, [distant], now).score,
    );
    expect(relativeDeadline(distant.challengeEndsAt, now)).toBe("Long-running");
  });
  it("removes disabled sources from old snapshots without losing other discoveries", () => {
    const old: Catalog = {
      competitions: [game, { ...game, id: "codalab:old", source: "codalab" }],
      sources: [
        {
          id: "codalab",
          name: "CodaLab",
          url: "https://legacy.example/",
          state: "retired",
          count: 1,
          checkedAt: null,
          lastSuccessAt: null,
          note: "Old snapshot",
        },
        {
          id: "evalai",
          name: "EvalAI",
          url: game.url,
          state: "healthy",
          count: 1,
          checkedAt: game.lastSeenAt,
          lastSuccessAt: game.lastSeenAt,
          note: "Existing discovery",
        },
      ],
      updatedAt: game.lastSeenAt,
    };
    const current = catalogForSources(old, ["evalai", "codabench"]);
    expect(current.competitions).toEqual([game]);
    expect(current.sources.map((source) => source.id)).toEqual(["evalai"]);
    expect(current.updatedAt).toBe(old.updatedAt);
    expect(old.sources).toHaveLength(2);
  });
  it("deduplicates canonical URLs but preserves different editions and tracks", () => {
    expect(
      deduplicate([
        game,
        { ...game, id: "other", url: game.url + "/?utm_source=other#overview" },
        { ...game, id: "next-year", url: game.url + "/2027" },
      ]),
    ).toHaveLength(2);
  });
  it("preserves date-only deadlines without inventing a time or timezone", () => {
    const item = competitionSchema.parse({ ...game, challengeEndsAt: "2026-11-06" });
    expect(formatDate(item.challengeEndsAt, true)).toBe("6 Nov 2026 · time/zone unlisted");
    expect(relativeDeadline(item.challengeEndsAt, now)).toBe("Time/zone unlisted");
    expect(isActive(item, Date.parse("2026-11-07T11:59:59Z"))).toBe(true);
    expect(isActive(item, Date.parse("2026-11-07T12:00:00Z"))).toBe(false);
    const ranked = rankCompetition(
      { ...item, registrationEndsAt: "2026-11-06" },
      defaultWorkspace,
      [item],
      Date.parse("2026-11-06T23:00:00Z"),
    );
    expect(ranked.cautions).not.toContain("Registration closed");
  });
  it("filters past events and formats the actual instant in WIB", () => {
    expect(isActive({ ...game, challengeEndsAt: "2026-11-05T23:59:59Z" }, now)).toBe(false);
    expect(formatDate("2026-11-06T23:00:00Z", true)).toBe("7 Nov 2026, 06:00 WIB");
    expect(relativeDeadline(null, now)).toBe("End date unlisted");
  });
});
