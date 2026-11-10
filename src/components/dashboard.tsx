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
  MessageCircle,
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
  type Competition,
  type ParticipationPlan,
  participationStages,
  type ManualCompetition,
  type Workspace,
  canonicalUrl,
  categories,
  deadlineTime,
  displayDeadline,
  isActive,
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
  withParticipationPlan,
  workspaceCompetitions,
} from "@/lib/workspace";
import { competitionLibrary, toggleSavedCompetition } from "@/lib/saved-competitions";
import { UnavailableSavedCompetition } from "./unavailable-saved-competition";
import { AskSiggo, type AssistantFocus } from "./ask-siggo";
import { ComparisonBar, ComparisonDialog, comparisonLimit } from "./comparison";

const authClient = createAuthClient();
type View = "For you" | "All competitions" | "Saved" | "New";

export function Dashboard({
  catalog,
  initialWorkspace,
  mode,
  now: serverNow,
  testData = false,
  assistantEnabled = false,
}: {
  catalog: Catalog;
  initialWorkspace: Workspace;
  mode: "local" | "cloud";
  now: number;
  testData?: boolean;
  assistantEnabled?: boolean;
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
  const [store] = useState(() =>
    createWorkspaceStore(initialWorkspace, mode, now, catalog.competitions),
  );
  useEffect(
    () => store.synchronize(catalog.competitions, initialWorkspace),
    [store, catalog.competitions, initialWorkspace],
  );
  const {
    workspace,
    since,
    status: saveStatus,
    unsynced,
    ready,
  } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [view, setView] = useState<View>("For you");
  const [savedView, setSavedView] = useState<"active" | "archive">("active");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All types");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("relevance");
  const [limit, setLimit] = useState(18);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSession, setAssistantSession] = useState<{ key: number; focus?: AssistantFocus }>(
    { key: 0 },
  );
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [progressFilter, setProgressFilter] = useState("all");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualEditor, setManualEditor] = useState<ManualCompetition | "new" | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const compareTriggerRef = useRef<HTMLButtonElement>(null);
  const comparisonReturnFocusRef = useRef<HTMLElement | null>(null);
  const library = useMemo(
    () => competitionLibrary(catalog.competitions, workspace, now),
    [catalog.competitions, workspace, now],
  );
  const items = useMemo(
    () => workspaceCompetitions(catalog.competitions, workspace, now),
    [catalog.competitions, workspace, now],
  );
  const discoverableIds = new Set(items.map((item) => item.id));
  const reminders = deadlineReminders(
    library.filter((item) => isActive(item, now)),
    workspace.saved,
    now,
  );
  const updateCount = reminders.length + workspace.deadlineChanges.length;
  const currentItems = new Map(catalog.competitions.map((item) => [canonicalUrl(item.url), item]));
  const snapshotOnly = (item: (typeof library)[number]) => {
    const current = currentItems.get(canonicalUrl(item.url));
    return (
      item.source !== "manual" &&
      (!isActive(item, now) ||
        !current ||
        Date.parse(current.lastSeenAt) < Date.parse(item.lastSeenAt))
    );
  };
  const publicIds = new Set(
    catalog.competitions.filter((item) => item.source !== "manual").map((item) => item.id),
  );
  const canAsk = (item: Competition) =>
    publicIds.has(item.id) && item.id.length <= 250 && !snapshotOnly(item) && isActive(item, now);
  const comparisonItems = comparisonIds.flatMap((id) => {
    const item = library.find((item) => item.id === id);
    return item ? [item] : [];
  });
  const matchesProgress = (id: string) =>
    progressFilter === "all" ||
    (progressFilter === "untracked"
      ? !Object.hasOwn(workspace.participationPlans, id)
      : workspace.participationPlans[id]?.stage === progressFilter);
  const newCount = items.filter((item) => isNewCompetition(item, since, now)).length;
  const ranked = useMemo(
    () => library.map((item) => ({ item, rank: rankCompetition(item, workspace, items, now) })),
    [library, items, workspace, now],
  );
  const visible = ranked
    .filter(({ item }) => {
      const active = isActive(item, now);
      if (view === "Saved") {
        if (
          !workspace.saved.includes(item.id) ||
          active === (savedView === "archive") ||
          !matchesProgress(item.id)
        )
          return false;
      } else if (!discoverableIds.has(item.id)) return false;
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
        : ((displayDeadline(a.item) ? deadlineTime(displayDeadline(a.item)!) : Infinity) -
            (displayDeadline(b.item) ? deadlineTime(displayDeadline(b.item)!) : Infinity)) *
            (view === "Saved" && savedView === "archive" ? -1 : 1) ||
          a.item.title.localeCompare(b.item.title),
    );
  const selected = ranked.find(({ item }) => item.id === selectedId);
  const selectedManual = workspace.manualCompetitions.find((item) => item.id === selectedId);
  const currentSources = catalog.sources.filter((item) => item.state !== "retired");
  const liveSources = currentSources.filter(
    (item) => ["healthy", "partial"].includes(item.state) && sourceState(item, now) !== "Stale",
  ).length;
  const savedCount = new Set(workspace.saved).size;
  const archivedCount = library.filter(
    (item) => workspace.saved.includes(item.id) && !isActive(item, now),
  ).length;
  const unavailableIds = [...new Set(workspace.saved)].filter(
    (id) => !library.some((item) => item.id === id),
  );
  const unavailable =
    view === "Saved" && savedView === "active" && category === "All types"
      ? unavailableIds.filter(
          (id) =>
            (source === "all" || id.startsWith(`${source}:`)) &&
            matchesProgress(id) &&
            `${id} ${workspace.notes[id] ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()),
        )
      : [];
  const hasFilters =
    query ||
    category !== "All types" ||
    source !== "all" ||
    (view === "Saved" && progressFilter !== "all");

  function openAssistant(item?: Competition) {
    setAssistantSession((previous) =>
      previous.focus?.id === item?.id
        ? previous
        : { key: previous.key + 1, focus: item ? { id: item.id, title: item.title } : undefined },
    );
    setSelectedId(null);
    setComparisonOpen(false);
    setAssistantOpen(true);
  }
  function toggleComparison(id: string) {
    const next = comparisonIds.includes(id)
      ? comparisonIds.filter((other) => other !== id)
      : [...comparisonIds, id];
    if (next.length > comparisonLimit) return;
    // Choose the fallback before React disables the comparison trigger during unmount.
    if (next.length < 2) comparisonReturnFocusRef.current = assistantTriggerRef.current;
    setComparisonIds(next);
    if (next.length < 2) setComparisonOpen(false);
  }
  function savePlan(id: string, plan: ParticipationPlan | null) {
    return persist((previous) =>
      withParticipationPlan(
        previous,
        id,
        plan,
        library.find((item) => item.id === id),
      ),
    );
  }

  function changeView(next: View) {
    setView(next);
    setLimit(18);
    setSort(
      next === "All competitions" || (next === "Saved" && savedView === "archive")
        ? "deadline"
        : "relevance",
    );
  }
  function persist(change: (previous: Workspace) => Workspace) {
    setSyncMessage("");
    return store.update(change);
  }
  function toggleSaved(id: string) {
    const item = library.find((item) => item.id === id);
    if (item) persist((previous) => toggleSavedCompetition(previous, item));
  }
  function toggleDismissed(id: string) {
    persist((previous) => ({
      ...previous,
      dismissed: previous.dismissed.includes(id)
        ? previous.dismissed.filter((item) => item !== id)
        : [...previous.dismissed, id],
    }));
  }
  function saveNote(id: string, note: string) {
    return persist((previous) => {
      const notes = { ...previous.notes };
      if (note.trim()) notes[id] = note;
      else delete notes[id];
      return { ...previous, notes };
    });
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
    setSyncMessage("Checking sources… Codabench can take up to four minutes.");
    try {
      await store.whenIdle();
      if (store.getSnapshot().unsynced)
        throw new Error("Sync your workspace changes before refreshing sources.");
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
    setProgressFilter("all");
    setLimit(18);
  }

  return (
    <div className="directory-app">
      <a className="skip-link" href="#main">
        Skip to competitions
      </a>
      <header className="masthead">
        <div className="masthead-inner">
          <Link href="/" className="brand" aria-label="Siggo home">
            siggo
            <span className="brand-rule" aria-hidden="true" />
          </Link>
          <span className="masthead-description">Competition index</span>
          <div className="masthead-actions">
            <span className={`workspace-mode ${testData ? "test-mode" : ""}`}>
              {testData ? "Test data" : mode === "local" ? "Local preview" : "Private"}
            </span>
            <button
              className="reminders-trigger"
              aria-label={`View deadline reminders and updates${updateCount ? ` (${updateCount})` : ""}`}
              onClick={() => setRemindersOpen(true)}
            >
              <Bell size={17} />
              {updateCount > 0 && <span>{updateCount}</span>}
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
              <h1>
                <span className="text-highlight">Competitions</span>
              </h1>
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
            <p className="directory-intro">
              {view === "Saved" && savedView === "archive"
                ? "Ended saved competitions, with your notes and plans kept."
                : "Active and upcoming, across your connected sources."}
            </p>
          </div>
          <div className="directory-heading-actions">
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
            <button
              ref={assistantTriggerRef}
              className="assistant-trigger"
              aria-label="Ask Siggo"
              onClick={() => openAssistant()}
            >
              <MessageCircle size={16} />
              <span>Ask Siggo</span>
            </button>
          </div>
        </section>
        {comparisonIds.length > 0 && (
          <ComparisonBar
            entries={comparisonIds.map((id) => ({
              id,
              title: library.find((item) => item.id === id)?.title ?? "Listing unavailable",
            }))}
            onRemove={toggleComparison}
            onClear={() => {
              setComparisonIds([]);
              setComparisonOpen(false);
            }}
            onCompare={() => {
              comparisonReturnFocusRef.current = compareTriggerRef.current;
              setComparisonOpen(true);
            }}
            compareRef={compareTriggerRef}
          />
        )}
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
          {workspace.trackingLimited && (
            <p className="tracking-warning" role="alert">
              Saved-list tracking has reached the workspace limit. Remove saved entries, shorten
              notes or tasks, or remove an unused plan to resume it. Existing private content is
              kept.
            </p>
          )}
          {view === "Saved" && (
            <div className="saved-view-controls" role="group" aria-label="Saved competition status">
              {(["active", "archive"] as const).map((tab) => (
                <button
                  key={tab}
                  aria-pressed={savedView === tab}
                  onClick={() => {
                    setSavedView(tab);
                    setSort(tab === "archive" ? "deadline" : "relevance");
                    setLimit(18);
                  }}
                >
                  {tab === "active" ? "Current" : "Archive"}{" "}
                  <span>{tab === "active" ? savedCount - archivedCount : archivedCount}</span>
                </button>
              ))}
              <p>
                {savedView === "archive"
                  ? "Ended listings stay here with notes and plans."
                  : "A missing listing is not assumed ended."}
              </p>
            </div>
          )}
          {view === "Saved" && (
            <label className="progress-filter">
              Participation progress
              <select
                aria-label="Filter saved by progress"
                value={progressFilter}
                onChange={(event) => {
                  setProgressFilter(event.target.value);
                  setLimit(18);
                }}
              >
                <option value="all">All progress</option>
                <option value="untracked">Not tracking</option>
                {participationStages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
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
                <option value="deadline">
                  {view === "Saved" && savedView === "archive" ? "Recently ended" : "Nearest date"}
                </option>
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
              <strong>{visible.length + unavailable.length}</strong>{" "}
              {view === "Saved"
                ? savedView === "archive"
                  ? "archived"
                  : "saved"
                : visible.length === 1
                  ? "competition"
                  : "competitions"}
            </p>
          </div>
          <div className="list-labels" aria-hidden="true">
            <span>COMPETITION</span>
            <span>{view === "Saved" && savedView === "archive" ? "ENDED" : "DATE"}</span>
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
                snapshot={snapshotOnly(item)}
                plan={workspace.participationPlans[item.id]}
                compared={comparisonIds.includes(item.id)}
                compareDisabled={
                  !comparisonIds.includes(item.id) && comparisonIds.length >= comparisonLimit
                }
                onCompare={() => toggleComparison(item.id)}
                onSave={() => toggleSaved(item.id)}
                onDismiss={() => toggleDismissed(item.id)}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </div>
          {unavailable.map((id) => (
            <UnavailableSavedCompetition
              key={id}
              id={id}
              note={workspace.notes[id] ?? ""}
              plan={workspace.participationPlans[id]}
              onSavePlan={(plan) => savePlan(id, plan)}
              onSaveNote={(note) => saveNote(id, note)}
              onUnsave={() =>
                persist((previous) => ({
                  ...previous,
                  saved: previous.saved.filter((value) => value !== id),
                }))
              }
            />
          ))}
          {!visible.length && !unavailable.length && (
            <div className="empty-state">
              <h2>
                {view === "New" && !hasFilters
                  ? "No new competitions"
                  : view === "Saved" && !hasFilters
                    ? savedView === "archive"
                      ? "No archived competitions"
                      : "No saved competitions"
                    : !items.length
                      ? "No competitions available"
                      : "No matching competitions"}
              </h2>
              <p>
                {view === "New" && !hasFilters
                  ? "New discoveries will appear here after your next source update."
                  : view === "Saved" && !hasFilters
                    ? savedView === "archive"
                      ? "Ended saved competitions will appear here automatically. Your notes are kept."
                      : "Use the bookmark beside a competition to save it here."
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
          <span>{unsynced ? saveStatus : syncMessage || saveStatus}</span>
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
      <AskSiggo
        key={assistantSession.key}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        enabled={assistantEnabled}
        focus={assistantSession.focus}
        onGeneralChat={() => openAssistant()}
        returnFocus={assistantTriggerRef}
      />
      {comparisonOpen && (
        <ComparisonDialog
          items={comparisonItems}
          snapshotIds={new Set(comparisonItems.filter(snapshotOnly).map((item) => item.id))}
          now={now}
          onRemove={toggleComparison}
          onClose={() => setComparisonOpen(false)}
          onAsk={openAssistant}
          canAsk={canAsk}
          returnFocus={() => comparisonReturnFocusRef.current}
        />
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
          snapshot={snapshotOnly(selected.item)}
          archived={!isActive(selected.item, now)}
          plan={workspace.participationPlans[selected.item.id]}
          onSavePlan={(plan) => savePlan(selected.item.id, plan)}
          compared={comparisonIds.includes(selected.item.id)}
          compareDisabled={
            !comparisonIds.includes(selected.item.id) && comparisonIds.length >= comparisonLimit
          }
          onCompare={() => toggleComparison(selected.item.id)}
          onAsk={canAsk(selected.item) ? () => openAssistant(selected.item) : undefined}
          onSave={() => toggleSaved(selected.item.id)}
          onSaveNote={(note) => saveNote(selected.item.id, note)}
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
          changes={workspace.deadlineChanges}
          competitions={library}
          snapshotIds={new Set(library.filter(snapshotOnly).map((item) => item.id))}
          onAcknowledge={(ids) => store.acknowledgeChanges(ids)}
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
              <DialogTitle>
                Source <span className="text-highlight">coverage</span>
              </DialogTitle>
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
