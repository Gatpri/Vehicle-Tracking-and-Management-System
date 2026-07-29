import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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

const statusBadge = (status: string) => {
  if (status === "stolen") return "uh-badge uh-badge-red";
  if (status === "inactive") return "uh-badge uh-badge-slate";
  return "uh-badge uh-badge-green";
};

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
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/vehicles", {
        plateNumber,
        make,
        model,
        year: year ? Number(year) : undefined,
        color,
        vehicleType,
      });
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
              <div className="ap-item-meta">
                <span>{v.make} {v.model} {v.year ? `(${v.year})` : ""}</span>
                <span>{v.color} · {v.vehicleType}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default VehiclesPage;
