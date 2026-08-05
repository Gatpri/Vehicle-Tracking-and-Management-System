import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../lib/workshopOptions";

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

// "oil_change:150000, tire_change:80000" <-> the servicesOffered array. Prices
// are entered and shown in rupees but stored in paisa, like everywhere else.
const servicesToText = (services: Workshop["servicesOffered"]) =>
  services.map((s) => `${s.serviceType}:${s.basePrice / 100}`).join(", ");

const textToServices = (raw: string) =>
  raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [serviceType, price] = chunk.split(":");
      return {
        serviceType: (serviceType ?? "").trim(),
        basePrice: Math.round((Number(price) || 0) * 100),
      };
    })
    .filter((s) => s.serviceType);

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
  const [servicesRaw, setServicesRaw] = useState("");
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
    setServicesRaw(servicesToText(w.servicesOffered ?? []));
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
    // onLoaded is a plain callback from the parent; re-fetching whenever its
    // identity changes would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId]);

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!workshop) return;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      toast.error("Enter a valid latitude (-90 to 90) and longitude (-180 to 180)");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch(`/workshops/${workshop._id}`, {
        name,
        description,
        address,
        area,
        location: { lat: latNum, lng: lngNum },
        contactPhone: phone,
        servicesOffered: textToServices(servicesRaw),
        brandsSupported: brands,
        bikeTypes: types,
      });
      hydrate(res.data.workshop);
      toast.success("Workshop updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"));
    } finally {
      setSaving(false);
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

  // Fills lat/lng from the browser — a garage owner knows where they are, not
  // what their coordinates are.
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        toast.info("Coordinates filled from your current location — save to apply");
      },
      () => toast.error("Couldn't get your location — check browser permissions")
    );
  };

  if (loading) return <p className="adm-empty">Loading...</p>;
  if (error || !workshop) return <p className="adm-empty">{error || "No workshop assigned."}</p>;

  return (
    <form className="adm-ws-panel" onSubmit={save}>
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
        <div className="adm-ws-coords">
          <input placeholder="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required />
          <input placeholder="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} required />
          <button type="button" className="adm-camera-toggle" onClick={useCurrentLocation}>Use my location</button>
        </div>
        <span className="adm-ws-hint">
          Coordinates drive "nearest workshop" search — update them if you move premises.
        </span>
      </div>

      <div className="adm-ws-picker">
        <span className="adm-ws-picker-label">Contact</span>
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="adm-ws-picker">
        <span className="adm-ws-picker-label">Services &amp; prices (Rs)</span>
        <input
          placeholder="oil_change:1500, tire_change:800"
          value={servicesRaw}
          onChange={(e) => setServicesRaw(e.target.value)}
        />
        <span className="adm-ws-hint">Comma separated, as service_name:price in rupees.</span>
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
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export default MyWorkshopPanel;
