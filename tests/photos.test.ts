import { afterEach, expect, it } from "vitest";
import Dexie from "dexie";
import { HealthDatabase } from "../src/storage/database";
import {
  initialize,
  readBackup,
  saveObservation,
  restoreBackup,
} from "../src/storage/repositories";
import { reviseObservation } from "../src/storage/observation-edits";
import {
  attachments,
  photoAssetSchema,
  photoKey,
  type PhotoAsset,
  type Attachment,
} from "../src/domain/photos";
import { observationHistory } from "../src/domain/history";
import { validateBackup } from "../src/domain/validation";
import { defaults } from "../src/templates/defaults";

const databases: Dexie[] = [];
afterEach(async () => {
  for (const d of databases) await d.delete();
  databases.length = 0;
});
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function setup() {
  const db = new HealthDatabase(`photos-${crypto.randomUUID()}`);
  databases.push(db);
  await initialize(db);
  const data = await readBackup(db);
  const asset: PhotoAsset = {
    id: crypto.randomUUID(),
    profileId: data.profiles[0].id,
    createdAt: new Date().toISOString(),
    mediaType: "image/png",
    width: 1,
    height: 1,
    dataUrl: png,
  };
  const photo: Attachment = {
    assetId: asset.id,
    caption: "Fictional test image",
    marks: [
      {
        tool: "arrow",
        color: "#e64040",
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.8, y: 0.7 },
        ],
      },
    ],
  };
  return { db, data, asset, photo };
}
async function saved() {
  const s = await setup();
  const observation = await saveObservation(
    s.asset.profileId,
    s.data.eventTypes[0].id,
    {
      precision: "approximate",
      earliest: "2026-09-25T12:00:00Z",
      latest: "2026-09-25T14:00:00Z",
      timeZone: "UTC",
      description: "Around lunchtime",
    },
    "Fictional photo test",
    s.db,
    { photos: [s.photo], photoAssets: [s.asset] },
  );
  return { ...s, observation };
}
const changes = (o: Awaited<ReturnType<typeof saved>>["observation"]) => ({
  startedAt: o.startedAt,
  values: o.values,
  notes: o.notes,
  medication: o.medication,
});

