import { useRef, useState, type PointerEvent } from "react";
import { Dialog } from "../../components/Dialog";
import {
  type Attachment,
  type PhotoAsset,
  type PhotoMark,
} from "../../domain/photos";
import { loadPhoto } from "./load-photo";

export function Marks({ marks }: { marks: PhotoMark[] }) {
  return (
    <>
      {marks.map((m, i) => {
        const a = m.points[0],
          b = m.points[m.points.length - 1],
          props = {
            stroke: m.color,
            strokeWidth: 4,
            fill: "none",
            vectorEffect: "non-scaling-stroke" as const,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
          };
        if (m.tool === "circle")
          return (
            <ellipse
              key={i}
              cx={(a.x + b.x) * 500}
              cy={(a.y + b.y) * 500}
              rx={Math.abs(a.x - b.x) * 500}
              ry={Math.abs(a.y - b.y) * 500}
              {...props}
            />
          );
        const path = m.points
          .map((p, j) => `${j ? "L" : "M"} ${p.x * 1000} ${p.y * 1000}`)
          .join(" ");
        const angle = Math.atan2(b.y - a.y, b.x - a.x),
          size = 25;
        return (
          <g key={i}>
            <path d={path} {...props} />
            {m.tool === "arrow" && (
              <path
                d={`M ${b.x * 1000 - size * Math.cos(angle - 0.5)} ${b.y * 1000 - size * Math.sin(angle - 0.5)} L ${b.x * 1000} ${b.y * 1000} L ${b.x * 1000 - size * Math.cos(angle + 0.5)} ${b.y * 1000 - size * Math.sin(angle + 0.5)}`}
                {...props}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
function PhotoImage({
  asset,
  caption,
  marks,
  original = false,
}: {
  asset: PhotoAsset;
  caption: string;
  marks: PhotoMark[];
  original?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="photo-image">
      {failed ? (
        <p role="alert">
          This photo cannot be displayed in this browser. Its saved original is
          preserved in backups.
        </p>
      ) : (
        <>
          <img
            src={asset.dataUrl}
            alt={caption || "Attached personal photo"}
            draggable={false}
            onError={() => setFailed(true)}
          />
          {!original && (
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <Marks marks={marks} />
            </svg>
          )}
        </>
      )}
    </div>
  );
}
function Annotator({
  asset,
  photo,
  onChange,
  onDone,
}: {
  asset: PhotoAsset;
  photo: Attachment;
  onChange: (p: Attachment) => void;
  onDone: () => void;
}) {
  const [tool, setTool] = useState<PhotoMark["tool"]>("pen"),
    [color, setColor] = useState<PhotoMark["color"]>("#e64040");
  const [draft, setDraft] = useState<PhotoMark | null>(null),
    [showOriginal, setShowOriginal] = useState(false);
  const stroke = useRef<PhotoMark | null>(null),
    pointer = useRef<number | null>(null);
  function point(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (
      showOriginal ||
      photo.marks.length >= 100 ||
      pointer.current !== null ||
      e.button !== 0
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    const p = point(e);
    stroke.current = { tool, color, points: [p, p] };
    setDraft(stroke.current);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== e.pointerId || !stroke.current) return;
    const p = point(e),
      s = stroke.current;
    stroke.current = {
      ...s,
      points:
        s.tool === "pen" ? [...s.points.slice(0, 499), p] : [s.points[0], p],
    };
    setDraft(stroke.current);
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== e.pointerId || !stroke.current) return;
    move(e);
    onChange({ ...photo, marks: [...photo.marks, stroke.current!] });
    stroke.current = null;
    pointer.current = null;
    setDraft(null);
  }
  return (
    <div className="photo-annotator">
      <div className="photo-tools">
        <label>
          Drawing tool
          <select
            aria-label="Drawing tool"
            value={tool}
            onChange={(e) => setTool(e.target.value as typeof tool)}
          >
            <option value="pen">Freehand</option>
            <option value="arrow">Arrow</option>
            <option value="circle">Circle / oval</option>
          </select>
        </label>
        <label>
          Mark color
          <select
            aria-label="Mark color"
            value={color}
            onChange={(e) => setColor(e.target.value as typeof color)}
          >
            <option value="#e64040">Red</option>
            <option value="#ffdb4d">Yellow</option>
            <option value="#ffffff">White</option>
            <option value="#583b53">Plum</option>
          </select>
        </label>
      </div>
      <div className="photo-tools">
        <button
          type="button"
          className="secondary"
          disabled={!photo.marks.length}
          onClick={() =>
            onChange({ ...photo, marks: photo.marks.slice(0, -1) })
          }
        >
          Undo mark
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!photo.marks.length}
          onClick={() => onChange({ ...photo, marks: [] })}
        >
          Clear marks
        </button>
        <button
          type="button"
          className="text-button"
          aria-pressed={showOriginal}
          onClick={() => setShowOriginal(!showOriginal)}
        >
          {showOriginal ? "Show annotations" : "Show original"}
        </button>
      </div>
      <div className="annotation-stage">
        <PhotoImage asset={asset} caption={photo.caption} marks={[]} original />
        <svg
          className="drawing-surface"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          role="img"
          aria-label="Photo annotation drawing surface"
          style={{ touchAction: showOriginal ? "auto" : "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            stroke.current = null;
            pointer.current = null;
            setDraft(null);
          }}
        >
          {!showOriginal && (
            <Marks marks={[...photo.marks, ...(draft ? [draft] : [])]} />
          )}
        </svg>
      </div>
      <p className="fine-print">
        Draw with a mouse, pen, or finger. Marks are separate from the original.
        You can describe the same spot in the caption without drawing.{" "}
        {photo.marks.length}/100 marks.
      </p>
      <button type="button" className="secondary" onClick={onDone}>
        Done annotating
      </button>
    </div>
  );
}

export function PhotoFields({
  profileId,
  items,
  assets,
  onChange,
  onBusy,
}: {
  profileId: string;
  items: Attachment[];
  assets: PhotoAsset[];
  onChange: (items: Attachment[], assets: PhotoAsset[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function add(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      if (items.length + files.length > 6)
        throw new Error("You can attach up to six photos per observation.");
      const loaded: PhotoAsset[] = [];
      for (const f of files) loaded.push(await loadPhoto(f, profileId));
      onChange(
        [
          ...items,
          ...loaded.map((a) => ({ assetId: a.id, caption: "", marks: [] })),
        ],
        [...assets, ...loaded],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add photo.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <fieldset className="photo-fields">
      <legend>
        Photos <span className="optional">optional</span>
      </legend>
      <p className="fine-print">
        Saved in this browser on your device. Breadcrumb does not upload or
        analyze photos or provide diagnoses. Keep backups; clearing browser data
        can remove them.
      </p>
      <label>
        Add photos
        <input
          aria-label="Add photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || editing !== null || items.length >= 6}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void add(files);
          }}
        />
      </label>
      <p className="fine-print">
        JPEG, PNG, or WebP · up to 8 MB each · six per entry. Originals may
        contain camera metadata, including location. Photo time is not inferred;
        use the observation’s time fields.
      </p>
      {busy && <p role="status">Opening photos…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.map((p, i) => {
        const asset = assets.find((a) => a.id === p.assetId);
        if (!asset) return null;
        return (
          <section className="photo-draft" key={p.assetId}>
            <h4>Photo {i + 1}</h4>
            <label>
              Caption for photo {i + 1}
              <textarea
                maxLength={1000}
                rows={2}
                value={p.caption}
                disabled={busy}
                onChange={(e) =>
                  onChange(
                    items.map((x) =>
                      x.assetId === p.assetId
                        ? { ...x, caption: e.target.value }
                        : x,
                    ),
                    assets,
                  )
                }
              />
            </label>
            {editing === p.assetId ? (
              <Annotator
                asset={asset}
                photo={p}
                onChange={(updated) =>
                  onChange(
                    items.map((x) => (x.assetId === p.assetId ? updated : x)),
                    assets,
                  )
                }
                onDone={() => setEditing(null)}
              />
            ) : (
              <>
                <PhotoImage asset={asset} caption={p.caption} marks={p.marks} />
                <div className="photo-tools">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setEditing(p.assetId)}
                  >
                    Annotate photo {i + 1}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      onChange(
                        items.filter((x) => x.assetId !== p.assetId),
                        assets,
                      )
                    }
                  >
                    Remove photo {i + 1}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
      {!!items.length && (
        <p className="fine-print">
          Photos and marks save when you save the entry. Removing a previously
          saved photo does not erase it: it remains in edit history and backups.
        </p>
      )}
    </fieldset>
  );
}
export function PhotoGallery({
  items,
  assets,
}: {
  items: Attachment[];
  assets: PhotoAsset[];
}) {
  const [selected, setSelected] = useState<Attachment | null>(null),
    [zoom, setZoom] = useState(100),
    [original, setOriginal] = useState(false);
  const asset = selected
    ? assets.find((a) => a.id === selected.assetId)
    : undefined;
  return (
    <>
      {items.length > 0 && (
        <div className="photo-gallery">
          {items.map((p, i) => {
            const a = assets.find((a) => a.id === p.assetId);
            return (
              a && (
                <button
                  type="button"
                  className="photo-thumb"
                  key={p.assetId}
                  aria-label={`Open photo ${i + 1}${p.caption ? `: ${p.caption}` : ""}`}
                  onClick={() => {
                    setSelected(p);
                    setZoom(100);
                    setOriginal(false);
                  }}
                >
                  <PhotoImage asset={a} caption={p.caption} marks={p.marks} />
                  <span>{p.caption || `Photo ${i + 1}`}</span>
                </button>
              )
            );
          })}
        </div>
      )}
      {selected && asset && (
        <Dialog title="Photo" onClose={() => setSelected(null)}>
          <p className="history-note">
            {selected.caption || "No caption recorded."}
          </p>
          <p className="fine-print">
            Attached {new Date(asset.createdAt).toLocaleString()}. This is not
            the photo’s capture date. {selected.marks.length} annotations.
          </p>
          <div className="photo-tools">
            <label>
              Zoom{" "}
              <input
                aria-label="Photo zoom"
                type="range"
                min={100}
                max={300}
                step={25}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              {zoom}%
            </label>
            <button
              className="secondary"
              aria-pressed={original}
              onClick={() => setOriginal(!original)}
            >
              {original ? "Show annotations" : "Show original"}
            </button>
          </div>
          <div className="photo-zoom">
            <div style={{ width: `${zoom}%` }}>
              <PhotoImage
                asset={asset}
                caption={selected.caption}
                marks={selected.marks}
                original={original}
              />
            </div>
          </div>
          <p className="fine-print">
            Annotations are your notes, not a diagnosis. The original image is
            unchanged.
          </p>
        </Dialog>
      )}
    </>
  );
}
