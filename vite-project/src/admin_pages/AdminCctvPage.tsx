import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface Sighting {
  _id: string;
  imageUrl: string;
  recognizedPlateText: string;
  confidence: number;
  plateDetected: boolean;
  plateDetectionConfidence: number;
  matchedVehicle: { plateNumber: string; make: string; model: string } | null;
  matchedStolen: boolean;
  cameraId: string;
  createdAt: string;
}

// A local-only tile representing one of this browser's own webcams. There's
// nothing at a fixed network address for the backend to poll, so these are
// never persisted or auto-scanned — they exist only while this tab is open.
interface DeviceSlot {
  id: string;
  label: string;
  deviceId?: string;
}

// A camera registered in the backend (models/Camera.js). Unlike a device
// slot, this survives page refreshes and is auto-polled by the server on
// an interval — see services/cameraPollerService.js.
interface CameraRecord {
  _id: string;
  label: string;
  sourceType: "device" | "remote";
  streamUrl: string;
  location: { lat: number | null; lng: number | null };
  active: boolean;
  tiledScan: boolean;
  pollIntervalSec: number;
  lastPolledAt: string | null;
  lastStatus: "never" | "ok" | "error";
  lastError: string;
}

type Mode = "upload" | "camera";

function AdminCctvPage() {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [cameraId, setCameraId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [alertBanner, setAlertBanner] = useState<Sighting | null>(null);
  const [lastResult, setLastResult] = useState<Sighting | null>(null);

  const [deviceSlots, setDeviceSlots] = useState<DeviceSlot[]>([]);
  const [remoteCameras, setRemoteCameras] = useState<CameraRecord[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newSourceType, setNewSourceType] = useState<"device" | "remote">("device");
  const [newUrl, setNewUrl] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [newTiled, setNewTiled] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/cctv/sightings");
      setSightings(res.data.sightings);
    } catch {
      toast.error("Failed to load sightings");
    } finally {
      setLoading(false);
    }
  };

  const loadCameras = async () => {
    try {
      const res = await api.get("/cameras");
      setRemoteCameras(res.data.cameras.filter((c: CameraRecord) => c.sourceType === "remote"));
    } catch {
      toast.error("Failed to load camera registry");
    }
  };

  useEffect(() => {
    load();

    const socket = getSocket();
    const onSighting = (s: Sighting) => {
      setAlertBanner(s);
      toast.error("Stolen vehicle detected on camera!");
      load();
    };
    socket.on("theft:sighting", onSighting);
    return () => {
      socket.off("theft:sighting", onSighting);
    };
  }, []);

  // While the admin has "Live Cameras" open, keep the registry list fresh
  // so the auto-poll status (last poll time, ok/error) updates on its own —
  // this is the visible proof that detection keeps running without anyone
  // clicking anything.
  useEffect(() => {
    if (mode !== "camera") return;
    const interval = setInterval(loadCameras, 5000);
    return () => clearInterval(interval);
  }, [mode]);

  // Video input labels stay blank until the browser has granted camera
  // permission at least once — probe with a throwaway getUserMedia call so
  // the device picker in "Add Camera" shows real names instead of being empty.
  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = list.filter((d) => d.kind === "videoinput");
    setDevices(videoInputs);
    setNewDeviceId((prev) => prev || videoInputs[0]?.deviceId || "");
  };

  const openLiveMode = async () => {
    setMode("camera");
    loadCameras();
    if (devices.length > 0 || !navigator.mediaDevices?.getUserMedia) {
      await refreshDevices();
      return;
    }
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error("Couldn't access any camera — check browser/OS permissions");
    }
    await refreshDevices();
  };

  const addCameraSlot = async () => {
    const label = newLabel.trim() || `camera-${deviceSlots.length + remoteCameras.length + 1}`;
    const labelTaken =
      deviceSlots.some((s) => s.label === label) || remoteCameras.some((c) => c.label === label);
    if (labelTaken) {
      toast.error("A camera with that ID already exists");
      return;
    }

    if (newSourceType === "device") {
      setDeviceSlots((prev) => [...prev, { id: crypto.randomUUID(), label, deviceId: newDeviceId || undefined }]);
      setNewLabel("");
      return;
    }

    const url = newUrl.trim();
    if (!url) {
      toast.error("Enter the remote camera's stream URL");
      return;
    }
    let lat: number | undefined;
    let lng: number | undefined;
    if (newLat.trim() || newLng.trim()) {
      lat = Number(newLat);
      lng = Number(newLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        toast.error("Enter a valid latitude (-90 to 90) and longitude (-180 to 180)");
        return;
      }
    }

    try {
      const res = await api.post("/cameras", {
        label,
        sourceType: "remote",
        streamUrl: url,
        lat,
        lng,
        tiledScan: newTiled,
      });
      setRemoteCameras((prev) => [res.data.camera, ...prev]);
      setNewLabel("");
      setNewUrl("");
      setNewLat("");
      setNewLng("");
      setNewTiled(false);
      toast.success("Camera registered — the server will start auto-scanning it shortly");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add camera"));
    }
  };

  const removeDeviceSlot = (id: string) => {
    setDeviceSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const removeRemoteCamera = async (id: string) => {
    try {
      await api.delete(`/cameras/${id}`);
      setRemoteCameras((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove camera"));
    }
  };

  const patchCamera = async (camera: CameraRecord, changes: Partial<CameraRecord>) => {
    try {
      const res = await api.patch(`/cameras/${camera._id}`, changes);
      setRemoteCameras((prev) => prev.map((c) => (c._id === camera._id ? res.data.camera : c)));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update camera"));
    }
  };

  const toggleCameraActive = (camera: CameraRecord) => patchCamera(camera, { active: !camera.active });

  const toggleCameraTiled = (camera: CameraRecord) => patchCamera(camera, { tiledScan: !camera.tiledScan });

  const submitImage = async (
    blob: Blob,
    filename: string,
    overrideCameraId?: string,
    location?: { lat: number; lng: number },
    tiles?: boolean
  ) => {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("image", blob, filename);
      const idToSend = overrideCameraId ?? cameraId;
      if (idToSend) formData.append("cameraId", idToSend);
      if (location) {
        formData.append("lat", String(location.lat));
        formData.append("lng", String(location.lng));
      }
      if (tiles) formData.append("tiles", "true");
      const res = await api.post("/cctv/scan", formData);
      setLastResult(res.data.sighting);
      toast.success("Scan complete");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Scan failed"));
    } finally {
      setScanning(false);
    }
  };

  const handleUploadScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Choose an image first");
      return;
    }
    await submitImage(file, file.name);
    setFile(null);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>CCTV / Plate Recognition</h2></div>

      {alertBanner && (
        <div className="adm-alert-banner">
          <span>🚨 Stolen match: {alertBanner.matchedVehicle?.plateNumber} on camera {alertBanner.cameraId}</span>
          <button className="delete-btn" onClick={() => setAlertBanner(null)}>Dismiss</button>
        </div>
      )}

      <div className="adm-mode-tabs">
        <button
          className={`adm-mode-tab ${mode === "upload" ? "active" : ""}`}
          onClick={() => setMode("upload")}
        >
          Upload Image
        </button>
        <button
          className={`adm-mode-tab ${mode === "camera" ? "active" : ""}`}
          onClick={openLiveMode}
        >
          Live Cameras
        </button>
      </div>

      {mode === "upload" ? (
        <>
          <div className="adm-field">
            <label htmlFor="cameraId">Camera ID (optional)</label>
            <input id="cameraId" placeholder="e.g. laptop-webcam" value={cameraId} onChange={(e) => setCameraId(e.target.value)} />
          </div>
          <form className="adm-upload-box" onSubmit={handleUploadScan}>
            <p>Upload a camera frame to run real OCR plate recognition</p>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="add-btn" type="submit" disabled={scanning} style={{ marginTop: 14 }}>
              {scanning ? "Scanning..." : "Scan Image"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="adm-add-camera-bar">
            <input
              placeholder="Camera ID e.g. gate-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <select value={newSourceType} onChange={(e) => setNewSourceType(e.target.value as "device" | "remote")}>
              <option value="device">This device's camera</option>
              <option value="remote">Remote CCTV (auto-scanned)</option>
            </select>
            {newSourceType === "device" ? (
              <select value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)}>
                {devices.length === 0 && <option value="">Default camera</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  placeholder="http://phone-ip:4747/video or camera /mjpeg, /snapshot"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  style={{ minWidth: 260 }}
                />
                <input
                  placeholder="Latitude"
                  value={newLat}
                  onChange={(e) => setNewLat(e.target.value)}
                  style={{ maxWidth: 110 }}
                  inputMode="decimal"
                />
                <input
                  placeholder="Longitude"
                  value={newLng}
                  onChange={(e) => setNewLng(e.target.value)}
                  style={{ maxWidth: 110 }}
                  inputMode="decimal"
                />
                <label className="adm-tiled-check" title="Also scan four overlapping tiles of each frame — finds small or distant plates a single pass misses and localizes plates more tightly, at roughly 1.6x the scan time">
                  <input type="checkbox" checked={newTiled} onChange={(e) => setNewTiled(e.target.checked)} />
                  Tiled scan
                </label>
              </>
            )}
            <button className="add-btn" onClick={addCameraSlot}>+ Add Camera</button>
          </div>

          {deviceSlots.length === 0 && remoteCameras.length === 0 ? (
            <p className="adm-empty">No cameras added yet — add one above to start a live view.</p>
          ) : (
            <div className="adm-camera-grid">
              {remoteCameras.map((camera) => (
                <RemoteCameraTile
                  key={camera._id}
                  camera={camera}
                  scanning={scanning}
                  onRemove={() => removeRemoteCamera(camera._id)}
                  onToggleActive={() => toggleCameraActive(camera)}
                  onToggleTiled={() => toggleCameraTiled(camera)}
                  onScan={(blob, filename) =>
                    submitImage(
                      blob,
                      filename,
                      camera.label,
                      camera.location.lat != null && camera.location.lng != null
                        ? { lat: camera.location.lat, lng: camera.location.lng }
                        : undefined,
                      camera.tiledScan
                    )
                  }
                />
              ))}
              {deviceSlots.map((slot) => (
                <DeviceCameraTile
                  key={slot.id}
                  slot={slot}
                  scanning={scanning}
                  onRemove={() => removeDeviceSlot(slot.id)}
                  onScan={(blob, filename) => submitImage(blob, filename, slot.label)}
                />
              ))}
            </div>
          )}
          <p className="adm-camera-hint">
            "This device's camera" is a manual, browser-only test feed — it only exists while this tab is open.
            "Remote CCTV" is registered on the server and auto-scanned on an interval even if no one is looking at
            this page; give it a latitude/longitude and any stolen-vehicle match it detects is plotted on the
            theft heatmap on the Safety page. A phone running DroidCam/IP Webcam works as a remote camera —
            use its stream URL, typically <code>http://phone-ip:4747/video</code>. "Tiled scan" also scans four
            overlapping tiles of each frame: it picks up small or distant plates a single pass misses and pins
            down the ones it does find more tightly, for roughly 1.6x the scan time — worth it for a wide view
            of a road or car park, unnecessary for a camera pointed at one gate.
            The camera must serve HTTP(S) MJPEG/snapshot frames with CORS
            enabled for the manual "Capture & Scan" button to work (RTSP feeds need a relay that converts them
            to MJPEG/HLS first) — auto-polling itself happens server-side and isn't affected by CORS.
          </p>
        </>
      )}

      {lastResult && (
        <div className="adm-last-result">
          <strong>Last scan:</strong> {lastResult.recognizedPlateText || "no text recognized"}
          {" "}({lastResult.confidence.toFixed(0)}% confidence)
          {lastResult.matchedVehicle && <> — matched {lastResult.matchedVehicle.plateNumber}</>}
          {lastResult.matchedStolen && <span className="role-badge status-cancelled" style={{ marginLeft: 8 }}>stolen</span>}
        </div>
      )}

      <div className="adm-page-head" style={{ marginTop: 24 }}><h2 style={{ fontSize: 16 }}>Sightings Log</h2></div>
      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : sightings.length === 0 ? (
        <p className="adm-empty">No sightings yet.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Camera</th><th>Plate Detected</th><th>Recognized Text</th><th>OCR Confidence</th><th>Matched Vehicle</th><th>Stolen?</th><th>Time</th></tr></thead>
          <tbody>
            {sightings.map((s) => (
              <tr key={s._id}>
                <td>{s.cameraId}</td>
                <td>
                  {s.plateDetected ? (
                    <span className="role-badge status-active">yes · {s.plateDetectionConfidence.toFixed(0)}%</span>
                  ) : (
                    <span className="role-badge status-pending">no (full frame)</span>
                  )}
                </td>
                <td>{s.recognizedPlateText || "—"}</td>
                <td>{s.confidence.toFixed(0)}%</td>
                <td>{s.matchedVehicle ? `${s.matchedVehicle.plateNumber}` : "no match"}</td>
                <td>{s.matchedStolen ? <span className="role-badge status-cancelled">stolen</span> : "—"}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeviceCameraTile({
  slot,
  scanning,
  onRemove,
  onScan,
}: {
  slot: DeviceSlot;
  scanning: boolean;
  onRemove: () => void;
  onScan: (blob: Blob, filename: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [liveDetect, setLiveDetect] = useState(false);
  const [liveText, setLiveText] = useState("");
  // Mirrors `liveDetect` for the interval closure below, and doubles as the
  // "am I already waiting on a request" guard so a slow /detect-preview
  // response can't cause overlapping requests to stack up.
  const liveDetectRef = useRef(false);
  const inFlightRef = useRef(false);
  const [liveMatch, setLiveMatch] = useState<{ plateNumber: string; stolen: boolean } | null>(null);
  // Resolved once when Live Detect is switched on, not per tick — a 1.5s loop
  // shouldn't re-prompt for permission or re-run the GPS fix.
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);

  const clearOverlay = () => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setLiveDetect(false);
    liveDetectRef.current = false;
    setLiveText("");
    clearOverlay();
  };

  // Release this tile's camera whenever it unmounts (removed, or the admin
  // navigates away) — otherwise the stream stays open in the background.
  useEffect(() => () => stop(), []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera access isn't available in this browser");
      return;
    }
    try {
      const constraints: MediaStreamConstraints = {
        video: slot.deviceId ? { deviceId: { exact: slot.deviceId } } : { facingMode: "environment" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      toast.error(`Couldn't start ${slot.label} — check browser/OS permissions`);
    }
  };

  const grabFrameBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });

  const captureAndScan = async () => {
    if (!active) return;
    const blob = await grabFrameBlob();
    if (blob) onScan(blob, `${slot.label}.jpg`);
  };

  const drawBox = (
    box: { x: number; y: number; width: number; height: number; confidence: number },
    label: string,
    stolen = false
  ) => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const color = stolen ? "#ef4444" : "#22c55e";
    const left = box.x - box.width / 2;
    const top = box.y - box.height / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(stolen ? 4 : 2, video.videoWidth / 240);
    ctx.strokeRect(left, top, box.width, box.height);

    const text = stolen ? `${label} — STOLEN` : `${label} (${box.confidence.toFixed(0)}%)`;
    ctx.font = `${Math.max(14, video.videoWidth / 32)}px sans-serif`;
    const textWidth = ctx.measureText(text).width + 10;
    const labelTop = Math.max(0, top - 24);
    ctx.fillStyle = color;
    ctx.fillRect(left, labelTop, textWidth, 24);
    ctx.fillStyle = "#0b0c14";
    ctx.fillText(text, left + 5, labelTop + 17);
  };

  const runLiveDetectTick = async () => {
    if (inFlightRef.current || !liveDetectRef.current) return;
    inFlightRef.current = true;
    try {
      const blob = await grabFrameBlob();
      if (!blob) return;
      const formData = new FormData();
      formData.append("image", blob, "preview.jpg");
      // Identifies the sighting if this frame turns out to hold a stolen
      // plate, and tells the owner where their vehicle was seen.
      formData.append("cameraId", slot.label);
      const here = geoRef.current;
      if (here) {
        formData.append("lat", String(here.lat));
        formData.append("lng", String(here.lng));
      }
      const res = await api.post("/cctv/detect-preview", formData);
      if (!liveDetectRef.current) return; // stopped while this request was in flight
      if (res.data.detected) {
        setLiveText(res.data.text || "");
        setLiveMatch(res.data.match ?? null);
        drawBox(res.data.box, res.data.text || "plate", Boolean(res.data.match?.stolen));
      } else {
        setLiveText("");
        setLiveMatch(null);
        clearOverlay();
      }
    } catch {
      // Transient errors during a fast polling loop shouldn't spam toasts —
      // the next tick just tries again.
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!liveDetect) return;
    const interval = setInterval(runLiveDetectTick, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDetect]);

  const toggleLiveDetect = () => {
    setLiveDetect((prev) => {
      const next = !prev;
      liveDetectRef.current = next;
      if (next) {
        // Best-effort: a missing location still alerts the owner, it just
        // can't say where. Never block detection on the permission prompt.
        navigator.geolocation?.getCurrentPosition(
          (pos) => { geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
          () => { geoRef.current = null; }
        );
      } else {
        setLiveText("");
        setLiveMatch(null);
        clearOverlay();
      }
      return next;
    });
  };

  return (
    <div className="adm-camera-tile">
      <div className="adm-camera-tile-head">
        <span>{slot.label}</span>
        <button className="delete-btn" onClick={() => { stop(); onRemove(); }}>Remove</button>
      </div>
      <div className="adm-camera-video-wrap">
        <video ref={videoRef} className="adm-camera-video" muted playsInline />
        <canvas ref={overlayRef} className="adm-camera-overlay" />
      </div>
      {liveDetect && (
        <p className={`adm-camera-live-text ${liveMatch?.stolen ? "adm-camera-live-stolen" : ""}`}>
          {liveMatch?.stolen
            ? `🚨 STOLEN — ${liveMatch.plateNumber} · owner alerted`
            : liveText
              ? `Detected: ${liveText}${liveMatch ? ` · registered (${liveMatch.plateNumber})` : ""}`
              : "Watching for a plate..."}
        </p>
      )}
      <div className="adm-camera-actions">
        {!active ? (
          <button className="add-btn" onClick={start}>Start</button>
        ) : (
          <>
            <button className={`add-btn ${liveDetect ? "adm-live-on" : ""}`} onClick={toggleLiveDetect}>
              {liveDetect ? "Live Detect: On" : "Live Detect: Off"}
            </button>
            <button className="add-btn" onClick={captureAndScan} disabled={scanning}>
              {scanning ? "Scanning..." : "Capture & Scan"}
            </button>
            <button className="delete-btn" onClick={stop}>Stop</button>
          </>
        )}
      </div>
    </div>
  );
}

function statusBadge(camera: { lastStatus: "never" | "ok" | "error"; lastPolledAt: string | null; lastError: string }) {
  if (camera.lastStatus === "never") {
    return <span className="role-badge status-pending">not scanned yet</span>;
  }
  const when = camera.lastPolledAt ? new Date(camera.lastPolledAt).toLocaleTimeString() : "";
  if (camera.lastStatus === "ok") {
    return <span className="role-badge status-active" title={`Last auto-scan at ${when}`}>auto-scan ok · {when}</span>;
  }
  return <span className="role-badge status-cancelled" title={camera.lastError}>auto-scan error · {when}</span>;
}

interface CameraRecordForTile {
  _id: string;
  label: string;
  streamUrl: string;
  location: { lat: number | null; lng: number | null };
  active: boolean;
  tiledScan: boolean;
  pollIntervalSec: number;
  lastPolledAt: string | null;
  lastStatus: "never" | "ok" | "error";
  lastError: string;
}

function RemoteCameraTile({
  camera,
  scanning,
  onRemove,
  onToggleActive,
  onToggleTiled,
  onScan,
}: {
  camera: CameraRecordForTile;
  scanning: boolean;
  onRemove: () => void;
  onToggleActive: () => void;
  onToggleTiled: () => void;
  onScan: (blob: Blob, filename: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inFlightRef = useRef(false);
  const liveDetectRef = useRef(false);
  const [viewing, setViewing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [src, setSrc] = useState("");
  const [liveDetect, setLiveDetect] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveMatch, setLiveMatch] = useState<{ plateNumber: string; stolen: boolean } | null>(null);

  const startViewing = () => {
    setErrored(false);
    // Cache-bust so a previously-broken connection gets a fresh attempt
    // instead of reusing a stalled response.
    setSrc(`${camera.streamUrl}${camera.streamUrl.includes("?") ? "&" : "?"}_=${Date.now()}`);
    setViewing(true);
  };

  const clearOverlay = () => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopLiveDetect = () => {
    liveDetectRef.current = false;
    setLiveDetect(false);
    setLiveText("");
    setLiveMatch(null);
    clearOverlay();
  };

  const stopViewing = () => {
    stopLiveDetect();
    setViewing(false);
    setSrc("");
  };

  // Unmount cleanup only: drop the stream and stop the detect loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopViewing(), []);

  // The server reads the frame and returns box coordinates in the *source*
  // frame's pixels, so scale them onto however large the <img> is rendered.
  // Drawing over a cross-origin image is allowed; only reading it back isn't,
  // which is why this detection path never touches the pixels.
  const drawBox = (
    box: { x: number; y: number; width: number; height: number; confidence: number },
    frame: { width: number; height: number } | null,
    label: string,
    stolen: boolean
  ) => {
    const img = imgRef.current;
    const canvas = overlayRef.current;
    if (!img || !canvas || !frame) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / frame.width;
    const sy = canvas.height / frame.height;
    const left = (box.x - box.width / 2) * sx;
    const top = (box.y - box.height / 2) * sy;
    const w = box.width * sx;
    const h = box.height * sy;

    const color = stolen ? "#ef4444" : "#22c55e";
    ctx.strokeStyle = color;
    ctx.lineWidth = stolen ? 4 : 3;
    ctx.strokeRect(left, top, w, h);

    const text = stolen ? `${label} — STOLEN` : label;
    ctx.font = "600 14px sans-serif";
    const textWidth = ctx.measureText(text).width + 10;
    const labelTop = top > 24 ? top - 24 : top + h;
    ctx.fillStyle = color;
    ctx.fillRect(left, labelTop, textWidth, 24);
    ctx.fillStyle = "#0b0c14";
    ctx.fillText(text, left + 5, labelTop + 17);
  };

  const runLiveDetectTick = async () => {
    if (inFlightRef.current || !liveDetectRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await api.post(`/cctv/cameras/${camera._id}/detect-preview`);
      if (!liveDetectRef.current) return; // stopped while this request was in flight
      if (res.data.detected && res.data.box) {
        const label = res.data.text || "plate";
        const stolen = Boolean(res.data.match?.stolen);
        setLiveText(label);
        setLiveMatch(res.data.match ?? null);
        drawBox(res.data.box, res.data.frame, label, stolen);
      } else {
        setLiveText("");
        setLiveMatch(null);
        clearOverlay();
      }
    } catch {
      // A tight polling loop shouldn't spam toasts on a transient failure —
      // the next tick just tries again.
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!liveDetect) return;
    const interval = setInterval(runLiveDetectTick, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDetect]);

  const toggleLiveDetect = () => {
    if (liveDetect) {
      stopLiveDetect();
      return;
    }
    liveDetectRef.current = true;
    setLiveDetect(true);
  };

  const captureAndScan = () => {
    const img = imgRef.current;
    if (!img || !viewing) return;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) onScan(blob, `${camera.label}.png`);
        else toast.error("Capture failed — the camera server may be blocking cross-origin access (CORS)");
      }, "image/png");
    } catch {
      toast.error("Capture failed — the camera server may be blocking cross-origin access (CORS)");
    }
  };

  return (
    <div className="adm-camera-tile">
      <div className="adm-camera-tile-head">
        <span>{camera.label} <em className="adm-camera-remote-badge">remote</em></span>
        <button className="delete-btn" onClick={() => { stopViewing(); onRemove(); }}>Remove</button>
      </div>
      <div className="adm-camera-status-row">
        {statusBadge(camera)}
        <button className="adm-camera-toggle" onClick={onToggleActive}>
          {camera.active ? "Pause auto-scan" : "Resume auto-scan"}
        </button>
        <button
          className={`adm-camera-toggle ${camera.tiledScan ? "adm-live-on" : ""}`}
          onClick={onToggleTiled}
          title="Also scan four overlapping tiles of each frame — finds small or distant plates a single pass misses and localizes plates more tightly, at roughly 1.6x the scan time"
        >
          {camera.tiledScan ? "Tiled scan: on" : "Tiled scan: off"}
        </button>
      </div>
      {camera.location.lat != null && camera.location.lng != null && (
        <p className="adm-camera-location">
          📍 {camera.location.lat.toFixed(5)}, {camera.location.lng.toFixed(5)}
        </p>
      )}
      {viewing ? (
        errored ? (
          <div className="adm-camera-video adm-camera-video-error">
            Couldn't load stream from {camera.streamUrl} — the camera likely doesn't send CORS headers.
            Live Detect still works: the server reads the frames.
          </div>
        ) : (
          <div className="adm-camera-video-wrap">
            <img
              ref={imgRef}
              src={src}
              crossOrigin="anonymous"
              className="adm-camera-video"
              onError={() => setErrored(true)}
              alt={`${camera.label} live feed`}
            />
            <canvas ref={overlayRef} className="adm-camera-overlay" />
          </div>
        )
      ) : (
        <div className="adm-camera-video adm-camera-video-idle" />
      )}
      {liveDetect && (
        <p className={`adm-camera-live-text ${liveMatch?.stolen ? "adm-camera-live-stolen" : ""}`}>
          {liveMatch?.stolen
            ? `🚨 STOLEN — ${liveMatch.plateNumber} · owner alerted`
            : liveText
              ? `Detected: ${liveText}${liveMatch ? ` · registered to ${liveMatch.plateNumber}` : ""}`
              : "Watching for a plate..."}
        </p>
      )}
      <div className="adm-camera-actions">
        {/* Live Detect is deliberately not gated on "View Live": the server
            fetches the frames, so it works even when the browser can't
            display the stream because of CORS. */}
        <button
          className={`add-btn ${liveDetect ? "adm-live-on" : ""}`}
          onClick={toggleLiveDetect}
          title="Server-side plate detection every 1.5s. A stolen match alerts the owner and is logged as a sighting."
        >
          {liveDetect ? "Live Detect: On" : "Live Detect: Off"}
        </button>
        {!viewing ? (
          <button className="add-btn" onClick={startViewing}>View Live</button>
        ) : (
          <>
            <button className="add-btn" onClick={captureAndScan} disabled={scanning || errored}>
              {scanning ? "Scanning..." : "Capture & Scan Now"}
            </button>
            <button className="delete-btn" onClick={stopViewing}>Stop Viewing</button>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminCctvPage;
