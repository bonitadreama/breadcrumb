import { z } from "zod";
import { photoAssetSchema } from "./photos";

const id = z.string().uuid();
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid timestamp");
const zone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Invalid time zone");
const finite = z.number().finite();
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    finite,
    z.string(),
    z.array(json),
    z.record(json),
  ]),
);
const extensions = z.record(json);
const entity = {
  id,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: instant.nullable(),
};
const owned = { ...entity, profileId: id };
const ref = z.object({ id, revision: z.number().int().positive() }).strict();

export const recordedTimeSchema = z
  .discriminatedUnion("precision", [
    z
      .object({ precision: z.literal("exact"), at: instant, timeZone: zone })
      .strict(),
    z
      .object({
        precision: z.literal("approximate"),
        earliest: instant,
        latest: instant,
        timeZone: zone,
        description: z.string().nullable(),
      })
      .strict(),
  ])
  .refine(
    (v) =>
      v.precision === "exact" || Date.parse(v.earliest) <= Date.parse(v.latest),
    "Time window ends before it starts",
  );
const fieldBase = {
  id,
  label: z.string().min(1),
  exportLabel: z.string().nullable(),
  helpText: z.string().nullable(),
};
const option = z
  .object({ id, label: z.string().min(1), exportLabel: z.string().nullable() })
  .strict();
const field = z.discriminatedUnion("kind", [
  z
    .object({ ...fieldBase, kind: z.literal("text"), multiline: z.boolean() })
    .strict(),
  z
    .object({
      ...fieldBase,
      kind: z.literal("number"),
      unit: z.string().nullable(),
      minimum: finite.nullable(),
      maximum: finite.nullable(),
      step: finite.positive().nullable(),
    })
    .strict(),
  z
    .object({
      ...fieldBase,
      kind: z.literal("severity"),
      minimum: finite,
      maximum: finite,
      step: finite.positive(),
      lowLabel: z.string().nullable(),
      highLabel: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      ...fieldBase,
      kind: z.literal("choice"),
      options: z.array(option),
      multiple: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...fieldBase,
      kind: z.literal("boolean"),
      trueLabel: z.string(),
      falseLabel: z.string(),
    })
    .strict(),
]);

export const eventTypeSchema = z
  .object({
    ...owned,
    revision: z.number().int().positive(),
    category: z.enum([
      "symptom",
      "medication",
      "food-drink",
      "sleep",
      "vital",
      "exposure",
      "intervention",
      "note",
      "custom",
    ]),
    displayName: z.string().min(1),
    exportName: z.string().nullable(),
    description: z.string().nullable(),
    icon: z.string(),
    color: z.string().regex(/^#[\da-f]{6}$/i),
    fields: z.array(field),
    quickLogFieldIds: z.array(id),
    archived: z.boolean(),
    extensions,
  })
  .strict();
const dose = z
  .object({ amount: finite.positive(), unit: z.string().trim().min(1) })
  .strict();
const value = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }).strict(),
  z.object({ kind: z.literal("number"), value: finite }).strict(),
  z.object({ kind: z.literal("severity"), value: finite }).strict(),
  z.object({ kind: z.literal("choice"), optionIds: z.array(id) }).strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
]);
export const observationSchema = z
  .object({
    ...owned,
    eventType: ref,
    startedAt: recordedTimeSchema,
    span: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("point") }).strict(),
      z.object({ kind: z.literal("ongoing") }).strict(),
      z.object({ kind: z.literal("ended"), end: recordedTimeSchema }).strict(),
    ]),
    values: z.record(id, value),
    medication: z
      .object({
        action: z.enum(["taken", "skipped"]),
        dose: dose.nullable(),
        occurrence: z
          .object({ schedule: ref, scheduledFor: instant })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    tagIds: z.array(id),
    notes: z.string().nullable(),
    source: z.enum(["manual", "import"]),
    extensions,
  })
  .strict();

