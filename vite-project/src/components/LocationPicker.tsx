import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import "./LocationPicker.css";

// Vite breaks Leaflet's default marker icon URL resolution — same explicit
// re-point used in LiveDeliveryMap.tsx.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

export interface LatLng {
  lat: number;
  lng: number;
}

// Kathmandu — a sensible "somewhere in Nepal" opening view for a picker that
// has no coordinate yet, so the user starts near home rather than at 0,0.
const DEFAULT_CENTER: LatLng = { lat: 27.7172, lng: 85.324 };
const DEFAULT_ZOOM = 13;
const PICKED_ZOOM = 16;

const SEARCH_DEBOUNCE_MS = 450;
const NOMINATIM = "https://nominatim.openstreetmap.org";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

/** Keeps the Leaflet view in sync when the value changes from outside the map
 *  (geolocation, search pick, or typed coordinates) without fighting the user's
 *  own panning — it only recentres when the target actually moved. */
function Recentre({ target }: { target: LatLng | null }) {
  const map = useMap();
  const lastRef = useRef<string>("");

  useEffect(() => {
    if (!target) return;
    const key = `${target.lat.toFixed(6)},${target.lng.toFixed(6)}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    map.setView([target.lat, target.lng], Math.max(map.getZoom(), PICKED_ZOOM), {
      animate: true,
    });
  }, [target, map]);

  return null;
}

/** Click anywhere to drop/move the pin — the interaction people expect from
 *  every consumer map picker, alongside dragging the marker itself. */
function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  /** Reverse-geocoded street address for the current pin, lifted to the parent
   *  so forms can store a human-readable label alongside the coordinates. */
  onAddressResolved?: (address: string) => void;
  height?: number;
  className?: string;
}

/**
 * Map-based location picker: search an address, drag the pin, click the map, or
 * snap to the device's GPS. Replaces coordinate-typing, which nobody outside a
 * GIS team can do accurately.
 *
 * Uses OpenStreetMap tiles + Nominatim geocoding — no API key, consistent with
 * the maps already in this app.
 */
function LocationPicker({
  value,
  onChange,
  onAddressResolved,
  height = 320,
  className = "",
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState("");
  const [showResults, setShowResults] = useState(false);

  // Only the first render's centre matters to MapContainer; later moves go
  // through <Recentre>, so this must not be reactive.
  const initialCentre = useMemo(() => value ?? DEFAULT_CENTER, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markerRef = useRef<L.Marker | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Derived rather than stored: results for an abandoned query stay in state
  // until the next fetch resolves, but must not be shown once the box is
  // cleared or trimmed below the search threshold.
  const visibleResults = query.trim().length < 3 ? [] : results;

  // Nominatim asks callers not to hammer the endpoint; debounce plus a minimum
  // query length keeps this to one request per pause in typing.
  useEffect(() => {
    const q = query.trim();
    // Too short to search: `visibleResults` below already hides any stale hits,
    // so there's no state to clear here (and clearing it would cascade a
    // render on every keystroke).
    if (q.length < 3) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${NOMINATIM}/search?format=json&limit=5&countrycodes=np&q=${encodeURIComponent(q)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          setResults(await res.json());
          setShowResults(true);
        }
      } catch {
        // Aborted or offline — leave the previous suggestions in place.
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Turn whatever the pin is on into a street address, so the user can confirm
  // they picked the right place instead of eyeballing raw numbers.
  useEffect(() => {
    if (!value) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}/reverse?format=json&lat=${value.lat}&lon=${value.lng}`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.display_name) {
          setAddress(data.display_name);
          onAddressResolved?.(data.display_name);
        }
      } catch {
        // Non-fatal: the coordinates are still valid without a label.
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // onAddressResolved is intentionally omitted — parents commonly pass an
    // inline arrow, which would re-fire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  // Close the suggestion dropdown when focus moves elsewhere on the page.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onChange]);

  const markerHandlers = useMemo(
    () => ({
      dragend: () => {
        const m = markerRef.current;
        if (!m) return;
        const p = m.getLatLng();
        onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange]
  );

  return (
    <div className={`lp-wrap ${className}`} ref={boxRef}>
      <div className="lp-toolbar">
        <div className="lp-search">
          <input
            type="text"
            value={query}
            placeholder="Search a place or address…"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => visibleResults.length > 0 && setShowResults(true)}
            // Enter would otherwise submit the surrounding form.
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
          {searching && <span className="lp-spinner" aria-hidden="true" />}
          {showResults && visibleResults.length > 0 && (
            <ul className="lp-results">
              {visibleResults.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
                      setQuery("");
                      setResults([]);
                      setShowResults(false);
                    }}
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="lp-gps" onClick={useMyLocation} disabled={locating}>
          {locating ? "Locating…" : "📍 My location"}
        </button>
      </div>

      <div className="lp-map" style={{ height }}>
        <MapContainer
          center={[initialCentre.lat, initialCentre.lng]}
          zoom={value ? PICKED_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={onChange} />
          <Recentre target={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={markerHandlers}
              ref={(m) => { markerRef.current = m; }}
            />
          )}
        </MapContainer>

        {!value && <div className="lp-hint-overlay">Click the map to drop a pin</div>}
      </div>

      <div className="lp-footer">
        {value ? (
          <>
            <span className="lp-coords">
              {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
            </span>
            {address && <span className="lp-address">{address}</span>}
          </>
        ) : (
          <span className="lp-address">
            Search, click the map, or use your location — then drag the pin to fine-tune.
          </span>
        )}
      </div>
    </div>
  );
}

export default LocationPicker;
