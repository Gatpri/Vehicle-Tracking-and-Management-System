import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { getCurrentUser } from "../lib/useAuth";
import "./TheftAlertOverlay.css";

interface SightingAlert {
  _id: string;
  imageUrl: string;
  recognizedPlateText: string;
  confidence: number;
  cameraId: string;
  location: { lat: number | null; lng: number | null };
  createdAt: string;
  matchedVehicle: {
    _id: string;
    plateNumber: string;
    make: string;
    model: string;
    color?: string;
    images?: string[];
    owner: string;
  } | null;
}

// Mounted in both layouts so a camera spotting the owner's stolen vehicle
// interrupts them wherever they are in the app.
//
// Two ways an alert arrives. The socket delivers it live, but only to an owner
// who happens to be online at that second — so on mount we also pull any
// detection still awaiting an answer. Without that, a detection that happens
// while the owner is logged out is lost entirely, which is exactly when it
// matters most.
function TheftAlertOverlay() {
  const [alert, setAlert] = useState<SightingAlert | null>(null);
  const [sending, setSending] = useState<"confirm" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/cctv/my-theft-alerts")
      .then((res) => {
        if (cancelled) return;
        const pending: SightingAlert[] = res.data.sightings ?? [];
        if (pending.length > 0) setAlert((current) => current ?? pending[0]);
      })
      .catch(() => {
        // Not signed in yet, or offline — the socket path still covers the
        // live case, and the next mount retries.
      });

    const socket = getSocket();
    const onSighting = (sighting: SightingAlert) => {
      // The same event goes to every admin (for the CCTV page banner) as well
      // as to the owner's own room. Only the owner gets the full-screen
      // interrupt — an admin who happens to be on a user page must not be told
      // that someone else's car is theirs.
      const me = getCurrentUser();
      const myId = me?._id ?? me?.id;
      if (!sighting.matchedVehicle || !myId) return;
      if (String(sighting.matchedVehicle.owner) !== String(myId)) return;
      setAlert(sighting);
    };
    socket.on("theft:sighting", onSighting);
    return () => {
      cancelled = true;
      socket.off("theft:sighting", onSighting);
    };
  }, []);

  if (!alert) return null;

  const vehicle = alert.matchedVehicle;
  const seenAt = alert.location.lat != null && alert.location.lng != null ? alert.location : null;

  // Both answers reach the admin SOS queue — confirming raises an active
  // emergency, declining files it as pending for review. The server reads the
  // plate photo, vehicle photo and camera location back off the sighting
  // itself, so this request can't be pointed at someone else's vehicle.
  const respond = (confirmed: boolean) => {
    setSending(confirmed ? "confirm" : "deny");

    const post = (lat?: number, lng?: number) =>
      api
        .post(`/cctv/theft-alerts/${alert._id}/respond`, { confirmed, lat, lng })
        .then(() => {
          toast[confirmed ? "success" : "info"](
            confirmed
              ? "Confirmed — admins are tracking your vehicle now"
              : "Marked as not confirmed — admins will review it"
          );
          setAlert(null);
        })
        .catch((err) => toast.error(getErrorMessage(err, "Failed to send your response")))
        .finally(() => setSending(null));

    // Location is a bonus, never a blocker: the server falls back to where the
    // camera saw the vehicle, which is the more useful coordinate anyway.
    if (!confirmed || !navigator.geolocation) return void post();
    navigator.geolocation.getCurrentPosition(
      (pos) => post(pos.coords.latitude, pos.coords.longitude),
      () => post()
    );
  };

  return (
    <div className="ta-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="ta-title">
      <div className="ta-modal">
        <div className="ta-ticker">
          <span className="ta-ticker-tag">BREAKING</span>
          <span className="ta-ticker-text">Your vehicle has been spotted by a live camera</span>
        </div>

        <div className="ta-body">
          <h2 id="ta-title" className="ta-plate">{vehicle?.plateNumber}</h2>
          <p className="ta-sub">
            {[vehicle?.color, vehicle?.make, vehicle?.model].filter(Boolean).join(" ")}
          </p>

          <div className="ta-shots">
            <figure className="ta-shot">
              <img src={alert.imageUrl} alt="Frame captured by the camera" />
              <figcaption>Camera frame · {alert.confidence.toFixed(0)}% read confidence</figcaption>
            </figure>
            {vehicle?.images?.[0] && (
              <figure className="ta-shot">
                <img src={vehicle.images[0]} alt="Your registered vehicle" />
                <figcaption>Your registered photo</figcaption>
              </figure>
            )}
          </div>

          <dl className="ta-facts">
            <div><dt>Camera</dt><dd>{alert.cameraId}</dd></div>
            <div><dt>Seen at</dt><dd>{new Date(alert.createdAt).toLocaleString()}</dd></div>
            <div>
              <dt>Location</dt>
              <dd>
                {seenAt ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${seenAt.lat}&mlon=${seenAt.lng}#map=17/${seenAt.lat}/${seenAt.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {seenAt.lat!.toFixed(5)}, {seenAt.lng!.toFixed(5)} — open map
                  </a>
                ) : (
                  "Camera has no location set"
                )}
              </dd>
            </div>
          </dl>

          <p className="ta-prompt">Is this your vehicle, and was it taken without your permission?</p>

          <div className="ta-actions">
            <button className="ta-btn ta-btn-sos" onClick={() => respond(true)} disabled={sending !== null}>
              {sending === "confirm" ? "Sending SOS..." : "YES — CONFIRM & SEND SOS"}
            </button>
            <button className="ta-btn ta-btn-ghost" onClick={() => respond(false)} disabled={sending !== null}>
              {sending === "deny" ? "Sending..." : "Not confirmed"}
            </button>
          </div>
          <p className="ta-fineprint">
            Confirming shares your location, this camera frame and your vehicle details with admins immediately
            so they can start tracking. Either answer is recorded — this alert won't be shown again.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TheftAlertOverlay;
