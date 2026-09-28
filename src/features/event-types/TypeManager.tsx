import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { EventType } from "../../domain/types";
import { saveEventType } from "../../storage/repositories";
import { Dialog } from "../../components/Dialog";

type Field = EventType["fields"][number];
function newField(kind: Field["kind"]): Field {
  const base = {
    id: crypto.randomUUID(),
    label: "",
    exportLabel: null,
    helpText: null,
  };
  switch (kind) {
    case "text":
      return { ...base, kind, multiline: false };
    case "number":
      return {
        ...base,
        kind,
        unit: null,
        minimum: null,
        maximum: null,
        step: null,
      };
    case "severity":
      return {
        ...base,
        label: "Severity",
        kind,
        minimum: 1,
        maximum: 10,
        step: 1,
        lowLabel: null,
        highLabel: null,
      };
    case "boolean":
      return { ...base, kind, trueLabel: "Yes", falseLabel: "No" };
    case "choice":
      return {
        ...base,
        kind,
        multiple: false,
        options: [{ id: crypto.randomUUID(), label: "", exportLabel: null }],
      };
  }
}
export function TypeManager({
  profileId,
  types,
  onClose,
  onSaved,
}: {
  profileId: string;
  types: EventType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<EventType | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  function create() {
    const now = new Date().toISOString();
    setError("");
    setMessage("");
    setRevision(null);
    setDraft({
      id: crypto.randomUUID(),
      profileId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
      category: "custom",
      displayName: "",
      exportName: null,
      description: null,
      icon: "sparkles",
      color: "#583b53",
      fields: [],
      quickLogFieldIds: [],
      archived: false,
      extensions: {},
    });
  }
  function updateField(index: number, field: Field) {
    if (draft)
      setDraft({
        ...draft,
        fields: draft.fields.map((f, i) => (i === index ? field : f)),
      });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setError("");
    setBusy(true);
    try {
      for (const f of draft.fields) {
        if (!f.label.trim())
          throw new Error("Give each field a name, or remove it.");
        if (f.kind === "choice") {
          const labels = f.options.map((o) => o.label.trim().toLowerCase());
          if (
            !labels.length ||
            labels.some((x) => !x) ||
            new Set(labels).size !== labels.length
          )
            throw new Error("Each choice needs a different, nonempty name.");
        }
      }
      await saveEventType(
        { ...draft, quickLogFieldIds: draft.fields.map((f) => f.id) },
        revision,
      );
      setDraft(null);
      setMessage(
        "Saved. Future entries will use your changes; earlier entries stay as they were.",
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this type.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        draft
          ? revision
            ? "Shape this observation"
            : "Something of your own"
          : "Make it yours"
      }
      onClose={onClose}
    >
      {!draft ? (
        <>
          <p className="muted dialog-intro">
            Your words, your details. Choose what belongs in your journal.
          </p>
          <button className="primary full-width" onClick={create}>
            <Plus size={17} /> Create observation type
          </button>
          <div className="type-list">
            {types
              .filter((t) => t.category !== "medication")
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setDraft(structuredClone(t));
                    setRevision(t.revision);
                    setError("");
                    setMessage("");
                  }}
                >
                  <span>
                    <strong>{t.displayName}</strong>
                    <small>
                      {t.fields.length
                        ? `${t.fields.length} optional field${t.fields.length === 1 ? "" : "s"}`
                        : "Just a name and a moment"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
        </>
      ) : (
        <form onSubmit={save}>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            <ArrowLeft size={15} /> Back to your types
          </button>
          <div className="editor-basics">
            <label>
              Name
              <input
                required
                maxLength={100}
                value={draft.displayName}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
                placeholder="e.g. Head pressure or Brain goblin"
              />
            </label>
            <label>
              Formal / export name <span className="optional">optional</span>
              <input
                value={draft.exportName || ""}
                maxLength={150}
                onChange={(e) =>
                  setDraft({ ...draft, exportName: e.target.value || null })
                }
                placeholder="A name you’d use at an appointment"
              />
            </label>
            <div className="two-fields">
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as EventType["category"],
                    })
                  }
                >
                  {[
                    "symptom",
                    "custom",
                    "note",
                    "vital",
                    "food-drink",
                    "sleep",
                    "exposure",
                    "intervention",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c.replace("-", " / ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Icon
                <select
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                >
                  <option value="sparkles">Sparkle</option>
                  <option value="activity">Wave</option>
                  <option value="sun">Sun</option>
                  <option value="notebook">Notebook</option>
                </select>
              </label>
            </div>
          </div>
          <div className="section-title">
            <h3>Optional details</h3>
            <span>None are required when logging.</span>
          </div>
          {draft.fields.map((field, index) => (
            <fieldset className="field-editor" key={field.id}>
              <legend>Field {index + 1}</legend>
              <div className="field-heading">
                <label>
                  Field name
                  <input
                    required
                    value={field.label}
                    maxLength={100}
                    onChange={(e) =>
                      updateField(index, { ...field, label: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove field ${index + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <label>
                Field format
                <select
                  value={field.kind}
                  onChange={(e) =>
                    updateField(index, {
                      ...newField(e.target.value as Field["kind"]),
                      label: field.label,
                    })
                  }
                >
                  <option value="text">Text</option>
                  <option value="number">Number with optional unit</option>
                  <option value="severity">Severity scale</option>
                  <option value="choice">Choices</option>
                  <option value="boolean">Yes / no</option>
                </select>
              </label>
              {field.kind === "text" && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={field.multiline}
                    onChange={(e) =>
                      updateField(index, {
                        ...field,
                        multiline: e.target.checked,
                      })
                    }
                  />{" "}
                  Allow longer notes
                </label>
              )}
              {field.kind === "number" && (
                <label>
                  Unit <span className="optional">optional</span>
                  <input
                    value={field.unit || ""}
                    onChange={(e) =>
                      updateField(index, {
                        ...field,
                        unit: e.target.value || null,
                      })
                    }
                    placeholder="e.g. bpm, °C, hours"
                  />
                </label>
              )}
              {(field.kind === "number" || field.kind === "severity") && (
                <div className="two-fields">
                  <label>
                    Minimum{" "}
                    {field.kind === "number" && (
                      <span className="optional">optional</span>
                    )}
                    <input
                      type="number"
                      step="any"
                      required={field.kind === "severity"}
                      value={field.minimum ?? ""}
                      onChange={(e) =>
                        updateField(index, {
                          ...field,
                          minimum:
                            e.target.value === "" && field.kind === "number"
                              ? null
                              : Number(e.target.value),
                        } as Field)
                      }
                    />
                  </label>
                  <label>
                    Maximum{" "}
                    {field.kind === "number" && (
                      <span className="optional">optional</span>
                    )}
                    <input
                      type="number"
                      step="any"
                      required={field.kind === "severity"}
                      value={field.maximum ?? ""}
                      onChange={(e) =>
                        updateField(index, {
                          ...field,
                          maximum:
                            e.target.value === "" && field.kind === "number"
                              ? null
                              : Number(e.target.value),
                        } as Field)
                      }
                    />
                  </label>
                </div>
              )}
              {field.kind === "severity" && (
                <div className="two-fields">
                  <label>
                    Low-end label <span className="optional">optional</span>
                    <input
                      value={field.lowLabel || ""}
                      onChange={(e) =>
                        updateField(index, {
                          ...field,
                          lowLabel: e.target.value || null,
                        })
                      }
                      placeholder="e.g. Mild"
                    />
                  </label>
                  <label>
                    High-end label <span className="optional">optional</span>
                    <input
                      value={field.highLabel || ""}
                      onChange={(e) =>
                        updateField(index, {
                          ...field,
                          highLabel: e.target.value || null,
                        })
                      }
                      placeholder="e.g. Severe"
                    />
                  </label>
                </div>
              )}
              {field.kind === "choice" && (
                <div className="choice-editor">
                  {field.options.map((o, i) => (
                    <div className="choice-row" key={o.id}>
                      <label>
                        Choice {i + 1}
                        <input
                          required
                          value={o.label}
                          onChange={(e) =>
                            updateField(index, {
                              ...field,
                              options: field.options.map((x) =>
                                x.id === o.id
                                  ? { ...x, label: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove choice ${i + 1}`}
                        onClick={() =>
                          updateField(index, {
                            ...field,
                            options: field.options.filter((x) => x.id !== o.id),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      updateField(index, {
                        ...field,
                        options: [
                          ...field.options,
                          {
                            id: crypto.randomUUID(),
                            label: "",
                            exportLabel: null,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} /> Add choice
                  </button>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={field.multiple}
                      onChange={(e) =>
                        updateField(index, {
                          ...field,
                          multiple: e.target.checked,
                        })
                      }
                    />{" "}
                    Allow more than one choice
                  </label>
                </div>
              )}
            </fieldset>
          ))}
          <button
            className="secondary full-width"
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                fields: [...draft.fields, newField("text")],
              })
            }
          >
            <Plus size={17} /> Add optional field
          </button>
          {revision && (
            <p className="fine-print">
              Changes apply to future entries. Past entries keep their original
              labels, fields, and scales.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy} type="submit">
            <Check size={17} />
            {busy ? "Saving…" : "Save observation type"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
