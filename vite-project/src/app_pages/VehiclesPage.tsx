import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import {
  PhotoSlots,
  PLATE_ANGLES,
  VEHICLE_ANGLES,
  type PlateAngle,
  type VehicleAngle,
} from "../components/VehiclePhotoSlots";

interface Vehicle {
  _id: string;
  plateNumber: string;
  make: string;
  model: string;
  year?: number;
  color?: string;
  vehicleType: string;
  status: "active" | "stolen" | "inactive";
  images: string[];
}

const statusBadge = (status: string) => {
  if (status === "stolen") return "uh-badge uh-badge-red";
  if (status === "inactive") return "uh-badge uh-badge-slate";
  return "uh-badge uh-badge-green";
};

/**
 * Object URLs for a set of picked files, revoked when they are replaced.
 *
 * Without the revoke every re-pick leaks the previous blob for the life of the
 * tab; without the memo a new url is minted on every render, which also makes
 * the <img> flicker as it reloads.
 */
function useObjectUrls<T extends string>(files: Partial<Record<T, File>>): Partial<Record<T, string>> {
  const urls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(files)
          .filter(([, f]) => !!f)
          .map(([k, f]) => [k, URL.createObjectURL(f as File)])
      ) as Partial<Record<T, string>>,
    [files]
  );

  // Revoke the previous batch once the next render has replaced them, and the
  // final batch on unmount. Doing it in the memo instead would revoke urls the
  // committed DOM is still displaying.
  useEffect(() => {
    return () => {
      for (const url of Object.values(urls)) {
        if (typeof url === "string") URL.revokeObjectURL(url);
      }
    };
  }, [urls]);

  return urls;
}

function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [vehicleType, setVehicleType] = useState("car");

  // Held until the vehicle exists: the upload endpoint is
  // /vehicles/:id/photos, and there is no id before the POST succeeds. Object
  // URLs give the slots a preview without reading the file twice.
  const [plates, setPlates] = useState<Partial<Record<PlateAngle, File>>>({});
  const [shots, setShots] = useState<Partial<Record<VehicleAngle, File>>>({});
  const [progress, setProgress] = useState<string | null>(null);

  // Memoised, and revoked on change: createObjectURL leaks until revoked, and
  // calling it inline in render would mint a fresh url on every keystroke.
  const platePreviews = useObjectUrls(plates);
  const shotPreviews = useObjectUrls(shots);

  const load = async () => {
    try {
      const res = await api.get("/vehicles/mine");
      setVehicles(res.data.vehicles);
    } catch {
      toast.error("Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();
  }, []);

  const resetForm = () => {
    setPlateNumber("");
    setMake("");
    setModel("");
    setYear("");
    setColor("");
    setVehicleType("car");
    setPlates({});
    setShots({});
    setProgress(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/vehicles", {
        plateNumber,
        make,
        model,
        year: year ? Number(year) : undefined,
        color,
        vehicleType,
      });

      const id: string | undefined = res.data?.vehicle?._id;
      const queued = [
        ...Object.entries(plates).map(([angle, f]) => ["plate", angle, f] as const),
        ...Object.entries(shots).map(([angle, f]) => ["vehicle", angle, f] as const),
      ].filter(([, , f]) => !!f);

      if (id && queued.length) {
        // Sequential rather than Promise.all: six multipart bodies at once is
        // how uploads time out, and the count gives something honest to watch.
        for (let i = 0; i < queued.length; i++) {
          const [kind, angle, file] = queued[i];
          setProgress(`Uploading photo ${i + 1} of ${queued.length}...`);
          const body = new FormData();
          body.append("image", file as File);
          body.append("kind", kind);
          body.append("angle", angle);
          try {
            await api.post(`/vehicles/${id}/photos`, body);
          } catch {
            // A failed photo must not discard the registered vehicle — it can
            // be added again from the vehicle's own page.
          }
        }
      }

      toast.success("Vehicle registered");
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to register vehicle"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>My Vehicles</h1>
        <button className="uh-btn uh-btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Register Vehicle"}
        </button>
      </div>

      {showForm && (
        <form className="uh-card" style={{ marginBottom: 24 }} onSubmit={handleSubmit}>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="plateNumber">Plate Number</label>
              <input id="plateNumber" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} required />
            </div>
            <div className="uh-field">
              <label htmlFor="make">Make</label>
              <input id="make" value={make} onChange={(e) => setMake(e.target.value)} required />
            </div>
            <div className="uh-field">
              <label htmlFor="model">Model</label>
              <input id="model" value={model} onChange={(e) => setModel(e.target.value)} required />
            </div>
          </div>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="year">Year</label>
              <input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="uh-field">
              <label htmlFor="color">Color</label>
              <input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="uh-field">
              <label htmlFor="vehicleType">Type</label>
              <select id="vehicleType" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="car">Car</option>
                <option value="bike">Bike</option>
                <option value="scooter">Scooter</option>
                <option value="truck">Truck</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          {/* Captured at registration rather than only afterwards: a plate shot
              is the reference a camera match is compared against, and this is
              the moment the owner has the photos to hand. */}
          <div className="ap-photo-cols" style={{ margin: "22px 0" }}>
            <PhotoSlots
              title="Number plate photos"
              hint="Front and back. This is what a camera's plate read is compared against."
              angles={PLATE_ANGLES}
              photos={platePreviews}
              kind="plate"
              uploading={null}
              onUpload={(file, _kind, angle) =>
                setPlates((p) => ({ ...p, [angle as PlateAngle]: file }))
              }
              onRemove={(angle) =>
                setPlates((p) => {
                  const next = { ...p };
                  delete next[angle];
                  return next;
                })
              }
            />

            <PhotoSlots
              title="Vehicle photos"
              hint="All four sides, so the vehicle can be identified from any angle."
              angles={VEHICLE_ANGLES}
              photos={shotPreviews}
              kind="vehicle"
              uploading={null}
              onUpload={(file, _kind, angle) =>
                setShots((p) => ({ ...p, [angle as VehicleAngle]: file }))
              }
              onRemove={(angle) =>
                setShots((p) => {
                  const next = { ...p };
                  delete next[angle];
                  return next;
                })
              }
            />
          </div>

          {progress ? <p className="ap-photo-hint">{progress}</p> : null}

          <button className="uh-btn uh-btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Registering..." : "Register"}
          </button>
        </form>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : vehicles.length === 0 ? (
        <div className="uh-empty">No vehicles yet — register one to get started.</div>
      ) : (
        <div className="ap-grid">
          {vehicles.map((v) => (
            <Link key={v._id} to={`/vehicles/${v._id}`} className="ap-item-card">
              <div className="ap-item-card-top">
                <h3>{v.plateNumber}</h3>
                <span className={statusBadge(v.status)}>{v.status}</span>
              </div>
              {v.images?.[0] && <img className="ap-item-thumb" src={v.images[0]} alt={v.plateNumber} />}
              <div className="ap-item-meta">
                <span>{v.make} {v.model} {v.year ? `(${v.year})` : ""}</span>
                <span>{v.color} · {v.vehicleType}</span>
                {!v.images?.[0] && <span className="ap-item-warn">No photo — add one for theft alerts</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default VehiclesPage;
