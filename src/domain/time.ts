import type { Observation, RecordedTime } from "./types";

export function bounds(time: RecordedTime): [number, number] {
  return time.precision === "exact"
    ? [Date.parse(time.at), Date.parse(time.at)]
    : [Date.parse(time.earliest), Date.parse(time.latest)];
}
export function startMs(o: Observation) {
  return bounds(o.startedAt)[0];
}
export function overlaps(
  o: Observation,
  from: number,
  to: number,
  now = Date.now(),
) {
  const [start, latest] = bounds(o.startedAt);
  const end =
    o.span.kind === "ended"
      ? bounds(o.span.end)[1]
      : o.span.kind === "ongoing"
        ? Math.max(now, latest)
        : latest;
  return start <= to && end >= from;
}
export function lookBackWindow(
  anchor: { startedAt: RecordedTime },
  beforeHours: number,
  afterHours: number,
): [number, number] {
  const [start, end] = bounds(anchor.startedAt);
  return [start - beforeHours * 3600000, end + afterHours * 3600000];
}
export function localInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export function formatTime(t: RecordedTime) {
  const fmt = (s: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: t.timeZone,
    }).format(new Date(s));
  return t.precision === "exact"
    ? fmt(t.at)
    : `${fmt(t.earliest)} – ${fmt(t.latest)}`;
}
export function formatDay(t: RecordedTime) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: t.timeZone,
  }).format(new Date(bounds(t)[0]));
}
export function parseLocalInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localInput(date) !== value)
    throw new Error(
      "That local time does not exist or is invalid. Please choose another time.",
    );
  return date.toISOString();
}
