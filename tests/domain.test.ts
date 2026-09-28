import { afterEach, describe, expect, it } from "vitest";
import { HealthDatabase } from "../src/storage/database";
import {
  initialize,
  readBackup,
  restoreBackup,
  saveObservation,
  saveEventType,
} from "../src/storage/repositories";
import { validateBackup } from "../src/domain/validation";
import { parseBackup } from "../src/transfer/backup";
import {
  formatDay,
  lookBackWindow,
  overlaps,
  parseLocalInput,
} from "../src/domain/time";
import type { Backup, Observation, RecordedTime } from "../src/domain/types";

const databases: HealthDatabase[] = [];
async function setup() {
  const db = new HealthDatabase(`test-${crypto.randomUUID()}`);
  databases.push(db);
  await initialize(db);
  return { db, data: await readBackup(db) };
}
const time: RecordedTime = {
  precision: "exact",
  at: "2026-09-27T16:00:00.000Z",
  timeZone: "America/New_York",
};
async function log(db: HealthDatabase, data: Backup, when = time, notes = "") {
  return saveObservation(
    data.profiles[0].id,
    data.eventTypes[0].id,
    when,
    notes,
    db,
  );
}
afterEach(async () => {
  for (const db of databases) await db.delete();
  databases.length = 0;
});

