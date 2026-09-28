import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, Flag, History, Plus } from "lucide-react";
import type { Episode, Observation } from "../../domain/types";
import { saveEpisode } from "../../storage/repositories";
import { formatTime, bounds } from "../../domain/time";
import { Dialog } from "../../components/Dialog";
import {
  TimeFields,
  readTimeDraft,
  timeDraft,
} from "../../components/TimeFields";

export function EpisodeManager({
  profileId,
  defaultWindow,
  episodes,
  seed,
  onClose,
  onSelect,
}: {
  profileId: string;
  defaultWindow: Episode["lookBackWindow"];
  episodes: Episode[];
  seed?: Observation;
  onClose: () => void;
  onSelect: (episode: Episode) => void;
}) {
  function blank(): Episode {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      profileId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      displayName: "",
      exportName: null,
      kind: "custom",
      startedAt: seed?.startedAt ?? {
        precision: "exact",
        at: now,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      endedAt: null,
      anchorObservationId: seed?.id ?? null,
      linkedObservationIds: seed ? [seed.id] : [],
      lookBackWindow: { ...defaultWindow },
      tagIds: [],
      notes: null,
      extensions: {},
    };
  }
  const [draft, setDraft] = useState<Episode | null>(() =>
    seed ? blank() : null,
  );
  const [expected, setExpected] = useState<string | null>(null);
  const [start, setStart] = useState(() => timeDraft(seed?.startedAt)),
    [end, setEnd] = useState(() => timeDraft());
  const [hasEnd, setHasEnd] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function edit(e?: Episode) {
    const next = e ? structuredClone(e) : blank();
    setDraft(next);
    setExpected(e?.updatedAt ?? null);
    setStart(timeDraft(next.startedAt));
    setEnd(timeDraft(next.endedAt ?? undefined));
    setHasEnd(Boolean(next.endedAt));
    setError("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveEpisode(
        {
          ...draft,
          startedAt: readTimeDraft(start),
          endedAt: hasEnd ? readTimeDraft(end) : null,
          notes: draft.notes?.trim() || null,
        },
        expected,
      );
      onSelect(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this episode.");
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        draft
          ? expected
            ? "Edit episode"
            : "Give this chapter a name"
          : "Your episodes"
      }
      onClose={onClose}
    >
      {!draft ? (
        <>
          <p className="muted dialog-intro">
            An illness, a flare, a crash, or just a stretch of days you want to
            remember.
          </p>
          <button className="primary" onClick={() => edit()}>
            <Plus size={17} /> Start an episode
          </button>
          {!episodes.length && (
            <p className="empty-small">
              You don’t need a diagnosis to name a chapter.
            </p>
          )}
          {[...episodes]
            .sort((a, b) => bounds(b.startedAt)[0] - bounds(a.startedAt)[0])
            .map((ep) => (
              <section className="medication-row" key={ep.id}>
                <h3>
                  <Flag size={17} /> {ep.displayName}
                </h3>
                <p className="fine-print">
                  {ep.startedAt.precision === "approximate"
                    ? "Approximately "
                    : ""}
                  {formatTime(ep.startedAt)}
                </p>
                <p className="fine-print">
                  {ep.endedAt
                    ? `End recorded: ${formatTime(ep.endedAt)}`
                    : "No end recorded"}{" "}
                  · {ep.linkedObservationIds.length} marked related
                </p>
                <div className="row-actions">
                  <button className="primary" onClick={() => onSelect(ep)}>
                    <History size={17} /> Look Back
                  </button>
                  <button className="text-button" onClick={() => edit(ep)}>
                    Edit episode
                  </button>
                </div>
              </section>
            ))}
        </>
      ) : (
        <form onSubmit={save}>
          <button
            className="text-button"
            type="button"
            onClick={() => setDraft(null)}
          >
            <ArrowLeft size={15} /> All episodes
          </button>
          <div className="editor-basics">
            <label>
              Episode name
              <input
                required
                maxLength={100}
                placeholder="e.g. September flare"
                value={draft.displayName}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Kind
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as Episode["kind"],
                  })
                }
              >
                <option value="custom">My own description</option>
                <option value="flare">Flare</option>
                <option value="illness">Illness</option>
                <option value="crash">Crash</option>
              </select>
            </label>
          </div>
          <TimeFields label="Start" value={start} onChange={setStart} />
          <label className="check-label">
            <input
              type="checkbox"
              checked={hasEnd}
              onChange={(e) => setHasEnd(e.target.checked)}
            />{" "}
            I want to record an end
          </label>
          {hasEnd && <TimeFields label="End" value={end} onChange={setEnd} />}
          <label>
            Notes <span className="optional">optional</span>
            <textarea
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, notes: e.target.value || null })
              }
            />
          </label>
          <p className="fine-print">
            Look Back starts around this episode’s recorded start. Marking an
            observation as related records your association, not a medical
            conclusion.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy}>
            <Check size={17} />
            {busy ? "Saving…" : "Save & Look Back"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
