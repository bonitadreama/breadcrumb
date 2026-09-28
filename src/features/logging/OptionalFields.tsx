import type { EventType, Observation } from "../../domain/types";

export function OptionalFields({
  fields,
  values,
  onChange,
}: {
  fields: EventType["fields"];
  values: Observation["values"];
  onChange: (values: Observation["values"]) => void;
}) {
  function set(id: string, value?: Observation["values"][string]) {
    const next = { ...values };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  }
  return (
    <div className="optional-fields">
      <p className="fine-print">
        Add any details you want. It’s also okay to leave them all blank.
      </p>
      {fields.map((f) => {
        const v = values[f.id],
          inputId = `field-${f.id}`;
        return (
          <div className="optional-field" key={f.id}>
            <label htmlFor={inputId}>
              {f.label}
              {f.kind === "number" && f.unit ? ` (${f.unit})` : ""}
              <span className="optional">optional</span>
            </label>
            {f.helpText && <p className="fine-print">{f.helpText}</p>}
            {f.kind === "text" &&
              (f.multiline ? (
                <textarea
                  id={inputId}
                  rows={2}
                  value={v?.kind === "text" ? v.value : ""}
                  onChange={(e) =>
                    set(
                      f.id,
                      e.target.value === ""
                        ? undefined
                        : { kind: "text", value: e.target.value },
                    )
                  }
                />
              ) : (
                <input
                  id={inputId}
                  value={v?.kind === "text" ? v.value : ""}
                  onChange={(e) =>
                    set(
                      f.id,
                      e.target.value === ""
                        ? undefined
                        : { kind: "text", value: e.target.value },
                    )
                  }
                />
              ))}
            {(f.kind === "number" || f.kind === "severity") && (
              <>
                <input
                  type="number"
                  id={inputId}
                  min={f.minimum ?? undefined}
                  max={f.maximum ?? undefined}
                  step={f.step ?? "any"}
                  value={v?.kind === f.kind ? v.value : ""}
                  onChange={(e) =>
                    set(
                      f.id,
                      e.target.value === ""
                        ? undefined
                        : { kind: f.kind, value: Number(e.target.value) },
                    )
                  }
                  placeholder={
                    f.kind === "severity"
                      ? `${f.minimum}–${f.maximum}`
                      : "Not recorded"
                  }
                />
                {f.kind === "severity" && (
                  <p className="fine-print">
                    {f.minimum}
                    {f.lowLabel ? ` · ${f.lowLabel}` : ""} to {f.maximum}
                    {f.highLabel ? ` · ${f.highLabel}` : ""}
                  </p>
                )}
              </>
            )}
            {f.kind === "boolean" && (
              <select
                id={inputId}
                value={v?.kind === "boolean" ? String(v.value) : ""}
                onChange={(e) =>
                  set(
                    f.id,
                    e.target.value === ""
                      ? undefined
                      : { kind: "boolean", value: e.target.value === "true" },
                  )
                }
              >
                <option value="">Not recorded</option>
                <option value="true">{f.trueLabel}</option>
                <option value="false">{f.falseLabel}</option>
              </select>
            )}
            {f.kind === "choice" &&
              (f.multiple ? (
                <fieldset id={inputId} className="multi-choice">
                  <legend className="sr-only">{f.label}</legend>
                  {f.options.map((o) => (
                    <label className="check-label" key={o.id}>
                      <input
                        type="checkbox"
                        checked={
                          v?.kind === "choice" && v.optionIds.includes(o.id)
                        }
                        onChange={(e) => {
                          const ids = v?.kind === "choice" ? v.optionIds : [];
                          const next = e.target.checked
                            ? [...ids, o.id]
                            : ids.filter((id) => id !== o.id);
                          set(
                            f.id,
                            next.length
                              ? { kind: "choice", optionIds: next }
                              : undefined,
                          );
                        }}
                      />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <select
                  id={inputId}
                  value={v?.kind === "choice" ? v.optionIds[0] || "" : ""}
                  onChange={(e) =>
                    set(
                      f.id,
                      e.target.value === ""
                        ? undefined
                        : { kind: "choice", optionIds: [e.target.value] },
                    )
                  }
                >
                  <option value="">Not recorded</option>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ))}
          </div>
        );
      })}
    </div>
  );
}