describe("The breadcrumb journey", () => {
  it("creates and edits custom types without changing old entries, then round-trips both revisions", async () => {
    const { db, data } = await setup();
    const fieldId = crypto.randomUUID();
    const original = await saveEventType(
      {
        ...data.eventTypes[0],
        id: crypto.randomUUID(),
        displayName: "Head pressure",
        fields: [
          {
            id: fieldId,
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
    const old = await saveObservation(
      original.profileId,
      original.id,
      time,
      "",
      db,
      { revision: 1, values: { [fieldId]: { kind: "severity", value: 8 } } },
    );
    const field = original.fields[0];
    if (field.kind !== "severity") throw new Error("Fixture mismatch");
    const edited = await saveEventType(
      {
        ...original,
        displayName: "Brain goblin",
        fields: [{ ...field, maximum: 3 }],
      },
      1,
      db,
    );
    expect(edited.revision).toBe(2);
    expect(await db.eventTypes.get([original.id, 1])).toEqual(original);
    expect((await db.observations.get(old.id))?.eventType.revision).toBe(1);
    await saveObservation(original.profileId, original.id, time, "", db, {
      revision: 2,
      values: {},
    });
    const fresh = await setup();
    await restoreBackup(await readBackup(db), fresh.db);
    expect(await fresh.db.eventTypes.get([original.id, 1])).toEqual(original);
    expect(await fresh.db.eventTypes.get([original.id, 2])).toEqual(edited);
    expect((await fresh.db.observations.get(old.id))?.values[fieldId]).toEqual({
      kind: "severity",
      value: 8,
    });
  });
  it("rejects stale editors and stale logging forms instead of reinterpreting values", async () => {
    const { db, data } = await setup();
    const t = data.eventTypes[0];
    await saveEventType({ ...t, displayName: "Changed type" }, 1, db);
    await expect(saveEventType(t, 1, db)).rejects.toThrow("another window");
    await expect(
      saveObservation(t.profileId, t.id, time, "", db, { revision: 1 }),
    ).rejects.toThrow("changed while");
    expect(await db.observations.count()).toBe(0);
    expect(
      (
        await db.eventTypes.where("profileId").equals(t.profileId).toArray()
      ).filter((x) => x.id === t.id),
    ).toHaveLength(2);
  });
  it("keeps boolean false distinct from missing and validates historical choices", async () => {
    const { db, data } = await setup();
    const yesno = crypto.randomUUID(),
      choice = crypto.randomUUID(),
      option = crypto.randomUUID();
    const base = { exportLabel: null, helpText: null };
    const t = await saveEventType(
      {
        ...data.eventTypes[0],
        id: crypto.randomUUID(),
        displayName: "Posture check",
        fields: [
          {
            ...base,
            id: yesno,
            label: "Standing?",
            kind: "boolean",
            trueLabel: "Yes",
            falseLabel: "No",
          },
          {
            ...base,
            id: choice,
            label: "Posture",
            kind: "choice",
            multiple: false,
            options: [{ id: option, label: "Lying down", exportLabel: null }],
          },
        ],
      },
      null,
      db,
    );
    const o = await saveObservation(t.profileId, t.id, time, "", db, {
      revision: 1,
      values: {
        [yesno]: { kind: "boolean", value: false },
        [choice]: { kind: "choice", optionIds: [option] },
      },
    });
    expect(o.values[yesno]).toEqual({ kind: "boolean", value: false });
    const empty = await saveObservation(t.profileId, t.id, time, "", db, {
      revision: 1,
    });
    expect(empty.values).toEqual({});
    await expect(
      saveObservation(t.profileId, t.id, time, "", db, {
        revision: 1,
        values: {
          [choice]: { kind: "choice", optionIds: [crypto.randomUUID()] },
        },
      }),
    ).rejects.toThrow("Unknown historical choice");
  });
  it("rejects invalid definitions and duplicate names without partial changes", async () => {
    const { db, data } = await setup();
    const t = data.eventTypes[0];
    await expect(
      saveEventType(
        {
          ...t,
          id: crypto.randomUUID(),
          displayName: ` ${t.displayName.toUpperCase()} `,
        },
        null,
        db,
      ),
    ).rejects.toThrow("already uses");
    const before = await db.eventTypes.count();
    await expect(
      saveEventType(
        {
          ...t,
          id: crypto.randomUUID(),
          displayName: "Bad scale",
          fields: [
            {
              id: crypto.randomUUID(),
              kind: "severity",
              label: "Severity",
              minimum: 10,
              maximum: 1,
              step: 1,
              lowLabel: null,
              highLabel: null,
              helpText: null,
              exportLabel: null,
            },
          ],
        },
        null,
        db,
      ),
    ).rejects.toThrow("bounds");
    expect(await db.eventTypes.count()).toBe(before);
  });
  it("uses the recorded time zone for calendar dates and rejects invalid local input", () => {
    const day = formatDay({
      precision: "exact",
      at: "2026-09-27T01:00:00Z",
      timeZone: "America/New_York",
    });
    expect(day).toContain("26");
    expect(() => parseLocalInput("not-a-date")).toThrow("invalid");
  });
  it("creates one profile even with concurrent initialization", async () => {
    const { db } = await setup();
    await Promise.all([initialize(db), initialize(db)]);
    expect(await db.profiles.count()).toBe(1);
    expect(await db.preferences.count()).toBe(1);
    expect(await db.observations.count()).toBe(0);
  });
  it("persists a minimal observation through database close and reopen", async () => {
    const { db, data } = await setup();
    const o = await log(db, data);
    db.close();
    await db.open();
    expect(await db.observations.get(o.id)).toEqual(o);
    expect(o.values).toEqual({});
    expect(o.notes).toBeNull();
    expect(o.span).toEqual({ kind: "point" });
  });
  it("preserves approximate time separately from entry time", async () => {
    const { db, data } = await setup();
    const approximate: RecordedTime = {
      precision: "approximate",
      earliest: "2026-09-26T22:00:00.000Z",
      latest: "2026-09-27T02:00:00.000Z",
      timeZone: "America/New_York",
      description: "Yesterday evening",
    };
    const o = await log(db, data, approximate, "Fictional test note");
    expect(o.startedAt).toEqual(approximate);
    expect(o.createdAt).not.toBe(approximate.earliest);
  });
  it("rejects invalid times without saving a partial entry", async () => {
    const { db, data } = await setup();
    await expect(
      log(db, data, {
        precision: "approximate",
        earliest: "2026-09-28T00:00:00Z",
        latest: "2026-09-27T00:00:00Z",
        timeZone: "UTC",
        description: null,
      }),
    ).rejects.toThrow();
    expect(await db.observations.count()).toBe(0);
  });
  it("finds approximate overlapping observations without interpolating missing time", async () => {
    const { db, data } = await setup();
    const anchor = await log(db, data);
    const nearby = await log(db, data, {
      precision: "approximate",
      earliest: "2026-09-27T08:00:00Z",
      latest: "2026-09-27T12:00:00Z",
      timeZone: "UTC",
      description: null,
    });
    const [from, to] = lookBackWindow(anchor, 6, 0);
    expect(overlaps(nearby, from, to)).toBe(true);
    const point: Observation = {
      ...anchor,
      startedAt: {
        precision: "exact",
        at: "2026-09-26T00:00:00Z",
        timeZone: "UTC",
      },
    };
    expect(overlaps(point, from, to)).toBe(false);
    expect(
      overlaps({ ...point, span: { kind: "ongoing" } }, from, to, to),
    ).toBe(true);
  });
  it("round-trips complete records, historical revisions, tags and extensions into another database", async () => {
    const { db, data } = await setup();
    await log(db, data);
    const backup = await readBackup(db);
    backup.eventTypes.push({
      ...backup.eventTypes[0],
      revision: 2,
      displayName: "Renamed later",
    });
    backup.observations[0].extensions = {
      "example.weather": { pressure: 1012, other: ["x", null, true] },
    };
    const tag = {
      id: crypto.randomUUID(),
      profileId: backup.profiles[0].id,
      createdAt: time.at,
      updatedAt: time.at,
      deletedAt: null,
      label: "Travel",
      archived: false,
    };
    backup.tags.push(tag);
    backup.observations[0].tagIds = [tag.id];
    const serialized = JSON.stringify(backup);
    const fresh = await setup();
    await restoreBackup(parseBackup(serialized), fresh.db);
    const restored = await readBackup(fresh.db);
    expect(restored.observations).toEqual(backup.observations);
    for (const t of backup.eventTypes)
      expect(restored.eventTypes).toContainEqual(t);
    expect(restored.tags).toEqual(backup.tags);
    const again = await restoreBackup(parseBackup(serialized), fresh.db);
    expect(again.added).toBe(0);
    expect(await fresh.db.observations.count()).toBe(1);
  });
  it("rejects conflicts atomically, including other new records in the file", async () => {
    const { db, data } = await setup();
    await log(db, data);
    const original = await readBackup(db),
      changed = structuredClone(original);
    changed.observations[0].notes = "Conflicting version";
    changed.tags.push({
      id: crypto.randomUUID(),
      profileId: original.profiles[0].id,
      label: "New tag",
      archived: false,
      createdAt: time.at,
      updatedAt: time.at,
      deletedAt: null,
    });
    await expect(restoreBackup(changed, db)).rejects.toThrow("conflicts");
    expect((await readBackup(db)).observations).toEqual(original.observations);
    expect(await db.tags.count()).toBe(0);
  });
  it("rejects malformed and future backups without changing saved data", async () => {
    const { db, data } = await setup();
    await log(db, data);
    expect(() => parseBackup("{ broken")).toThrow("valid JSON");
    expect(() => validateBackup({ ...data, formatVersion: 999 })).toThrow(
      "unsupported",
    );
    const bad = await readBackup(db);
    bad.observations[0].eventType.revision = 99;
    await expect(restoreBackup(bad, db)).rejects.toThrow("Missing event");
    expect(await db.observations.count()).toBe(1);
  });
  it("rejects cross-profile references", async () => {
    const a = await setup(),
      b = await setup();
    await log(a.db, a.data);
    const data = await readBackup(a.db);
    data.observations[0].profileId = b.data.profiles[0].id;
    expect(() => validateBackup(data)).toThrow("missing profile");
  });
  it("keeps historical scales valid after a definition changes", async () => {
    const { db, data } = await setup();
    await log(db, data);
    const b = await readBackup(db);
    const fieldId = crypto.randomUUID();
    const definition = b.eventTypes.find(
      (t) => t.id === b.observations[0].eventType.id,
    )!;
    definition.fields = [
      {
        id: fieldId,
        kind: "severity",
        label: "Severity",
        exportLabel: null,
        helpText: null,
        minimum: 1,
        maximum: 10,
        step: 1,
        lowLabel: null,
        highLabel: null,
      },
    ];
    b.observations[0].values[fieldId] = { kind: "severity", value: 8 };
    b.eventTypes.push({
      ...definition,
      revision: 2,
      fields: [
        {
          ...definition.fields[0],
          kind: "severity",
          minimum: 1,
          maximum: 3,
          step: 1,
          lowLabel: null,
          highLabel: null,
        },
      ],
    });
    expect(() => validateBackup(b)).not.toThrow();
    b.observations[0].eventType.revision = 2;
    expect(() => validateBackup(b)).toThrow("outside field range");
  });
  it("accepts PRN plans but rejects PRN scheduled occurrences", async () => {
    const { db, data } = await setup();
    await log(db, data);
    const b = await readBackup(db);
    const t = b.eventTypes.find(
      (t) => t.id === b.observations[0].eventType.id,
    )!;
    t.category = "medication";
    const schedule = {
      id: crypto.randomUUID(),
      profileId: t.profileId,
      createdAt: time.at,
      updatedAt: time.at,
      deletedAt: null,
      revision: 1,
      eventType: { id: t.id, revision: 1 },
      label: null,
      effectiveFrom: time.at,
      effectiveUntil: null,
      timeZone: "UTC",
      rule: { kind: "as-needed" as const },
      plannedDose: null,
      instructions: null,
      archived: false,
      extensions: {},
    };
    b.medicationSchedules.push(schedule);
    expect(() => validateBackup(b)).not.toThrow();
    b.observations[0].medication = {
      action: "taken",
      dose: null,
      occurrence: {
        schedule: { id: schedule.id, revision: 1 },
        scheduledFor: time.at,
      },
    };
    expect(() => validateBackup(b)).toThrow("PRN");
  });
});
