import type { EventType, Preferences, Profile } from "../domain/types";

export function defaults() {
  const now = new Date().toISOString();
  const base = () => ({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const profile: Profile = {
    ...base(),
    displayName: "My journal",
    avatar: { icon: "sprout", color: "#583b53" },
    archived: false,
    extensions: {},
  };
  const eventTypes: EventType[] = [
    ["Something feels off", "symptom", "sparkles"],
    ["Pain or discomfort", "symptom", "activity"],
    ["Energy change", "symptom", "sun"],
    ["A note to remember", "note", "notebook"],
  ].map(([displayName, category, icon]) => ({
    ...base(),
    profileId: profile.id,
    revision: 1,
    category: category as EventType["category"],
    displayName,
    exportName: null,
    description: null,
    icon,
    color: "#583b53",
    fields: [],
    quickLogFieldIds: [],
    archived: false,
    extensions: {},
  }));
  const preferences: Preferences = {
    profileId: profile.id,
    appearance: {
      theme: "light",
      accentColor: "#583b53",
      textSize: "standard",
      motion: "system",
      personality: "gentle",
      acknowledgments: true,
    },
    logging: {
      favoriteEventTypeIds: eventTypes.map((t) => t.id),
      showRecentTypes: true,
      defaultTimeZone: "device",
    },
    timeline: {
      defaultView: "list",
      defaultRange: "week",
      trackOrder: [],
      hiddenEventTypeIds: [],
    },
    lookBack: { beforeHours: 168, afterHours: 24 },
    formatting: { locale: "en-US", hourCycle: "system", weekStartsOn: 1 },
    reports: {
      nameStyle: "formal-when-available",
      includeNotesByDefault: false,
    },
    updatedAt: now,
    extensions: {},
  };
  return { profile, eventTypes, preferences };
}
