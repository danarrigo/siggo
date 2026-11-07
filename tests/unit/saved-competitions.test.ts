import { describe, expect, it } from "vitest";
import { type Competition, defaultWorkspace, isActive } from "../../src/lib/model";
import {
  acknowledgeDeadlineChanges,
  competitionLibrary,
  deadlineChangeLabel,
  reconcileSavedCompetitions,
  toggleSavedCompetition,
} from "../../src/lib/saved-competitions";

import { savedCompetition as original } from "../fixtures/saved-competition";
import { workspaceCompetitions } from "../../src/lib/workspace";

const now = Date.parse("2026-11-06T00:00:00Z");
const saved = () =>
  toggleSavedCompetition(
    { ...defaultWorkspace, notes: { [original.id]: "Keep the approach" } },
    original,
  );
const update = (overrides: Partial<Competition>) => ({
  ...original,
  lastSeenAt: "2026-11-02T00:00:00Z",
  ...overrides,
});

describe("durable saved competition details", () => {
  it("establishes a baseline without false alerts, including legacy bookmarks", () => {
    const workspace = saved();
    expect(workspace.savedSnapshots[original.id]).toEqual(original);
    expect(workspace.deadlineChanges).toEqual([]);
    const legacy = reconcileSavedCompetitions({ ...defaultWorkspace, saved: [original.id] }, [
      original,
    ]);
    expect(legacy.savedSnapshots[original.id]).toEqual(original);
    expect(legacy.deadlineChanges).toEqual([]);
    expect(reconcileSavedCompetitions(legacy, [original])).toBe(legacy);
  });
  it("keeps ended and missing listings and their notes without assuming absence means ended", () => {
    const workspace = reconcileSavedCompetitions(saved(), []);
    const items = competitionLibrary([], workspace, now);
    expect(items).toEqual([original]);
    expect(isActive(items[0], now)).toBe(true);
    expect(workspaceCompetitions([], workspace, now)).toEqual([]);
    const ended = reconcileSavedCompetitions(workspace, [
      update({ submissionEndsAt: "2020-01-01" }),
    ]);
    const retained = competitionLibrary([], ended, now)[0];
    expect(isActive(retained, now)).toBe(false);
    expect(ended.notes[original.id]).toBe("Keep the approach");
    expect(reconcileSavedCompetitions(ended, []).savedSnapshots[original.id]).toEqual(retained);
  });
  it("uses current metadata over an older saved snapshot and avoids duplicate active/archived records", () => {
    const workspace = saved();
    const current = update({ title: "Updated title", submissionEndsAt: "2026-12-01" });
    expect(competitionLibrary([current], workspace, now)).toEqual([current]);
    const refreshed = reconcileSavedCompetitions(workspace, [current]);
    expect(competitionLibrary([original], refreshed, now)).toEqual([current]);
  });
  it("retains bookmark identity and notes when a compatible parser ID changes", () => {
    const renamed = update({ id: "evalai:new-parser-id", submissionEndsAt: "2026-12-01" });
    const workspace = reconcileSavedCompetitions(saved(), [renamed]);
    expect(workspace.saved).toEqual([original.id]);
    expect(competitionLibrary([renamed], workspace, now)[0].id).toBe(original.id);
    expect(workspace.deadlineChanges[0].competitionId).toBe(original.id);
    expect(workspace.notes[original.id]).toBe("Keep the approach");
  });
  it("unsaving prunes tracking and unread updates but never deletes a private note", () => {
    const updated = reconcileSavedCompetitions(saved(), [
      update({ submissionEndsAt: "2026-11-20" }),
    ]);
    const workspace = toggleSavedCompetition(updated, original);
    expect(workspace.savedSnapshots).toEqual({});
    expect(workspace.deadlineChanges).toEqual([]);
    expect(workspace.notes[original.id]).toBe("Keep the approach");
  });
  it("does not silently discard notes or earlier snapshots when tracking reaches its size bound", () => {
    const catalog = Array.from({ length: 700 }, (_, i) => ({
      ...original,
      id: `evalai:${i}`,
      url: `https://eval.ai/challenges/${i}`,
      description: "x".repeat(1500),
    }));
    const workspace = {
      ...defaultWorkspace,
      saved: catalog.map((item) => item.id),
      notes: { private: "Keep" },
    };
    const limited = reconcileSavedCompetitions(workspace, catalog);
    expect(limited.trackingLimited).toBe(true);
    expect(limited.savedSnapshots).toEqual({});
    expect(limited.notes).toEqual(workspace.notes);
    expect(limited.saved).toEqual(workspace.saved);
  });
});

