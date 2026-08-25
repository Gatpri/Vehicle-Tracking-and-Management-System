/**
 * Angle-slotted vehicle photo capture, shared by the vehicle list (where a
 * vehicle is registered) and the vehicle detail page.
 *
 * A plate has a front and a back; a vehicle has four sides. Both are fixed
 * sets, not open-ended galleries, so this renders one tile per angle. That
 * means re-uploading an angle replaces it rather than leaving duplicates, and
 * a half-finished set shows at a glance which side is still missing.
 */

export type PlateAngle = "front" | "back";
export type VehicleAngle = "front" | "back" | "left" | "right";

/** A plate has two faces; a vehicle has four sides. Both are fixed sets. */
export const PLATE_ANGLES: { key: PlateAngle; label: string }[] = [
  { key: "front", label: "Front plate" },
  { key: "back", label: "Back plate" },
];

export const VEHICLE_ANGLES: { key: VehicleAngle; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
];

/** Turns the stored [{url, angle}] list into the {angle: url} the grid wants. */
export function byAngle<T extends string>(list?: { url: string; angle: T }[]): Partial<Record<T, string>> {
  return Object.fromEntries((list ?? []).map((p) => [p.angle, p.url])) as Partial<Record<T, string>>;
}

/**
 * One tile per angle rather than an open-ended gallery.
 *
 * A plate is front and back; a vehicle is four sides. Rendering the empty
 * slots too is the point: a half-finished set shows at a glance which angle is
 * still missing, which a "no photos yet" placeholder cannot.
 */
export function PhotoSlots<T extends string>({
  title,
  hint,
  angles,
  photos,
  kind,
  uploading,
  onUpload,
  onRemove,
}: {
  title: string;
  hint: string;
  angles: { key: T; label: string }[];
  photos: Partial<Record<T, string>>;
  kind: "plate" | "vehicle";
  uploading: string | null;
  onUpload: (file: File, kind: "vehicle" | "plate", angle: string) => void;
  /** Called with the slot that was cleared, plus its url when there is one. */
  onRemove: (angle: T, url: string | undefined, kind: "vehicle" | "plate") => void;
}) {
  const filled = angles.filter((a) => photos[a.key]).length;

  return (
    <section>
      <div className="ap-photo-slot-head">
        <h4 className="ap-photo-head">{title}</h4>
        <span className="ap-photo-count">{filled}/{angles.length}</span>
      </div>
      <p className="ap-photo-hint">{hint}</p>

      <div className="ap-photo-slots">
        {angles.map((a) => {
          const url = photos[a.key];
          const busy = uploading === `${kind}:${a.key}`;
          return (
            <div className="ap-photo-slot" key={a.key}>
              {/* The label is the whole tile, so clicking anywhere on an empty
                  slot opens the file picker. */}
              <label className={`ap-photo-drop${url ? " is-filled" : ""}`}>
                {url ? <img src={url} alt={a.label} /> : <span className="ap-photo-plus">+</span>}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file, kind, a.key);
                    // Cleared so re-picking the same file fires onChange again.
                    e.target.value = "";
                  }}
                />
                {busy ? <span className="ap-photo-busy">Uploading...</span> : null}
              </label>
              <div className="ap-photo-slot-foot">
                <span className="ap-photo-slot-label">{a.label}</span>
                {url ? (
                  <button type="button" className="ap-photo-clear" onClick={() => onRemove(a.key, url, kind)}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
