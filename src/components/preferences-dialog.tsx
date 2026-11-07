"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Profile, profileSchema } from "@/lib/model";

const suggestions = [
  "Games & simulation",
  "Finance",
  "LLMs & agents",
  "Computer vision",
  "Forecasting",
  "Science & health",
];
export function PreferencesDialog({
  open,
  onOpenChange,
  profile,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onApply: (profile: Profile) => void;
}) {
  // The parent remounts this form when opening so cancel never edits live preferences.
  const [draft, setDraft] = useState(profile);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  function toggle(interest: string) {
    setDraft({
      ...draft,
      interests: draft.interests.includes(interest)
        ? draft.interests.filter((item) => item !== interest)
        : [...draft.interests, interest],
    });
  }
  function addInterest() {
    const value = custom.trim();
    if (
      value &&
      value.length <= 60 &&
      !draft.interests.some((item) => item.toLowerCase() === value.toLowerCase())
    )
      toggle(value);
    setCustom("");
  }
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const result = profileSchema.safeParse(draft);
    if (!result.success) {
      setError("Add a country and keep your interests to 16 topics, up to 60 characters each.");
      return;
    }
    onApply(result.data);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="preferences-dialog">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Used to sort recommendations. All competitions remain available.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={apply} className="preferences-form">
          <fieldset>
            <legend>Interests</legend>
            <p className="field-help">
              Choose topics to prioritize. You can change these at any time.
            </p>
            <div className="interest-options">
              {[...new Set([...suggestions, ...draft.interests])].map((interest) => (
                <button
                  type="button"
                  key={interest}
                  aria-pressed={draft.interests.includes(interest)}
                  onClick={() => toggle(interest)}
                  className={draft.interests.includes(interest) ? "chosen" : ""}
                >
                  {draft.interests.includes(interest) ? <Check size={13} /> : <Plus size={13} />}
                  {interest}
                </button>
              ))}
            </div>
            <div className="custom-interest">
              <Input
                aria-label="Custom interest"
                placeholder="Add another topic"
                maxLength={60}
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addInterest();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addInterest}
                disabled={!custom.trim()}
              >
                Add
              </Button>
            </div>
          </fieldset>
          <div className="form-grid">
            <label>
              Based in
              <Input
                value={draft.country}
                maxLength={80}
                required
                onChange={(event) => setDraft({ ...draft, country: event.target.value })}
              />
            </label>
            <label>
              Participation
              <select
                value={draft.team}
                onChange={(event) =>
                  setDraft({ ...draft, team: event.target.value as Profile["team"] })
                }
              >
                <option>Both</option>
                <option>Solo</option>
                <option>Team</option>
              </select>
            </label>
          </div>
          <label className="compute-field">
            <span>Compute</span>
            <Input
              placeholder="e.g. DGX Spark"
              value={draft.compute}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, compute: event.target.value })}
            />
            <span className="field-help">
              A profile note, not a guarantee that a challenge supports your hardware.
            </span>
          </label>
          <div className="preference-toggles">
            {(
              [
                ["student", "I'm a student", "Student status is a clue, not proof of eligibility."],
                [
                  "remoteOnly",
                  "Remote qualifying rounds",
                  "Keep in-person events in All, but rank them lower.",
                ],
                [
                  "preferFree",
                  "Prefer free entry",
                  "Unpublished fees stay unknown, not assumed free.",
                ],
                [
                  "fundedFinals",
                  "Finalist travel should be funded",
                  "Funding is unverified unless confirmed by the organizer.",
                ],
              ] as const
            ).map(([key, label, help]) => (
              <label className="toggle-row" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
                />
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="error-message">
              <X size={14} />
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Apply preferences</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
