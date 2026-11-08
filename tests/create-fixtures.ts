import { mkdir, writeFile } from "node:fs/promises";
import { type Catalog, type Competition } from "../src/lib/model";
import { sourceDefinitions } from "../src/lib/sources";

const now = Date.now();
const after = (days: number) => new Date(now + days * 86400000).toISOString();
function item(overrides: Partial<Competition>): Competition {
  return {
    id: "evalai:default",
    source: "evalai",
    title: "Research challenge",
    url: "https://eval.ai/web/challenges/challenge-page/1/overview",
    description:
      "An opportunity to build, experiment, and discover a new approach to machine learning.",
    category: "Research challenge",
    tags: [],
    organizer: "Research team",
    reward: null,
    opensAt: after(-7),
    registrationEndsAt: null,
    submissionEndsAt: null,
    challengeEndsAt: after(28),
    eventEndsAt: null,
    registrationOpen: null,
    participation: "Online",
    location: "Online submissions; finals vary",
    entryFee: "Unknown",
    eligibility: "Eligibility for Indonesia is unverified. Check the organizer's rules.",
    lastSeenAt: after(0),
    firstSeenAt: after(-10),
    ...overrides,
  };
}
const competitions = [
  item({
    id: "evalai:arena",
    firstSeenAt: after(-0.25),
    title: "Neural Arena: Multi-agent Simulation",
    image: { url: "https://media.eval.ai/media/logos/siggo-e2e-cover.png", kind: "cover" },
    tags: ["reinforcement learning", "games", "simulation"],
    description:
      "Train agents to cooperate, compete, and find their footing in procedurally generated worlds. Explore the next frontier of multi-agent learning.",
    reward: "$50,000",
    url: "https://eval.ai/web/challenges/challenge-page/1/overview",
  }),
  item({
    id: "drivendata:finance",
    source: "drivendata",
    category: "ML / Data science",
    title: "Forecast the Financial Frontier",
    tags: ["finance", "forecasting", "time series"],
    description:
      "Turn noisy market signals into robust financial forecasts. Build models that hold up when conditions change, not just on the leaderboard.",
    reward: "$25,000",
    challengeEndsAt: after(14),
    url: "https://www.drivendata.org/competitions/2/finance/",
  }),
  item({
    id: "mlh:build",
    source: "mlh",
    title: "Build Something That Plays",
    category: "Hackathon",
    tags: ["games", "AI", "open ended"],
    description:
      "A weekend for playful ideas. Prototype a game, a simulation, or something delightfully unexpected with fellow builders around the world.",
    challengeEndsAt: null,
    eventEndsAt: after(5),
    url: "https://www.mlh.com/events/build",
  }),
  item({
    id: "evalai:vision",
    title: "Seeing Beyond the Frame",
    // Exercise preview loading by image URL, independently of the discovery source.
    image: { url: "https://www.kaggle.com/open-graph/images/Competitions/1234", kind: "cover" },
    tags: ["computer vision", "video", "science"],
    description:
      "Help machine learning systems understand the world beyond individual frames. A research challenge in temporal reasoning and video understanding.",
    challengeEndsAt: after(21),
    url: "https://eval.ai/web/challenges/challenge-page/4/overview",
  }),
  item({
    id: "aicrowd:closed",
    source: "aicrowd",
    title: "Game Agent Challenge: Final Round",
    tags: ["game", "agents"],
    description:
      "The final round is under way. Existing teams are submitting game-playing agents, but registration for new participants has already closed.",
    registrationOpen: false,
    registrationEndsAt: after(-2),
    challengeEndsAt: after(8),
    url: "https://www.aicrowd.com/challenges/game-agent",
  }),
  item({
    id: "mlh:travel",
    source: "mlh",
    title: "Campus AI Hack Weekend",
    category: "Hackathon",
    tags: ["machine learning", "AI"],
    participation: "In person",
    location: "California, United States",
    challengeEndsAt: null,
    eventEndsAt: after(12),
    url: "https://www.mlh.com/events/campus",
  }),
  item({
    id: "zindi:flood",
    source: "zindi",
    title: "Forecast River Flood Risk",
    image: {
      url: "https://zindi-public-release.s3.eu-west-2.amazonaws.com/uploads/competition/image/1234/siggo-e2e-flood.png",
      kind: "cover",
    },
    category: "ML / Data science",
    tags: ["climate", "forecasting"],
    url: "https://zindi.world/competitions/river-flood-risk",
    description: "A clearly fictional E2E calendar listing with date-only deadlines.",
    submissionEndsAt: after(30).slice(0, 10),
    registrationEndsAt: after(28).slice(0, 10),
    challengeEndsAt: null,
  }),
  item({
    id: "codabench:reasoning",
    source: "codabench",
    title: "Language Reasoning Benchmark",
    reward:
      "All participants receive recognition and an invitation to share their research with the community. "
        .repeat(8)
        .trim(),
    tags: ["language", "reasoning"],
    url: "https://www.codabench.org/competitions/1234/",
    description: "A clearly fictional E2E phase-verified research challenge.",
    challengeEndsAt: after(40),
  }),
  item({
    id: "devpost:tensorhack:community-fixture",
    source: "devpost",
    title: "Community Builder Hack",
    description:
      "A clearly fictional E2E third-party metadata listing with an unverified cutoff type.",
    category: "Hackathon",
    url: "https://tensorhack.com/hackathons/devpost-community-fixture",
    metadataSource: {
      name: "TensorHack",
      url: "https://tensorhack.com/hackathons/devpost-community-fixture",
    },
    listedDeadline: after(6).slice(0, 10),
    opensAt: null,
    challengeEndsAt: null,
    participation: "Check format",
    location: "Check organizer rules",
  }),
  item({
    id: "devpost:organizer-logo-fixture",
    source: "devpost",
    title: "STEM2Connect logo test",
    description:
      "A clearly fictional E2E listing for attributed organizer-logo rendering, not a live opportunity.",
    category: "Hackathon",
    url: "https://stem2connect-online-hackathon.devpost.com/",
    metadataSource: {
      name: "TensorHack",
      url: "https://tensorhack.com/hackathons/devpost-stem2connect-ai-hackathon",
    },
    image: {
      url: "https://raw.githubusercontent.com/stem4teens-sys/stem2connect-website/63825f28b74a318d955cba782c6088bd700da1be/assets/logo.jpg",
      kind: "logo",
      attribution: {
        name: "STEM2Connect",
        url: "https://github.com/stem4teens-sys/stem2connect-website/blob/63825f28b74a318d955cba782c6088bd700da1be/assets/logo.jpg",
      },
    },
    listedDeadline: after(20).slice(0, 10),
    opensAt: null,
    challengeEndsAt: null,
    participation: "Check format",
    location: "Check organizer rules",
  }),
  item({
    id: "evalai:expired",
    title: "An Archived Competition",
    challengeEndsAt: after(-1),
    url: "https://eval.ai/web/challenges/challenge-page/7/overview",
  }),
];
const catalog: Catalog = {
  competitions,
  sources: sourceDefinitions.map((source) => ({
    ...source,
    state:
      source.id === "kaggle"
        ? "not-configured"
        : ["zindi", "codabench", "devpost"].includes(source.id)
          ? "partial"
          : "healthy",
    note:
      source.id === "codabench"
        ? `${source.note} 81 public entries discovered (directory complete); 1 phase check this refresh; 80 known IDs not yet verified. Checks resume across refreshes.`
        : source.note,
    count: competitions.filter((item) => item.source === source.id).length,
    checkedAt: source.id === "kaggle" ? null : after(0),
    lastSuccessAt: source.id === "kaggle" ? null : after(0),
  })),
  updatedAt: after(0),
  // Fictional server-only progress metadata must not be serialized into the dashboard.
  codabench: {
    checks: { "1234": { attemptedAt: after(0), verifiedAt: after(0), active: true } },
    directoryCount: 81,
    directoryCheckedAt: after(0),
  },
};
await mkdir("tests/fixtures", { recursive: true });
await writeFile("tests/fixtures/catalog.json", JSON.stringify(catalog, null, 2));
