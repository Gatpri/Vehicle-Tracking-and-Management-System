import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";

interface SosAlert {
  _id: string;
  location: { lat: number; lng: number };
  message: string;
  status: "active" | "resolved";
  createdAt: string;
  resolvedAt?: string | null;
}

function SosPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const res = await api.get("/sos/mine");
      setAlerts(res.data.alerts);
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

  return (
    <div className="uh-page">
      <h1 style={{ marginBottom: 20 }}>Emergency SOS</h1>

      <div className="ap-sos-hero">
        <button className="ap-sos-button" onClick={sendSos} disabled={sending}>
          {sending ? "Sending..." : "SEND SOS"}
        </button>
        <div className="uh-field" style={{ maxWidth: 360, margin: "24px auto 0" }}>
          <label htmlFor="message">Optional message</label>
          <input id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. flat tire on highway" />
        </div>
      </div>

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
