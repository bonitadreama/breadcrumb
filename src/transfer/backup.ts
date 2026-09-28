import type { Backup } from "../domain/types";
import { validateBackup } from "../domain/validation";

export const collections = [
  "profiles",
  "preferences",
  "eventTypes",
  "observations",
  "medicationSchedules",
  "episodes",
  "tags",
  "photoAssets",
] as const;
export function recordKey(
  name: (typeof collections)[number],
  row: unknown,
): string {
  const r = row as { id?: string; profileId?: string; revision?: number };
  return name === "preferences"
    ? r.profileId!
    : name === "eventTypes" || name === "medicationSchedules"
      ? `${r.id}:${r.revision}`
      : r.id!;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function mergeBackups(current: Backup, incoming: Backup) {
  const merged = structuredClone(current);
  let added = 0,
    identical = 0;
  for (const name of collections) {
    const rows = merged[name] as unknown[];
    const existing = new Map(rows.map((row) => [recordKey(name, row), row]));
    for (const row of incoming[name]) {
      const key = recordKey(name, row),
        previous = existing.get(key);
      if (previous) {
        if (canonical(previous) !== canonical(row))
          throw new Error(
            `This backup conflicts with a saved ${name} record. Nothing was changed. Restore into a separate browser profile to inspect that version.`,
          );
        identical++;
      } else {
        rows.push(row);
        existing.set(key, row);
        added++;
      }
    }
  }
  return { backup: validateBackup(merged), added, identical };
}
export function parseBackup(text: string) {
  try {
    return validateBackup(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("This is not a valid JSON backup. Nothing was changed.");
    throw error;
  }
}
