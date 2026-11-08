import { describe, expect, it } from "vitest";
import { parseTensorHack } from "../../src/lib/sources/parsers";
import {
  competitionSchema,
  defaultWorkspace,
  displayDeadline,
  endDate,
  isActive,
} from "../../src/lib/model";
import { deadlineReminders } from "../../src/lib/workspace";
import {
  reconcileSavedCompetitions,
  toggleSavedCompetition,
} from "../../src/lib/saved-competitions";
import { tensorHackEntries, tensorHackPage } from "../fixtures/tensorhack";

const stamp = "2035-11-29T00:00:00.000Z";
const read = (html = tensorHackPage()) => parseTensorHack(html, stamp);

describe("TensorHack public HTML metadata", () => {
  it("imports only declared Devpost records, preserves provenance, and never invents a destination", () => {
    const result = read(
      tensorHackPage(
        [...tensorHackEntries, { id: "luma-other", name: "Other event", deadline: "2035-12-01" }],
        [
          {
            id: tensorHackEntries[0].id,
            url: "https://finance-fixture.devpost.com/?utm_source=fixture",
          },
        ],
      ),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      url: "https://finance-fixture.devpost.com/",
      listedDeadline: "2035-12-01",
      metadataSource: {
        name: "TensorHack",
        url: "https://tensorhack.com/hackathons/devpost-finance-fixture",
      },
      image: null,
      reward: null,
      entryFee: "Unknown",
      submissionEndsAt: null,
      registrationEndsAt: null,
      challengeEndsAt: null,
      eventEndsAt: null,
    });
    expect(result.items[1].url).toBe("https://tensorhack.com/hackathons/devpost-games-fixture");
  });
  it("does not stop at the first 40 or at the first JSON-LD page", () => {
    const rows = Array.from({ length: 189 }, (_, index) => ({
      id: `devpost-fixture-${index}`,
      name: `Fictional event ${index}`,
      deadline: "2035-12-01",
    }));
    expect(read(tensorHackPage(rows)).items).toHaveLength(189);
  });
  it("rejects changed/unrendered page structure instead of treating it as an empty successful feed", () => {
    expect(() => read("<h1>Sign in</h1>")).toThrow();
    expect(read(tensorHackPage([])).items).toEqual([]);
  });
  it("rejects impossible dates, traversal IDs and missing published listing links", () => {
    expect(
      read(tensorHackPage([{ ...tensorHackEntries[0], deadline: "2035-02-31" }])).skipped,
    ).toBe(1);
    expect(
      read(tensorHackPage([{ ...tensorHackEntries[0], id: "devpost-../api/private" }])).items,
    ).toEqual([]);
    expect(
      read(
        tensorHackPage().replaceAll(
          'href="/hackathons/devpost-finance-fixture"',
          'href="https://evil.example/hackathons/devpost-finance-fixture"',
        ),
      ).items,
    ).toHaveLength(1);
  });
  it("accepts only explicit Devpost event links, not projects, other hosts, or credentials", () => {
    for (const url of [
      "https://devpost.com/software/project",
      "https://devpost.com.evil.example/",
      "https://owner:secret@finance-fixture.devpost.com/",
      "https://info.devpost.com/",
    ]) {
      expect(
        read(tensorHackPage(tensorHackEntries, [{ id: tensorHackEntries[0].id, url }])).items[0]
          .url,
      ).toBe("https://tensorhack.com/hackathons/devpost-finance-fixture");
    }
  });
  it("parses published JSON without executing page scripts", () => {
    Object.defineProperty(globalThis, "siggoFixtureExecuted", {
      value: false,
      configurable: true,
      writable: true,
    });
    try {
      read(`${tensorHackPage()}<script>globalThis.siggoFixtureExecuted=true</script>`);
      expect(Reflect.get(globalThis, "siggoFixtureExecuted")).toBe(false);
    } finally {
      Reflect.deleteProperty(globalThis, "siggoFixtureExecuted");
    }
  });
});

describe("provider-listed cutoff semantics", () => {
  it("safely rejects malformed, non-HTTPS, and credential-bearing provenance URLs", () => {
    const item = read().items[0];
    for (const url of [
      "not a URL",
      "http://tensorhack.com/",
      "https://owner:secret@tensorhack.com/",
    ]) {
      const invalid = { ...item, metadataSource: { name: "TensorHack", url } };
      expect(() => competitionSchema.safeParse(invalid)).not.toThrow();
      expect(competitionSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("retains known provenance and cutoff without inventing a removal from older/partial snapshots", () => {
    const item = read().items[0];
    const saved = toggleSavedCompetition(defaultWorkspace, item);
    const partial = { ...item, lastSeenAt: "2035-11-30T00:00:00.000Z" };
    delete partial.metadataSource;
    delete partial.listedDeadline;
    const result = reconcileSavedCompetitions(saved, [partial]);
    expect(result.deadlineChanges).toEqual([]);
    expect(result.savedSnapshots[item.id]).toMatchObject({
      listedDeadline: item.listedDeadline,
      metadataSource: item.metadataSource,
    });
  });
  it("sorts/displays an uncertain cutoff without treating it as a verified end or automatically archiving it", () => {
    const item = read().items[0];
    expect(displayDeadline(item)).toBe("2035-12-01");
    expect(endDate(item)).toBeNull();
    expect(isActive(item, Date.parse("2035-12-10T00:00:00Z"))).toBe(true);
    expect(deadlineReminders([item], [item.id], Date.parse(stamp))[0]).toMatchObject({
      field: "listedDeadline",
      label: "Listed cutoff",
    });
  });
  it("retains cutoff changes and provenance independently of official deadline fields", () => {
    const item = read().items[0];
    const saved = toggleSavedCompetition(defaultWorkspace, item);
    const workspace = reconcileSavedCompetitions(saved, [
      { ...item, listedDeadline: "2035-12-03", lastSeenAt: "2035-11-30T00:00:00.000Z" },
    ]);
    expect(workspace.deadlineChanges).toHaveLength(1);
    expect(workspace.deadlineChanges[0]).toMatchObject({
      field: "listedDeadline",
      before: "2035-12-01",
      after: "2035-12-03",
    });
    expect(workspace.savedSnapshots[item.id].metadataSource).toEqual(item.metadataSource);
  });
});
