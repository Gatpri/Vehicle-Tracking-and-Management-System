import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../lib/api";
import { VEHICLE_BRANDS, BIKE_TYPES, SORT_LABELS, type SortMode } from "../lib/workshopOptions";

interface Workshop {
  _id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  servicesOffered: { serviceType: string; basePrice: number }[];
  rating: { average: number; count: number };
  sentiment: { score: number; positiveRatio: number; scoredCount: number };
  brandsSupported: string[];
  bikeTypes: string[];
  distanceKm: number | null;
}

function WorkshopsPage() {
  const [searchParams] = useSearchParams();
  const vehicleId = searchParams.get("vehicleId") || "";

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortMode>("best");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const load = async (overrides: { sortBy?: SortMode; origin?: { lat: number; lng: number } | null } = {}) => {
    setLoading(true);
    const effectiveSort = overrides.sortBy ?? sortBy;
    const effectiveOrigin = overrides.origin !== undefined ? overrides.origin : origin;
    try {
      const res = await api.get("/workshops", {
        params: {
          ...(serviceType && { serviceType }),
          ...(brands.length && { brands: brands.join(",") }),
          ...(types.length && { bikeTypes: types.join(",") }),
          sortBy: effectiveSort,
          ...(effectiveOrigin && { lat: effectiveOrigin.lat, lng: effectiveOrigin.lng }),
        },
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // Sorting by distance needs a location, so asking for one is folded into
  // picking that sort mode rather than being a separate button to remember.
  // (Not named use* — that would make ESLint treat it as a React hook.)
  const locateThenLoad = (nextSort: SortMode) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(here);
        setLocating(false);
        load({ sortBy: nextSort, origin: here });
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setLocating(false);
        load({ sortBy: nextSort });
      }
    );
  };

  const changeSort = (next: SortMode) => {
    setSortBy(next);
    if ((next === "distance" || next === "best") && !origin) return locateThenLoad(next);
    load({ sortBy: next });
  };

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Workshops</h1>
      </div>

      <div className="uh-card ap-filter-card">
        <div className="ap-filter-row">
          <div className="uh-field" style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <label htmlFor="serviceType">Service type</label>
            <input
              id="serviceType"
              placeholder="e.g. oil_change"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            />
          </div>
          <div className="uh-field" style={{ marginBottom: 0, flex: "0 1 190px" }}>
            <label htmlFor="sortBy">Sort by</label>
            <select id="sortBy" value={sortBy} onChange={(e) => changeSort(e.target.value as SortMode)}>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>{SORT_LABELS[mode]}</option>
              ))}
            </select>
          </div>
          <button className="uh-btn uh-btn-primary" onClick={() => load()} disabled={locating}>
            {locating ? "Locating..." : "Apply"}
          </button>
        </div>

        <div className="ap-filter-group">
          <span className="ap-filter-label">Brand experience</span>
          <div className="ap-chip-row">
            {VEHICLE_BRANDS.map((b) => (
              <button
                key={b}
                type="button"
                className={`ap-chip ${brands.includes(b) ? "active" : ""}`}
                onClick={() => toggle(b, brands, setBrands)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="ap-filter-group">
          <span className="ap-filter-label">Motorcycle type</span>
          <div className="ap-chip-row">
            {BIKE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`ap-chip ${types.includes(t) ? "active" : ""}`}
                onClick={() => toggle(t, types, setTypes)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : workshops.length === 0 ? (
        <div className="uh-empty">No workshops match those filters.</div>
      ) : (
        <div className="ap-grid">
          {workshops.map((w) => (
            <Link
              key={w._id}
              to={`/workshops/${w._id}${vehicleId ? `?vehicleId=${vehicleId}` : ""}`}
              className="ap-item-card"
            >
              <div className="ap-item-card-top">
                <h3>{w.name}</h3>
                {w.distanceKm !== null && (
                  <span className="uh-badge uh-badge-blue">{w.distanceKm.toFixed(1)} km</span>
                )}
              </div>
              <div className="ap-item-meta">
                <span>{w.address}</span>
                <span>
                  ★ {w.rating.average.toFixed(1)} ({w.rating.count})
                  {w.sentiment?.scoredCount > 0 && (
                    <> · {Math.round(w.sentiment.positiveRatio * 100)}% positive</>
                  )}
                </span>
                {w.brandsSupported?.length > 0 && (
                  <span className="ap-item-brands">{w.brandsSupported.join(" · ")}</span>
                )}
                <span>{w.servicesOffered.map((s) => s.serviceType).join(", ")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkshopsPage;
