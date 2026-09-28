import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import type { EventType, Observation, RecordedTime } from "../../domain/types";
import { localInput, parseLocalInput } from "../../domain/time";
import { saveObservation } from "../../storage/repositories";
import { Dialog } from "../../components/Dialog";
import { OptionalFields } from "./OptionalFields";
import { PhotoFields } from "../photos/Photos";
import type { Attachment, PhotoAsset } from "../../domain/photos";

export function LogForm({
  profileId,
  profileName,
  types,
  initialTypeId,
  onClose,
  onSaved,
}: {
  profileId: string;
  profileName: string;
  types: EventType[];
  initialTypeId?: string;
  onClose: () => void;
  onSaved: (o: Observation) => void;
}) {
  const [typeId, setTypeId] = useState(initialTypeId || types[0]?.id || "");
  // Keep the definition the user actually saw. A concurrent edit must not
  // silently reinterpret this form's values under a newer revision.
  const [definitions] = useState(() => types);
  const definition = definitions.find((t) => t.id === typeId);
  const [values, setValues] = useState<Observation["values"]>({});
  const [medAction, setMedAction] = useState<"" | "taken" | "skipped">("");
  const [doseAmount, setDoseAmount] = useState(""),
    [doseUnit, setDoseUnit] = useState("");
  const [mode, setMode] = useState<"now" | "exact" | "approximate">("now");
  const [at, setAt] = useState(localInput());
  const [from, setFrom] = useState(localInput(new Date(Date.now() - 3600000)));
  const [to, setTo] = useState(localInput());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Attachment[]>([]),
    [photoAssets, setPhotoAssets] = useState<PhotoAsset[]>([]),
    [photoBusy, setPhotoBusy] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(18, 0, 0, 0);
    setFrom(localInput(d));
    d.setHours(22);
    setTo(localInput(d));
    setDescription("Yesterday evening");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || photoBusy) return;
    setError("");
    setBusy(true);
    try {
      if (definition?.category === "medication" && !medAction)
        throw new Error("Choose Taken or Explicitly skipped.");
      if (
        definition?.category === "medication" &&
        medAction === "taken" &&
        Boolean(doseAmount.trim()) !== Boolean(doseUnit.trim())
      )
        throw new Error(
          "Enter both the amount taken and its unit, or leave both blank.",
        );
      const time: RecordedTime =
        mode === "approximate"
          ? {
              precision: "approximate",
              earliest: parseLocalInput(from),
              latest: parseLocalInput(to),
              timeZone,
              description: description.trim() || null,
            }
          : {
              precision: "exact",
              at:
                mode === "now" ? new Date().toISOString() : parseLocalInput(at),
              timeZone,
            };
      onSaved(
        await saveObservation(profileId, typeId, time, notes, undefined, {
          values,
          revision: definition?.revision,
          photos,
          photoAssets: photoAssets.filter((a) =>
            photos.some((p) => p.assetId === a.id),
          ),
          medication:
            definition?.category === "medication" && medAction
              ? {
                  action: medAction,
                  dose:
                    medAction === "taken" && doseAmount
                      ? { amount: Number(doseAmount), unit: doseUnit.trim() }
                      : null,
                  occurrence: null,
                }
              : null,
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <Dialog title="Leave a breadcrumb" onClose={onClose}>
      <p className="logging-profile">
        Logging for: <strong>{profileName}</strong>
      </p>
      <p className="muted dialog-intro">
        A little is enough. Details can wait.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="observation-type">What did you notice?</label>
        <select
          id="observation-type"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setValues({});
            setMedAction("");
            setDoseAmount("");
            setDoseUnit("");
          }}
        >
          {definitions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        {definition?.category === "medication" && (
          <fieldset className="medication-log">
            <legend>What happened?</legend>
            <div className="segmented">
              <button
                type="button"
                aria-pressed={medAction === "taken"}
                onClick={() => setMedAction("taken")}
              >
                Taken
              </button>
              <button
                type="button"
                aria-pressed={medAction === "skipped"}
                onClick={() => setMedAction("skipped")}
              >
                Explicitly skipped
              </button>
            </div>
            {medAction === "taken" && (
              <div className="two-fields">
                <label>
                  Amount taken <span className="optional">optional</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={doseAmount}
                    onChange={(e) => setDoseAmount(e.target.value)}
                  />
                </label>
                <label>
                  Unit <span className="optional">optional</span>
                  <input
                    value={doseUnit}
                    onChange={(e) => setDoseUnit(e.target.value)}
                    placeholder="e.g. mg, mL, tablet"
                  />
                </label>
              </div>
            )}
            <p className="fine-print">
              Only record what happened. A planned amount is never assumed to be
              taken.
            </p>
          </fieldset>
        )}
        <fieldset>
          <legend>
            <Clock3 size={16} /> When was it?
          </legend>
          <div className="segmented">
            {(["now", "exact", "approximate"] as const).map((m) => (
              <button
                type="button"
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {m === "now"
                  ? "Right now"
                  : m === "exact"
                    ? "Choose time"
                    : "Approximately"}
              </button>
            ))}
          </div>
          {mode === "exact" && (
            <label className="subfield">
              Date and time
              <input
                type="datetime-local"
                required
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </label>
          )}
          {mode === "approximate" && (
            <div className="approximate-fields">
              <button type="button" className="text-button" onClick={yesterday}>
                Use yesterday evening <ArrowRight size={14} />
              </button>
              <div className="two-fields">
                <label>
                  Earliest
                  <input
                    type="datetime-local"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Latest
                  <input
                    type="datetime-local"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
              <label>
                How you remember it <span className="optional">optional</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. After lunch"
                  maxLength={200}
                />
              </label>
              <p className="fine-print">
                Check this window before saving. We’ll keep it approximate.
              </p>
            </div>
          )}
          <p className="fine-print">
            Times shown in {timeZone.replaceAll("_", " ")}.
          </p>
        </fieldset>
        {definition && definition.fields.length > 0 && (
          <OptionalFields
            fields={definition.fields}
            values={values}
            onChange={setValues}
          />
        )}
        <label htmlFor="notes">
          Anything else? <span className="optional">optional</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="In your own words. No need to explain why."
          rows={3}
          maxLength={20000}
        />
        <PhotoFields
          profileId={profileId}
          items={photos}
          assets={photoAssets}
          onBusy={setPhotoBusy}
          onChange={(items, assets) => {
            setPhotos(items);
            setPhotoAssets(assets);
          }}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="primary full-width"
          disabled={busy || photoBusy || !typeId}
        >
          <Check size={18} />
          {busy ? "Saving…" : "Save breadcrumb"}
        </button>
      </form>
    </Dialog>
  );
}
