"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Search } from "lucide-react";

export function TopicFilter({
  topics,
  selected,
  disabled,
  onChange,
}: {
  topics: string[];
  selected: string[];
  disabled: boolean;
  onChange: (topics: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const matching = topics.filter((topic) =>
    topic.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover.Root onOpenChange={() => setQuery("")}>
      <Popover.Trigger
        className="topic-filter-trigger"
        disabled={disabled}
        aria-label="Filter by topics"
      >
        <span>
          Topics
          {selected.length > 0 && <span className="topic-filter-count">{selected.length}</span>}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="topic-filter-positioner"
          sideOffset={6}
          align="start"
          collisionPadding={16}
        >
          <Popover.Popup className="topic-filter-popup">
            <Popover.Title className="topic-filter-title">Filter topics</Popover.Title>
            <Popover.Description className="topic-filter-description">
              Match any selected topic.
            </Popover.Description>
            <div className="topic-search">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search topics"
                placeholder="Find a topic…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="topic-options" role="group" aria-label="Available topics">
              {matching.map((topic) => (
                <label key={topic}>
                  <input
                    type="checkbox"
                    checked={selected.includes(topic)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...selected, topic]
                          : selected.filter((value) => value !== topic),
                      )
                    }
                  />
                  <span>{topic}</span>
                </label>
              ))}
              {matching.length === 0 && <p role="status">No topics found.</p>}
            </div>
            <div className="topic-filter-actions">
              <button disabled={selected.length === 0} onClick={() => onChange([])}>
                Clear topics
              </button>
              <Popover.Close>Done</Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
