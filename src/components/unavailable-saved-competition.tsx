"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ParticipationPlan } from "@/lib/model";
import { ParticipationPlanEditor } from "./participation-plan";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Older bookmarks may predate snapshots. Keep their identity and notes accessible without
// inventing competition metadata, an official URL, or an end date.
export function UnavailableSavedCompetition({
  id,
  note,
  plan,
  onSavePlan,
  onSaveNote,
  onUnsave,
}: {
  id: string;
  note: string;
  plan?: ParticipationPlan;
  onSavePlan: (plan: ParticipationPlan | null) => boolean;
  onSaveNote: (note: string) => boolean;
  onUnsave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [taskDirty, setTaskDirty] = useState(false);
  function canLeave() {
    return (
      (draft === note && !taskDirty) ||
      window.confirm(
        draft !== note
          ? taskDirty
            ? "Discard the unsaved note changes and unadded task?"
            : "Discard the unsaved changes to your note?"
          : "Discard the task you haven't added?",
      )
    );
  }
  function close() {
    if (canLeave()) setOpen(false);
  }
  return (
    <>
      <article className="unavailable-saved-listing">
        <div>
          <strong>Saved listing unavailable</strong>
          <p>{id}</p>
          <small>
            Details were not retained before this source listing disappeared. Its status is unknown.
          </small>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDraft(note);
            setTaskDirty(false);
            setOpen(true);
          }}
        >
          {plan ? "View note and plan" : "View note"}
        </Button>
      </article>
      {open && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent className="personal-dialog">
            <DialogHeader>
              <DialogTitle>Saved listing unavailable</DialogTitle>
              <DialogDescription>
                {id}. Missing source details do not confirm that this competition ended.
              </DialogDescription>
            </DialogHeader>
            <ParticipationPlanEditor
              plan={plan}
              onChange={onSavePlan}
              onDraftChange={setTaskDirty}
            />
            <section className="personal-note">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveNote(draft);
                }}
              >
                <label htmlFor="unavailable-note">Private note</label>
                <textarea
                  id="unavailable-note"
                  rows={4}
                  maxLength={4000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="note-actions">
                  <span>Only in your workspace</span>
                  <Button type="submit" variant="outline" disabled={draft === note}>
                    Save note
                  </Button>
                </div>
              </form>
            </section>
            <Button
              variant="outline"
              onClick={() => {
                if (canLeave()) onUnsave();
              }}
            >
              Unsave listing
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