it("preserves original bytes, uncertainty, captions and overlays across reopen and a fresh backup restore", async () => {
  const { db, observation, asset, photo } = await saved();
  db.close();
  await db.open();
  const exported = await readBackup(db);
  expect(exported.photoAssets).toEqual([asset]);
  expect(attachments(exported.observations[0])).toEqual([photo]);
  expect(exported.observations[0].startedAt).toEqual(observation.startedAt);
  const fresh = await setup();
  await restoreBackup(
    validateBackup(JSON.parse(JSON.stringify(exported))),
    fresh.db,
  );
  const restored = await readBackup(fresh.db);
  expect(restored.photoAssets).toEqual([asset]);
  expect(restored.observations).toEqual(exported.observations);
  await restoreBackup(exported, fresh.db);
  expect(await fresh.db.photoAssets.count()).toBe(1);
});
it("keeps annotation edits and removed attachments in history, with one immutable original", async () => {
  const { db, observation, asset, photo } = await saved();
  const edited = await reviseObservation(
    observation,
    {
      ...changes(observation),
      photos: [{ ...photo, caption: "Updated caption", marks: [] }],
      photoAssets: [asset],
    },
    db,
  );
  expect(attachments(observationHistory(edited)[0])).toEqual([photo]);
  const removed = await reviseObservation(
    edited,
    { ...changes(edited), photos: [], photoAssets: [] },
    db,
  );
  expect(attachments(removed)).toEqual([]);
  expect(attachments(observationHistory(removed)[1])[0].caption).toBe(
    "Updated caption",
  );
  expect(await db.photoAssets.toArray()).toEqual([asset]);
  const deleted = await reviseObservation(removed, { deleted: true }, db),
    restored = await reviseObservation(deleted, { deleted: false }, db);
  expect(attachments(observationHistory(restored)[0])).toEqual([photo]);
  const fresh = await setup();
  await restoreBackup(await readBackup(db), fresh.db);
  expect(await fresh.db.photoAssets.toArray()).toEqual([asset]);
});
it("rejects missing, foreign and malformed current or historical attachments", async () => {
  const { db, observation, photo } = await saved();
  const backup = await readBackup(db);
  const missing = structuredClone(backup);
  missing.photoAssets = [];
  expect(() => validateBackup(missing)).toThrow("Missing photo");
  const foreign = structuredClone(backup);
  foreign.photoAssets[0].profileId = crypto.randomUUID();
  expect(() => validateBackup(foreign)).toThrow("profile");
  const edited = await reviseObservation(
    observation,
    { ...changes(observation), photos: [] },
    db,
  );
  const historyBackup = await readBackup(db);
  historyBackup.photoAssets = [];
  expect(() => validateBackup(historyBackup)).toThrow("Missing photo");
  await expect(
    reviseObservation(
      edited,
      {
        ...changes(edited),
        photos: [
          {
            ...photo,
            marks: [
              {
                tool: "arrow",
                color: "#e64040",
                points: [
                  { x: 2, y: 0 },
                  { x: 0, y: 0 },
                ],
              },
            ],
          },
        ],
      },
      db,
    ),
  ).rejects.toThrow("Invalid photo");
  expect(await db.observations.get(edited.id)).toEqual(edited);
});
it("rolls back invalid photo writes and prevents replacing original bytes or saving a stale edit", async () => {
  const { db, observation, asset, photo } = await saved();
  const other = { ...asset, id: crypto.randomUUID() };
  await expect(
    reviseObservation(
      observation,
      {
        ...changes(observation),
        photos: [{ ...photo, assetId: crypto.randomUUID() }],
        photoAssets: [other],
      },
      db,
    ),
  ).rejects.toThrow("Missing photo");
  expect(await db.photoAssets.count()).toBe(1);
  await expect(
    reviseObservation(
      observation,
      { ...changes(observation), photoAssets: [{ ...asset, width: 2 }] },
      db,
    ),
  ).rejects.toThrow("cannot be overwritten");
  await reviseObservation(
    observation,
    { ...changes(observation), notes: "Newer note" },
    db,
  );
  await expect(
    reviseObservation(
      observation,
      { ...changes(observation), photoAssets: [other] },
      db,
    ),
  ).rejects.toThrow("another window");
  expect(await db.photoAssets.count()).toBe(1);
  const foreign = { ...other, profileId: crypto.randomUUID() };
  await expect(
    saveObservation(
      asset.profileId,
      (await readBackup(db)).eventTypes[0].id,
      observation.startedAt,
      "",
      db,
      { photoAssets: [foreign] },
    ),
  ).rejects.toThrow("another journal");
  expect(await db.observations.count()).toBe(1);
});
it("upgrades a genuine v1 backup in memory without altering its source", async () => {
  const { db } = await setup();
  const current = await readBackup(db);
  const { photoAssets, ...rest } = current;
  const legacy = { ...rest, formatVersion: 1 };
  const before = JSON.stringify(legacy);
  const upgraded = validateBackup(legacy);
  expect(upgraded.formatVersion).toBe(2);
  expect(upgraded.photoAssets).toEqual([]);
  expect(upgraded.profiles).toEqual(current.profiles);
  expect(JSON.stringify(legacy)).toBe(before);
  expect(() => validateBackup({ ...legacy, photoAssets })).toThrow(
    "unexpected",
  );
  expect(() => validateBackup({ ...legacy, formatVersion: 999 })).toThrow(
    "unsupported",
  );
});
it("adds the v2 photo store to a v1 database while preserving existing rows and active profile", async () => {
  const name = `legacy-${crypto.randomUUID()}`,
    legacy = new Dexie(name),
    seed = defaults();
  legacy
    .version(1)
    .stores({
      profiles: "id",
      preferences: "profileId",
      eventTypes: "[id+revision], profileId",
      observations: "id, profileId",
      medicationSchedules: "[id+revision], profileId",
      episodes: "id, profileId",
      tags: "id, profileId",
      meta: "key",
    });
  await legacy.table("profiles").add(seed.profile);
  await legacy.table("preferences").add(seed.preferences);
  await legacy.table("eventTypes").bulkAdd(seed.eventTypes);
  await legacy
    .table("meta")
    .put({ key: "activeProfileId", value: seed.profile.id });
  legacy.close();
  const upgraded = new HealthDatabase(name);
  databases.push(upgraded);
  await upgraded.open();
  expect(upgraded.verno).toBe(2);
  expect(await upgraded.profiles.toArray()).toEqual([seed.profile]);
  expect(await upgraded.eventTypes.toArray()).toHaveLength(
    seed.eventTypes.length,
  );
  expect((await upgraded.meta.get("activeProfileId"))?.value).toBe(
    seed.profile.id,
  );
  expect(await upgraded.photoAssets.count()).toBe(0);
});
it("rejects executable/remote image data, invalid dimensions and duplicate references", async () => {
  const { asset, db, observation, photo } = await saved();
  expect(
    photoAssetSchema.safeParse({
      ...asset,
      dataUrl: "https://example.com/photo.png",
    }).success,
  ).toBe(false);
  expect(
    photoAssetSchema.safeParse({
      ...asset,
      dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    }).success,
  ).toBe(false);
  expect(
    photoAssetSchema.safeParse({ ...asset, width: 20000, height: 20000 })
      .success,
  ).toBe(false);
  const backup = await readBackup(db);
  backup.observations[0].extensions[photoKey] = {
    version: 1,
    items: [photo, photo],
  };
  expect(() => validateBackup(backup)).toThrow("Duplicate");
  expect(observation.profileId).toBe(asset.profileId);
});
