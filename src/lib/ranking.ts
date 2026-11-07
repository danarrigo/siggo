import { type Competition, type Workspace, deadlineTime, endDate, isDateOnly } from "./model";

const topicTerms: Record<string, string[]> = {
  "games & simulation": [
    "game",
    "games",
    "gaming",
    "chess",
    "simulation",
    "simulator",
    "reinforcement",
    "multi-agent",
    "mmo",
    "procgen",
    "robotics",
  ],
  finance: [
    "finance",
    "financial",
    "trading",
    "market",
    "portfolio",
    "stock",
    "investment",
    "fintech",
    "banking",
    "quantitative",
    "fraud",
  ],
  "llms & agents": ["llm", "language model", "agent", "generative", "rag"],
  "computer vision": ["vision", "image", "video", "detection", "segmentation"],
  forecasting: ["forecast", "prediction", "time series"],
  "science & health": ["health", "medical", "science", "climate", "energy", "biology"],
};

function matches(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}
export function topicMatches(item: Competition, interests: string[]) {
  const text = [item.title, item.description, ...item.tags].join(" ").toLowerCase();
  return interests.filter((interest) => {
    const normalized = interest.toLowerCase();
    return (topicTerms[normalized] ?? [normalized]).some((term) => matches(text, term));
  });
}

export function rankCompetition(
  item: Competition,
  workspace: Workspace,
  all: Competition[],
  now = Date.now(),
) {
  const { profile, saved, dismissed } = workspace;
  const topics = topicMatches(item, profile.interests);
  let score = topics.length * 30;
  const reasons = topics.map((topic) => `Matches ${topic.toLowerCase()}`);
  const cautions: string[] = [];
  if (item.participation === "Online") {
    score += profile.remoteOnly ? 14 : 5;
    reasons.push("Online participation");
  } else if (item.participation === "In person" && profile.remoteOnly) {
    score -= 30;
    cautions.push("Requires in-person participation");
  } else if (item.participation === "Check format" || item.participation === "Hybrid") {
    cautions.push("Confirm qualifying-round format");
  }
  if (profile.preferFree && item.entryFee === "Paid") {
    score -= 20;
    cautions.push("Paid entry");
  }
  if (item.entryFee === "Unknown") cautions.push("Entry fee unverified");
  if (
    item.registrationOpen === false ||
    (item.registrationEndsAt && deadlineTime(item.registrationEndsAt) <= now)
  ) {
    score -= 45;
    cautions.push("Registration closed");
  }
  const end = endDate(item);
  if (end) {
    const days = (deadlineTime(end) - now) / 86400000;
    if (days > 730) {
      score -= 10;
      cautions.push("Long-running listing; confirm current rounds");
    } else if (days > 0 && days <= 45) {
      score += 10;
      reasons.push("Near-term timeline");
      if (days < 7) score -= 3;
    }
  } else {
    cautions.push("End date not published");
  }

  // Feedback nudges shared topics, but never changes factual eligibility.
  const savedTags = new Set(
    all
      .filter((other) => saved.includes(other.id))
      .flatMap((other) => other.tags.map((tag) => tag.toLowerCase())),
  );
  const feedback = item.tags.filter((tag) => savedTags.has(tag.toLowerCase())).length;
  if (feedback && !saved.includes(item.id)) {
    score += Math.min(feedback * 3, 12);
    reasons.push("Related to your shortlist");
  }
  if (dismissed.includes(item.id)) {
    score -= 100;
    cautions.push("Marked less relevant by you");
  }
  const label = dismissed.includes(item.id)
    ? "Less like this"
    : topics.length &&
        !cautions.includes("Registration closed") &&
        item.participation !== "In person"
      ? "Strong signal"
      : "Explore";
  return { score, reasons, cautions, label, topics };
}

export function formatDate(value: string | null, withTime = false) {
  if (!value) return "Not published";
  const dateOnly = isDateOnly(value);
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: dateOnly ? "UTC" : "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(withTime && !dateOnly ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(value)) + (withTime ? (dateOnly ? " · time/zone unlisted" : " WIB") : "")
  );
}

export function relativeDeadline(value: string | null, now: number) {
  if (!value) return "End date unlisted";
  const days = Math.ceil((deadlineTime(value) - now) / 86400000);
  if (days > 730) return "Long-running";
  if (days <= 0) return "Ended";
  if (isDateOnly(value)) return "Time/zone unlisted";
  if (days === 1) return "Ends in 1 day";
  return days < 31 ? `Ends in ${days} days` : formatDate(value);
}
