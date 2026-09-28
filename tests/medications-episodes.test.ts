import { afterEach, describe, expect, it } from "vitest";
import { HealthDatabase } from "../src/storage/database";
import {
  initialize,
  readBackup,
  restoreBackup,
  saveMedication,
  saveObservation,
  saveEpisode,
  toggleEpisodeLink,
} from "../src/storage/repositories";
import { currentPlans, scheduleEnd } from "../src/domain/schedules";
import { bounds, lookBackWindow, overlaps } from "../src/domain/time";
import type {
  Episode,
  EventType,
  MedicationSchedule,
  RecordedTime,
} from "../src/domain/types";

const databases: HealthDatabase[] = [];
const now = "2026-09-27T12:00:00.000Z";
const time: RecordedTime = { precision: "exact", at: now, timeZone: "UTC" };
async function setup() {
  const db = new HealthDatabase(`test-med-${crypto.randomUUID()}`);
  databases.push(db);
  await initialize(db);
  const data = await readBackup(db),
    profileId = data.profiles[0].id;
  const type: EventType = {
    ...data.eventTypes[0],
    id: crypto.randomUUID(),
    displayName: "Fictional medication",
    category: "medication",
    icon: "pill",
  };
  const plan: MedicationSchedule = {
    id: crypto.randomUUID(),
    profileId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    eventType: { id: type.id, revision: 1 },
    label: null,
    effectiveFrom: now,
    effectiveUntil: null,
    timeZone: "America/New_York",
    rule: {
      kind: "scheduled",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      times: ["09:00"],
    },
    plannedDose: { amount: 5, unit: "mg" },
    instructions: null,
    archived: false,
    extensions: {},
  };
  const episode: Episode = {
    id: crypto.randomUUID(),
    profileId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    displayName: "Fictional flare",
    exportName: null,
    kind: "flare",
    startedAt: time,
    endedAt: null,
    anchorObservationId: null,
    linkedObservationIds: [],
    lookBackWindow: { beforeHours: 168, afterHours: 24 },
    tagIds: [],
    notes: null,
    extensions: {},
  };
  return { db, data, profileId, type, plan, episode };
}
afterEach(async () => {
  for (const db of databases) await db.delete();
  databases.length = 0;
});

describe("Medication records and plans", () => {
  it("saving a scheduled plan does not create taken or skipped observations", async () => {
    const { db, type, plan } = await setup();
    await saveMedication(type, plan, null, null, db);
    expect(await db.observations.count()).toBe(0);
    const saved = await db.medicationSchedules.toArray();
    expect(saved[0].plannedDose).toEqual({ amount: 5, unit: "mg" });
    expect(
      currentPlans(saved, Date.parse(saved[0].effectiveFrom) + 1),
    ).toHaveLength(1);
  });
  it("distinguishes unconfigured from PRN and never generates records for PRN", async () => {
    const { db, type, plan } = await setup();
    await saveMedication(type, null, null, null, db);
    expect(await db.medicationSchedules.count()).toBe(0);
    await saveMedication(
      type,
      { ...plan, rule: { kind: "as-needed" } },
      1,
      null,
      db,
    );
    expect((await db.medicationSchedules.toArray())[0].rule.kind).toBe(
      "as-needed",
    );
    expect(await db.observations.count()).toBe(0);
  });
  it("requires an explicit medication action and does not infer planned dose", async () => {
    const { db, type, plan } = await setup();
    await saveMedication(type, plan, null, null, db);
    await expect(
      saveObservation(type.profileId, type.id, time, "", db),
    ).rejects.toThrow("Choose whether");
    const o = await saveObservation(type.profileId, type.id, time, "", db, {
      medication: { action: "taken", dose: null, occurrence: null },
    });
    expect(o.medication?.dose).toBeNull();
    expect(o.medication?.occurrence).toBeNull();
    const skipped = await saveObservation(
      type.profileId,
      type.id,
      time,
      "",
      db,
      { medication: { action: "skipped", dose: null, occurrence: null } },
    );
    expect(skipped.medication?.action).toBe("skipped");
    await expect(
      saveObservation(type.profileId, type.id, time, "", db, {
        medication: {
          action: "skipped",
          dose: { amount: 5, unit: "mg" },
          occurrence: null,
        },
      }),
    ).rejects.toThrow("skipped");
  });
  it("preserves historical plans and doses when changing or stopping a plan", async () => {
    const { db, type, plan } = await setup();
    await saveMedication(type, plan, null, null, db);
    const original = (await db.medicationSchedules.toArray())[0];
    const dose = await saveObservation(type.profileId, type.id, time, "", db, {
      medication: {
        action: "taken",
        dose: { amount: 3, unit: "mg" },
        occurrence: null,
      },
    });
    await saveMedication(
      type,
      { ...original, rule: { kind: "as-needed" } },
      1,
      1,
      db,
    );
    const rev2 = (await db.medicationSchedules.get([plan.id, 2]))!;
    expect(await db.medicationSchedules.get([plan.id, 1])).toEqual(original);
    expect(scheduleEnd(original, [original, rev2])).toBe(
      Date.parse(rev2.effectiveFrom),
    );
    expect(
      currentPlans([original, rev2], Date.parse(rev2.effectiveFrom) + 1)[0].rule
        .kind,
    ).toBe("as-needed");
    await saveMedication(type, { ...rev2, archived: true }, 1, 2, db);
    const all = await db.medicationSchedules.toArray(),
      rev3 = all.find((p) => p.revision === 3)!;
    expect(currentPlans(all, Date.parse(rev3.effectiveFrom) + 1)).toHaveLength(
      0,
    );
    expect(await db.observations.get(dose.id)).toEqual(dose);
    expect(await db.medicationSchedules.get([plan.id, 2])).toEqual(rev2);
  });
  it("rejects invalid plans atomically and stale plan edits", async () => {
    const { db, type, plan } = await setup();
    await expect(
      saveMedication(
        type,
        { ...plan, plannedDose: { amount: -1, unit: "mg" } },
        null,
        null,
        db,
      ),
    ).rejects.toThrow();
    expect(await db.eventTypes.get([type.id, 1])).toBeUndefined();
    await saveMedication(type, plan, null, null, db);
    await expect(saveMedication(type, plan, 1, null, db)).rejects.toThrow(
      "another window",
    );
    expect(await db.medicationSchedules.count()).toBe(1);
  });
});

