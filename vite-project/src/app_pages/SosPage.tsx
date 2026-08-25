import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import LocationPicker, { type LatLng } from "../components/LocationPicker";

interface SosAlert {
  _id: string;
  location: { lat: number; lng: number };
  message: string;
  status: "active" | "resolved";
  createdAt: string;
  resolvedAt?: string | null;
}

interface Vehicle {
  _id: string;
  plateNumber: string;
}

/**
 * Emergency SOS — one button, two outcomes.
 *
 * Tapping SOS asks what happened, because the two cases genuinely diverge
 * afterwards:
 *
 *   "I need help"       → an SOS alert with the device's position. One more
 *                         tap and it is sent; nothing else is touched.
 *
 *   "Vehicle stolen"    → an SOS alert *and* a theft report, which sets
 *                         vehicle.status = "stolen". That flag is the only
 *                         thing the CCTV pipeline matches against
 *                         (cctvController.js), so without it a stolen vehicle
 *                         is never detected by a camera.
 *
 * The choice exists precisely so those stay distinct: every SOS filing a theft
 * report would flag a vehicle as stolen over a flat tyre, and an SOS that
 * never filed one would leave the recognition models with nothing to detect.
 */
type SosMode = null | "help" | "theft";
function SosPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  // Which branch the SOS button opened, if any.
  const [mode, setMode] = useState<SosMode>(null);

  // Theft report — moved here from the Safety page, which now shows only the
  // heatmap and the reports you have already filed.
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState("");

  const load = async () => {
    try {
      const [alertRes, vehicleRes] = await Promise.all([
        api.get("/sos/mine"),
        api.get("/vehicles/mine"),
      ]);
      setAlerts(alertRes.data.alerts);
      setVehicles(vehicleRes.data.vehicles);
    } catch {
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();

    const socket = getSocket();
    const onResolved = (alert: SosAlert) => {
      setAlerts((prev) => prev.map((a) => (a._id === alert._id ? alert : a)));
      toast.info("Your SOS alert was resolved by an admin");
    };
    socket.on("sos:resolved", onResolved);
    return () => {
      socket.off("sos:resolved", onResolved);
    };
  }, []);

  const sendSos = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.post("/sos", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            message,
          });
          toast.success("SOS sent — help is on the way");
          setMessage("");
          load();
        } catch (err) {
          toast.error(getErrorMessage(err, "Failed to send SOS"));
        } finally {
          setSending(false);
        }
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setSending(false);
      }
    );
  };

  const handleReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    if (!location) {
      toast.error("Mark on the map where the vehicle was lost from");
      return;
    }
    setSubmitting(true);
    try {
      // The theft report goes first: it is the part that flags the vehicle for
      // CCTV, so if only one of the two succeeds it should be this one.
      await api.post("/theft-reports", {
        vehicleId,
        lat: location.lat,
        lng: location.lng,
        description,
      });

      // ...and an SOS alongside it, so the theft appears on the admins' live
      // alert board rather than only in a report list someone has to open.
      try {
        const plate = vehicles.find((v) => v._id === vehicleId)?.plateNumber;
        await api.post("/sos", {
          lat: location.lat,
          lng: location.lng,
          message: `Vehicle stolen${plate ? ` — ${plate}` : ""}${description ? `: ${description}` : ""}`,
        });
      } catch {
        // The report is what matters and it already succeeded; a failed alert
        // must not make the user think the theft was not recorded.
      }

      toast.success("Theft reported — vehicle flagged and admins alerted");
      setDescription("");
      setLocation(null);
      setLocationLabel("");
      setVehicleId("");
      setMode(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to file report"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="uh-page">
      <h1 style={{ marginBottom: 20 }}>Emergency SOS</h1>

      <div className="ap-sos-hero">
        <button className="ap-sos-button" onClick={() => setMode(mode ? null : "help")} disabled={sending}>
          {sending ? "Sending..." : "SEND SOS"}
        </button>

        {!mode && <p className="ap-row-sub" style={{ marginTop: 16 }}>Tap for emergency help or to report a theft.</p>}

        {mode && (
          <div className="ap-sos-choice">
            {/* The two cases diverge in what they do to the vehicle, so the
                choice is made up front rather than inferred. */}
            <button
              type="button"
              className={`ap-sos-option ${mode === "help" ? "active" : ""}`}
              onClick={() => setMode("help")}
            >
              <strong>I need help</strong>
              <span>Breakdown, accident, feeling unsafe</span>
            </button>
            <button
              type="button"
              className={`ap-sos-option ${mode === "theft" ? "active" : ""}`}
              onClick={() => setMode("theft")}
            >
              <strong>My vehicle was stolen</strong>
              <span>Flags it so CCTV cameras watch for it</span>
            </button>
          </div>
        )}

        {mode === "help" && (
          <div style={{ maxWidth: 360, margin: "20px auto 0" }}>
            <div className="uh-field">
              <label htmlFor="message">Optional message</label>
              <input id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. flat tire on highway" />
            </div>
            <button className="uh-btn uh-btn-danger" style={{ width: "100%", marginTop: 12 }} onClick={sendSos} disabled={sending}>
              {sending ? "Sending..." : "Send alert with my location"}
            </button>
          </div>
        )}
      </div>

      {mode === "theft" && (
        <form className="uh-card" style={{ marginBottom: 24 }} onSubmit={handleReport}>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="vehicleId">Vehicle</label>
              <select id="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                <option value="">Select a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>{v.plateNumber}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="uh-field">
            <label>From where vehicle was lost?</label>
            {/* Picked on a map, or dropped on the device's own position via
                the picker's "My location" — where a vehicle was taken from is
                rarely where the owner is standing when they file. */}
            <LocationPicker
              value={location}
              onChange={setLocation}
              onAddressResolved={setLocationLabel}
              height={280}
            />
            {locationLabel && <span className="ap-row-sub">{locationLabel}</span>}
          </div>
          <div className="uh-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="uh-btn uh-btn-danger" type="submit" disabled={submitting || !location}>
            {submitting ? "Reporting..." : "Report theft & alert admins"}
          </button>
        </form>
      )}

      <div className="ap-section-title">My Alert History</div>
      {loading ? (
        <p>Loading...</p>
      ) : alerts.length === 0 ? (
        <div className="uh-empty">No alerts sent yet.</div>
      ) : (
        <div className="uh-list">
          {alerts.map((a) => (
            <div className="ap-row" key={a._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">{a.message || "SOS Alert"}</span>
                <span className="ap-row-sub">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
              <span className={`uh-badge ${a.status === "resolved" ? "uh-badge-green" : "uh-badge-red"}`}>{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SosPage;
