import { useState, type FormEvent } from "react";
import type { EventType, Observation } from "../../domain/types";
import { Dialog } from "../../components/Dialog";
import {
  TimeFields,
  readTimeDraft,
  timeDraft,
} from "../../components/TimeFields";
import { OptionalFields } from "./OptionalFields";
import { reviseObservation } from "../../storage/observation-edits";
import { observationHistory } from "../../domain/history";
import { formatTime } from "../../domain/time";
import { PhotoFields, PhotoGallery } from "../photos/Photos";
import { attachments, type PhotoAsset } from "../../domain/photos";

export function EditObservation({
  observation,
  definition,
  profileName,
  assets,
  onClose,
  onSaved,
}: {
  observation: Observation;
  definition: EventType;
  profileName: string;
  assets: PhotoAsset[];
  onClose: () => void;
  onSaved: (o: Observation) => void;
}) {
  const [original] = useState(() => structuredClone(observation));
  const [photos, setPhotos] = useState(() => attachments(original)),
    [photoAssets, setPhotoAssets] = useState(() =>
      assets.filter((a) => a.profileId === original.profileId),
    ),
    [photoBusy, setPhotoBusy] = useState(false);
  const [time, setTime] = useState(() => timeDraft(original.startedAt));
  const [notes, setNotes] = useState(original.notes ?? "");
  const [values, setValues] = useState(original.values);
  const [action, setAction] = useState(original.medication?.action ?? "");
  const [amount, setAmount] = useState(
    original.medication?.dose ? String(original.medication.dose.amount) : "",
  );
  const [unit, setUnit] = useState(original.medication?.dose?.unit ?? "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || photoBusy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "taken" && Boolean(amount.trim()) !== Boolean(unit.trim()))
        throw new Error("Enter both amount and unit, or leave both blank.");
      const medication: Observation["medication"] =
        definition.category !== "medication" || !action
          ? null
          : {
              action: action as "taken" | "skipped",
              dose:
                action === "taken" && amount
                  ? { amount: Number(amount), unit: unit.trim() }
                  : null,
              occurrence: original.medication?.occurrence ?? null,
            };
      onSaved(
        await reviseObservation(original, {
          startedAt: readTimeDraft(time),
          notes,
          values,
          medication,
          photos,
          photoAssets: photoAssets.filter((a) =>
            photos.some((p) => p.assetId === a.id),
          ),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
      setBusy(false);
    }
  }
  return (
    <Dialog title="Edit breadcrumb" onClose={onClose}>
      <p className="logging-profile">
        Logging for: <strong>{profileName}</strong>
      </p>
      <h3>{definition.displayName}</h3>
      <p className="fine-print">
        This entry keeps its original template and scale. Your previous version
        stays in edit history.
      </p>
      <form onSubmit={save}>
        <TimeFields label="Observation" value={time} onChange={setTime} />
        {definition.category === "medication" && (
          <fieldset>
            <legend>Medication record</legend>
            <label>
              Recorded action
              <select
                aria-label="Recorded action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {!original.medication && (
                  <option value="">No action recorded</option>
                )}
                <option value="taken">Taken</option>
                <option value="skipped">Explicitly skipped</option>
              </select>
            </label>
            {action === "taken" && (
              <div className="two-fields">
                <label>
                  Amount taken
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Unit
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </label>
              </div>
            )}
          </fieldset>
        )}
        {definition.fields.length > 0 && (
          <OptionalFields
            fields={definition.fields}
            values={values}
            onChange={setValues}
          />
        )}
        <label>
          Notes
          <textarea
            value={notes}
            rows={3}
            maxLength={20000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <PhotoFields
          profileId={original.profileId}
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
        <button className="primary full-width" disabled={busy || photoBusy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Dialog>
  );
}

export function ObservationHistory({
  observation,
  definition,
  assets,
}: {
  observation: Observation;
  definition: EventType;
  assets: PhotoAsset[];
}) {
  const entries = observationHistory(observation);
  if (!entries.length) return null;
  return (
    <details className="entry-history">
      <summary>
        Edit history · {entries.length} previous{" "}
        {entries.length === 1 ? "version" : "versions"}
      </summary>
      <p className="fine-print">
        Previous versions are kept in backups, including text, photos, and marks
        you corrected or removed.
      </p>
      {[...entries].reverse().map((o) => (
        <section key={o.updatedAt}>
          <PhotoGallery items={attachments(o)} assets={assets} />
          <h4>Version saved {new Date(o.updatedAt).toLocaleString()}</h4>
          <p>
            {o.deletedAt ? "In Recently deleted" : "In journal"} ·{" "}
            {formatTime(o.startedAt)}
          </p>
          {o.medication && (
            <p>
              {o.medication.action === "taken" ? "Taken" : "Explicitly skipped"}
              {o.medication.dose
                ? ` · ${o.medication.dose.amount} ${o.medication.dose.unit}`
                : " · no dose recorded"}
            </p>
          )}
          {Object.entries(o.values).map(([id, v]) => {
            const field = definition.fields.find((f) => f.id === id);
            const text =
              v.kind === "choice"
                ? v.optionIds
                    .map((id) =>
                      field?.kind === "choice"
                        ? field.options.find((x) => x.id === id)?.label
                        : id,
                    )
                    .join(", ")
                : v.kind === "boolean"
                  ? v.value
                    ? "Yes"
                    : "No"
                  : String(v.value);
            return (
              <p key={id}>
                {field?.label}: {text}
              </p>
            );
          })}
          <p className="history-note">{o.notes || "No notes recorded."}</p>
        </section>
      ))}
    </details>
  );
}