describe("Episodes and Look Back", () => {
  it("preserves approximate episode times, explicit related links, and optional ends through backups", async () => {
    const { db, data, episode } = await setup();
    const approx: RecordedTime = {
      precision: "approximate",
      earliest: "2026-09-26T18:00:00Z",
      latest: "2026-09-26T22:00:00Z",
      timeZone: "UTC",
      description: "Yesterday evening",
    };
    const o = await saveObservation(
      episode.profileId,
      data.eventTypes[0].id,
      approx,
      "fictional",
      db,
    );
    const e = await saveEpisode(
      { ...episode, startedAt: approx, anchorObservationId: o.id },
      null,
      db,
    );
    expect(e.endedAt).toBeNull();
    const linked = await toggleEpisodeLink(e.id, o.id, e.profileId, db);
    expect(linked.linkedObservationIds).toEqual([o.id]);
    expect(await db.observations.get(o.id)).toEqual(o);
    const [from, to] = lookBackWindow(linked, 0, 0);
    expect(from).toBe(bounds(approx)[0]);
    expect(to).toBe(bounds(approx)[1]);
    expect(overlaps(o, from, to)).toBe(true);
    const backup = await readBackup(db),
      fresh = await setup();
    await restoreBackup(backup, fresh.db);
    expect(await fresh.db.episodes.get(e.id)).toEqual(linked);
    const unlinked = await toggleEpisodeLink(e.id, o.id, e.profileId, db);
    expect(unlinked.linkedObservationIds).toEqual([]);
  });
  it("rejects impossible ends and cross-profile links without changing the episode", async () => {
    const { db, episode } = await setup();
    await expect(
      saveEpisode(
        { ...episode, endedAt: { ...time, at: "2026-09-01T00:00:00Z" } },
        null,
        db,
      ),
    ).rejects.toThrow("End time");
    expect(await db.episodes.count()).toBe(0);
    const saved = await saveEpisode(episode, null, db);
    await expect(
      toggleEpisodeLink(saved.id, crypto.randomUUID(), saved.profileId, db),
    ).rejects.toThrow("Invalid episode observation");
    await expect(
      toggleEpisodeLink(saved.id, crypto.randomUUID(), crypto.randomUUID(), db),
    ).rejects.toThrow("no longer available");
    expect(await db.episodes.get(saved.id)).toEqual(saved);
  });
  it("rejects stale episode editors without removing a newly added association", async () => {
    const { db, data, episode } = await setup();
    const saved = await saveEpisode(episode, null, db);
    const o = await saveObservation(
      episode.profileId,
      data.eventTypes[0].id,
      time,
      "",
      db,
    );
    const linked = await toggleEpisodeLink(saved.id, o.id, saved.profileId, db);
    await expect(
      saveEpisode({ ...saved, displayName: "Stale edit" }, saved.updatedAt, db),
    ).rejects.toThrow("another window");
    expect(await db.episodes.get(saved.id)).toEqual(linked);
  });
});
