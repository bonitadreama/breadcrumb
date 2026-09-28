import type {
  Backup,
  EventType,
  Episode,
  MedicationSchedule,
  Observation,
  RecordedTime,
} from "../domain/types";
import { validateBackup } from "../domain/validation";
import { defaults } from "../templates/defaults";
import { collections, mergeBackups } from "../transfer/backup";
import { db, type HealthDatabase } from "./database";
import { photoKey, type Attachment, type PhotoAsset } from "../domain/photos";
import { stagePhotos } from "./photo-writes";

async function snapshot(database: HealthDatabase): Promise<Backup> {
  const [
    profiles,
    preferences,
    eventTypes,
    observations,
    medicationSchedules,
    episodes,
    tags,
    photoAssets,
  ] = await Promise.all(
    collections.map((name) => database.table(name).toArray()),
  );
  return {
    format: "personal-health-timeline",
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    appVersion: "0.1.0",
    profiles,
    preferences,
    eventTypes,
    observations,
    medicationSchedules,
    episodes,
    tags,
    photoAssets,
  };
}
export async function initialize(database = db) {
  await database.transaction("rw", database.tables, async () => {
    if (await database.profiles.count()) return;
    const initial = defaults();
    await database.profiles.add(initial.profile);
    await database.preferences.add(initial.preferences);
    await database.eventTypes.bulkAdd(initial.eventTypes);
    await database.meta.put({
      key: "activeProfileId",
      value: initial.profile.id,
    });
  });
}
export async function readBackup(database = db) {
  return database.transaction("r", database.tables, async () =>
    validateBackup(await snapshot(database)),
  );
}
export async function saveObservation(
  profileId: string,
  typeId: string,
  startedAt: RecordedTime,
  notes: string,
  database = db,
  details: {
    values?: Observation["values"];
    revision?: number;
    medication?: Observation["medication"];
    photos?: Attachment[];
    photoAssets?: PhotoAsset[];
  } = {},
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await snapshot(database);
    const type = data.eventTypes
      .filter(
        (t) =>
          t.id === typeId &&
          t.profileId === profileId &&
          !t.archived &&
          !t.deletedAt,
      )
      .sort((a, b) => b.revision - a.revision)[0];
    if (!type)
      throw new Error(
        "This observation type is no longer available. Please reopen the form.",
      );
    if (details.revision !== undefined && type.revision !== details.revision)
      throw new Error(
        "This observation type changed while you were logging. Close and reopen the form before saving; your entry has not been saved.",
      );
    if (type.category === "medication" && !details.medication)
      throw new Error(
        "Choose whether this medication was taken or explicitly skipped.",
      );
    if (details.medication?.action === "skipped" && details.medication.dose)
      throw new Error("A skipped record cannot contain a taken dose.");
    const now = new Date().toISOString();
    const observation: Observation = {
      id: crypto.randomUUID(),
      profileId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      eventType: { id: type.id, revision: type.revision },
      startedAt,
      span: { kind: "point" },
      values: details.values ?? {},
      medication: details.medication ?? null,
      tagIds: [],
      notes: notes.trim() || null,
      source: "manual",
      extensions: details.photos?.length
        ? { [photoKey]: { version: 1, items: details.photos } }
        : {},
    };
    data.observations.push(observation);
    stagePhotos(data, details.photoAssets ?? [], profileId);
    validateBackup(data);
    if (details.photoAssets?.length)
      await database.photoAssets.bulkPut(details.photoAssets);
    await database.observations.add(observation);
    return observation;
  });
}
export async function saveMedication(
  type: EventType,
  plan: MedicationSchedule | null,
  expectedTypeRevision: number | null,
  expectedPlanRevision: number | null,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await snapshot(database);
    const latestType = data.eventTypes
      .filter((t) => t.id === type.id)
      .sort((a, b) => b.revision - a.revision)[0];
    if (
      (latestType?.revision ?? null) !== expectedTypeRevision ||
      (latestType && latestType.profileId !== type.profileId)
    )
      throw new Error(
        "This medication changed in another window. Reopen it to edit.",
      );
    if (type.category !== "medication")
      throw new Error("Medication type required.");
    const now = new Date().toISOString();
    // Reuse the definition when only the plan changes.
    const sameDefinition =
      latestType &&
      latestType.displayName === type.displayName.trim() &&
      latestType.exportName === (type.exportName?.trim() || null);
    let savedType = latestType;
    if (!sameDefinition) {
      savedType = {
        ...type,
        revision: (latestType?.revision ?? 0) + 1,
        createdAt: latestType?.createdAt ?? now,
        updatedAt: now,
        displayName: type.displayName.trim(),
        exportName: type.exportName?.trim() || null,
      };
      if (
        data.eventTypes.some(
          (t) =>
            t.profileId === type.profileId &&
            t.id !== type.id &&
            !t.archived &&
            !t.deletedAt &&
            !data.eventTypes.some(
              (n) => n.id === t.id && n.revision > t.revision,
            ) &&
            t.displayName.trim().toLowerCase() ===
              savedType.displayName.toLowerCase(),
        )
      )
        throw new Error(
          "That name is already in use. Edit the existing medication or choose another name.",
        );
      data.eventTypes.push(savedType);
    }
    let savedPlan: MedicationSchedule | null = null;
    if (plan) {
      const latestPlan = data.medicationSchedules
        .filter((p) => p.id === plan.id)
        .sort((a, b) => b.revision - a.revision)[0];
      if (
        (latestPlan?.revision ?? null) !== expectedPlanRevision ||
        plan.profileId !== type.profileId ||
        (latestPlan &&
          (latestPlan.profileId !== type.profileId ||
            latestPlan.eventType.id !== type.id))
      )
        throw new Error(
          "This plan changed in another window. Reopen it to edit.",
        );
      savedPlan = {
        ...plan,
        revision: (latestPlan?.revision ?? 0) + 1,
        createdAt: latestPlan?.createdAt ?? now,
        updatedAt: now,
        effectiveFrom: new Date(
          Math.max(
            Date.now(),
            latestPlan ? Date.parse(latestPlan.effectiveFrom) + 1 : 0,
          ),
        ).toISOString(),
        effectiveUntil: null,
        eventType: { id: savedType.id, revision: savedType.revision },
      };
      data.medicationSchedules.push(savedPlan);
    }
    validateBackup(data);
    if (!sameDefinition) await database.eventTypes.add(savedType);
    if (savedPlan) await database.medicationSchedules.add(savedPlan);
    return savedType;
  });
}
export async function saveEpisode(
  episode: Episode,
  expectedUpdatedAt: string | null,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await snapshot(database),
      previous = data.episodes.find((e) => e.id === episode.id);
    if (
      (previous?.updatedAt ?? null) !== expectedUpdatedAt ||
      (previous && previous.profileId !== episode.profileId)
    )
      throw new Error(
        "This episode changed in another window. Reopen it before editing.",
      );
    const now = new Date(
      Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0),
    ).toISOString();
    const next = {
      ...episode,
      displayName: episode.displayName.trim(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      linkedObservationIds: [...new Set(episode.linkedObservationIds)],
    };
    data.episodes = [...data.episodes.filter((e) => e.id !== next.id), next];
    validateBackup(data);
    await database.episodes.put(next);
    return next;
  });
}
export async function toggleEpisodeLink(
  episodeId: string,
  observationId: string,
  profileId: string,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const episode = await database.episodes.get(episodeId);
    if (!episode || episode.profileId !== profileId)
      throw new Error("Episode is no longer available.");
    const linked = episode.linkedObservationIds.includes(observationId);
    return saveEpisode(
      {
        ...episode,
        linkedObservationIds: linked
          ? episode.linkedObservationIds.filter((id) => id !== observationId)
          : [...episode.linkedObservationIds, observationId],
      },
      episode.updatedAt,
      database,
    );
  });
}
export async function saveEventType(
  draft: EventType,
  expectedRevision: number | null,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await snapshot(database);
    const latest = data.eventTypes
      .filter((t) => t.id === draft.id)
      .sort((a, b) => b.revision - a.revision)[0];
    if ((latest?.revision ?? null) !== expectedRevision)
      throw new Error(
        "This type was changed in another window. Reopen it before editing.",
      );
    if (latest && latest.profileId !== draft.profileId)
      throw new Error("Profile mismatch.");
    const now = new Date().toISOString();
    const next: EventType = {
      ...draft,
      displayName: draft.displayName.trim(),
      exportName: draft.exportName?.trim() || null,
      revision: (latest?.revision ?? 0) + 1,
      createdAt: latest?.createdAt ?? now,
      updatedAt: now,
    };
    if (
      data.eventTypes.some(
        (t) =>
          t.profileId === next.profileId &&
          t.id !== next.id &&
          !t.archived &&
          !t.deletedAt &&
          !data.eventTypes.some(
            (newer) => newer.id === t.id && newer.revision > t.revision,
          ) &&
          t.displayName.trim().toLowerCase() === next.displayName.toLowerCase(),
      )
    )
      throw new Error(
        "An observation type already uses that name. Choose a different name or edit the existing type.",
      );
    data.eventTypes.push(next);
    const prefs = data.preferences.find((p) => p.profileId === next.profileId);
    if (!prefs) throw new Error("Profile preferences are missing.");
    if (!latest) {
      prefs.logging.favoriteEventTypeIds.unshift(next.id);
      prefs.updatedAt = now;
    }
    validateBackup(data);
    await database.eventTypes.add(next);
    if (!latest) await database.preferences.put(prefs);
    return next;
  });
}
export async function previewRestore(incoming: Backup, database = db) {
  return mergeBackups(await readBackup(database), validateBackup(incoming));
}
export async function restoreBackup(incoming: Backup, database = db) {
  // Revalidate and recheck conflicts within the same write transaction.
  return database.transaction("rw", database.tables, async () => {
    const result = mergeBackups(
      await snapshot(database),
      validateBackup(incoming),
    );
    for (const name of collections)
      await database.table(name).bulkPut(result.backup[name]);
    const active = incoming.profiles.find((p) => !p.deletedAt && !p.archived);
    if (active)
      await database.meta.put({ key: "activeProfileId", value: active.id });
    return result;
  });
}