export const medicationScheduleSchema = z
  .object({
    ...owned,
    revision: z.number().int().positive(),
    eventType: ref,
    label: z.string().nullable(),
    effectiveFrom: instant,
    effectiveUntil: instant.nullable(),
    timeZone: zone,
    rule: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("scheduled"),
          weekdays: z.array(z.number().int().min(1).max(7)).min(1),
          times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1),
        })
        .strict(),
      z.object({ kind: z.literal("as-needed") }).strict(),
    ]),
    plannedDose: dose.nullable(),
    instructions: z.string().nullable(),
    archived: z.boolean(),
    extensions,
  })
  .strict();
export const episodeSchema = z
  .object({
    ...owned,
    displayName: z.string().min(1),
    exportName: z.string().nullable(),
    kind: z.enum(["flare", "illness", "crash", "custom"]),
    startedAt: recordedTimeSchema,
    endedAt: recordedTimeSchema.nullable(),
    anchorObservationId: id.nullable(),
    linkedObservationIds: z.array(id),
    lookBackWindow: z
      .object({
        beforeHours: finite.nonnegative(),
        afterHours: finite.nonnegative(),
      })
      .strict(),
    tagIds: z.array(id),
    notes: z.string().nullable(),
    extensions,
  })
  .strict();
export const profileSchema = z
  .object({
    ...entity,
    displayName: z.string().min(1),
    avatar: z.object({ icon: z.string(), color: z.string() }).strict(),
    archived: z.boolean(),
    extensions,
  })
  .strict();
export const tagSchema = z
  .object({ ...owned, label: z.string().trim().min(1), archived: z.boolean() })
  .strict();
export const preferencesSchema = z
  .object({
    profileId: id,
    appearance: z
      .object({
        theme: z.enum(["system", "light", "dark", "high-contrast"]),
        accentColor: z.string(),
        textSize: z.enum(["standard", "large", "extra-large"]),
        motion: z.enum(["system", "reduced"]),
        personality: z.enum(["plain", "gentle", "playful"]),
        acknowledgments: z.boolean(),
      })
      .strict(),
    logging: z
      .object({
        favoriteEventTypeIds: z.array(id),
        showRecentTypes: z.boolean(),
        defaultTimeZone: z.union([z.literal("device"), zone]),
      })
      .strict(),
    timeline: z
      .object({
        defaultView: z.enum(["list", "tracks"]),
        defaultRange: z.enum(["day", "week"]),
        trackOrder: z.array(id),
        hiddenEventTypeIds: z.array(id),
      })
      .strict(),
    lookBack: z
      .object({
        beforeHours: finite.nonnegative(),
        afterHours: finite.nonnegative(),
      })
      .strict(),
    formatting: z
      .object({
        locale: z.string(),
        hourCycle: z.enum(["system", "12h", "24h"]),
        weekStartsOn: z.number().int().min(1).max(7),
      })
      .strict(),
    reports: z
      .object({
        nameStyle: z.enum(["display", "formal-when-available"]),
        includeNotesByDefault: z.boolean(),
      })
      .strict(),
    updatedAt: instant,
    extensions,
  })
  .strict();
export const backupSchema = z
  .object({
    format: z.literal("personal-health-timeline"),
    formatVersion: z.literal(2),
    exportedAt: instant,
    appVersion: z.string(),
    profiles: z.array(profileSchema).min(1),
    preferences: z.array(preferencesSchema),
    eventTypes: z.array(eventTypeSchema),
    observations: z.array(observationSchema),
    medicationSchedules: z.array(medicationScheduleSchema),
    episodes: z.array(episodeSchema),
    tags: z.array(tagSchema),
    photoAssets: z.array(photoAssetSchema),
  })
  .strict();

export type RecordedTime = z.infer<typeof recordedTimeSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type MedicationSchedule = z.infer<typeof medicationScheduleSchema>;
export type Episode = z.infer<typeof episodeSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Backup = z.infer<typeof backupSchema>;
