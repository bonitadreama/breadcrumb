import { backupSchema, type Backup, type RecordedTime } from "./types";
import { bounds } from "./time";
import { scheduleEnd } from "./schedules";
import { observationHistory, withoutHistory } from "./history";
import { attachments, MAX_PHOTO_DATA } from "./photos";

export function validateBackup(input: unknown): Backup {
  if (
    typeof input === "object" &&
    input &&
    "formatVersion" in input &&
    input.formatVersion !== 1 &&
    input.formatVersion !== 2
  )
    throw new Error(
      "This backup uses an unsupported format. Your existing records have not changed.",
    );
  // v1 had no photo store. Upgrade in memory before validation; never rewrite a source file.
  if (
    typeof input === "object" &&
    input &&
    "formatVersion" in input &&
    input.formatVersion === 1
  ) {
    if ("photoAssets" in input)
      throw new Error("Invalid v1 backup: unexpected photo assets.");
    input = { ...input, formatVersion: 2, photoAssets: [] };
  }
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid backup at ${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`,
    );
  const b = parsed.data;
  const check = (ok: unknown, message: string) => {
    if (!ok) throw new Error(message);
  };
  const unique = (keys: string[], name: string) =>
    check(new Set(keys).size === keys.length, `Duplicate ${name}`);
  const profiles = new Set(b.profiles.map((p) => p.id));
  unique(
    b.photoAssets.map((a) => a.id),
    "photo IDs",
  );
  check(
    b.photoAssets.reduce((n, a) => n + a.dataUrl.length, 0) <= MAX_PHOTO_DATA,
    "Local photo capacity reached. This prototype supports 48 MB of encoded photo data across all journals, including history.",
  );
  for (const asset of b.photoAssets)
    check(profiles.has(asset.profileId), "Photo references a missing profile");
  const assets = new Map(b.photoAssets.map((a) => [a.id, a]));
  for (const o of b.observations) {
    const photos = attachments(o);
    unique(
      photos.map((p) => p.assetId),
      "observation photos",
    );
    for (const photo of photos)
      check(
        assets.get(photo.assetId)?.profileId === o.profileId,
        "Missing photo or photo belongs to another profile",
      );
  }
  unique([...b.profiles.map((p) => p.id)], "profile IDs");
  for (const name of ["observations", "episodes", "tags"] as const)
    unique(
      b[name].map((x) => x.id),
      `${name} IDs`,
    );
  unique(
    b.eventTypes.map((x) => `${x.id}:${x.revision}`),
    "event revisions",
  );
  unique(
    b.medicationSchedules.map((x) => `${x.id}:${x.revision}`),
    "schedule revisions",
  );
  unique(
    b.preferences.map((x) => x.profileId),
    "preferences",
  );
  for (const list of [
    b.eventTypes,
    b.observations,
    b.medicationSchedules,
    b.episodes,
    b.tags,
    b.preferences,
  ])
    for (const item of list)
      check(
        profiles.has(item.profileId),
        "Record references a missing profile",
      );
  const type = (r: { id: string; revision: number }, profileId: string) => {
    const found = b.eventTypes.find(
      (t) =>
        t.id === r.id && t.revision === r.revision && t.profileId === profileId,
    );
    check(found, "Missing event definition or cross-profile reference");
    return found!;
  };
  const timeEnd = (start: RecordedTime, end: RecordedTime) =>
    check(bounds(end)[1] >= bounds(start)[0], "End time is before start time");
  const tags = (ids: string[], profileId: string) => {
    unique(ids, "tag references");
    ids.forEach((id) =>
      check(
        b.tags.some((t) => t.id === id && t.profileId === profileId),
        "Missing tag or cross-profile tag",
      ),
    );
  };
  for (const t of b.eventTypes) {
    check(
      b.eventTypes
        .filter((x) => x.id === t.id)
        .every((x) => x.profileId === t.profileId),
      "Event revisions cross profiles",
    );
    unique(
      t.fields.map((f) => f.id),
      "field IDs",
    );
    for (const field of t.fields) {
      if (field.kind === "number" || field.kind === "severity")
        check(
          field.minimum === null ||
            field.maximum === null ||
            field.minimum <= field.maximum,
          "Invalid field bounds",
        );
      if (field.kind === "choice")
        unique(
          field.options.map((x) => x.id),
          "choice IDs",
        );
    }
    t.quickLogFieldIds.forEach((id) =>
      check(
        t.fields.some((f) => f.id === id),
        "Unknown quick-log field",
      ),
    );
  }
  for (const s of b.medicationSchedules) {
    check(
      type(s.eventType, s.profileId).category === "medication",
      "Schedule must reference medication",
    );
    if (s.effectiveUntil)
      check(
        Date.parse(s.effectiveUntil) > Date.parse(s.effectiveFrom),
        "Invalid schedule period",
      );
    if (s.rule.kind === "scheduled") {
      unique(s.rule.times, "schedule times");
      unique(s.rule.weekdays.map(String), "weekdays");
    }
    for (const other of b.medicationSchedules.filter(
      (x) => x.id === s.id && x.revision !== s.revision,
    )) {
      check(
        other.profileId === s.profileId,
        "Schedule revisions cross profiles",
      );
      check(
        (s.revision < other.revision
          ? Date.parse(s.effectiveFrom) < Date.parse(other.effectiveFrom)
          : Date.parse(s.effectiveFrom) > Date.parse(other.effectiveFrom)) &&
          (Date.parse(s.effectiveFrom) >=
            scheduleEnd(other, b.medicationSchedules) ||
            Date.parse(other.effectiveFrom) >=
              scheduleEnd(s, b.medicationSchedules)),
        "Overlapping schedule revisions",
      );
    }
  }
  for (const o of b.observations) {
    const t = type(o.eventType, o.profileId);
    tags(o.tagIds, o.profileId);
    if (o.span.kind === "ended") timeEnd(o.startedAt, o.span.end);
    if (o.medication) {
      check(
        t.category === "medication",
        "Medication record on non-medication event",
      );
      const occurrence = o.medication.occurrence;
      if (occurrence) {
        const s = b.medicationSchedules.find(
          (s) =>
            s.id === occurrence.schedule.id &&
            s.revision === occurrence.schedule.revision &&
            s.profileId === o.profileId,
        );
        check(
          s && s.rule.kind === "scheduled" && s.eventType.id === t.id,
          "Invalid scheduled occurrence; PRN cannot generate an expected dose",
        );
        check(
          s &&
            Date.parse(occurrence.scheduledFor) >=
              Date.parse(s.effectiveFrom) &&
            Date.parse(occurrence.scheduledFor) <
              scheduleEnd(s, b.medicationSchedules),
          "Occurrence outside schedule period",
        );
      }
    }
    for (const [id, v] of Object.entries(o.values)) {
      const f = t.fields.find((f) => f.id === id);
      check(
        f && f.kind === v.kind,
        "Value does not match historical field definition",
      );
      if (
        f &&
        (f.kind === "number" || f.kind === "severity") &&
        (v.kind === "number" || v.kind === "severity")
      ) {
        check(
          (f.minimum === null || v.value >= f.minimum) &&
            (f.maximum === null || v.value <= f.maximum),
          "Value outside field range",
        );
      }
      if (f?.kind === "choice" && v.kind === "choice") {
        unique(v.optionIds, "selected choices");
        check(
          f.multiple || v.optionIds.length <= 1,
          "Multiple values in single choice",
        );
        v.optionIds.forEach((id) =>
          check(
            f.options.some((x) => x.id === id),
            "Unknown historical choice",
          ),
        );
      }
    }
  }
  for (const e of b.episodes) {
    tags(e.tagIds, e.profileId);
    if (e.endedAt) timeEnd(e.startedAt, e.endedAt);
    for (const id of [
      ...e.linkedObservationIds,
      ...(e.anchorObservationId ? [e.anchorObservationId] : []),
    ])
      check(
        b.observations.some((o) => o.id === id && o.profileId === e.profileId),
        "Invalid episode observation",
      );
  }
  for (const p of b.profiles)
    check(
      b.preferences.some((x) => x.profileId === p.id),
      "Missing profile preferences",
    );
  for (const p of b.preferences)
    for (const id of [
      ...p.logging.favoriteEventTypeIds,
      ...p.timeline.trackOrder,
      ...p.timeline.hiddenEventTypeIds,
    ])
      check(
        b.eventTypes.some((t) => t.id === id && t.profileId === p.profileId),
        "Invalid preference event reference",
      );
  // Validate historical snapshots against the same definitions and reference graph.
  const histories = b.observations.flatMap((o) => observationHistory(o));
  if (histories.length) {
    const base = { ...b, observations: b.observations.map(withoutHistory) };
    for (const old of histories)
      validateBackup({
        ...base,
        observations: base.observations.map((o) => (o.id === old.id ? old : o)),
      });
  }
  return b;
}
