import type { RecordedTime } from "../domain/types";
import { localInput, parseLocalInput } from "../domain/time";

export interface TimeDraft {
  mode: "exact" | "approximate";
  at: string;
  from: string;
  to: string;
  description: string;
  original?: RecordedTime;
}
export function timeDraft(time?: RecordedTime): TimeDraft {
  const now = localInput();
  return {
    mode: time?.precision ?? "exact",
    at: time?.precision === "exact" ? localInput(new Date(time.at)) : now,
    from:
      time?.precision === "approximate"
        ? localInput(new Date(time.earliest))
        : now,
    to:
      time?.precision === "approximate"
        ? localInput(new Date(time.latest))
        : now,
    description:
      time?.precision === "approximate" ? (time.description ?? "") : "",
    original: time,
  };
}
export function readTimeDraft(draft: TimeDraft): RecordedTime {
  if (draft.original) return draft.original;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return draft.mode === "exact"
    ? { precision: "exact", at: parseLocalInput(draft.at), timeZone }
    : {
        precision: "approximate",
        earliest: parseLocalInput(draft.from),
        latest: parseLocalInput(draft.to),
        timeZone,
        description: draft.description.trim() || null,
      };
}
export function TimeFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimeDraft;
  onChange: (d: TimeDraft) => void;
}) {
  function change(update: Partial<TimeDraft>) {
    onChange({ ...value, ...update, original: undefined });
  }
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={value.mode === "exact"}
          onClick={() => change({ mode: "exact" })}
        >
          Choose time
        </button>
        <button
          type="button"
          aria-pressed={value.mode === "approximate"}
          onClick={() => change({ mode: "approximate" })}
        >
          Approximately
        </button>
      </div>
      {value.mode === "exact" ? (
        <label className="subfield">
          {label} date and time
          <input
            type="datetime-local"
            required
            value={value.at}
            onChange={(e) => change({ at: e.target.value })}
          />
        </label>
      ) : (
        <>
          <div className="two-fields subfield">
            <label>
              {label} earliest
              <input
                type="datetime-local"
                required
                value={value.from}
                onChange={(e) => change({ from: e.target.value })}
              />
            </label>
            <label>
              {label} latest
              <input
                type="datetime-local"
                required
                value={value.to}
                onChange={(e) => change({ to: e.target.value })}
              />
            </label>
          </div>
          <label>
            How you remember the {label.toLowerCase()}
            <input
              value={value.description}
              onChange={(e) => change({ description: e.target.value })}
              placeholder="e.g. Monday evening"
            />
          </label>
        </>
      )}
      <p className="fine-print">
        Shown in{" "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}.
        Approximate times remain windows.
      </p>
    </fieldset>
  );
}
