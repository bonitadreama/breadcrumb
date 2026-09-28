import type { Preferences, Profile } from "../domain/types";
import { defaults } from "../templates/defaults";
import { validateBackup } from "../domain/validation";
import { db } from "./database";
import { readBackup } from "./repositories";

function nameFor(name: string, profiles: Profile[], except?: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100)
    throw new Error("Give this journal a name of 1–100 characters.");
  const normalized = (s: string) =>
    (s === "My space" ? "My journal" : s).toLowerCase();
  if (
    profiles.some(
      (p) =>
        p.id !== except &&
        !p.archived &&
        !p.deletedAt &&
        normalized(p.displayName) === normalized(clean),
    )
  )
    throw new Error(
      "That journal name is already in use. Choose a different name so they are easy to tell apart.",
    );
  return clean;
}

export async function createProfile(name: string, database = db) {
  return database.transaction("rw", database.tables, async () => {
    const data = await readBackup(database);
    const initial = defaults();
    initial.profile.displayName = nameFor(name, data.profiles);
    data.profiles.push(initial.profile);
    data.preferences.push(initial.preferences);
    data.eventTypes.push(...initial.eventTypes);
    validateBackup(data);
    await database.profiles.add(initial.profile);
    await database.preferences.add(initial.preferences);
    await database.eventTypes.bulkAdd(initial.eventTypes);
    await database.meta.put({
      key: "activeProfileId",
      value: initial.profile.id,
    });
    return initial.profile;
  });
}

export async function switchProfile(id: string, database = db) {
  return database.transaction(
    "rw",
    database.profiles,
    database.meta,
    async () => {
      const profile = await database.profiles.get(id);
      if (!profile || profile.deletedAt || profile.archived)
        throw new Error("This journal is no longer available.");
      await database.meta.put({ key: "activeProfileId", value: id });
    },
  );
}

export async function saveProfileSettings(
  profile: Profile,
  preferences: Preferences,
  expected: { profile: string; preferences: string },
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const data = await readBackup(database);
    const old = data.profiles.find((p) => p.id === profile.id);
    const oldPreferences = data.preferences.find(
      (p) => p.profileId === profile.id,
    );
    if (
      !old ||
      old.archived ||
      old.deletedAt ||
      !oldPreferences ||
      old.updatedAt !== expected.profile ||
      oldPreferences.updatedAt !== expected.preferences
    )
      throw new Error(
        "This journal changed in another window. Reopen its settings before saving.",
      );
    if (preferences.profileId !== profile.id)
      throw new Error("Settings must belong to this journal.");
    const now = new Date(
      Math.max(
        Date.now(),
        Date.parse(old.updatedAt) + 1,
        Date.parse(oldPreferences.updatedAt) + 1,
      ),
    ).toISOString();
    // Only exposed settings are mutable here; preserve all other data and extensions.
    const next = {
      ...old,
      displayName: nameFor(profile.displayName, data.profiles, old.id),
      updatedAt: now,
    };
    const prefs = {
      ...oldPreferences,
      logging: {
        ...oldPreferences.logging,
        favoriteEventTypeIds: preferences.logging.favoriteEventTypeIds,
      },
      lookBack: preferences.lookBack,
      updatedAt: now,
    };
    if (
      new Set(prefs.logging.favoriteEventTypeIds).size !==
      prefs.logging.favoriteEventTypeIds.length
    )
      throw new Error("Each quick action can appear only once.");
    data.profiles = data.profiles.map((p) => (p.id === next.id ? next : p));
    data.preferences = data.preferences.map((p) =>
      p.profileId === next.id ? prefs : p,
    );
    validateBackup(data);
    await database.profiles.put(next);
    await database.preferences.put(prefs);
  });
}
