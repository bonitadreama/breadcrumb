import Dexie, { type Table } from "dexie";
import type { PhotoAsset } from "../domain/photos";
import type {
  Episode,
  EventType,
  MedicationSchedule,
  Observation,
  Preferences,
  Profile,
  Tag,
} from "../domain/types";

export class HealthDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  preferences!: Table<Preferences, string>;
  eventTypes!: Table<EventType, [string, number]>;
  observations!: Table<Observation, string>;
  medicationSchedules!: Table<MedicationSchedule, [string, number]>;
  episodes!: Table<Episode, string>;
  tags!: Table<Tag, string>;
  photoAssets!: Table<PhotoAsset, string>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor(name = "breadcrumb-health-v1") {
    super(name);
    this.version(1).stores({
      profiles: "id",
      preferences: "profileId",
      eventTypes: "[id+revision], profileId",
      observations: "id, profileId",
      medicationSchedules: "[id+revision], profileId",
      episodes: "id, profileId",
      tags: "id, profileId",
      meta: "key",
    });
    // Additive upgrade: existing records and store indexes are untouched.
    this.version(2).stores({ photoAssets: "id, profileId" });
    this.on("blocked", () => {
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("breadcrumb-storage-blocked"));
    });
    this.on("versionchange", () => {
      this.close();
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("breadcrumb-storage-changed"));
    });
  }
}
export const db = new HealthDatabase();
