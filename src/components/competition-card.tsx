"use client";

import { Bookmark } from "lucide-react";
import { type Competition, deadlineTime, endDate, isActive } from "@/lib/model";
import { formatDate, relativeDeadline, type rankCompetition } from "@/lib/ranking";
import { CompetitionCover } from "./competition-cover";

export type Ranked = ReturnType<typeof rankCompetition>;
const sourceNames = {
  kaggle: "Kaggle",
  evalai: "EvalAI",
  drivendata: "DrivenData",
  aicrowd: "AIcrowd",
  mlh: "MLH",
  zindi: "Zindi",
  codabench: "Codabench",
  codalab: "CodaLab",
  devpost: "Devpost",
  manual: "Added by you",
};
const categoryNames = {
  "ML / Data science": "ML / Data",
  Hackathon: "Hackathon",
  "Research challenge": "Research",
};

export function CompetitionCard({
  item,
  saved,
  dismissed,
  now,
  eagerArtwork = false,
  isNew = false,
  hasNote = false,
  snapshot = false,
  onSave,
  onDismiss,
  onOpen,
}: {
  item: Competition;
  saved: boolean;
  dismissed: boolean;
  now: number;
  eagerArtwork?: boolean;
  isNew?: boolean;
  hasNote?: boolean;
  snapshot?: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const archived = !isActive(item, now);
  const end = endDate(item);
  const relative = relativeDeadline(end, now);
  const date =
    relative === "Long-running" ? "Long-running" : end ? formatDate(end) : "Not published";
  const dateKind = item.submissionEndsAt
    ? "Submissions"
    : item.challengeEndsAt
      ? "Challenge"
      : item.eventEndsAt
        ? "Event"
        : "End date";
  const dateNote = relative.startsWith("Ends in ")
    ? `${dateKind} · ${relative.slice(8)} left`
    : relative === "Time/zone unlisted"
      ? `${dateKind} · time unlisted`
      : dateKind;
  const closed =
    item.registrationOpen === false ||
    Boolean(item.registrationEndsAt && deadlineTime(item.registrationEndsAt) <= now);
  const soon = !archived && Boolean(end && deadlineTime(end) - now < 7 * 86400000);
  const reward = item.reward?.replace(/\b(usd|eur|gbp)\b/gi, (currency) => currency.toUpperCase());

  return (
    <article
      className={`competition-row ${dismissed ? "is-dismissed" : ""}`}
      data-testid="competition-card"
    >
      <button className="card-cover-trigger" onClick={onOpen} aria-label={`Preview ${item.title}`}>
        <CompetitionCover item={item} eager={eagerArtwork} />
      </button>
      <div className="competition-copy">
        <div className="competition-meta">
          <span>{sourceNames[item.source]}</span>
          <span className="meta-divider" aria-hidden="true">
            /
          </span>
          <span>{categoryNames[item.category]}</span>
          {isNew && <span className="new-listing">New</span>}
          {hasNote && <span className="note-indicator">Has note</span>}
          {archived && !snapshot && <span className="snapshot-indicator">Archived</span>}
          {snapshot && <span className="snapshot-indicator">Saved snapshot</span>}
          {!archived && closed && <span className="registration-closed">Registration closed</span>}
        </div>
        <h2>
          <button onClick={onOpen}>{item.title}</button>
        </h2>
        <p className="competition-description">
          {item.description ||
            "Task details and participation rules are on the official event page."}
        </p>
        <div className="competition-details">
          <span>{item.participation}</span>
          <button
            className="why-button"
            onClick={onOpen}
            aria-label={`Why ${item.title} is recommended`}
          >
            Why listed
          </button>
          <button
            className="less-button"
            aria-label={`${dismissed ? "Undo less relevant for" : "Show less like"} ${item.title}`}
            aria-pressed={dismissed}
            onClick={onDismiss}
          >
            {dismissed ? "Undo feedback" : "Less relevant"}
          </button>
        </div>
      </div>
      <div className={`timeline-column ${soon ? "closing-soon" : ""}`}>
        <span className="column-label">{archived ? "Ended" : "Ends"}</span>
        <strong>{date}</strong>
        <span>{dateNote}</span>
      </div>
      <div className="reward-column">
        <span className="column-label">Prize / reward</span>
        <strong className={!item.reward ? "not-published" : ""}>{reward || "Not listed"}</strong>
      </div>
      <button
        className={`save-button ${saved ? "is-saved" : ""}`}
        aria-label={`${saved ? "Unsave" : "Save"} ${item.title}`}
        aria-pressed={saved}
        onClick={onSave}
      >
        <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
