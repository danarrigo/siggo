"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type Catalog,
  type ManualCompetition,
  type Workspace,
  canonicalUrl,
  categories,
  deadlineTime,
  endDate,
} from "@/lib/model";
import { formatDate, rankCompetition } from "@/lib/ranking";
import { CompetitionCard } from "./competition-card";
import { PreferencesDialog } from "./preferences-dialog";
import { DetailDialog } from "./detail-dialog";
import { SourceCoverage, sourceState } from "./source-coverage";
import { ManualCompetitionDialog } from "./manual-competition-dialog";
import { RemindersDialog } from "./reminders-dialog";
import { createWorkspaceStore } from "@/lib/workspace-store";
import {
  deadlineReminders,
  isNewCompetition,
  withoutManualCompetition,
  workspaceCompetitions,
} from "@/lib/workspace";

const authClient = createAuthClient();
type View = "For you" | "All competitions" | "Saved" | "New";

export function Dashboard({
  catalog,
  initialWorkspace,
  mode,
  now: serverNow,
  testData = false,
}: {
  catalog: Catalog;
  initialWorkspace: Workspace;
  mode: "local" | "cloud";
  now: number;
  testData?: boolean;
}) {
  const router = useRouter();
  const [clientNow, setClientNow] = useState(serverNow);
  const now = Math.max(serverNow, clientNow);
  useEffect(() => {
    const tick = () => setClientNow(Date.now());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const [store] = useState(() => createWorkspaceStore(initialWorkspace, mode, now));
  const {
    workspace,
    since,
    status: saveStatus,
    unsynced,
    ready,
  } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [view, setView] = useState<View>("For you");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All types");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("relevance");
  const [limit, setLimit] = useState(18);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualEditor, setManualEditor] = useState<ManualCompetition | "new" | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => workspaceCompetitions(catalog.competitions, workspace, now),
    [catalog.competitions, workspace, now],
  );
  const reminders = deadlineReminders(items, workspace.saved, now);
  const newCount = items.filter((item) => isNewCompetition(item, since, now)).length;
  const ranked = useMemo(
    () => items.map((item) => ({ item, rank: rankCompetition(item, workspace, items, now) })),
    [items, workspace, now],
  );
  const visible = ranked
    .filter(({ item }) => {
      if (view === "Saved" && !workspace.saved.includes(item.id)) return false;
      if (view === "New" && !isNewCompetition(item, since, now)) return false;
      if (category !== "All types" && item.category !== category) return false;
      if (source !== "all" && item.source !== source) return false;
      return [item.title, item.description, item.organizer, item.source, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase().trim());
    })
    .sort((a, b) =>
      sort === "relevance"
        ? b.rank.score - a.rank.score || a.item.title.localeCompare(b.item.title)
        : (endDate(a.item) ? deadlineTime(endDate(a.item)!) : Infinity) -
            (endDate(b.item) ? deadlineTime(endDate(b.item)!) : Infinity) ||
          a.item.title.localeCompare(b.item.title),
    );
  const selected = ranked.find(({ item }) => item.id === selectedId);
  const selectedManual = workspace.manualCompetitions.find((item) => item.id === selectedId);
  const currentSources = catalog.sources.filter((item) => item.state !== "retired");
  const liveSources = currentSources.filter(
    (item) => ["healthy", "partial"].includes(item.state) && sourceState(item, now) !== "Stale",
  ).length;
  const savedCount = items.filter((item) => workspace.saved.includes(item.id)).length;
  const hasFilters = query || category !== "All types" || source !== "all";

  function changeView(next: View) {
    setView(next);
    setLimit(18);
    setSort(next === "All competitions" ? "deadline" : "relevance");
  }
  function persist(change: (previous: Workspace) => Workspace) {
    setSyncMessage("");
    return store.update(change);
  }
  function toggleSaved(id: string) {
    persist((previous) => ({
      ...previous,
      saved: previous.saved.includes(id)
        ? previous.saved.filter((item) => item !== id)
        : [...previous.saved, id],
    }));
  }
  function toggleDismissed(id: string) {
    persist((previous) => ({
      ...previous,
      dismissed: previous.dismissed.includes(id)
        ? previous.dismissed.filter((item) => item !== id)
        : [...previous.dismissed, id],
    }));
  }
  function saveManual(item: ManualCompetition) {
    const duplicate = items.find(
      (other) => other.id !== item.id && canonicalUrl(other.url) === canonicalUrl(item.url),
    );
    if (duplicate) {
      if (workspace.manualCompetitions.some((other) => other.id === item.id)) {
        setSyncMessage(
          "That link is already listed. Keep a distinct URL for this personal listing.",
        );
        return false;
      }
      if (
        !persist((previous) => ({
          ...previous,
          saved: [...new Set([...previous.saved, duplicate.id])],
        }))
      )
        return false;
      setSelectedId(duplicate.id);
      setSyncMessage("That link is already listed. Saved the existing competition instead.");
      return true;
    }
    return persist((previous) => ({
      ...previous,
      manualCompetitions: [
        ...previous.manualCompetitions.filter((other) => other.id !== item.id),
        item,
      ],
      saved: [...new Set([...previous.saved, item.id])],
    }));
  }
  async function refresh() {
    setSyncing(true);
    setSyncMessage("Checking sources…");
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not refresh the catalog");
      router.refresh();
      setSyncMessage(result.message || "Sources checked. See coverage for any failures.");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setSyncing(false);
    }
  }
  function clearFilters() {
    setQuery("");
    setCategory("All types");
    setSource("all");
    setLimit(18);
  }

  return (
    <div className="directory-app">
      <a className="skip-link" href="#main">
        Skip to competitions
      </a>
      <header className="masthead">
        <div className="masthead-inner">
          <Link href="/" className="brand" aria-label="Signal home">
            signal
            <span className="brand-rule" aria-hidden="true" />
          </Link>
          <span className="masthead-description">Competition index</span>
          <div className="masthead-actions">
            <span className={`workspace-mode ${testData ? "test-mode" : ""}`}>
              {testData ? "Test data" : mode === "local" ? "Local preview" : "Private"}
            </span>
            <button
              className="reminders-trigger"
              aria-label={`View deadline reminders${reminders.length ? ` (${reminders.length})` : ""}`}
              onClick={() => setRemindersOpen(true)}
            >
              <Bell size={17} />
              {reminders.length > 0 && <span>{reminders.length}</span>}
            </button>
            <button
              onClick={() => setCoverageOpen(true)}
              aria-label="View source coverage"
              className="header-button"
            >
              Sources{" "}
              <span>
                {liveSources}/{currentSources.length}
              </span>
            </button>
            <button
              onClick={() => setPreferencesOpen(true)}
              aria-label="Open preferences"
              className="header-button preferences-button"
            >
              <Settings2 size={16} className="preference-icon" />
              <span className="preferences-label">Preferences</span>
            </button>
            {mode === "cloud" && (
              <button
                className="header-icon"
                aria-label="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  router.refresh();
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="directory-main">
        <section className="directory-heading">
          <div>
            <div className="heading-title">
              <h1>Competitions</h1>
              <Button
                variant="outline"
                className="add-competition"
                aria-label="Add competition"
                onClick={() => setManualEditor("new")}
              >
                <Plus size={15} />
                <span>Add</span>
              </Button>
            </div>
            <p className="directory-intro">Active and upcoming, across your connected sources.</p>
          </div>
          <div className="profile-summary">
            <span>
              {workspace.profile.country}
              {workspace.profile.student ? " / Student" : ""}
            </span>
            <button onClick={() => setPreferencesOpen(true)} aria-label="Edit interests">
              {workspace.profile.interests.length
                ? workspace.profile.interests.slice(0, 3).join(" · ")
                : "Set your interests"}
              <ArrowUpRight size={13} />
            </button>
          </div>
        </section>
        <section className="discovery-panel" aria-label="Competition discovery">
          <div className="view-row">
            <nav className="view-tabs" aria-label="Catalog view">
              {(["For you", "All competitions", "Saved", "New"] as const).map((tab) => (
                <button
                  key={tab}
                  aria-current={view === tab ? "page" : undefined}
                  className={view === tab ? "active" : ""}
                  onClick={() => changeView(tab)}
                >
                  {tab}
                  {tab === "Saved" && <span>{savedCount}</span>}
                  {tab === "New" && <span>{newCount}</span>}
                </button>
              ))}
            </nav>
            <button
              className="refresh-button"
              onClick={refresh}
              disabled={syncing}
              aria-label="Refresh sources"
            >
              <RefreshCw size={14} className={syncing ? "spin" : ""} />
              <span>{syncing ? "Checking…" : "Refresh"}</span>
            </button>
          </div>
          {view === "New" && (
            <div className="new-listings-summary">
              <p>Discovered since your previous visit. Your first visit establishes a baseline.</p>
              {newCount > 0 && <button onClick={() => store.markSeen()}>Mark all seen</button>}
            </div>
          )}
          <div className="filter-toolbar">
            <div className="search-row">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Search competitions"
                disabled={!ready}
                placeholder="Search title, topic, or organizer"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(18);
                }}
              />
              {query && (
                <button
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <label className="select-filter">
              <span className="sr-only">Filter by source</span>
              <select
                value={source}
                disabled={!ready}
                onChange={(event) => {
                  setSource(event.target.value);
                  setLimit(18);
                }}
              >
                <option value="all">All sources</option>
                <option value="manual">Added by you</option>
                {currentSources
                  .filter((item) => item.state !== "manual")
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="select-filter sort-filter">
              <span className="sr-only">Sort opportunities</span>
              <select
                disabled={!ready}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="relevance">Relevance</option>
                <option value="deadline">Ending soonest</option>
              </select>
            </label>
          </div>
          <div className="results-heading">
            <div className="category-filters" aria-label="Competition type">
              {["All types", ...categories].map((type) => (
                <button
                  key={type}
                  aria-pressed={category === type}
                  className={category === type ? "selected" : ""}
                  onClick={() => {
                    setCategory(type);
                    setLimit(18);
                  }}
                >
                  {type === "ML / Data science"
                    ? "ML / Data"
                    : type === "Research challenge"
                      ? "Research"
                      : type === "Hackathon"
                        ? "Hackathons"
                        : type}
                </button>
              ))}
            </div>
            <p className="results-count" aria-live="polite">
              <strong>{visible.length}</strong>{" "}
              {view === "Saved" ? "saved" : visible.length === 1 ? "competition" : "competitions"}
            </p>
          </div>
          <div className="list-labels" aria-hidden="true">
            <span>COMPETITION</span>
            <span>ENDS</span>
            <span>PRIZE / REWARD</span>
            <span />
          </div>
          <div className="competition-list">
            {visible.slice(0, limit).map(({ item }, index) => (
              <CompetitionCard
                key={item.id}
                item={item}
                saved={workspace.saved.includes(item.id)}
                dismissed={workspace.dismissed.includes(item.id)}
                now={now}
                eagerArtwork={index < 4}
                isNew={isNewCompetition(item, since, now)}
                hasNote={Boolean(workspace.notes[item.id])}
                onSave={() => toggleSaved(item.id)}
                onDismiss={() => toggleDismissed(item.id)}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </div>
          {!visible.length && (
            <div className="empty-state">
              <h2>
                {view === "New" && !hasFilters
                  ? "No new competitions"
                  : view === "Saved" && !hasFilters
                    ? "No saved competitions"
                    : !items.length
                      ? "No competitions available"
                      : "No matching competitions"}
              </h2>
              <p>
                {view === "New" && !hasFilters
                  ? "New discoveries will appear here after your next source update."
                  : view === "Saved" && !hasFilters
                    ? "Use the bookmark beside a competition to save it here."
                    : !items.length
                      ? "Check source coverage or try refreshing the catalog."
                      : "Try a different search or clear the filters."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (!items.length) setCoverageOpen(true);
                  else if (hasFilters) clearFilters();
                  else changeView("All competitions");
                }}
              >
                {!items.length
                  ? "View coverage"
                  : hasFilters
                    ? "Clear filters"
                    : "Browse competitions"}
              </Button>
            </div>
          )}
          {visible.length > limit && (
            <div className="load-more">
              <span>
                Showing {Math.min(limit, visible.length)} of {visible.length}
              </span>
              <Button variant="outline" onClick={() => setLimit(limit + 18)}>
                Show more opportunities
                <ChevronDown size={14} />
              </Button>
            </div>
          )}
        </section>
        <footer className="page-footer">
          <p>
            Check the official rules before entering. Recommendations do not verify eligibility.
          </p>
          <p>
            Updated <time dateTime={catalog.updatedAt}>{formatDate(catalog.updatedAt, true)}</time>
          </p>
          <span>
            {mode === "local"
              ? "Local preview: preferences and saved items stay in this browser."
              : "Preferences and saved items are synced across your devices."}
          </span>
        </footer>
      </main>
      {(saveStatus || syncMessage) && (
        <div
          className={`status-toast ${unsynced ? "warning" : ""}`}
          role="status"
          aria-live="polite"
        >
          {syncing ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
          <span>{syncMessage || saveStatus}</span>
          {unsynced && <button onClick={() => store.retry()}>Retry save</button>}
          <button
            aria-label="Dismiss status"
            onClick={() => {
              store.dismissStatus();
              setSyncMessage("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {preferencesOpen && (
        <PreferencesDialog
          open
          onOpenChange={setPreferencesOpen}
          profile={workspace.profile}
          onApply={(profile) => {
            persist((previous) => ({ ...previous, profile }));
          }}
        />
      )}
      {selected && (
        <DetailDialog
          key={selected.item.id}
          item={selected.item}
          rank={selected.rank}
          profile={workspace.profile}
          saved={workspace.saved.includes(selected.item.id)}
          note={workspace.notes[selected.item.id] ?? ""}
          onSave={() => toggleSaved(selected.item.id)}
          onSaveNote={(note) =>
            persist((previous) => {
              const notes = { ...previous.notes };
              if (note.trim()) notes[selected.item.id] = note;
              else delete notes[selected.item.id];
              return { ...previous, notes };
            })
          }
          onEdit={
            selectedManual
              ? () => {
                  setSelectedId(null);
                  setManualEditor(selectedManual);
                }
              : undefined
          }
          onClose={() => setSelectedId(null)}
        />
      )}
      {manualEditor && (
        <ManualCompetitionDialog
          entries={workspace.manualCompetitions}
          initialEntry={manualEditor === "new" ? undefined : manualEditor}
          onSave={saveManual}
          onDelete={(id) => persist((previous) => withoutManualCompetition(previous, id))}
          onClose={() => setManualEditor(null)}
        />
      )}
      {remindersOpen && (
        <RemindersDialog
          reminders={reminders}
          onClose={() => setRemindersOpen(false)}
          onOpen={(id) => {
            setRemindersOpen(false);
            setSelectedId(id);
          }}
        />
      )}
      {coverageOpen && (
        <Dialog open onOpenChange={setCoverageOpen}>
          <DialogContent className="coverage-dialog">
            <DialogHeader>
              <DialogTitle>Source coverage</DialogTitle>
              <DialogDescription>
                What is connected, when it was checked, and what is missing.
              </DialogDescription>
            </DialogHeader>
            <SourceCoverage sources={catalog.sources} now={now} expanded />
            <p className="coverage-footer">
              Failed sources retain their last successful snapshot. Verify deadlines and eligibility
              on the official event page.{" "}
              <a href="https://info.devpost.com/terms" target="_blank" rel="noopener noreferrer">
                Devpost terms
                <ArrowUpRight size={12} />
              </a>
            </p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
