import type { Competition } from "../../src/lib/model";

// Fictional metadata shared by saved-history and persistence regression tests.
export const savedCompetition: Competition = {
  id: "evalai:history",
  source: "evalai",
  title: "Saved research challenge",
  url: "https://eval.ai/challenges/123",
  description: "Fictional unit-test metadata",
  category: "Research challenge",
  organizer: "Test organizer",
  tags: [],
  reward: null,
  opensAt: null,
  registrationEndsAt: null,
  submissionEndsAt: "2026-11-15",
  challengeEndsAt: null,
  eventEndsAt: null,
  registrationOpen: null,
  participation: "Online",
  location: "Online",
  entryFee: "Unknown",
  eligibility: "Unverified",
  lastSeenAt: "2026-11-01T00:00:00Z",
};
