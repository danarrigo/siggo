"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Competition, type DeadlineChange } from "@/lib/model";
import { formatDate } from "@/lib/ranking";
import { deadlineChangeLabel, deadlineLabels } from "@/lib/saved-competitions";
import type { deadlineReminders } from "@/lib/workspace";

export function RemindersDialog({
  reminders,
  changes,
  competitions,
  snapshotIds,
  onAcknowledge,
  onOpen,
  onClose,
}: {
  reminders: ReturnType<typeof deadlineReminders>;
  changes: DeadlineChange[];
  competitions: Competition[];
  snapshotIds: ReadonlySet<string>;
  onAcknowledge: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="reminders-dialog">
        <DialogHeader>
          <DialogTitle>
            Reminders and <span className="text-highlight">updates</span>
          </DialogTitle>
          <DialogDescription>
            Saved-listing changes and upcoming deadlines. In-app only; no email or push
            notifications.
          </DialogDescription>
        </DialogHeader>
        <section className="deadline-updates">
          <div className="reminder-section-heading">
            <h3>Deadline changes</h3>
            <button
              disabled={!changes.length}
              onClick={() => onAcknowledge(changes.map((change) => change.id))}
            >
              Mark changes read
            </button>
          </div>
          {changes.length ? (
            <ul className="deadline-change-list">
              {[...changes]
                .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
                .map((change) => {
                  const item = competitions.find((item) => item.id === change.competitionId);
                  return (
                    <li key={change.id}>
                      <button
                        className="deadline-change-title"
                        onClick={() => onOpen(change.competitionId)}
                      >
                        {item?.title ?? change.competitionId}
                      </button>
                      <div className="deadline-change-kind">
                        <span>{deadlineLabels[change.field]}</span>
                        <strong>{deadlineChangeLabel(change)}</strong>
                      </div>
                      <dl className="deadline-change-dates">
                        <div>
                          <dt>Previously</dt>
                          <dd>{formatDate(change.before, true)}</dd>
                        </div>
                        <div>
                          <dt>Latest known</dt>
                          <dd>
                            <time dateTime={change.after}>{formatDate(change.after, true)}</time>
                          </dd>
                        </div>
                      </dl>
                      <p className="field-help">
                        Observed {formatDate(change.observedAt)}. Confirm the organizer&apos;s
                        current rules.
                      </p>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="field-help">No unread deadline changes</p>
          )}
        </section>
        <section>
          <div className="reminder-section-heading">
            <h3>Upcoming deadlines</h3>
            <span>Next 7 days</span>
          </div>
          {reminders.length ? (
            <ul className="reminder-list">
              {reminders.map(({ item, field, label, value }) => (
                <li key={`${item.id}:${field}`}>
                  <button onClick={() => onOpen(item.id)}>
                    <strong>{item.title}</strong>
                    <span>{label}</span>
                    <time dateTime={value}>{formatDate(value, true)}</time>
                    {snapshotIds.has(item.id) && (
                      <small className="field-help">
                        Last-known date from a saved snapshot. Check the official page.
                      </small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="reminders-empty">
              <h3>No upcoming reminders</h3>
              <p>
                Save a competition with a published deadline to see it here when it is due within
                seven days.
              </p>
            </div>
          )}
        </section>
        <p className="field-help">
          Times are shown in WIB where known. Date-only listings retain their unlisted closing time
          and timezone. Challenge and event ends are not submission deadlines. Alerts compare
          observed listings, not verified rule changes.
        </p>
      </DialogContent>
    </Dialog>
  );
}
