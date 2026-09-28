import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Heart,
  History,
  Info,
  Leaf,
  List,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Pill,
  Flag,
  Link,
  Users,
} from "lucide-react";
import {
  initialize,
  readBackup,
  toggleEpisodeLink,
} from "../storage/repositories";
import { db } from "../storage/database";
import {
  formatDay,
  formatTime,
  lookBackWindow,
  overlaps,
  startMs,
} from "../domain/time";
import type { Episode, EventType, Observation } from "../domain/types";
import { LogForm } from "../features/logging/LogForm";
import { BackupDialog } from "../features/backup/BackupDialog";
import { Dialog } from "../components/Dialog";
import { TypeManager } from "../features/event-types/TypeManager";
import { MedicationManager } from "../features/medications/MedicationManager";
import { EpisodeManager } from "../features/episodes/EpisodeManager";
import { ProfileManager } from "../features/profiles/ProfileManager";
import {
  EditObservation,
  ObservationHistory,
} from "../features/logging/EditObservation";
import { DeletedObservations } from "../features/logging/DeletedObservations";
import { reviseObservation } from "../storage/observation-edits";
import { PhotoGallery } from "../features/photos/Photos";
import { attachments } from "../domain/photos";
import { WelcomeNotice } from "../components/WelcomeNotice";

// Presentation alias for the original starter name; do not rewrite profile
// records or make older backups conflict just to change the default caption.
const profileLabel = (name: string) =>
  name === "My space" ? "My journal" : name;

const typeIcon = (name: string, size = 20) =>
  name === "pill" ? (
    <Pill size={size} />
  ) : name === "activity" ? (
    <Activity size={size} />
  ) : name === "sun" ? (
    <Sun size={size} />
  ) : name === "notebook" ? (
    <NotebookPen size={size} />
  ) : (
    <Sparkles size={size} />
  );

