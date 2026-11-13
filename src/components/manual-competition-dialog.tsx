"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ManualCompetition, categories, isActive, manualCompetitionSchema } from "@/lib/model";

const dateFields = [
  ["registrationEndsAt", "Registration deadline"],
  ["submissionEndsAt", "Submission deadline"],
  ["challengeEndsAt", "Challenge ends"],
  ["eventEndsAt", "Event ends"],
] as const;
function formValues(item?: ManualCompetition) {
  return {
    title: item?.title ?? "",
    url: item?.url ?? "",
    category: item?.category ?? "ML / Data science",
    organizer: item?.organizer ?? "",
    description: item?.description ?? "",
    reward: item?.reward ?? "",
    participation: item?.participation ?? "Check format",
    entryFee: item?.entryFee ?? "Unknown",
    registrationEndsAt: item?.registrationEndsAt?.slice(0, 10) ?? "",
    submissionEndsAt: item?.submissionEndsAt?.slice(0, 10) ?? "",
    challengeEndsAt: item?.challengeEndsAt?.slice(0, 10) ?? "",
    eventEndsAt: item?.eventEndsAt?.slice(0, 10) ?? "",
  };
}

export function ManualCompetitionDialog({
  entries,
  initialEntry,
  onSave,
  onDelete,
  onClose,
}: {
  entries: ManualCompetition[];
  initialEntry?: ManualCompetition;
  onSave: (item: ManualCompetition) => boolean;
  onDelete: (id: string) => boolean;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [draft, setDraft] = useState(() => formValues(initialEntry));
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  function close() {
    if (
      JSON.stringify(draft) !== JSON.stringify(formValues(entry)) &&
      !window.confirm("Discard the unsaved changes to this listing?")
    )
      return;
    onClose();
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const dates = Object.fromEntries(
      dateFields.map(([key]) => [
        key,
        draft[key] ? (draft[key] === entry?.[key]?.slice(0, 10) ? entry[key] : draft[key]) : null,
      ]),
    );
    const result = manualCompetitionSchema.safeParse({
      ...draft,
      ...dates,
      id: entry?.id ?? `manual:${crypto.randomUUID()}`,
      source: "manual",
      image: null,
      title: draft.title.trim(),
      url: draft.url.trim(),
      organizer: draft.organizer.trim(),
      description: draft.description.trim(),
      reward: draft.reward.trim() || null,
      tags: [],
      opensAt: null,
      registrationOpen: null,
      location: "Check the official listing",
      eligibility: "Added by you; eligibility has not been independently verified.",
      lastSeenAt: stamp,
      firstSeenAt: entry?.firstSeenAt ?? stamp,
    });
    if (!result.success) {
      setError("Add a title and a valid HTTPS link without credentials. Check the date fields.");
      return;
    }
    if (!entry && !isActive(result.data)) {
      setError("The closing date has passed. Add an active or upcoming opportunity.");
      return;
    }
    if (onSave(result.data)) onClose();
    else setError("Could not save this listing. Check the workspace status.");
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="personal-dialog">
        <DialogHeader>
          <DialogTitle>
            {managing
              ? "Your personal listings"
              : entry
                ? "Edit personal listing"
                : "Add competition"}
          </DialogTitle>
          <DialogDescription>
            Private to your workspace. Links are not scraped or refreshed automatically.
          </DialogDescription>
        </DialogHeader>
        {managing ? (
          <div className="personal-list">
            {entries.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setEntry(item);
                  setDraft(formValues(item));
                  setManaging(false);
                  setDeleting(false);
                  setError("");
                }}
              >
                <span>{item.title}</span>
                <small>{isActive(item) ? "Edit listing" : "Ended · edit listing"}</small>
              </button>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                setEntry(undefined);
                setDraft(formValues());
                setManaging(false);
              }}
            >
              Add another competition
            </Button>
          </div>
        ) : (
          <form className="personal-form" onSubmit={submit}>
            <label>
              Title
              <Input
                required
                maxLength={500}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              Official URL
              <Input
                required
                type="url"
                placeholder="https://"
                maxLength={2048}
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                <span id="manual-category-label">Competition type</span>
                <select
                  aria-labelledby="manual-category-label"
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      category: event.target.value as ManualCompetition["category"],
                    })
                  }
                >
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value === "ML / Data science"
                        ? "ML / Data"
                        : value === "Research challenge"
                          ? "Research"
                          : value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span id="manual-participation-label">Participation</span>
                <select
                  aria-labelledby="manual-participation-label"
                  value={draft.participation}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      participation: event.target.value as ManualCompetition["participation"],
                    })
                  }
                >
                  {["Check format", "Online", "Hybrid", "In person"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Organizer (optional)
              <Input
                maxLength={200}
                value={draft.organizer}
                onChange={(event) => setDraft({ ...draft, organizer: event.target.value })}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                maxLength={2000}
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <fieldset>
              <legend>Dates (optional)</legend>
              <p className="field-help">
                Calendar dates only; closing times and timezones remain unlisted. Leave unknown
                dates blank.
              </p>
              <div className="form-grid">
                {dateFields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <Input
                      type="date"
                      value={draft[key]}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label>
                Prize / reward (optional)
                <Input
                  maxLength={120}
                  value={draft.reward}
                  onChange={(event) => setDraft({ ...draft, reward: event.target.value })}
                />
              </label>
              <label>
                <span id="manual-fee-label">Entry fee</span>
                <select
                  aria-labelledby="manual-fee-label"
                  value={draft.entryFee}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      entryFee: event.target.value as ManualCompetition["entryFee"],
                    })
                  }
                >
                  {["Unknown", "Free", "Paid"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            {deleting ? (
              <div className="delete-confirmation" role="alert">
                <p>
                  Delete “{entry?.title}”, its bookmark, note, and participation plan? This cannot
                  be undone.
                </p>
                <div className="dialog-actions">
                  <Button type="button" variant="outline" onClick={() => setDeleting(false)}>
                    Keep listing
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (onDelete(entry!.id)) onClose();
                      else setError("Could not delete this listing. Check the workspace status.");
                    }}
                  >
                    Confirm delete
                  </Button>
                </div>
              </div>
            ) : (
              <div className="dialog-actions">
                {entry && (
                  <Button type="button" variant="ghost" onClick={() => setDeleting(true)}>
                    Delete listing
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit">{entry ? "Save listing" : "Add and save competition"}</Button>
              </div>
            )}
            {entries.length > 0 && (
              <button
                className="manage-listings"
                type="button"
                onClick={() => {
                  if (
                    JSON.stringify(draft) !== JSON.stringify(formValues(entry)) &&
                    !window.confirm("Discard the unsaved changes to this listing?")
                  )
                    return;
                  setDraft(formValues(entry));
                  setManaging(true);
                }}
              >
                Manage your {entries.length} personal{" "}
                {entries.length === 1 ? "listing" : "listings"}
              </button>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
