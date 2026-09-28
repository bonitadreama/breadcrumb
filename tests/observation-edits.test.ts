import { afterEach, expect, it } from "vitest";
import { HealthDatabase } from "../src/storage/database";
import {
  initialize,
  readBackup,
  saveObservation,
  restoreBackup,
  saveEventType,
} from "../src/storage/repositories";
import { reviseObservation } from "../src/storage/observation-edits";
import { historyKey, observationHistory } from "../src/domain/history";
import { validateBackup } from "../src/domain/validation";
const databases: HealthDatabase[] = [];
it("corrects an actual dose without changing medication plans and retains the prior dose", async () => {
  const { db, data } = await setup();
  const type = await saveEventType(
    {
      ...data.eventTypes[0],
      id: crypto.randomUUID(),
      displayName: "Fictional dose test",
      category: "medication",
    },
    null,
    db,
  );
  const o = await saveObservation(
    type.profileId,
    type.id,
    { precision: "exact", at: new Date().toISOString(), timeZone: "UTC" },
    "",
    db,
    {
      medication: {
        action: "taken",
        dose: { amount: 2, unit: "tablets" },
        occurrence: null,
      },
    },
  );
  const edited = await reviseObservation(
    o,
    {
      startedAt: o.startedAt,
      notes: o.notes,
      values: o.values,
      medication: {
        action: "taken",
        dose: { amount: 1, unit: "tablet" },
        occurrence: null,
      },
    },
    db,
  );
  expect(observationHistory(edited)[0].medication!.dose!.amount).toBe(2);
  expect(edited.medication!.dose!.amount).toBe(1);
  expect(await db.medicationSchedules.count()).toBe(0);
  await expect(
    reviseObservation(
      edited,
      {
        startedAt: o.startedAt,
        notes: null,
        values: {},
        medication: {
          action: "skipped",
          dose: { amount: 1, unit: "tablet" },
          occurrence: null,
        },
      },
      db,
    ),
  ).rejects.toThrow("skipped");
});
async function setup() {
  const db = new HealthDatabase(`edit-${crypto.randomUUID()}`);
  databases.push(db);
  await initialize(db);
  const data = await readBackup(db);
  const o = await saveObservation(
    data.profiles[0].id,
    data.eventTypes[0].id,
    {
      precision: "approximate",
      earliest: "2026-09-26T18:00:01Z",
      latest: "2026-09-26T22:00:03Z",
      timeZone: "UTC",
      description: "Evening",
    },
    "Original note",
    db,
  );
  return { db, o, data };
}
afterEach(async () => {
  for (const db of databases) await db.delete();
  databases.length = 0;
});
it("corrects against the original scale even after its template changes", async () => {
  const { db, data } = await setup();
  const id = crypto.randomUUID();
  const type = await saveEventType(
    {
      ...data.eventTypes[0],
      id: crypto.randomUUID(),
      displayName: "Historical scale",
      fields: [
        {
          id,
          kind: "severity",
          label: "Intensity",
          exportLabel: null,
          helpText: null,
          minimum: 1,
          maximum: 10,
          step: 1,
          lowLabel: null,
          highLabel: null,
        },
      ],
    },
    null,
    db,
  );
  const o = await saveObservation(
    type.profileId,
    type.id,
    { precision: "exact", at: new Date().toISOString(), timeZone: "UTC" },
    "",
    db,
    { revision: 1, values: { [id]: { kind: "severity", value: 8 } } },
  );
  await saveEventType(
    {
      ...type,
      fields: [
        {
          ...type.fields[0],
          kind: "severity",
          minimum: 1,
          maximum: 3,
          step: 1,
          lowLabel: null,
          highLabel: null,
        },
      ],
    },
    1,
    db,
  );
  const edited = await reviseObservation(
    o,
    {
      startedAt: o.startedAt,
      notes: "Corrected",
      values: { [id]: { kind: "severity", value: 9 } },
      medication: null,
    },
    db,
  );
  expect(edited.eventType.revision).toBe(1);
  expect(observationHistory(edited)[0].values[id]).toEqual({
    kind: "severity",
    value: 8,
  });
});
it("keeps flat immutable snapshots, exact uncertainty, identity and creation time across corrections and backup restore", async () => {
  const { db, o } = await setup();
  const edited = await reviseObservation(
    o,
    {
      startedAt: o.startedAt,
      notes: "Corrected",
      values: o.values,
      medication: null,
    },
    db,
  );
  expect(edited.startedAt).toEqual(o.startedAt);
  expect(edited.id).toBe(o.id);
  expect(edited.createdAt).toBe(o.createdAt);
  expect(observationHistory(edited)).toEqual([o]);
  const twice = await reviseObservation(
    edited,
    {
      startedAt: o.startedAt,
      notes: "Second correction",
      values: {},
      medication: null,
    },
    db,
  );
  expect(observationHistory(twice)).toHaveLength(2);
  expect(observationHistory(twice)[1].notes).toBe("Corrected");
  expect(historyKey in observationHistory(twice)[1].extensions).toBe(false);
  const backup = await readBackup(db),
    fresh = await setup();
  await restoreBackup(backup, fresh.db);
  expect(await fresh.db.observations.get(o.id)).toEqual(twice);
});
it("soft deletes and restores without dropping episode references or edit history", async () => {
  const { db, o } = await setup();
  const episode = {
    id: crypto.randomUUID(),
    profileId: o.profileId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    deletedAt: null,
    displayName: "Demo",
    exportName: null,
    kind: "custom" as const,
    startedAt: o.startedAt,
    endedAt: null,
    anchorObservationId: o.id,
    linkedObservationIds: [o.id],
    lookBackWindow: { beforeHours: 24, afterHours: 24 },
    tagIds: [],
    notes: null,
    extensions: {},
  };
  await db.episodes.add(episode);
  const deleted = await reviseObservation(o, { deleted: true }, db);
  expect(deleted.deletedAt).not.toBeNull();
  db.close();
  await db.open();
  const restored = await reviseObservation(
    (await db.observations.get(o.id))!,
    { deleted: false },
    db,
  );
  expect(restored.deletedAt).toBeNull();
  expect(restored.notes).toBe(o.notes);
  expect(observationHistory(restored)).toHaveLength(2);
  expect(await db.episodes.get(episode.id)).toEqual(episode);
});
it("rejects stale edits and undo, invalid corrections, and edits to deleted records atomically", async () => {
  const { db, o } = await setup();
  await expect(
    reviseObservation(
      o,
      {
        startedAt: {
          precision: "approximate",
          earliest: "2026-09-28T00:00:00Z",
          latest: "2026-09-01T00:00:00Z",
          timeZone: "UTC",
          description: null,
        },
        notes: "bad",
        values: {},
        medication: null,
      },
      db,
    ),
  ).rejects.toThrow();
  expect(await db.observations.get(o.id)).toEqual(o);
  const deleted = await reviseObservation(o, { deleted: true }, db);
  await expect(reviseObservation(o, { deleted: false }, db)).rejects.toThrow(
    "another window",
  );
  await expect(
    reviseObservation(
      deleted,
      { startedAt: o.startedAt, notes: "bad", values: {}, medication: null },
      db,
    ),
  ).rejects.toThrow("Restore");
  expect(await db.observations.get(o.id)).toEqual(deleted);
});
it("rejects corrupt historical identities and values on import", async () => {
  const { db, o } = await setup();
  await reviseObservation(
    o,
    { startedAt: o.startedAt, notes: "new", values: {}, medication: null },
    db,
  );
  const backup = await readBackup(db);
  const corrupt = structuredClone(backup);
  const raw = corrupt.observations[0].extensions[historyKey] as {
    version: number;
    entries: any[];
  };
  raw.entries[0].profileId = crypto.randomUUID();
  expect(() => validateBackup(corrupt)).toThrow("history");
  const invalid = structuredClone(backup);
  const raw2 = invalid.observations[0].extensions[historyKey] as {
    version: number;
    entries: any[];
  };
  raw2.entries[0].values[crypto.randomUUID()] = { kind: "number", value: 3 };
  expect(() => validateBackup(invalid)).toThrow("historical field");
});