export default function App() {
  const [ready, setReady] = useState(false),
    [fatal, setFatal] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [page, setPage] = useState<"timeline" | "lookback">("timeline");
  const [log, setLog] = useState<string | null>(null),
    [backup, setBackup] = useState(false),
    [about, setAbout] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [customize, setCustomize] = useState(false);
  const [journalsOpen, setJournalsOpen] = useState(false);
  const [editingObservation, setEditingObservation] =
    useState<Observation | null>(null);
  const [deletedOpen, setDeletedOpen] = useState(false),
    [undoDelete, setUndoDelete] = useState<Observation | null>(null),
    [entryBusy, setEntryBusy] = useState(false);
  const [medicationsOpen, setMedicationsOpen] = useState(false),
    [episodesOpen, setEpisodesOpen] = useState(false);
  const [episodeId, setEpisodeId] = useState<string | null>(null),
    [episodeSeed, setEpisodeSeed] = useState<Observation | undefined>();
  const [linkBusy, setLinkBusy] = useState(false);
  const [before, setBefore] = useState(168),
    [after, setAfter] = useState(24);
  const [toast, setToast] = useState(""),
    [storage, setStorage] = useState("");
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
  } = useRegisterSW();
  useEffect(() => {
    const changed = () =>
      setStorageNotice(
        "Storage was updated in another tab. Copy any unsaved draft, then reload Breadcrumb. Saved records are preserved.",
      );
    const blocked = () =>
      setFatal(
        "Close other Breadcrumb tabs, then reload to finish the local storage update. Saved records are preserved.",
      );
    globalThis.window.addEventListener("breadcrumb-storage-changed", changed);
    globalThis.window.addEventListener("breadcrumb-storage-blocked", blocked);
    initialize()
      .then(() => {
        setFatal("");
        setReady(true);
      })
      .catch((e) => setFatal(`Could not open local storage. ${e.message}`));
    return () => {
      globalThis.window.removeEventListener(
        "breadcrumb-storage-changed",
        changed,
      );
      globalThis.window.removeEventListener(
        "breadcrumb-storage-blocked",
        blocked,
      );
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const data = useLiveQuery(
    async () => (ready ? readBackup() : undefined),
    [ready],
  );
  const active = useLiveQuery(() => db.meta.get("activeProfileId"));
  const currentProfileId =
    data?.profiles.find(
      (p) => p.id === active?.value && !p.archived && !p.deletedAt,
    )?.id ?? data?.profiles.find((p) => !p.archived && !p.deletedAt)?.id;
  const currentPreferences = data?.preferences.find(
    (p) => p.profileId === currentProfileId,
  );
  useEffect(() => {
    setSelectedId(null);
    setEpisodeId(null);
    setEpisodeSeed(undefined);
    setQuery("");
    setPage("timeline");
    setLog(null);
    setEditingObservation(null);
    setDeletedOpen(false);
    setUndoDelete(null);
    setCustomize(false);
    setMedicationsOpen(false);
    setEpisodesOpen(false);
    setToast("");
  }, [currentProfileId]);
  useEffect(() => {
    if (currentPreferences && !episodeId) {
      setBefore(currentPreferences.lookBack.beforeHours);
      setAfter(currentPreferences.lookBack.afterHours);
    }
  }, [
    currentProfileId,
    currentPreferences?.lookBack.beforeHours,
    currentPreferences?.lookBack.afterHours,
    episodeId,
  ]);
  if (fatal)
    return (
      <main className="startup">
        <h1>Let’s keep your records safe.</h1>
        <p role="alert">{fatal}</p>
        <p>Use a regular browser window with local storage enabled.</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="startup">
        <img
          src={`${import.meta.env.BASE_URL}icon.svg`}
          width="48"
          height="48"
          alt=""
        />
        <h1>Opening your space…</h1>
      </main>
    );
  const profiles = data.profiles.filter((p) => !p.archived && !p.deletedAt);
  const profile = profiles.find((p) => p.id === active?.value) || profiles[0];
  if (!profile)
    return (
      <main className="startup">
        <h1>No active profile</h1>
        <p>
          Your records are preserved, but this backup contains no active
          profile.
        </p>
      </main>
    );
  const favorites = data.preferences.find((p) => p.profileId === profile.id)!
    .logging.favoriteEventTypeIds;
  const types = data.eventTypes
    .filter(
      (t) =>
        t.profileId === profile.id &&
        !t.deletedAt &&
        !t.archived &&
        !data.eventTypes.some((n) => n.id === t.id && n.revision > t.revision),
    )
    .sort((a, b) => {
      const rank = (id: string) =>
        favorites.includes(id)
          ? favorites.indexOf(id)
          : Number.MAX_SAFE_INTEGER;
      return (
        rank(a.id) - rank(b.id) || a.displayName.localeCompare(b.displayName)
      );
    });
  const resolve = (o: Observation): EventType =>
    data.eventTypes.find(
      (t) => t.id === o.eventType.id && t.revision === o.eventType.revision,
    )!;
  const observations = data.observations
    .filter((o) => o.profileId === profile.id && !o.deletedAt)
    .sort((a, b) => startMs(b) - startMs(a));
  const selected = observations.find((o) => o.id === selectedId);
  const episodes = data.episodes.filter(
    (e) => e.profileId === profile.id && !e.deletedAt,
  );
  const selectedEpisode =
    page === "lookback" ? episodes.find((e) => e.id === episodeId) : undefined;
  const window = selectedEpisode
    ? lookBackWindow(selectedEpisode, before, after)
    : selected
      ? lookBackWindow(selected, before, after)
      : null;
  const visible = observations.filter((o) => {
    if (page === "lookback" && window && !overlaps(o, window[0], window[1]))
      return false;
    const text = [
      resolve(o).displayName,
      o.notes || "",
      ...o.tagIds.map((id) => data.tags.find((t) => t.id === id)?.label || ""),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(query.toLowerCase());
  });
  const saved = (o: Observation) => {
    setLog(null);
    setSelectedId(o.id);
    setToast("Saved. A little breadcrumb, safely on this device.");
  };
  async function deleteEntry() {
    if (!selected || entryBusy) return;
    setEntryBusy(true);
    try {
      const deleted = await reviseObservation(selected, { deleted: true });
      setUndoDelete(deleted);
      setSelectedId(null);
      setToast("");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not delete entry.");
    } finally {
      setEntryBusy(false);
    }
  }
  async function undoDeletion() {
    if (!undoDelete || entryBusy) return;
    setEntryBusy(true);
    try {
      const restored = await reviseObservation(undoDelete, { deleted: false });
      setUndoDelete(null);
      setSelectedId(restored.id);
      setToast("Entry restored.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not restore entry.");
    } finally {
      setEntryBusy(false);
    }
  }
  async function protectStorage() {
    try {
      const granted = await navigator.storage?.persist?.();
      setStorage(
        granted
          ? "Persistent storage is enabled. Backups still protect against clearing browser data or losing this device."
          : "Your browser did not grant persistent storage. Keep a separate backup of important entries.",
      );
    } catch {
      setStorage(
        "Storage protection is unavailable in this browser. Keep a separate backup.",
      );
    }
  }
  function openEpisode(episode: Episode) {
    setEpisodesOpen(false);
    setEpisodeSeed(undefined);
    setEpisodeId(episode.id);
    setSelectedId(null);
    setBefore(episode.lookBackWindow.beforeHours);
    setAfter(episode.lookBackWindow.afterHours);
    setQuery("");
    setPage("lookback");
  }
  async function toggleRelated() {
    if (!selectedEpisode || !selected || linkBusy) return;
    setLinkBusy(true);
    try {
      await toggleEpisodeLink(selectedEpisode.id, selected.id, profile.id);
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : "Could not update this episode.",
      );
    } finally {
      setLinkBusy(false);
    }
  }
  return (
    <div className="app-shell">
      {storageNotice && (
        <div className="storage-notice" role="alert">
          {storageNotice}{" "}
          <button type="button" onClick={() => globalThis.location.reload()}>
            Reload
          </button>
        </div>
      )}
      <aside className="sidebar" aria-label="Main navigation">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("timeline");
          }}
        >
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          <span>
            breadcrumb
            <span className="brand-caption">A little space for you.</span>
          </span>
        </a>
        <nav>
          <button
            className={page === "timeline" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setPage("timeline");
              setQuery("");
            }}
          >
            <List size={20} /> Your timeline
          </button>
          <button
            className={page === "lookback" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setPage("lookback");
              setQuery("");
            }}
          >
            <History size={20} /> Look Back
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Leaf size={23} />
            <p>
              You don’t have to
              <br />
              log perfectly.
            </p>
          </div>
          <button className="nav-item" onClick={() => setBackup(true)}>
            <Download size={19} /> Backups
          </button>
          <button className="nav-item" onClick={() => setAbout(true)}>
            <Info size={19} /> About this space
          </button>
          <div className="local-status">
            <span className="status-dot" /> Stored on your device
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar-label">YOUR PERSONAL HEALTH TIMELINE</span>
          <button
            className="profile-badge"
            onClick={() => setJournalsOpen(true)}
            aria-label={`Current profile: ${profileLabel(profile.displayName)}. Open local profiles`}
            aria-haspopup="dialog"
            title="Choose or customize a local profile"
          >
            <span className="avatar">
              <Leaf size={17} />
            </span>
            <span>{profileLabel(profile.displayName)}</span>
            <ChevronRight size={14} />
          </button>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "timeline"
                  ? "LOG FIRST. UNDERSTAND LATER."
                  : "MAKE ROOM FOR THE WHOLE PICTURE."}
              </p>
              <h1>
                {page === "timeline"
                  ? "How’s your little corner of life?"
                  : "Sometimes, it makes sense later."}
              </h1>
              <p className="intro">
                {page === "timeline"
                  ? "Whatever you noticed, there’s room for it here."
                  : "Choose a breadcrumb and see what was happening around it."}
              </p>
            </div>
            <span className="heading-crumbs" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <WelcomeNotice />
          {needRefresh && (
            <p className="notice">
              An update is ready. Close all Breadcrumb tabs and reopen when
              you’re finished to load it safely.
            </p>
          )}
          <div className="journal-tools">
            <button className="secondary" onClick={() => setJournalsOpen(true)}>
              <Users size={17} /> Profiles
            </button>
            <button
              className="secondary"
              onClick={() => setMedicationsOpen(true)}
            >
              <Pill size={17} /> Medications
            </button>
            <button
              className="secondary"
              onClick={() => {
                setEpisodeSeed(undefined);
                setEpisodesOpen(true);
              }}
            >
              <Flag size={17} /> Episodes
              {episodes.length > 0 ? ` · ${episodes.length}` : ""}
            </button>
          </div>
          {page === "timeline" && (
            <section className="quick-log" aria-labelledby="quick-log-title">
              <div className="section-title">
                <h2 id="quick-log-title">Leave a breadcrumb</h2>
                <button
                  className="text-button"
                  onClick={() => setCustomize(true)}
                >
                  Make it yours <Plus size={14} />
                </button>
              </div>
              <div className="quick-actions">
                {favorites
                  .map((id) => types.find((t) => t.id === id))
                  .filter((t): t is EventType => Boolean(t))
                  .slice(0, 4)
                  .map((t) => (
                    <button key={t.id} onClick={() => setLog(t.id)}>
                      {typeIcon(t.icon, 22)}
                      <span>{t.displayName}</span>
                      <Plus size={16} />
                    </button>
                  ))}
              </div>
            </section>
          )}
          <div className="content-grid">
            <section className="timeline" aria-labelledby="timeline-title">
              <div className="section-title timeline-title">
                <h2 id="timeline-title">
                  {page === "timeline" ? "Your timeline" : "Look Back"}
                </h2>
                {page === "timeline" ? (
                  <span className="all-entries">
                    All entries <ArrowDown size={13} />
                  </span>
                ) : (
                  <span className="subtle-label">
                    {selectedEpisode
                      ? "Around this episode"
                      : selected
                        ? "Around this observation"
                        : "Choose an observation"}
                  </span>
                )}
              </div>
              {page === "lookback" && selectedEpisode && (
                <div className="episode-context">
                  <p className="eyebrow">YOUR EPISODE</p>
                  <h3>
                    <Flag size={17} /> {selectedEpisode.displayName}
                  </h3>
                  <p>
                    {selectedEpisode.startedAt.precision === "approximate"
                      ? "Approximate start: "
                      : "Start: "}
                    {formatTime(selectedEpisode.startedAt)}
                  </p>
                  {selectedEpisode.notes && <p>{selectedEpisode.notes}</p>}
                  <span>
                    {selectedEpisode.linkedObservationIds.length}{" "}
                    {selectedEpisode.linkedObservationIds.length === 1
                      ? "observation"
                      : "observations"}{" "}
                    marked related
                  </span>
                </div>
              )}
              {page === "lookback" && (
                <div className="window-controls">
                  <label>
                    Before
                    <select
                      aria-label="Look Back before"
                      value={before}
                      onChange={(e) => setBefore(Number(e.target.value))}
                    >
                      {![6, 24, 72, 168, 336].includes(before) && (
                        <option value={before}>{before} hours</option>
                      )}
                      <option value={6}>6 hours</option>
                      <option value={24}>1 day</option>
                      <option value={72}>3 days</option>
                      <option value={168}>7 days</option>
                      <option value={336}>14 days</option>
                    </select>
                  </label>
                  <label>
                    After
                    <select
                      aria-label="Look Back after"
                      value={after}
                      onChange={(e) => setAfter(Number(e.target.value))}
                    >
                      {![0, 6, 24, 72, 168].includes(after) && (
                        <option value={after}>{after} hours</option>
                      )}
                      <option value={0}>No extra time</option>
                      <option value={6}>6 hours</option>
                      <option value={24}>1 day</option>
                      <option value={72}>3 days</option>
                      <option value={168}>7 days</option>
                    </select>
                  </label>
                  {(selected || selectedEpisode) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelectedId(null);
                        setEpisodeId(null);
                      }}
                    >
                      <X size={15} /> Change anchor
                    </button>
                  )}
                </div>
              )}
              {window && page === "lookback" && (
                <p className="window-description">
                  {new Date(window[0]).toLocaleString()} —{" "}
                  {new Date(window[1]).toLocaleString()}
                  <br />
                  Includes possible matches when a time is approximate.
                </p>
              )}
              <div className="search">
                <Search size={17} />
                <input
                  aria-label="Search observations"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a breadcrumb…"
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {!visible.length ? (
                <div className="empty-state">
                  <div className="breadcrumb-art" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h3>
                    {query
                      ? "No matching breadcrumbs"
                      : observations.length
                        ? "Nothing recorded in this window"
                        : "Your story can start anywhere."}
                  </h3>
                  <p>
                    {query
                      ? "Try another word, or clear your search."
                      : observations.length
                        ? "A gap just means there are no entries here."
                        : "A feeling. A small change. Something you can’t quite put your finger on."}
                  </p>
                  {!observations.length && (
                    <button className="primary" onClick={() => setLog("")}>
                      <Plus size={18} /> Log your first observation
                    </button>
                  )}
                  <span className="empty-footnote">
                    You don’t need to know what it means yet.
                  </span>
                </div>
              ) : (
                <div className="entries">
                  {visible.map((o, index) => {
                    const t = resolve(o),
                      day = formatDay(o.startedAt);
                    const prevDay = index
                      ? formatDay(visible[index - 1].startedAt)
                      : null;
                    return (
                      <div key={o.id}>
                        {day !== prevDay && (
                          <div className="date-divider">{day}</div>
                        )}
                        <button
                          className={`entry ${selected?.id === o.id ? "selected" : ""}`}
                          onClick={() => setSelectedId(o.id)}
                          aria-label={`${t.displayName}, ${formatTime(o.startedAt)}`}
                        >
                          <span className="entry-icon">
                            {typeIcon(t.icon, 19)}
                          </span>
                          <span className="entry-body">
                            <strong>{t.displayName}</strong>
                            {o.medication && (
                              <span className="medication-record">
                                {o.medication.action === "taken"
                                  ? "Taken"
                                  : "Explicitly skipped"}
                                {o.medication.action === "taken"
                                  ? o.medication.dose
                                    ? ` · ${o.medication.dose.amount} ${o.medication.dose.unit}`
                                    : " · dose not recorded"
                                  : ""}
                              </span>
                            )}
                            {selectedEpisode?.linkedObservationIds.includes(
                              o.id,
                            ) && (
                              <span className="related-label">
                                <Link size={12} /> Marked related
                              </span>
                            )}
                            <span className="entry-time">
                              {o.startedAt.precision === "approximate" && (
                                <span className="approx-badge">
                                  Approximate
                                </span>
                              )}
                              {o.startedAt.precision === "approximate"
                                ? o.startedAt.description ||
                                  "Within a time window"
                                : new Date(o.startedAt.at).toLocaleTimeString(
                                    undefined,
                                    {
                                      hour: "numeric",
                                      minute: "2-digit",
                                      timeZone: o.startedAt.timeZone,
                                    },
                                  )}
                            </span>
                            {o.notes && (
                              <span className="entry-note">{o.notes}</span>
                            )}
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <aside className="context-panel" aria-label="Observation details">
              {selected ? (
                <>
                  <div className="context-kicker">
                    <span>
                      {selectedEpisode
                        ? "SELECTED OBSERVATION"
                        : page === "lookback"
                          ? "YOUR ANCHOR"
                          : "A CLOSER LOOK"}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Close observation details"
                      onClick={() => setSelectedId(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="detail-icon">
                    {typeIcon(resolve(selected).icon, 26)}
                  </div>
                  <h2>{resolve(selected).displayName}</h2>
                  {selected.medication && (
                    <p className="medication-detail">
                      <Pill size={16} />{" "}
                      {selected.medication.action === "taken"
                        ? selected.medication.dose
                          ? `Taken · ${selected.medication.dose.amount} ${selected.medication.dose.unit}`
                          : "Taken · dose not recorded"
                        : "Explicitly skipped"}
                    </p>
                  )}
                  <div className="detail-time">
                    <Clock3 size={16} />
                    <div>
                      {selected.startedAt.precision === "approximate" && (
                        <strong>
                          Approximate time
                          <br />
                        </strong>
                      )}
                      {formatTime(selected.startedAt)}
                      <small>{selected.startedAt.timeZone}</small>
                    </div>
                  </div>
                  {selected.startedAt.precision === "approximate" &&
                    selected.startedAt.description && (
                      <p className="recalled">
                        “{selected.startedAt.description}”
                      </p>
                    )}
                  {selected.notes ? (
                    <p className="detail-notes">{selected.notes}</p>
                  ) : (
                    <p className="muted">
                      {Object.keys(selected.values).length
                        ? "No note added."
                        : "No extra details recorded. That’s enough."}
                    </p>
                  )}
                  {Object.entries(selected.values).map(([id, v]) => {
                    const f = resolve(selected).fields.find((f) => f.id === id);
                    return (
                      <p key={id}>
                        <strong>{f?.label}: </strong>
                        {v.kind === "choice" && f?.kind === "choice"
                          ? v.optionIds
                              .map(
                                (id) =>
                                  f.options.find((x) => x.id === id)?.label,
                              )
                              .join(", ")
                          : v.kind === "boolean" && f?.kind === "boolean"
                            ? v.value
                              ? f.trueLabel
                              : f.falseLabel
                            : "value" in v
                              ? String(v.value)
                              : ""}
                        {f?.kind === "number" && f.unit ? ` ${f.unit}` : ""}
                        {f?.kind === "severity"
                          ? ` (scale ${f.minimum}–${f.maximum})`
                          : ""}
                      </p>
                    );
                  })}
                  {selected.span.kind !== "point" && (
                    <p>
                      {selected.span.kind === "ongoing"
                        ? "Recorded as ongoing"
                        : `Recorded end: ${formatTime(selected.span.end)}`}
                    </p>
                  )}
                  {selected.tagIds.length > 0 && (
                    <p>
                      {selected.tagIds
                        .map((id) => data.tags.find((t) => t.id === id)?.label)
                        .join(" · ")}
                    </p>
                  )}
                  {page === "timeline" && (
                    <button
                      className="primary full-width"
                      onClick={() => {
                        setPage("lookback");
                        setEpisodeId(null);
                        setBefore(currentPreferences!.lookBack.beforeHours);
                        setAfter(currentPreferences!.lookBack.afterHours);
                        setQuery("");
                      }}
                    >
                      <History size={18} /> Look Back around this
                    </button>
                  )}
                  {page === "lookback" && selectedEpisode && (
                    <button
                      className="secondary full-width"
                      disabled={linkBusy}
                      onClick={toggleRelated}
                    >
                      <Link size={16} />
                      {selectedEpisode.linkedObservationIds.includes(
                        selected.id,
                      )
                        ? "Unmark as related"
                        : "Mark as related"}
                    </button>
                  )}
                  {!selectedEpisode && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setEpisodeSeed(selected);
                        setEpisodesOpen(true);
                      }}
                    >
                      <Flag size={15} /> Start an episode here
                    </button>
                  )}
                  <div className="entry-actions">
                    <button
                      className="text-button"
                      onClick={() => setEditingObservation(selected)}
                    >
                      Edit entry
                    </button>
                    <button
                      className="text-button"
                      disabled={entryBusy}
                      onClick={() => void deleteEntry()}
                    >
                      Move to Recently deleted
                    </button>
                  </div>
                  <PhotoGallery
                    items={attachments(selected)}
                    assets={data.photoAssets}
                  />
                  <ObservationHistory
                    assets={data.photoAssets}
                    observation={selected}
                    definition={resolve(selected)}
                  />
                  <p className="fine-print detail-footer">
                    Entered {new Date(selected.createdAt).toLocaleString()}.
                    <br />
                    Only what you recorded. No assumptions.
                  </p>
                </>
              ) : (
                <>
                  <span className="context-kicker">A LITTLE PERSPECTIVE</span>
                  <History size={29} className="context-symbol" />
                  <h2>
                    You can connect
                    <br />
                    the dots later.
                  </h2>
                  <p>
                    Look Back gathers the observations around a moment, so you
                    don’t have to hold everything in your head.
                  </p>
                  <div className="dot-path" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <p className="context-instruction">
                    {observations.length
                      ? "Select an entry to take a closer look."
                      : "Once you’ve logged something, choose it on your timeline to look around that moment."}
                  </p>
                </>
              )}
              <div className="gentle-footer">
                <Heart size={16} />
                <span>It’s okay to be sick.</span>
              </div>
            </aside>
          </div>
          <footer className="workspace-footer">
            <button
              className="text-button"
              onClick={() => setDeletedOpen(true)}
            >
              Recently deleted
            </button>
            <span>
              <ShieldCheck size={15} /> Your words stay on this device.
            </span>
            <button className="text-button" onClick={() => setBackup(true)}>
              Keep a backup <ArrowRight size={14} />
            </button>
          </footer>
        </main>
        <button
          className="floating-log"
          onClick={() => setLog("")}
          aria-label="Log an observation"
        >
          <Plus size={21} />
          <span>Something happened</span>
        </button>
      </div>
      {undoDelete && (
        <div className="undo-delete" role="status">
          Entry moved to Recently deleted.{" "}
          <button
            className="text-button"
            disabled={entryBusy}
            onClick={() => void undoDeletion()}
          >
            Undo deletion
          </button>
          <button className="text-button" onClick={() => setUndoDelete(null)}>
            Dismiss
          </button>
        </div>
      )}
      {editingObservation && (
        <EditObservation
          assets={data.photoAssets}
          observation={editingObservation}
          definition={resolve(editingObservation)}
          profileName={profileLabel(profile.displayName)}
          onClose={() => setEditingObservation(null)}
          onSaved={(o) => {
            setEditingObservation(null);
            setSelectedId(o.id);
            setToast("Changes saved. Previous version kept in edit history.");
          }}
        />
      )}
      {deletedOpen && (
        <DeletedObservations
          observations={data.observations.filter(
            (o) => o.profileId === profile.id && o.deletedAt,
          )}
          types={data.eventTypes}
          profileName={profileLabel(profile.displayName)}
          onClose={() => setDeletedOpen(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {customize && (
        <TypeManager
          profileId={profile.id}
          types={types}
          onClose={() => setCustomize(false)}
          onSaved={() => {}}
        />
      )}
      {journalsOpen && (
        <ProfileManager
          profiles={profiles}
          preferences={data.preferences}
          types={data.eventTypes}
          activeId={profile.id}
          onClose={() => setJournalsOpen(false)}
          onActivated={() => setJournalsOpen(false)}
        />
      )}
      {medicationsOpen && (
        <MedicationManager
          profileId={profile.id}
          types={types}
          plans={data.medicationSchedules.filter(
            (p) => p.profileId === profile.id,
          )}
          observations={observations}
          onClose={() => setMedicationsOpen(false)}
          onLog={(id) => {
            setMedicationsOpen(false);
            setLog(id);
          }}
        />
      )}
      {episodesOpen && (
        <EpisodeManager
          profileId={profile.id}
          defaultWindow={currentPreferences!.lookBack}
          episodes={episodes}
          seed={episodeSeed}
          onClose={() => {
            setEpisodesOpen(false);
            setEpisodeSeed(undefined);
          }}
          onSelect={openEpisode}
        />
      )}
      {log !== null && (
        <LogForm
          profileId={profile.id}
          profileName={profileLabel(profile.displayName)}
          types={types}
          initialTypeId={log || undefined}
          onClose={() => setLog(null)}
          onSaved={saved}
        />
      )}
      {backup && (
        <BackupDialog
          onClose={() => setBackup(false)}
          onRestored={() => {
            setSelectedId(null);
            setQuery("");
            setPage("timeline");
          }}
        />
      )}
      {about && (
        <Dialog
          title="A little space for being human"
          onClose={() => setAbout(false)}
        >
          <div className="about-copy">
            <img
              src={`${import.meta.env.BASE_URL}icon.svg`}
              alt=""
              width="46"
              height="46"
            />
            <p>
              Inspired by my own experience living with chronic illnesses, and
              the moments I wished I could remember more clearly.
            </p>
            <p>
              Created and directed by a Codex Ambassador from lived experience.
              Developed with help from ChatGPT and OpenAI Codex, powered by
              Astra. The idea, product decisions, and release responsibility
              belong to the human creator. Open source, so we can improve it
              together.
            </p>
            <blockquote>
              You don’t have to know what matters yet.
              <br />
              You don’t have to log perfectly.
              <br />
              It’s okay to be sick.
            </blockquote>
            <p>
              <a
                href="https://github.com/bonitadreama/breadcrumb"
                target="_blank"
                rel="noreferrer"
              >
                Source code and community
              </a>{" "}
              ·{" "}
              <a
                href="https://github.com/bonitadreama/breadcrumb/blob/main/docs/getting-started.md"
                target="_blank"
                rel="noreferrer"
              >
                Getting started
              </a>
            </p>
            <h3>Your space, your records</h3>
            <p>
              Entries save in this browser on this device. No account or
              health-data uploads. Breadcrumb adds no analytics; the website
              host may keep ordinary access logs. Local profiles are separate
              containers, not password-protected accounts. Anyone with access to
              this browser profile may be able to read them.
            </p>
            <p>
              Keep a backup: browser data can be cleared, and losing this device
              can mean losing its records. Downloaded backups are not encrypted.
              Corrections and removed photos remain in history and backups;
              permanent erasure in the app is not available yet.
            </p>
            <button className="secondary" onClick={protectStorage}>
              <ShieldCheck size={17} /> Request persistent storage
            </button>
            {storage && <p role="status">{storage}</p>}
            <p className="fine-print">
              {offlineReady
                ? "Offline app files are ready on this device."
                : "Offline app files are preparing or have not been confirmed yet."}
            </p>
            <p className="fine-print">
              Breadcrumb helps you remember observations, medication records,
              and episodes. It does not provide diagnoses, treatment advice, or
              medication alarms. An independent project, not an OpenAI-endorsed
              product.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
