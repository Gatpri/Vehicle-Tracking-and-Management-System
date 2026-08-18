import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../lib/workshopOptions";
import ServicesTableEditor, { type ServiceRow } from "../components/ServicesTableEditor";
import LocationPicker, { type LatLng } from "../components/LocationPicker";

interface Workshop {
  _id: string;
  name: string;
  description: string;
  address: string;
  area?: string;
  location: { lat: number; lng: number };
  servicesOffered: { serviceType: string; basePrice: number }[];
  brandsSupported: string[];
  bikeTypes: string[];
  contactPhone: string;
  logoUrl: string;
  rating: { average: number; count: number };
}

/**
 * Edit one garage's public details. A workshop-admin gets this for the shop
 * assigned to them (workshopId omitted -> /workshops/mine); an admin can pass
 * an explicit id to edit any.
 */
function MyWorkshopPanel({
  workshopId,
  onLoaded,
}: {
  workshopId?: string;
  // Reports which workshop this resolved to, so the page around it can show
  // that garage's reviews without fetching /workshops/mine a second time.
  onLoaded?: (id: string) => void;
}) {
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [pending, setPending] = useState<{ _id: string; createdAt: string } | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const hydrate = (w: Workshop) => {
    setWorkshop(w);
    setName(w.name ?? "");
    setDescription(w.description ?? "");
    setAddress(w.address ?? "");
    setArea(w.area ?? "");
    setLat(String(w.location?.lat ?? ""));
    setLng(String(w.location?.lng ?? ""));
    setPhone(w.contactPhone ?? "");
    setServices((w.servicesOffered ?? []).map((s) => ({ ...s })));
    setBrands(w.brandsSupported ?? []);
    setTypes(w.bikeTypes ?? []);
  };

  useEffect(() => {
    api
      .get(workshopId ? `/workshops/${workshopId}` : "/workshops/mine")
      .then((res) => {
        hydrate(res.data.workshop);
        onLoaded?.(res.data.workshop._id);
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your workshop")))
      .finally(() => setLoading(false));
    loadPending();
    // onLoaded is a plain callback from the parent; re-fetching whenever its
    // identity changes would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId]);

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // A workshop-admin can't write to their garage directly any more: the price
  // list every booking is billed against needs a second pair of eyes, so this
  // submits a change request for an admin/superadmin to approve.
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!workshop) return;
    setSaving(true);
    try {
      await api.post(`/workshops/${workshop._id}/change-requests`, {
        name,
        description,
        address,
        area,
        contactPhone: phone,
        servicesOffered: services,
      });
      toast.success("Sent for approval — an admin will review your changes");
      loadPending();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to submit changes"));
    } finally {
      setSaving(false);
    }
  };

  // So the garage can see their request is queued rather than resubmitting it.
  const loadPending = async () => {
    try {
      const res = await api.get("/workshop-change-requests", { params: { status: "pending" } });
      setPending(res.data.requests?.[0] ?? null);
    } catch {
      setPending(null);
    }
  };

  // The logo reuses the vehicle-photo upload path — same Cloudinary flow, and
  // the workshop update endpoint just stores the returned URL.
  const uploadLogo = async (file: File) => {
    if (!workshop) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await api.post(`/workshops/${workshop._id}/logo`, form);
      hydrate(upload.data.workshop);
      toast.success("Logo updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to upload logo"));
    } finally {
      setUploading(false);
    }
  };

  // lat/lng stay strings (they back plain text inputs and the save payload);
  // the map picker works in numbers, so translate at the boundary. Half-typed
  // or empty fields simply mean "no pin yet" rather than a NaN marker.
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

  if (loading) return <p className="adm-empty">Loading...</p>;
  if (error || !workshop) return <p className="adm-empty">{error || "No workshop assigned."}</p>;

  return (
    <form className="adm-ws-panel" onSubmit={save}>
      {pending && (
        <div className="svc-pending-banner">
          Changes submitted {new Date(pending.createdAt).toLocaleString()} are waiting for an
          admin to review. Saving again will replace them once that one is decided.
        </div>
      )}
      <div className="adm-ws-identity">
        <div className="adm-ws-logo">
          {workshop.logoUrl
            ? <img src={workshop.logoUrl} alt={workshop.name} />
            : <span className="adm-ws-logo-empty">No logo</span>}
          <label className="adm-camera-toggle adm-ws-logo-btn">
            {uploading ? "Uploading..." : workshop.logoUrl ? "Replace" : "Upload logo"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="adm-ws-identity-fields">
          <input placeholder="Workshop name" value={name} onChange={(e) => setName(e.target.value)} required />
          <textarea
            rows={2}
            placeholder="Short description customers will see"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="adm-ws-rating">
            ★ {workshop.rating.average.toFixed(1)} ({workshop.rating.count} reviews)
          </span>
        </div>
      </div>

      <div className="adm-ws-picker">
        <span className="adm-ws-picker-label">Address &amp; location</span>
        <input placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input
          placeholder="Area (e.g. Kathmandu) — matched against delivery-staff for pickup/return assignment"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <LocationPicker
          value={pickedLocation}
          onChange={applyPickedLocation}
          onAddressResolved={(resolved) => {
            // Only offer the looked-up address as a default — never overwrite
            // an address the owner has already written themselves.
            if (!address.trim()) setAddress(resolved);
          }}
        />
        <div className="adm-ws-coords">
          <input placeholder="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required />
          <input placeholder="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} required />
        </div>
        <span className="adm-ws-hint">
          Coordinates drive "nearest workshop" search — update them if you move premises.
          The boxes above stay in sync with the pin, so you can also paste exact values.
        </span>
      </div>

      <div className="adm-ws-picker">
        <span className="adm-ws-picker-label">Contact</span>
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="adm-ws-picker">
        <span className="adm-ws-picker-label">Services &amp; prices (Rs)</span>
        <ServicesTableEditor rows={services} onChange={setServices} />
        <span className="adm-ws-hint">
          Price changes are reviewed by an admin before they go live.
        </span>
      </div>

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

      <button className="add-btn" type="submit" disabled={saving}>
        {saving ? "Submitting..." : "Submit for approval"}
      </button>
    </form>
  );
}

export default MyWorkshopPanel;
