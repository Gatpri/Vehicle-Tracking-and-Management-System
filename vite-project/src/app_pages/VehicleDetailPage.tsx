import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import {
  PhotoSlots,
  byAngle,
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
  plateImageUrl: string;
  /**
   * Photos held per angle. The flat images[]/plateImageUrl fields are kept in
   * step by the backend, so CCTV matching and the SOS evidence panel continue
   * to read them unchanged.
   */
  plateImages?: { url: string; angle: PlateAngle }[];
  vehicleImages?: { url: string; angle: VehicleAngle }[];
}

function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Keyed "kind:angle" so only the slot being replaced shows a spinner.
  const [uploading, setUploading] = useState<string | null>(null);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");

  const load = async () => {
    try {
      const res = await api.get(`/vehicles/${id}`);
      setVehicle(res.data.vehicle);
      setMake(res.data.vehicle.make);
      setModel(res.data.vehicle.model);
      setColor(res.data.vehicle.color || "");
    } catch {
      toast.error("Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch(`/vehicles/${id}`, { make, model, color });
      setVehicle(res.data.vehicle);
      setEditing(false);
      toast.success("Vehicle updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update vehicle"));
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File, kind: "vehicle" | "plate", angle: string) => {
    setUploading(`${kind}:${angle}`);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("kind", kind);
      // The angle makes this a slot rather than an append: re-uploading the
      // front plate replaces the front plate instead of leaving two.
      formData.append("angle", angle);
      const res = await api.post(`/vehicles/${id}/photos`, formData);
      setVehicle(res.data.vehicle);
      toast.success("Photo saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to upload photo"));
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = async (url: string, kind: "vehicle" | "plate") => {
    try {
      const res = await api.delete(`/vehicles/${id}/photos`, { data: { url, kind } });
      setVehicle(res.data.vehicle);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove photo"));
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this vehicle? This cannot be undone.")) return;
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success("Vehicle deleted");
      navigate("/vehicles");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete vehicle"));
    }
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;
  if (!vehicle) return <div className="uh-page"><p>Vehicle not found.</p></div>;

  return (
    <div className="uh-page">
      <Link to="/vehicles" className="ap-back-link">← Back to Vehicles</Link>

      <div className="ap-detail-header">
        <div>
          <h1>{vehicle.plateNumber}</h1>
          <p>{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""} · {vehicle.color} · {vehicle.vehicleType}</p>
        </div>
        <div className="ap-detail-actions">
          <Link to={`/vehicles/${vehicle._id}/history`} className="uh-btn uh-btn-ghost">Service History</Link>
          <Link to={`/workshops?vehicleId=${vehicle._id}`} className="uh-btn uh-btn-orange">Book Service</Link>
        </div>
      </div>

      <div className="uh-card">
        {editing ? (
          <form onSubmit={handleSave}>
            <div className="uh-form-row">
              <div className="uh-field">
                <label htmlFor="make">Make</label>
                <input id="make" value={make} onChange={(e) => setMake(e.target.value)} required />
              </div>
              <div className="uh-field">
                <label htmlFor="model">Model</label>
                <input id="model" value={model} onChange={(e) => setModel(e.target.value)} required />
              </div>
              <div className="uh-field">
                <label htmlFor="color">Color</label>
                <input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="uh-btn uh-btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button className="uh-btn uh-btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="uh-btn uh-btn-ghost" onClick={() => setEditing(true)}>Edit Details</button>
            <button className="uh-btn uh-btn-danger" onClick={handleDelete}>Delete Vehicle</button>
          </div>
        )}
      </div>

      {/* Theft evidence. Uploaded ahead of time on purpose: the moment a camera
          spots this plate, the owner is shown their own photo next to the
          camera frame, and an SOS carries both to admins. Adding them after
          the vehicle is gone is too late to be useful. */}
      <div className="ap-section-title" style={{ marginTop: 28 }}>Photos</div>
      <p className="ap-photo-hint">
        Used as evidence if a camera detects this plate — you'll see your own photo beside the camera frame,
        and admins receive both with any SOS you raise.
      </p>

      <div className="ap-photo-cols">
        <PhotoSlots
          title="Number plate photos"
          hint="Front and back. This is what a camera's plate read is compared against."
          angles={PLATE_ANGLES}
          photos={byAngle(vehicle.plateImages)}
          kind="plate"
          uploading={uploading}
          onUpload={uploadPhoto}
          onRemove={(_angle, url) => url && removePhoto(url, "plate")}
        />

        <PhotoSlots
          title="Vehicle photos"
          hint="All four sides, so the vehicle can be identified from any angle."
          angles={VEHICLE_ANGLES}
          photos={byAngle(vehicle.vehicleImages)}
          kind="vehicle"
          uploading={uploading}
          onUpload={uploadPhoto}
          onRemove={(_angle, url) => url && removePhoto(url, "vehicle")}
        />
      </div>

    </div>
  );
}

export default VehicleDetailPage;
