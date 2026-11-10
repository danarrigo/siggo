import { describe, expect, it } from "vitest";
import {
  defaultWorkspace,
  participationPlanSchema,
  workspaceSchema,
  type ParticipationPlan,
} from "../../src/lib/model";
import { withParticipationPlan, withoutManualCompetition } from "../../src/lib/workspace";
import {
  competitionLibrary,
  reconcileSavedCompetitions,
  toggleSavedCompetition,
} from "../../src/lib/saved-competitions";
import { savedCompetition as item } from "../fixtures/saved-competition";

const plan: ParticipationPlan = {
  stage: "Preparing",
  tasks: [{ id: "task-1", text: "Read the organizer rules", done: false }],
};
describe("private participation plans", () => {
  it("reads legacy workspaces with an empty plan collection without a migration", () => {
    const legacy = { profile: defaultWorkspace.profile, saved: [], dismissed: [] };
    expect(workspaceSchema.parse(legacy).participationPlans).toEqual({});
  });
  it("starting a plan saves its listing and snapshot without changing facts or private notes", () => {
    const original = { ...defaultWorkspace, notes: { [item.id]: "Private note" } };
    const next = withParticipationPlan(original, item.id, plan, item);
    expect(next.saved).toEqual([item.id]);
    expect(next.savedSnapshots[item.id]).toEqual(item);
    expect(next.notes).toEqual(original.notes);
    expect(next.participationPlans[item.id]).toEqual(plan);
    expect(original.participationPlans).toEqual({});
  });
  it("retains plans through source disappearance, archival, and unsaving; edits do not silently re-save", () => {
    const tracked = withParticipationPlan(defaultWorkspace, item.id, plan, item);
    const absent = reconcileSavedCompetitions(tracked, []);
    expect(absent.participationPlans[item.id]).toEqual(plan);
    expect(competitionLibrary([], absent, Date.parse("2035-01-01"))[0]).toEqual(item);
    const unsaved = toggleSavedCompetition(absent, item);
    expect(unsaved.participationPlans[item.id]).toEqual(plan);
    const edited = withParticipationPlan(unsaved, item.id, { ...plan, stage: "Submitted" }, item);
    expect(edited.saved).toEqual([]);
    expect(edited.participationPlans[item.id].stage).toBe("Submitted");
    expect(item.registrationOpen).toBe(null);
  });
  it("can track a legacy saved ID without inventing source metadata", () => {
    const next = withParticipationPlan(
      { ...defaultWorkspace, saved: ["evalai:lost"] },
      "evalai:lost",
      plan,
    );
    expect(next.participationPlans["evalai:lost"]).toEqual(plan);
    expect(next.savedSnapshots).toEqual({});
    expect(competitionLibrary([], next, Date.now())).toEqual([]);
  });
  it("removing a plan keeps bookmarks and notes, while explicitly deleting a personal listing removes its plan", () => {
    const tracked = withParticipationPlan(
      { ...defaultWorkspace, notes: { [item.id]: "Keep this" } },
      item.id,
      plan,
      item,
    );
    const removed = withParticipationPlan(tracked, item.id, null, item);
    expect(removed.saved).toEqual([item.id]);
    expect(removed.notes[item.id]).toBe("Keep this");
    expect(removed.participationPlans).toEqual({});
    const personalId = "manual:plan-test";
    const personal = withoutManualCompetition(
      {
        ...tracked,
        participationPlans: { ...tracked.participationPlans, [personalId]: plan },
        notes: { ...tracked.notes, [personalId]: "Remove this" },
      },
      personalId,
    );
    expect(personal.participationPlans).toEqual({ [item.id]: plan });
    expect(personal.notes).toEqual(tracked.notes);
  });
  it("serializes task completion and enforces valid stages, unique task IDs, and bounded content", () => {
    const completed = { ...plan, tasks: plan.tasks.map((task) => ({ ...task, done: true })) };
    const workspace = withParticipationPlan(defaultWorkspace, item.id, completed, item);
    expect(
      workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).participationPlans[item.id],
    ).toEqual(completed);
    for (const value of [
      { ...plan, stage: "Approved" },
      { ...plan, tasks: [{ ...plan.tasks[0], text: " " }] },
      { ...plan, tasks: [{ ...plan.tasks[0], text: "x".repeat(201) }] },
      { ...plan, tasks: [plan.tasks[0], plan.tasks[0]] },
      {
        ...plan,
        tasks: Array.from({ length: 21 }, (_, i) => ({ ...plan.tasks[0], id: String(i) })),
      },
    ])
      expect(participationPlanSchema.safeParse(value).success).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...defaultWorkspace,
        participationPlans: Object.fromEntries(
          Array.from({ length: 201 }, (_, i) => [`evalai:${i}`, plan]),
        ),
      }).success,
    ).toBe(false);
    const large = {
      stage: "Interested",
      tasks: Array.from({ length: 20 }, (_, i) => ({
        id: String(i).padStart(80, "0"),
        text: "x".repeat(200),
        done: false,
      })),
    };
    expect(
      workspaceSchema.safeParse({
        ...defaultWorkspace,
        participationPlans: Object.fromEntries(
          Array.from({ length: 200 }, (_, i) => [`evalai:${i}`, large]),
        ),
      }).success,
    ).toBe(false);
  });
});
