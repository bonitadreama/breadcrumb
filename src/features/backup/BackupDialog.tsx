import { useRef, useState } from "react";
import { Download, Upload, ShieldCheck, Check } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import {
  readBackup,
  previewRestore,
  restoreBackup,
} from "../../storage/repositories";
import { parseBackup } from "../../transfer/backup";
import type { Backup } from "../../domain/types";
import { MAX_BACKUP_BYTES } from "../../domain/photos";

export function BackupDialog({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    data: Backup;
    added: number;
    identical: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function download() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const data = await readBackup();
      const file = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error(
          "This backup exceeds the 100 MB import limit. Your records are unchanged; please seek help exporting this larger journal.",
        );
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = `breadcrumb-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(
        "Your backup file is ready. Check your downloads and keep it somewhere private.",
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  async function load(file?: File) {
    if (!file) return;
    setPending(null);
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error(
          "This version supports backups up to 100 MB. Nothing was changed.",
        );
      const data = parseBackup(await file.text());
      const { added, identical } = await previewRestore(data);
      setPending({ data, added, identical });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this backup.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function restore() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const result = await restoreBackup(pending.data);
      setPending(null);
      setMessage(
        `Backup restored. ${result.added} records added; ${result.identical} identical records left unchanged.`,
      );
      onRestored();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Restore failed. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Keep your breadcrumbs" onClose={onClose}>
      <p className="muted dialog-intro">
        Your entries save automatically on this device. A backup gives you
        another copy.
      </p>
      <div className="backup-section">
        <Download size={24} />
        <div>
          <h3>Save a backup</h3>
          <p>
            All local profiles, observations, original photos, annotations, and
            edit history in one JSON file.
          </p>
          <button className="primary" onClick={download} disabled={busy}>
            <Download size={17} /> Download backup
          </button>
        </div>
      </div>
      <div className="backup-section">
        <Upload size={24} />
        <div>
          <h3>Restore a backup</h3>
          <p>
            We’ll check the file first. Identical records are skipped;
            conflicting versions are never overwritten.
          </p>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Choose backup file"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </div>
      </div>
      {pending && (
        <div className="restore-preview">
          <h3>Ready to restore</h3>
          <p>
            {pending.data.observations.length} observations across{" "}
            {pending.data.profiles.length} profile(s).{" "}
            {pending.data.photoAssets.length} original photos included.
          </p>
          <p>
            {pending.added} new records · {pending.identical} already saved
          </p>
          <button className="primary" disabled={busy} onClick={restore}>
            <Check size={18} />
            {busy ? "Restoring…" : "Confirm restore"}
          </button>
          <button
            className="text-button"
            onClick={() => setPending(null)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <p className="privacy-note">
        <ShieldCheck size={18} /> Backups contain readable health information.
        They aren’t encrypted. Keep them private. Clearing browser data can
        remove local entries.
      </p>
    </Dialog>
  );
}
