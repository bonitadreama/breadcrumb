import { afterEach, expect, it } from "vitest";
import { HealthDatabase } from "../src/storage/database";
import {
  initialize,
  readBackup,
  restoreBackup,
  saveObservation,
} from "../src/storage/repositories";
import {
  createProfile,
  saveProfileSettings,
  switchProfile,
} from "../src/storage/profiles";

const databases: HealthDatabase[] = [];
async function setup() {
  const db = new HealthDatabase(`profiles-${crypto.randomUUID()}`);
  databases.push(db);
  await initialize(db);
  return db;
}
afterEach(async () => {
  for (const db of databases) await db.delete();
  databases.length = 0;
});

it("creates independent starter definitions without copying records, and remembers the active journal after reopening", async () => {
  const db = await setup(),
    original = await readBackup(db);
  const observation = await saveObservation(
    original.profiles[0].id,
    original.eventTypes[0].id,
    { precision: "exact", at: new Date().toISOString(), timeZone: "UTC" },
    "Fictional first journal entry",
    db,
  );
  const second = await createProfile("Second journal", db);
  const data = await readBackup(db);
  expect(data.eventTypes.filter((t) => t.profileId === second.id)).toHaveLength(
    4,
  );
  expect(data.observations.filter((o) => o.profileId === second.id)).toEqual(
    [],
  );
  expect(data.observations).toEqual([observation]);
  expect(
    data.preferences
      .find((p) => p.profileId === second.id)!
      .logging.favoriteEventTypeIds.every(
        (id) => !original.eventTypes.some((t) => t.id === id),
      ),
  ).toBe(true);
  db.close();
  await db.open();
  expect((await db.meta.get("activeProfileId"))!.value).toBe(second.id);
  await switchProfile(original.profiles[0].id, db);
  expect((await db.meta.get("activeProfileId"))!.value).toBe(
    original.profiles[0].id,
  );
});

it("saves per-journal name, action order and window without changing another profile or historical entries; restores all settings", async () => {
  const db = await setup(),
    initial = await readBackup(db),
    first = initial.profiles[0];
  const second = await createProfile("Other", db),
    data = await readBackup(db);
  const prefs = data.preferences.find((p) => p.profileId === second.id)!;
  const ids = [...prefs.logging.favoriteEventTypeIds].reverse().slice(0, 2);
  await saveProfileSettings(
    { ...second, displayName: "Renamed journal" },
    {
      ...prefs,
      logging: { ...prefs.logging, favoriteEventTypeIds: ids },
      lookBack: { beforeHours: 48, afterHours: 0 },
    },
    { profile: second.updatedAt, preferences: prefs.updatedAt },
    db,
  );
  const saved = await readBackup(db);
  expect(saved.profiles.find((p) => p.id === first.id)).toEqual(first);
  expect(saved.preferences.find((p) => p.profileId === first.id)).toEqual(
    initial.preferences[0],
  );
  expect(
    saved.preferences.find((p) => p.profileId === second.id)!.logging
      .favoriteEventTypeIds,
  ).toEqual(ids);
  expect(saved.eventTypes).toEqual(data.eventTypes);
  const fresh = await setup();
  await restoreBackup(saved, fresh);
  expect(
    (await readBackup(fresh)).preferences.find(
      (p) => p.profileId === second.id,
    ),
  ).toEqual(saved.preferences.find((p) => p.profileId === second.id));
  expect((await fresh.profiles.get(second.id))!.displayName).toBe(
    "Renamed journal",
  );
});

it("rejects duplicate names and invalid or cross-profile settings atomically", async () => {
  const db = await setup(),
    data = await readBackup(db),
    first = data.profiles[0],
    prefs = data.preferences[0];
  await expect(createProfile("  my journal  ", db)).rejects.toThrow(
    "already in use",
  );
  await expect(createProfile("   ", db)).rejects.toThrow("name");
  expect(await db.profiles.count()).toBe(1);
  const second = await createProfile("Second", db),
    foreign = (await db.eventTypes.toArray()).find(
      (t) => t.profileId === second.id,
    )!;
  const expected = { profile: first.updatedAt, preferences: prefs.updatedAt };
  await expect(
    saveProfileSettings(
      { ...first, displayName: "Should not save" },
      {
        ...prefs,
        logging: { ...prefs.logging, favoriteEventTypeIds: [foreign.id] },
      },
      expected,
      db,
    ),
  ).rejects.toThrow("Invalid preference");
  await expect(
    saveProfileSettings(
      first,
      { ...prefs, profileId: second.id },
      expected,
      db,
    ),
  ).rejects.toThrow("belong");
  await expect(
    saveProfileSettings(
      first,
      { ...prefs, lookBack: { beforeHours: -1, afterHours: 0 } },
      expected,
      db,
    ),
  ).rejects.toThrow();
  expect(await db.profiles.get(first.id)).toEqual(first);
  expect(await db.preferences.get(first.id)).toEqual(prefs);
  await expect(switchProfile(crypto.randomUUID(), db)).rejects.toThrow(
    "no longer available",
  );
  expect((await db.meta.get("activeProfileId"))!.value).toBe(second.id);
});

it("rejects stale settings without losing a newer customization", async () => {
  const db = await setup(),
    data = await readBackup(db),
    p = data.profiles[0],
    prefs = data.preferences[0],
    expected = { profile: p.updatedAt, preferences: prefs.updatedAt };
  await saveProfileSettings(
    { ...p, displayName: "New name" },
    prefs,
    expected,
    db,
  );
  await expect(
    saveProfileSettings(
      p,
      { ...prefs, lookBack: { beforeHours: 0, afterHours: 0 } },
      expected,
      db,
    ),
  ).rejects.toThrow("another window");
  expect((await db.profiles.get(p.id))!.displayName).toBe("New name");
  expect((await db.preferences.get(p.id))!.lookBack).toEqual(prefs.lookBack);
});
