import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Leaf, Plus } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import type { EventType, Preferences, Profile } from "../../domain/types";
import {
  createProfile,
  saveProfileSettings,
  switchProfile,
} from "../../storage/profiles";

export function ProfileManager({
  profiles,
  preferences,
  types,
  activeId,
  onClose,
  onActivated,
}: {
  profiles: Profile[];
  preferences: Preferences[];
  types: EventType[];
  activeId: string;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [editing, setEditing] = useState<{
    profile: Profile;
    prefs: Preferences;
  } | null>(null);
  const [adding, setAdding] = useState(false),
    [name, setName] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const caption = (p: Profile) =>
    p.displayName === "My space" ? "My journal" : p.displayName;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this journal.");
    } finally {
      setBusy(false);
    }
  }
  function edit(p: Profile) {
    setEditing({
      profile: structuredClone(p),
      prefs: structuredClone(preferences.find((x) => x.profileId === p.id)!),
    });
    setName(caption(p));
    setError("");
    setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (adding) {
        await createProfile(name);
        onActivated();
        return;
      }
      if (!editing) return;
      await saveProfileSettings(
        { ...editing.profile, displayName: name },
        editing.prefs,
        {
          profile: editing.profile.updatedAt,
          preferences: editing.prefs.updatedAt,
        },
      );
      setEditing(null);
      setMessage(
        "Journal settings saved. Your recorded entries stay just as they were.",
      );
    });
  }
  const choices = editing
    ? types.filter(
        (t) =>
          t.profileId === editing.profile.id &&
          !t.archived &&
          !t.deletedAt &&
          !types.some((n) => n.id === t.id && n.revision > t.revision),
      )
    : [];
  const ids = editing?.prefs.logging.favoriteEventTypeIds ?? [];
  function favorites(next: string[]) {
    if (editing)
      setEditing({
        ...editing,
        prefs: {
          ...editing.prefs,
          logging: { ...editing.prefs.logging, favoriteEventTypeIds: next },
        },
      });
  }
  function move(id: string, by: number) {
    const next = [...ids],
      i = next.indexOf(id);
    [next[i], next[i + by]] = [next[i + by], next[i]];
    favorites(next);
  }
  return (
    <Dialog
      title={
        adding
          ? "A new local journal"
          : editing
            ? "Make this journal yours"
            : "Local profiles"
      }
      onClose={onClose}
    >
      <p className="muted dialog-intro">
        Choose who you’re logging for. Each profile has its own journal, saved
        on this device. These are not password-protected accounts; anyone using
        this browser can open them.
      </p>
      {!adding && !editing ? (
        <>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setAdding(true);
              setName("");
              setError("");
              setMessage("");
            }}
          >
            <Plus size={17} /> Add a profile
          </button>
          {profiles.map((p) => (
            <section className="journal-row" key={p.id}>
              <div>
                <h3>
                  <Leaf size={18} /> {caption(p)}
                </h3>
                {p.id === activeId && (
                  <span className="fine-print">Currently logging here</span>
                )}
              </div>
              <div className="row-actions">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => edit(p)}
                  aria-label={`Customize ${caption(p)}`}
                >
                  Customize
                </button>
                {p.id !== activeId && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await switchProfile(p.id);
                        onActivated();
                      })
                    }
                    aria-label={`Open ${caption(p)}`}
                  >
                    Use this profile
                  </button>
                )}
              </div>
            </section>
          ))}
          <p className="fine-print">
            Each journal has its own observations, medications, episodes,
            templates, and preferences. Backups include all journals.
          </p>
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
        </>
      ) : (
        <form onSubmit={save}>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setAdding(false);
              setEditing(null);
              setError("");
            }}
          >
            Back to journals
          </button>
          <label className="journal-name">
            Journal name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My daily breadcrumbs"
            />
          </label>
          {adding ? (
            <p className="fine-print">
              Start fresh with the four starter templates. No entries or custom
              templates are copied from another journal.
            </p>
          ) : (
            editing && (
              <>
                <fieldset className="journal-settings">
                  <legend>Quick actions</legend>
                  <p className="fine-print">
                    Choose and order up to four favorites for the home screen.
                    Everything is still available in the logging menu.
                  </p>
                  <ol className="favorite-list">
                    {ids.map((id, i) => {
                      const type = choices.find((t) => t.id === id);
                      return (
                        <li key={id}>
                          <span>
                            {type?.displayName ?? "Unavailable template"}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Move ${type?.displayName ?? "template"} up`}
                            disabled={i === 0}
                            onClick={() => move(id, -1)}
                          >
                            <ArrowUp size={17} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Move ${type?.displayName ?? "template"} down`}
                            disabled={i === ids.length - 1}
                            onClick={() => move(id, 1)}
                          >
                            <ArrowDown size={17} />
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              favorites(ids.filter((x) => x !== id))
                            }
                            aria-label={`Remove ${type?.displayName ?? "template"} from quick actions`}
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {!ids.length && (
                    <p className="fine-print">
                      No quick actions selected. You can still use “Something
                      happened.”
                    </p>
                  )}
                  <label>
                    Add a quick action
                    <select
                      aria-label="Add a quick action"
                      value=""
                      disabled={ids.length >= 4}
                      onChange={(e) => {
                        if (e.target.value) favorites([...ids, e.target.value]);
                      }}
                    >
                      <option value="">
                        {ids.length >= 4
                          ? "Four selected — remove one to add another"
                          : "Choose a template"}
                      </option>
                      {choices
                        .filter((t) => !ids.includes(t.id))
                        .map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                </fieldset>
                <fieldset className="journal-settings">
                  <legend>Default Look Back window</legend>
                  <p className="fine-print">
                    Used when you open Look Back around an observation or start
                    a new episode. Existing episodes keep their own windows.
                  </p>
                  <div className="two-fields">
                    {(["beforeHours", "afterHours"] as const).map((key) => (
                      <label key={key}>
                        {key === "beforeHours" ? "Hours before" : "Hours after"}
                        <input
                          type="number"
                          required
                          min={0}
                          max={8760}
                          step="any"
                          value={
                            Number.isNaN(editing.prefs.lookBack[key])
                              ? ""
                              : editing.prefs.lookBack[key]
                          }
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              prefs: {
                                ...editing.prefs,
                                lookBack: {
                                  ...editing.prefs.lookBack,
                                  [key]:
                                    e.target.value === ""
                                      ? NaN
                                      : Number(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )
          )}
          <button className="primary full-width" disabled={busy}>
            <Check size={17} />
            {busy
              ? "Saving…"
              : adding
                ? "Create & open journal"
                : "Save journal settings"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
