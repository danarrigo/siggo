"use client";

import { ArrowUpRight } from "lucide-react";
import { type SourceStatus } from "@/lib/model";
import { formatDate } from "@/lib/ranking";

export function sourceState(source: SourceStatus, now: number) {
  if (
    ["healthy", "partial"].includes(source.state) &&
    source.lastSuccessAt &&
    now - Date.parse(source.lastSuccessAt) > 26 * 3600000
  )
    return "Stale";
  return {
    healthy: "Connected",
    partial:
      source.id === "zindi" && source.collectionMode !== "public-directory"
        ? "Curated feed"
        : "Limited",
    unavailable: "Unavailable",
    "not-configured": "Needs key",
    manual: "Browse manually",
    retired: "Retired",
  }[source.state];
}
export function SourceCoverage({
  sources,
  now,
  expanded = false,
}: {
  sources: SourceStatus[];
  now: number;
  expanded?: boolean;
}) {
  return (
    <div className="source-list">
      {sources.map((source) => {
        const state = sourceState(source, now);
        return (
          <div className="source-row" key={source.id}>
            <div className="source-row-head">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name}
                <ArrowUpRight size={13} />
              </a>
              <span className={`source-status ${state === "Connected" ? "healthy" : ""}`}>
                {state}
              </span>
            </div>
            {expanded && (
              <div className="source-row-detail">
                <p>{source.note}</p>
                {source.attribution && (
                  <a
                    className="underline underline-offset-2"
                    href={source.attribution.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.attribution.name} <ArrowUpRight size={12} className="inline" />
                  </a>
                )}
                <span>
                  {source.state === "retired"
                    ? "No live import from this retired service"
                    : source.lastSuccessAt
                      ? `Last success: ${formatDate(source.lastSuccessAt, true)} · ${source.count} ${source.count === 1 ? "listing" : "listings"}`
                      : "No successful automated sync"}
                </span>
                {source.state === "unavailable" && source.checkedAt && (
                  <span>Last attempt: {formatDate(source.checkedAt, true)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
