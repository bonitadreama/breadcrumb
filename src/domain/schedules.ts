import type { MedicationSchedule } from "./types";

// Supersession closes an open-ended revision without rewriting its definition.
export function scheduleEnd(
  plan: MedicationSchedule,
  all: MedicationSchedule[],
) {
  const successor = all
    .filter((p) => p.id === plan.id && p.revision > plan.revision)
    .sort((a, b) => a.revision - b.revision)[0];
  return Math.min(
    plan.effectiveUntil ? Date.parse(plan.effectiveUntil) : Infinity,
    successor ? Date.parse(successor.effectiveFrom) : Infinity,
  );
}
export function currentPlans(plans: MedicationSchedule[], now = Date.now()) {
  return plans.filter(
    (p) =>
      !p.deletedAt &&
      !p.archived &&
      Date.parse(p.effectiveFrom) <= now &&
      now < scheduleEnd(p, plans),
  );
}
export function planSummary(plan: MedicationSchedule) {
  if (plan.rule.kind === "as-needed")
    return "As needed / PRN · no expected dose times";
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdays =
    plan.rule.weekdays.length === 7
      ? "Every day"
      : [...plan.rule.weekdays]
          .sort()
          .map((d) => days[d - 1])
          .join(", ");
  return `${weekdays} · ${plan.rule.times.join(", ")} · ${plan.timeZone.replaceAll("_", " ")}`;
}
