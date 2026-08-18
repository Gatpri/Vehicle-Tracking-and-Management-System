import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../lib/workshopOptions";
import { isWorkshopAdmin } from "../lib/roles";
import { getCurrentUser } from "../lib/useAuth";
import MyWorkshopPanel from "./MyWorkshopPanel";
import WorkshopReviewsPanel from "./WorkshopReviewsPanel";
import ServicesTableEditor, { type ServiceRow } from "../components/ServicesTableEditor";
import ServicesTableView from "../components/ServicesTableView";
import LocationPicker, { type LatLng } from "../components/LocationPicker";
import WorkshopChangeRequestsPanel from "./WorkshopChangeRequestsPanel";
import "./AdminPages.css";

/** The assigned manager, or null when unassigned or not populated for this
 *  caller. managedBy arrives populated only for admin/superadmin — for anyone
 *  else it's a bare id string, which carries no name or email to show. */
const managerOf = (w: Workshop) =>
  w.managedBy && typeof w.managedBy === "object" ? w.managedBy : null;

interface Workshop {
  _id: string;
  name: string;
  address: string;
  area?: string;
  region?: string;
  status: string;
  servicesOffered: ServiceRow[];
  // Populated with the assigned manager for admin/superadmin (who may
  // reassign); a bare id, or null, for everyone else.
  managedBy: string | { _id: string; firstname: string; lastname: string; email: string; role: string } | null;
  rating: { average: number; count: number };
  sentiment: { score: number; positiveRatio: number; scoredCount: number };
}

function AdminWorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  // Which workshop's price list is expanded, and which is being edited.
  const [openServicesId, setOpenServicesId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<ServiceRow[]>([]);
  const [savingServices, setSavingServices] = useState(false);
  const currentUser = getCurrentUser();
  // Email of the account being assigned as manager, keyed by workshop id.
  const [managerEmail, setManagerEmail] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // Which workshop's reviews are expanded (admin view), and the workshop-admin's
  // own garage id once MyWorkshopPanel has resolved it.
  const [openReviewsId, setOpenReviewsId] = useState<string | null>(null);
  const [myWorkshopId, setMyWorkshopId] = useState<string | null>(null);

  // Admin/superadmin write straight through; a workshop-admin never reaches
  // this page's edit controls (their own garage is handled by MyWorkshopPanel,
  // which submits a change request instead).
  const saveServices = async (workshopId: string) => {
    setSavingServices(true);
    try {
      await api.patch(`/workshops/${workshopId}`, { servicesOffered: editRows });
      toast.success("Services updated");
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update services"));
    } finally {
      setSavingServices(false);
    }
  };

  // Assigning by email rather than picking from a user list: email is the
  // unique handle an admin actually has when a garage owner asks for access.
  const assignManager = async (workshopId: string) => {
    const email = (managerEmail[workshopId] ?? "").trim();
    if (!email) {
      toast.error("Enter the manager's account email");
      return;
    }
    setAssigningId(workshopId);
    try {
      const res = await api.patch(`/workshops/${workshopId}/manager`, { email });
      toast.success(`${res.data.manager.firstname} now manages this workshop (${res.data.manager.role})`);
      setManagerEmail((m) => ({ ...m, [workshopId]: "" }));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to assign manager"));
    } finally {
      setAssigningId(null);
    }
  };

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

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

  // lat/lng are strings here (they back plain text inputs and the submit
  // payload); the map picker works in numbers, so translate at the boundary.
  // A half-typed or empty field just means "no pin yet" rather than a NaN one.
  const pickedLocation: LatLng | null = (() => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    return Number.isFinite(latNum) && Number.isFinite(lngNum)
      ? { lat: latNum, lng: lngNum }
      : null;
  })();

  const applyPickedLocation = (next: LatLng) => {
    setLat(String(next.lat));
    setLng(String(next.lng));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/workshops", {
        name,
        address,
        area,
        location: { lat: Number(lat), lng: Number(lng) },
        servicesOffered: services,
        brandsSupported: brands,
        bikeTypes: types,
      });
      toast.success("Workshop created");
      setName(""); setAddress(""); setArea(""); setLat(""); setLng(""); setServices([]);
      setBrands([]); setTypes([]);
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

  // A workshop-admin has exactly one garage and no business seeing the
  // registry, so this page becomes their workshop editor instead.
  if (isWorkshopAdmin(currentUser?.role)) {
    return (
      <div className="adm-page">
        <div className="adm-page-head"><h2>My Workshop</h2></div>
        <MyWorkshopPanel onLoaded={setMyWorkshopId} />
        {myWorkshopId && (
          <>
            <div className="ap-section-title" style={{ marginTop: 28, marginBottom: 10 }}>
              Ratings &amp; Reviews
            </div>
            <WorkshopReviewsPanel workshopId={myWorkshopId} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <h2>Workshops</h2>
        <button className="add-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New Workshop"}
        </button>
      </div>

      {/* Sits above the registry so a waiting request is the first thing an
          admin sees, next to the table it affects. Renders nothing when the
          queue is empty. */}
      <WorkshopChangeRequestsPanel onApplied={load} />

      {showForm && (
        <form className="add-form" onSubmit={handleSubmit} style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 500 }}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <input
            placeholder="Area (e.g. Kathmandu) — used to match delivery-staff"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <LocationPicker
            value={pickedLocation}
            onChange={applyPickedLocation}
            onAddressResolved={(resolved) => {
              // Offer the looked-up address as a default only — never
              // overwrite one the admin has already typed.
              if (!address.trim()) setAddress(resolved);
            }}
            height={280}
          />
          {/* Kept alongside the map: the pin stays in sync with these, so exact
              coordinates can still be pasted when someone already has them. */}
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} required />
            <input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} required />
          </div>
          {/* A real table rather than the old "name:paisa, name:paisa" string:
              that format silently dropped anything it couldn't parse and hid
              the fact prices were in paisa. */}
          <div className="adm-ws-picker">
            <span className="adm-ws-picker-label">Services &amp; prices</span>
            <ServicesTableEditor rows={services} onChange={setServices} />
          </div>
          {/* Drives the customer-facing brand and type filters. Leaving these
              empty marks the workshop "unspecified", which keeps it out of
              filtered searches rather than falsely claiming every brand. */}
          <div className="adm-ws-picker">
            <span className="adm-ws-picker-label">Brand experience</span>
            <div className="adm-ws-chips">
              {VEHICLE_BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`adm-ws-chip ${brands.includes(b) ? "active" : ""}`}
                  onClick={() => toggle(b, brands, setBrands)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="adm-ws-picker">
            <span className="adm-ws-picker-label">Motorcycle types serviced</span>
            <div className="adm-ws-chips">
              {BIKE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`adm-ws-chip ${types.includes(t) ? "active" : ""}`}
                  onClick={() => toggle(t, types, setTypes)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

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
          <thead><tr><th>Name</th><th>Address</th><th>Area</th><th>Services</th><th>Rating</th><th>Sentiment</th><th>Manager</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {workshops.map((w) => [
              <tr key={w._id}>
                <td>{w.name}</td>
                <td>{w.address}</td>
                <td>{w.area || "—"}</td>
                {/* A count plus a button, rather than every service name run
                    together in one cell — the full price list opens below. */}
                <td>
                  <button
                    className="adm-camera-toggle"
                    onClick={() => {
                      setOpenServicesId(openServicesId === w._id ? null : w._id);
                      setEditingId(null);
                    }}
                  >
                    {openServicesId === w._id ? "Hide services" : `View services (${w.servicesOffered.length})`}
                  </button>
                </td>
                <td>★ {w.rating.average.toFixed(1)} ({w.rating.count})</td>
                <td>
                  {w.sentiment?.scoredCount > 0 ? (
                    <>
                      <div style={{ color: w.sentiment.score > 0 ? '#4ade80' : w.sentiment.score < 0 ? '#f87171' : '#94a3b8' }}>
                        {w.sentiment.score > 0 ? '+' : ''}{w.sentiment.score.toFixed(2)}
                      </div>
                      <div className="adm-sub">
                        {Math.round(w.sentiment.positiveRatio * 100)}% positive ({w.sentiment.scoredCount} analyzed)
                      </div>
                    </>
                  ) : (
                    <span className="adm-sub">No analysis</span>
                  )}
                </td>
                <td>
                  {/* Who currently runs this garage, so an admin can see the
                      existing manager before reassigning rather than assigning
                      blind. */}
                  {managerOf(w) ? (
                    <div className="adm-ws-manager">
                      <span className="adm-ws-manager-name">
                        {managerOf(w)!.firstname} {managerOf(w)!.lastname}
                      </span>
                      <span className="adm-sub">{managerOf(w)!.email}</span>
                    </div>
                  ) : (
                    <span className="adm-ws-unassigned">Not assigned</span>
                  )}

                  {/* Assigning a manager both links the garage and promotes a
                      plain user to workshop-admin, so it's one action. */}
                  <div className="adm-ws-assign">
                    <input
                      placeholder="manager@email.com"
                      value={managerEmail[w._id] ?? ""}
                      onChange={(e) => setManagerEmail((m) => ({ ...m, [w._id]: e.target.value }))}
                    />
                    <button
                      className="adm-camera-toggle"
                      disabled={assigningId === w._id}
                      onClick={() => assignManager(w._id)}
                    >
                      {assigningId === w._id ? "..." : w.managedBy ? "Reassign" : "Assign"}
                    </button>
                  </div>
                </td>
                <td>{w.status}</td>
                <td>
                  <button
                    className="adm-camera-toggle"
                    style={{ marginRight: 6 }}
                    onClick={() => setOpenReviewsId(openReviewsId === w._id ? null : w._id)}
                  >
                    {openReviewsId === w._id ? "Hide reviews" : "Ratings & reviews"}
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(w._id)}>Delete</button>
                </td>
              </tr>,
              openServicesId === w._id && (
                <tr key={`${w._id}-services`}>
                  <td colSpan={9} style={{ background: "#0e0f19", padding: 14 }}>
                    <div className="adm-sub" style={{ marginBottom: 10 }}>{w.name} — services &amp; prices</div>
                    {editingId === w._id ? (
                      <>
                        <ServicesTableEditor rows={editRows} onChange={setEditRows} />
                        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                          <button
                            className="uh-btn uh-btn-sm uh-btn-primary"
                            disabled={savingServices}
                            onClick={() => saveServices(w._id)}
                          >
                            {savingServices ? "Saving..." : "Save services"}
                          </button>
                          <button className="adm-camera-toggle" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <ServicesTableView rows={w.servicesOffered} />
                        <div style={{ marginTop: 10 }}>
                          <button
                            className="uh-btn uh-btn-sm uh-btn-primary"
                            onClick={() => { setEditingId(w._id); setEditRows(w.servicesOffered.map((s) => ({ ...s }))); }}
                          >
                            Edit services
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ),
              openReviewsId === w._id && (
                <tr key={`${w._id}-reviews`}>
                  <td colSpan={9} style={{ background: "#0e0f19", padding: 14 }}>
                    <div className="adm-sub" style={{ marginBottom: 10 }}>{w.name}</div>
                    <WorkshopReviewsPanel workshopId={w._id} />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminWorkshopsPage;
