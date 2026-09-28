import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import type { EventType, Observation } from "../../domain/types";
import { formatTime } from "../../domain/time";
import { reviseObservation } from "../../storage/observation-edits";

export function DeletedObservations({
  observations,
  types,
  profileName,
  onClose,
}: {
  observations: Observation[];
  types: EventType[];
  profileName: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function restore(o: Observation) {
    setBusy(true);
    setError("");
    try {
      await reviseObservation(o, { deleted: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore entry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Recently deleted" onClose={onClose}>
      <p className="logging-profile">
        Journal: <strong>{profileName}</strong>
      </p>
      <p className="fine-print">
        These entries are hidden from your timeline, not erased. They stay here
        until you restore them, and remain in backups. Nothing is automatically
        purged.
      </p>
      {!observations.length && <p>No deleted entries in this journal.</p>}
      {[...observations]
        .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!))
        .map((o) => (
          <section className="journal-row" key={o.id}>
            <h3>
              {
                types.find(
                  (t) =>
                    t.id === o.eventType.id &&
                    t.revision === o.eventType.revision,
                )?.displayName
              }
            </h3>
            <p>{formatTime(o.startedAt)}</p>
            <p className="history-note">{o.notes}</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void restore(o)}
            >
              Restore entry
            </button>
          </section>
        ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
