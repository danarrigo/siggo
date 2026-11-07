"use client";

import { useState } from "react";
import { ArrowUpRight, Bookmark, CheckCircle2, Info, ShieldQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type Competition, type Profile } from "@/lib/model";
import { formatDate } from "@/lib/ranking";
import type { Ranked } from "./competition-card";
import { CompetitionCover } from "./competition-cover";

export function DetailDialog({
  item,
  rank,
  profile,
  saved,
  note,
  onSave,
  onSaveNote,
  onEdit,
  onClose,
}: {
  item: Competition;
  rank: Ranked;
  profile: Profile;
  saved: boolean;
  note: string;
  onSave: () => void;
  onSaveNote: (value: string) => boolean;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const [draftNote, setDraftNote] = useState(note);
  function close() {
    if (draftNote !== note && !window.confirm("Discard the unsaved changes to your note?")) return;
    onClose();
  }
  const dates = [
    ["Starts / opens", item.opensAt],
    ["Registration deadline", item.registrationEndsAt],
    ["Submission deadline", item.submissionEndsAt],
    ["Challenge ends", item.challengeEndsAt],
    ["Event ends", item.eventEndsAt],
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="detail-dialog">
        <DialogHeader>
          <div className="eyebrow">
            {item.source === "manual" ? "ADDED BY YOU" : item.source.toUpperCase()} /{" "}
            {item.category}
          </div>
          <DialogTitle>{item.title}</DialogTitle>
          <CompetitionCover
            item={item}
            className="detail-cover"
            eager
            sizes="(max-width: 620px) 100vw, 565px"
          />
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>
        <section className="match-explanation">
          <h3>Why this is listed</h3>
          {rank.reasons.length ? (
            <ul>
              {rank.reasons.map((reason) => (
                <li key={reason}>
                  <CheckCircle2 size={14} />
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>No direct match to your interests. Included to keep the catalog complete.</p>
          )}
          {rank.cautions.length > 0 && (
            <ul className="cautions">
              {rank.cautions.map((reason) => (
                <li key={reason}>
                  <Info size={14} />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="detail-facts">
          <div>
            <span>Participation</span>
            <strong>{item.participation}</strong>
            <small>{item.location}</small>
          </div>
          <div>
            <span>Prize / reward</span>
            <strong>{item.reward || "Not published"}</strong>
          </div>
          <div>
            <span>Entry fee</span>
            <strong>{item.entryFee === "Unknown" ? "Unverified" : item.entryFee}</strong>
          </div>
          <div>
            <span>Registration</span>
            <strong>
              {item.registrationOpen === false
                ? "Closed"
                : item.registrationOpen === true
                  ? "Open at last check"
                  : "Check organizer rules"}
            </strong>
          </div>
        </div>
        <section className="timeline">
          <h3>
            Timeline <span>Times in WIB</span>
          </h3>
          <dl>
            {dates
              .filter(
                ([label, value]) =>
                  value || label === "Registration deadline" || label === "Submission deadline",
              )
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatDate(value, true)}</dd>
                </div>
              ))}
          </dl>
          <p>
            Event and challenge end dates are not automatically registration or submission
            deadlines.
          </p>
        </section>
        <div className="eligibility-notice">
          <ShieldQuestion size={19} />
          <div>
            <strong>Eligibility needs verification</strong>
            <p>
              {item.eligibility}{" "}
              {profile.fundedFinals
                ? "Finalist travel funding is unverified."
                : "Check any finalist travel requirements."}{" "}
              Team size and hardware compatibility also need organizer confirmation.
            </p>
          </div>
        </div>
        <section className="personal-note">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(draftNote);
            }}
          >
            <label htmlFor="competition-note">Private note</label>
            <textarea
              id="competition-note"
              rows={4}
              maxLength={4000}
              placeholder="Ideas, eligibility questions, or team plans…"
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
            />
            <div className="note-actions">
              <span>Only in your workspace</span>
              <Button type="submit" variant="outline" disabled={draftNote === note}>
                Save note
              </Button>
            </div>
          </form>
        </section>
        <p className="source-provenance">
          {item.source === "manual" ? "Personal listing last edited" : "Listing last checked"}{" "}
          {formatDate(item.lastSeenAt, true)}. The organizer&apos;s current rules always take
          precedence.
        </p>
        <div className="dialog-actions">
          <Button variant="outline" aria-pressed={saved} onClick={onSave}>
            <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save opportunity"}
          </Button>
          {onEdit && (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  draftNote !== note &&
                  !window.confirm("Discard the unsaved changes to your note?")
                )
                  return;
                onEdit();
              }}
            >
              Edit listing
            </Button>
          )}
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="primary-link">
            Official challenge <ArrowUpRight size={16} />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
