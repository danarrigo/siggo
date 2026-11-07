"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  onSaveNote,
  onUnsave,
}: {
  id: string;
  note: string;
  onSaveNote: (note: string) => boolean;
  onUnsave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  function close() {
    if (draft !== note && !window.confirm("Discard the unsaved changes to your note?")) return;
    setOpen(false);
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
            setOpen(true);
          }}
        >
          View note
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
                if (draft !== note && !window.confirm("Discard the unsaved changes to your note?"))
                  return;
                onUnsave();
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
