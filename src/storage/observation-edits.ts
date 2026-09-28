import type { Observation } from "../domain/types";
import {
  historyKey,
  observationHistory,
  withoutHistory,
} from "../domain/history";
import { validateBackup } from "../domain/validation";
import { readBackup } from "./repositories";
import { db } from "./database";
import { canonical } from "../transfer/backup";
import { photoKey, type Attachment, type PhotoAsset } from "../domain/photos";
import { stagePhotos } from "./photo-writes";

export async function reviseObservation(
  original: Observation,
  changes:
    | (Pick<Observation, "startedAt" | "notes" | "values" | "medication"> & {
        photos?: Attachment[];
        photoAssets?: PhotoAsset[];
      })
    | { deleted: boolean },
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await readBackup(database),
      current = data.observations.find(
        (o) => o.id === original.id && o.profileId === original.profileId,
      );
    if (!current || canonical(current) !== canonical(original))
      throw new Error(
        "This entry changed in another window. Reopen it before trying again.",
      );
    const deletion = "deleted" in changes;
    if (!deletion && current.deletedAt)
      throw new Error("Restore this entry before editing it.");
    if (deletion && Boolean(current.deletedAt) === changes.deleted)
      return current;
    const now = new Date(
      Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
    ).toISOString();
    const next: Observation = deletion
      ? { ...current, deletedAt: changes.deleted ? now : null, updatedAt: now }
      : {
          ...current,
          startedAt: changes.startedAt,
          values: changes.values,
          medication: changes.medication,
          notes: changes.notes?.trim() || null,
          updatedAt: now,
        };
    if (next.medication?.action === "skipped" && next.medication.dose)
      throw new Error("A skipped record cannot contain a taken dose.");
    // Flat snapshots preserve prior data without recursively nesting history.
    next.extensions = {
      ...current.extensions,
      [historyKey]: {
        version: 1,
        entries: [...observationHistory(current), withoutHistory(current)],
      },
    };
    if (!deletion && changes.photos !== undefined)
      next.extensions[photoKey] = { version: 1, items: changes.photos };
    if (!deletion)
      stagePhotos(data, changes.photoAssets ?? [], current.profileId);
    data.observations = data.observations.map((o) =>
      o.id === next.id ? next : o,
    );
    validateBackup(data);
    if (!deletion && changes.photoAssets?.length)
      await database.photoAssets.bulkPut(changes.photoAssets);
    await database.observations.put(next);
    return next;
  });
}
