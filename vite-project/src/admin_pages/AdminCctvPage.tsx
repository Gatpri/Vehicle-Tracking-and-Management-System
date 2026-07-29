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
  matchedVehicle: { plateNumber: string; make: string; model: string } | null;
  matchedStolen: boolean;
  cameraId: string;
  createdAt: string;
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

  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();

    const socket = getSocket();
    const onSighting = (s: Sighting) => {
      setAlertBanner(s);
      toast.error("Stolen vehicle detected on camera!");
    };
    socket.on("theft:sighting", onSighting);
    return () => {
      socket.off("theft:sighting", onSighting);
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  // Release the webcam whenever the page unmounts — otherwise the camera
  // stays "on" (and the browser tab keeps showing the recording indicator)
  // even after the admin is done testing.
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera access isn't available in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      toast.error("Couldn't access the camera — check browser/OS permissions");
    }
  };

  const submitImage = async (blob: Blob, filename: string) => {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("image", blob, filename);
      if (cameraId) formData.append("cameraId", cameraId);
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

  // Grabs whatever the video element is showing right now, draws it onto an
  // off-screen canvas, and sends that frame through the exact same
  // /cctv/scan endpoint the file-upload path uses — same OCR pipeline
  // either way, so this is a stand-in for a real camera feed until the
  // trained detection model is wired in.
  const captureAndScan = () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) submitImage(blob, "capture.png");
    }, "image/png");
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
          onClick={() => { stopCamera(); setMode("upload"); }}
        >
          Upload Image
        </button>
        <button
          className={`adm-mode-tab ${mode === "camera" ? "active" : ""}`}
          onClick={() => setMode("camera")}
        >
          Live Camera
        </button>
      </div>

      <div className="adm-field">
        <label htmlFor="cameraId">Camera ID (optional)</label>
        <input id="cameraId" placeholder="e.g. laptop-webcam" value={cameraId} onChange={(e) => setCameraId(e.target.value)} />
      </div>

      {mode === "upload" ? (
        <form className="adm-upload-box" onSubmit={handleUploadScan}>
          <p>Upload a camera frame to run real OCR plate recognition</p>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="add-btn" type="submit" disabled={scanning} style={{ marginTop: 14 }}>
            {scanning ? "Scanning..." : "Scan Image"}
          </button>
        </form>
      ) : (
        <div className="adm-camera-box">
          <video ref={videoRef} className="adm-camera-video" muted playsInline />
          <div className="adm-camera-actions">
            {!cameraActive ? (
              <button className="add-btn" onClick={startCamera}>Start Camera</button>
            ) : (
              <>
                <button className="add-btn" onClick={captureAndScan} disabled={scanning}>
                  {scanning ? "Scanning..." : "Capture & Scan"}
                </button>
                <button className="delete-btn" onClick={stopCamera}>Stop Camera</button>
              </>
            )}
          </div>
          <p className="adm-camera-hint">
            Uses your laptop's webcam for now — swap this out once the trained plate-detection model is ready.
          </p>
        </div>
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
          <thead><tr><th>Camera</th><th>Recognized Text</th><th>Confidence</th><th>Matched Vehicle</th><th>Stolen?</th><th>Time</th></tr></thead>
          <tbody>
            {sightings.map((s) => (
              <tr key={s._id}>
                <td>{s.cameraId}</td>
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

export default AdminCctvPage;
