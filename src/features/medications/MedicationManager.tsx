import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, Pill, Plus, X } from "lucide-react";
import type {
  EventType,
  MedicationSchedule,
  Observation,
} from "../../domain/types";
import { currentPlans, planSummary } from "../../domain/schedules";
import { formatTime, startMs } from "../../domain/time";
import { saveMedication } from "../../storage/repositories";
import { Dialog } from "../../components/Dialog";

export function MedicationManager({
  profileId,
  types,
  plans,
  observations,
  onClose,
  onLog,
}: {
  profileId: string;
  types: EventType[];
  plans: MedicationSchedule[];
  observations: Observation[];
  onClose: () => void;
  onLog: (id: string) => void;
}) {
  const [draft, setDraft] = useState<EventType | null>(null),
    [originalPlan, setOriginalPlan] = useState<MedicationSchedule | null>(null);
  const [typeRevision, setTypeRevision] = useState<number | null>(null);
  const [mode, setMode] = useState<"none" | "scheduled" | "as-needed">("none");
  const [times, setTimes] = useState(["09:00"]),
    [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [amount, setAmount] = useState(""),
    [unit, setUnit] = useState(""),
    [instructions, setInstructions] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const medications = types.filter((t) => t.category === "medication");
  function edit(type?: EventType, plan?: MedicationSchedule) {
    const now = new Date().toISOString();
    setDraft(
      type
        ? structuredClone(type)
        : {
            id: crypto.randomUUID(),
            profileId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            revision: 1,
            category: "medication",
            displayName: "",
            exportName: null,
            description: null,
            icon: "pill",
            color: "#583b53",
            fields: [],
            quickLogFieldIds: [],
            archived: false,
            extensions: {},
          },
    );
    setTypeRevision(type?.revision ?? null);
    setOriginalPlan(plan ? structuredClone(plan) : null);
    setMode(plan && !plan.archived ? plan.rule.kind : "none");
    setTimes(plan?.rule.kind === "scheduled" ? plan.rule.times : ["09:00"]);
    setWeekdays(
      plan?.rule.kind === "scheduled"
        ? plan.rule.weekdays
        : [1, 2, 3, 4, 5, 6, 7],
    );
    setZone(plan?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setAmount(plan?.plannedDose ? String(plan.plannedDose.amount) : "");
    setUnit(plan?.plannedDose?.unit ?? "");
    setInstructions(plan?.instructions ?? "");
    setError("");
    setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode !== "none" && Boolean(amount.trim()) !== Boolean(unit.trim()))
        throw new Error(
          "Enter both planned amount and unit, or leave both blank.",
        );
      const now = new Date().toISOString();
      const plan: MedicationSchedule | null =
        mode === "none" && !originalPlan
          ? null
          : {
              ...(originalPlan ?? {
                id: crypto.randomUUID(),
                profileId,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                revision: 1,
                label: null,
                extensions: {},
              }),
              eventType: { id: draft.id, revision: draft.revision },
              effectiveFrom: now,
              effectiveUntil: null,
              timeZone: zone,
              rule:
                mode === "none"
                  ? originalPlan!.rule
                  : mode === "as-needed"
                    ? { kind: "as-needed" }
                    : {
                        kind: "scheduled",
                        weekdays,
                        times: [...new Set(times)].sort(),
                      },
              plannedDose:
                mode !== "none" && amount
                  ? { amount: Number(amount), unit: unit.trim() }
                  : null,
              instructions: instructions.trim() || null,
              archived: mode === "none",
            };
      await saveMedication(
        draft,
        plan,
        typeRevision,
        originalPlan?.revision ?? null,
      );
      setDraft(null);
      setMessage(
        "Saved. Plans describe your intentions; only your logged entries record what happened.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save this medication.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        draft
          ? typeRevision
            ? "Your medication plan"
            : "Add a medication"
          : "Medications"
      }
      onClose={onClose}
    >
      {!draft ? (
        <>
          <p className="muted dialog-intro">
            A place to remember what you took, and when. No alarms or
            missed-dose scores.
          </p>
          <button className="primary" onClick={() => edit()}>
            <Plus size={17} /> Add medication
          </button>
          {!medications.length && (
            <p className="empty-small">
              Start with a name. A plan is optional.
            </p>
          )}
          {medications.map((type) => {
            const active = currentPlans(
              plans.filter((p) => p.eventType.id === type.id),
            );
            const taken = observations
              .filter(
                (o) =>
                  o.eventType.id === type.id &&
                  o.medication?.action === "taken" &&
                  !o.deletedAt,
              )
              .sort((a, b) => startMs(b) - startMs(a))[0];
            return (
              <section className="medication-row" key={type.id}>
                <h3>
                  <Pill size={18} /> {type.displayName}
                </h3>
                {active.length ? (
                  active.map((p) => (
                    <div className="plan-summary" key={`${p.id}:${p.revision}`}>
                      <p>{planSummary(p)}</p>
                      {p.plannedDose && (
                        <p>
                          Planned: {p.plannedDose.amount} {p.plannedDose.unit}
                        </p>
                      )}
                      {p.instructions && <p>{p.instructions}</p>}
                      <button
                        className="text-button"
                        onClick={() => edit(type, p)}
                      >
                        Edit this plan
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No plan configured</p>
                )}
                <p className="fine-print">
                  {taken ? (
                    <>
                      Latest taken entry:{" "}
                      {taken.startedAt.precision === "approximate"
                        ? "approximately "
                        : ""}
                      {formatTime(taken.startedAt)}
                      {taken.medication?.dose
                        ? ` · ${taken.medication.dose.amount} ${taken.medication.dose.unit}`
                        : " · dose not recorded"}
                    </>
                  ) : (
                    "No taken entry recorded yet."
                  )}
                </p>
                <div className="row-actions">
                  <button className="primary" onClick={() => onLog(type.id)}>
                    Log medication
                  </button>
                  <button className="text-button" onClick={() => edit(type)}>
                    {active.length
                      ? "Add another plan / edit name"
                      : "Add plan / edit name"}
                  </button>
                </div>
                {plans.some((p) => p.eventType.id === type.id) && (
                  <details className="plan-history">
                    <summary>Plan history</summary>
                    {plans
                      .filter((p) => p.eventType.id === type.id)
                      .sort(
                        (a, b) =>
                          Date.parse(b.effectiveFrom) -
                          Date.parse(a.effectiveFrom),
                      )
                      .map((p) => (
                        <p key={`${p.id}:${p.revision}`}>
                          {new Date(p.effectiveFrom).toLocaleString()} ·{" "}
                          {p.archived ? "Plan stopped" : planSummary(p)}
                          {p.plannedDose
                            ? ` · planned ${p.plannedDose.amount} ${p.plannedDose.unit}`
                            : ""}
                        </p>
                      ))}
                  </details>
                )}
              </section>
            );
          })}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
        </>
      ) : (
        <form onSubmit={save}>
          <button
            type="button"
            className="text-button"
            onClick={() => setDraft(null)}
          >
            <ArrowLeft size={15} /> Back to medications
          </button>
          <div className="editor-basics">
            <label>
              Medication name
              <input
                required
                maxLength={100}
                value={draft.displayName}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Formal / export name <span className="optional">optional</span>
              <input
                maxLength={150}
                value={draft.exportName ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, exportName: e.target.value || null })
                }
              />
            </label>
            <label>
              Plan
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="none">
                  {originalPlan ? "Stop this plan" : "No plan configured"}
                </option>
                <option value="as-needed">As needed / PRN</option>
                <option value="scheduled">Scheduled days and times</option>
              </select>
            </label>
            {mode === "as-needed" && (
              <p className="fine-print">
                No doses will be expected at any particular time.
              </p>
            )}
            {mode === "scheduled" && (
              <>
                <fieldset className="weekday-picker">
                  <legend>Days</legend>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d, i) => (
                      <label key={d}>
                        <input
                          type="checkbox"
                          checked={weekdays.includes(i + 1)}
                          onChange={(e) =>
                            setWeekdays(
                              e.target.checked
                                ? [...weekdays, i + 1]
                                : weekdays.filter((x) => x !== i + 1),
                            )
                          }
                        />
                        {d}
                      </label>
                    ),
                  )}
                </fieldset>
                <div>
                  {times.map((t, i) => (
                    <div className="choice-row" key={i}>
                      <label>
                        Planned time {i + 1}
                        <input
                          type="time"
                          required
                          value={t}
                          onChange={(e) =>
                            setTimes(
                              times.map((x, j) =>
                                i === j ? e.target.value : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {times.length > 1 && (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Remove time ${i + 1}`}
                          onClick={() =>
                            setTimes(times.filter((_, j) => j !== i))
                          }
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setTimes([...times, ""])}
                  >
                    <Plus size={15} /> Add time
                  </button>
                </div>
                <label>
                  Plan time zone
                  <input
                    required
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    placeholder="America/New_York"
                  />
                </label>
                <p className="fine-print">
                  These clock times stay in this time zone when you travel. This
                  is a written plan, not an alarm or a dose recommendation.
                </p>
              </>
            )}
            {mode !== "none" && (
              <>
                <div className="two-fields">
                  <label>
                    Planned amount <span className="optional">optional</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Planned unit <span className="optional">optional</span>
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g. mg, mL, tablet"
                    />
                  </label>
                </div>
                <label>
                  Plan notes <span className="optional">optional</span>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={2}
                  />
                </label>
              </>
            )}
          </div>
          {originalPlan && (
            <p className="fine-print">
              Changes take effect when you save. Previous plan versions and
              logged doses are preserved.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy}>
            <Check size={17} />
            {busy ? "Saving…" : "Save medication"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