describe("observed deadline changes", () => {
  it("keeps registration, submission, challenge, and event changes distinct", () => {
    const latest = update({
      registrationEndsAt: "2026-11-10",
      submissionEndsAt: "2026-11-20",
      challengeEndsAt: "2026-11-25",
      eventEndsAt: "2026-11-30",
    });
    const workspace = reconcileSavedCompetitions(saved(), [latest]);
    expect(workspace.deadlineChanges.map((change) => change.field)).toEqual([
      "registrationEndsAt",
      "submissionEndsAt",
      "challengeEndsAt",
      "eventEndsAt",
    ]);
    expect(workspace.deadlineChanges.map(deadlineChangeLabel)).toEqual([
      "Deadline added",
      "Extended",
      "Deadline added",
      "Deadline added",
    ]);
    expect(reconcileSavedCompetitions(workspace, [latest])).toBe(workspace);
  });
  it("coalesces unread changes and cancels reversions to the earlier baseline", () => {
    const first = reconcileSavedCompetitions(saved(), [update({ submissionEndsAt: "2026-11-20" })]);
    const latest = reconcileSavedCompetitions(first, [
      update({ submissionEndsAt: "2026-11-25", lastSeenAt: "2026-11-03T00:00:00Z" }),
    ]);
    expect(latest.deadlineChanges).toHaveLength(1);
    expect(latest.deadlineChanges[0]).toMatchObject({
      before: original.submissionEndsAt,
      after: "2026-11-25",
    });
    const reverted = reconcileSavedCompetitions(latest, [
      update({ lastSeenAt: "2026-11-04T00:00:00Z" }),
    ]);
    expect(reverted.deadlineChanges).toEqual([]);
  });
  it("acknowledges only exact observed versions, not newer unseen changes", () => {
    const first = reconcileSavedCompetitions(saved(), [update({ submissionEndsAt: "2026-11-20" })]);
    const latest = reconcileSavedCompetitions(first, [
      update({ submissionEndsAt: "2026-11-25", lastSeenAt: "2026-11-03T00:00:00Z" }),
    ]);
    expect(
      acknowledgeDeadlineChanges(latest, [first.deadlineChanges[0].id]).deadlineChanges,
    ).toEqual(latest.deadlineChanges);
    const read = acknowledgeDeadlineChanges(
      latest,
      latest.deadlineChanges.map((change) => change.id),
    );
    expect(
      reconcileSavedCompetitions(read, [latest.savedSnapshots[original.id]]).deadlineChanges,
    ).toEqual([]);
    const changedAgain = reconcileSavedCompetitions(read, [
      update({ submissionEndsAt: "2026-11-26", lastSeenAt: "2026-11-04T00:00:00Z" }),
    ]);
    expect(changedAgain.deadlineChanges[0]).toMatchObject({
      before: "2026-11-25",
      after: "2026-11-26",
    });
  });
  it("does not invent deadline removal from omissions or refresh failures", () => {
    const omitted = reconcileSavedCompetitions(saved(), [update({ submissionEndsAt: null })]);
    expect(omitted.deadlineChanges).toEqual([]);
    expect(omitted.savedSnapshots[original.id].submissionEndsAt).toBe(original.submissionEndsAt);
    expect(reconcileSavedCompetitions(omitted, []).deadlineChanges).toEqual([]);
    expect(
      reconcileSavedCompetitions(omitted, [
        update({ submissionEndsAt: "2026-11-20", lastSeenAt: "2026-11-03T00:00:00Z" }),
      ]).deadlineChanges[0].before,
    ).toBe(original.submissionEndsAt);
  });
  it("does not mistake a timezone representation change for a changed instant", () => {
    const timed = toggleSavedCompetition(defaultWorkspace, {
      ...original,
      submissionEndsAt: "2026-11-15T00:00:00Z",
    });
    const workspace = reconcileSavedCompetitions(timed, [
      update({ submissionEndsAt: "2026-11-15T07:00:00+07:00" }),
    ]);
    expect(workspace.deadlineChanges).toEqual([]);
  });
  it("labels precision changes without claiming an extension or invented closing time", () => {
    const workspace = reconcileSavedCompetitions(saved(), [
      update({ submissionEndsAt: "2026-11-15T12:00:00Z" }),
    ]);
    expect(deadlineChangeLabel(workspace.deadlineChanges[0])).toBe("Deadline details updated");
    expect(workspace.deadlineChanges[0].before).toBe("2026-11-15");
    expect(
      deadlineChangeLabel(
        reconcileSavedCompetitions(saved(), [update({ submissionEndsAt: "2026-11-12" })])
          .deadlineChanges[0],
      ),
    ).toBe("Moved earlier");
  });
  it("ignores stale responses and does not notify about the user's own manual edits", () => {
    expect(
      reconcileSavedCompetitions(saved(), [
        { ...original, submissionEndsAt: "2026-12-01", lastSeenAt: "2026-10-01T00:00:00Z" },
      ]),
    ).toEqual(saved());
    const manual = { ...original, id: "manual:own", source: "manual" as const, image: null };
    const workspace = toggleSavedCompetition(
      { ...defaultWorkspace, manualCompetitions: [manual] },
      manual,
    );
    const latest = reconcileSavedCompetitions(
      { ...workspace, manualCompetitions: [{ ...manual, submissionEndsAt: "2026-12-01" }] },
      [],
    );
    expect(latest.deadlineChanges).toEqual([]);
    expect(latest.savedSnapshots[manual.id].submissionEndsAt).toBe("2026-12-01");
  });
});
