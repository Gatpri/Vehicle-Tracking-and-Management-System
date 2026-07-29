import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface Vehicle {
  _id: string;
  plateNumber: string;
  make: string;
  model: string;
  year?: number;
  color?: string;
  vehicleType: string;
  status: "active" | "stolen" | "inactive";
}

function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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
          <Link to={`/tracking/${vehicle._id}`} className="uh-btn uh-btn-primary">Track Vehicle</Link>
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
    </div>
  );
}

export default VehicleDetailPage;
