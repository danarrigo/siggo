"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/ranking";
import type { deadlineReminders } from "@/lib/workspace";

export function RemindersDialog({
  reminders,
  onOpen,
  onClose,
}: {
  reminders: ReturnType<typeof deadlineReminders>;
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
          <DialogTitle>Upcoming deadlines</DialogTitle>
          <DialogDescription>
            Saved competitions in the next seven days. In-app only; no email or push notifications.
          </DialogDescription>
        </DialogHeader>
        {reminders.length ? (
          <ul className="reminder-list">
            {reminders.map(({ item, field, label, value }) => (
              <li key={`${item.id}:${field}`}>
                <button onClick={() => onOpen(item.id)}>
                  <strong>{item.title}</strong>
                  <span>{label}</span>
                  <time dateTime={value}>{formatDate(value, true)}</time>
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
        <p className="field-help">
          Times are shown in WIB where known. Date-only listings retain their unlisted closing time
          and timezone. Challenge and event ends are not submission deadlines.
        </p>
      </DialogContent>
    </Dialog>
  );
}
