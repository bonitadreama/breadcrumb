import { z } from "zod";
import { observationSchema, type Observation } from "./types";

export const historyKey = "breadcrumb.observation-history";
const historySchema = z
  .object({ version: z.literal(1), entries: z.array(observationSchema) })
  .strict();
export function withoutHistory(observation: Observation): Observation {
  const copy = structuredClone(observation);
  delete copy.extensions[historyKey];
  return copy;
}
export function observationHistory(observation: Observation): Observation[] {
  const raw = observation.extensions[historyKey];
  if (raw === undefined) return [];
  const parsed = historySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "Invalid observation history. Your records have not changed.",
    );
  let last = -Infinity;
  for (const entry of parsed.data.entries) {
    if (
      entry.id !== observation.id ||
      entry.profileId !== observation.profileId ||
      entry.createdAt !== observation.createdAt ||
      entry.eventType.id !== observation.eventType.id ||
      entry.eventType.revision !== observation.eventType.revision ||
      historyKey in entry.extensions ||
      Date.parse(entry.updatedAt) <= last ||
      Date.parse(entry.updatedAt) >= Date.parse(observation.updatedAt)
    )
      throw new Error("Invalid observation history order or identity.");
    last = Date.parse(entry.updatedAt);
  }
  return parsed.data.entries;
}
