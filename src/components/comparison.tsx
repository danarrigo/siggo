"use client";

import "./comparison.css";
import { type ReactNode, type RefObject } from "react";
import { ArrowUpRight, Columns2, MessageCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { type Competition, canonicalUrl, deadlineTime, isActive } from "@/lib/model";
import { formatDate } from "@/lib/ranking";

export const comparisonLimit = 4;
function date(value: string | null | undefined) {
  return value ? (
    <time dateTime={value}>{formatDate(value, true)}</time>
  ) : (
    <span className="comparison-unknown">Not captured</span>
  );
}
const rows: { label: string; content: (item: Competition, now: number) => ReactNode }[] = [
  { label: "Type", content: (item) => item.category },
  {
    label: "Participation format",
    content: (item) => (
      <>
        {item.participation === "Check format" ? "Unverified" : item.participation}
        <small>{item.location}</small>
      </>
    ),
  },
  {
    label: "Entry fee",
    content: (item) =>
      item.entryFee === "Unknown" ? (
        <span className="comparison-unknown">Unverified</span>
      ) : (
        item.entryFee
      ),
  },
  {
    label: "Eligibility",
    content: (item) => item.eligibility || "Unverified; check organizer rules",
  },
  {
    label: "Prize / reward",
    content: (item) =>
      !item.reward ? (
        <span className="comparison-unknown">Not captured</span>
      ) : item.reward.length <= 160 ? (
        item.reward
      ) : (
        <details>
          <summary>
            {item.reward.slice(0, 160)}… <span>Read full reward</span>
          </summary>
          <p>{item.reward}</p>
        </details>
      ),
  },
  {
    label: "Registration status",
    content: (item, now) =>
      item.registrationOpen === false
        ? "Closed at last observation"
        : item.registrationEndsAt && deadlineTime(item.registrationEndsAt) <= now
          ? "Listed registration deadline has passed"
          : item.registrationOpen === true
            ? "Open at last observation"
            : "Unverified; check organizer rules",
  },
  { label: "Starts / opens", content: (item) => date(item.opensAt) },
  { label: "Registration deadline", content: (item) => date(item.registrationEndsAt) },
  { label: "Submission deadline", content: (item) => date(item.submissionEndsAt) },
  { label: "Challenge ends", content: (item) => date(item.challengeEndsAt) },
  { label: "Event ends", content: (item) => date(item.eventEndsAt) },
  { label: "Provider-listed cutoff (unverified)", content: (item) => date(item.listedDeadline) },
  { label: "Last observed / edited", content: (item) => date(item.lastSeenAt) },
];

export function ComparisonBar({
  entries,
  onRemove,
  onClear,
  onCompare,
  compareRef,
}: {
  entries: { id: string; title: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
  compareRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className="comparison-bar" aria-label="Comparison selection">
      <div className="comparison-bar-heading">
        <strong>
          {entries.length}/{comparisonLimit} selected
        </strong>
        <span>Select 2–4 listings. No AI quota used.</span>
      </div>
      <ul>
        {entries.map((item) => (
          <li key={item.id}>
            <span title={item.title}>{item.title}</span>
            <button
              aria-label={`Remove ${item.title} from comparison`}
              onClick={() => onRemove(item.id)}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="comparison-bar-actions">
        <button onClick={onClear}>Clear selection</button>
        <Button ref={compareRef} size="sm" disabled={entries.length < 2} onClick={onCompare}>
          <Columns2 size={14} /> Compare ({entries.length})
        </Button>
      </div>
    </section>
  );
}

export function ComparisonDialog({
  items,
  snapshotIds,
  now,
  onRemove,
  onClose,
  onAsk,
  canAsk,
  returnFocus,
}: {
  items: Competition[];
  snapshotIds: Set<string>;
  now: number;
  onRemove: (id: string) => void;
  onClose: () => void;
  onAsk: (item: Competition) => void;
  canAsk: (item: Competition) => boolean;
  returnFocus: () => HTMLElement | null;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="comparison-dialog" finalFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>
            Compare <span className="text-highlight">opportunities</span>
          </DialogTitle>
          <DialogDescription>
            Available details side by side, not an eligibility verdict. This view uses no AI quota.
          </DialogDescription>
        </DialogHeader>
        {items.length >= 2 && (
          <p className="comparison-scroll-hint">
            Swipe across the table to see the other selected listings. Row labels stay pinned.
          </p>
        )}
        {items.length < 2 ? (
          <p role="status">
            At least two selected listings must still be available. Close this view to choose
            another.
          </p>
        ) : (
          <div
            className="comparison-scroll"
            role="region"
            aria-label="Competition comparison"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Competition facts; unknown values are not treated as free, eligible, or funded.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Details</th>
                  {items.map((item) => (
                    <th scope="col" key={item.id}>
                      <button
                        className="comparison-remove"
                        aria-label={`Remove ${item.title} from comparison`}
                        onClick={() => onRemove(item.id)}
                      >
                        <X size={14} />
                      </button>
                      <span className="comparison-source">
                        {item.source === "manual" ? "Added by you" : item.source}
                      </span>
                      <h3 title={item.title}>{item.title}</h3>
                      {snapshotIds.has(item.id) && (
                        <p className="comparison-status">
                          Saved snapshot; current details unverified.
                        </p>
                      )}
                      {!isActive(item, now) && (
                        <p className="comparison-status">Known end date has passed.</p>
                      )}
                      {item.listedDeadline &&
                        deadlineTime(item.listedDeadline) <= now &&
                        isActive(item, now) && (
                          <p className="comparison-status">
                            Listed cutoff passed; actual end unverified.
                          </p>
                        )}
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.source === "manual"
                          ? "Your added link"
                          : item.metadataSource &&
                              canonicalUrl(item.url) === canonicalUrl(item.metadataSource.url)
                            ? "Provider listing"
                            : "Official page"}
                        <ArrowUpRight size={11} />
                      </a>
                      {item.metadataSource && (
                        <small>
                          Metadata via{" "}
                          <a
                            href={item.metadataSource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.metadataSource.name}
                          </a>
                        </small>
                      )}
                      {canAsk(item) && (
                        <button
                          className="comparison-ask"
                          aria-label={`Ask about ${item.title}`}
                          onClick={() => onAsk(item)}
                        >
                          <MessageCircle size={12} /> Ask about this
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {items.map((item) => (
                      <td key={item.id}>{row.content(item, now)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="comparison-footer">
          Exact times are displayed in WIB; date-only values have no verified time or timezone.
          Provider cutoffs do not establish registration or event closure. Team rules, hardware
          compatibility, and finalist travel funding need organizer confirmation.
        </p>
      </DialogContent>
    </Dialog>
  );
}
