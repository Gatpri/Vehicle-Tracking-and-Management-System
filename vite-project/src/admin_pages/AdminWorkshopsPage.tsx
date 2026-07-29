import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import "./AdminPages.css";

interface Workshop {
  _id: string;
  name: string;
  address: string;
  status: string;
  servicesOffered: { serviceType: string; basePrice: number }[];
}

function parseServices(raw: string) {
  return raw
    .split(",")
    .map((tok) => tok.trim())
    .filter(Boolean)
    .map((tok) => {
      const [serviceType, price] = tok.split(":").map((s) => s.trim());
      return { serviceType, basePrice: Number(price) };
    })
    .filter((s) => s.serviceType && !Number.isNaN(s.basePrice));
}

function AdminWorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [servicesRaw, setServicesRaw] = useState("");

  const load = async () => {
    try {
      const res = await api.get("/workshops");
      setWorkshops(res.data.workshops);
    } catch {
      toast.error("Failed to load workshops");
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/workshops", {
        name,
        address,
        location: { lat: Number(lat), lng: Number(lng) },
        servicesOffered: parseServices(servicesRaw),
      });
      toast.success("Workshop created");
      setName(""); setAddress(""); setLat(""); setLng(""); setServicesRaw("");
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create workshop"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workshop?")) return;
    try {
      await api.delete(`/workshops/${id}`);
      toast.success("Workshop deleted");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete workshop"));
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <h2>Workshops</h2>
        <button className="add-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New Workshop"}
        </button>
      </div>

      {showForm && (
        <form className="add-form" onSubmit={handleSubmit} style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 500 }}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} required />
            <input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} required />
          </div>
          <input
            placeholder="Services e.g. oil_change:150000, tire_change:80000 (paisa)"
            value={servicesRaw}
            onChange={(e) => setServicesRaw(e.target.value)}
            style={{ width: "100%" }}
          />
          <button className="add-btn" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Workshop"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : workshops.length === 0 ? (
        <p className="adm-empty">No workshops.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Name</th><th>Address</th><th>Services</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {workshops.map((w) => (
              <tr key={w._id}>
                <td>{w.name}</td>
                <td>{w.address}</td>
                <td>{w.servicesOffered.map((s) => s.serviceType).join(", ")}</td>
                <td>{w.status}</td>
                <td><button className="delete-btn" onClick={() => handleDelete(w._id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminWorkshopsPage;
