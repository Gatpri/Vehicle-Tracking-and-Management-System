import Camera from "../models/Camera.js";
import { fetchFrame } from "./frameFetcherService.js";
import { processFrame } from "../controllers/cctvController.js";

const TICK_MS = 5000;
let intervalHandle = null;
// Tracks cameras currently mid-poll so a slow/hanging camera can't stack up
// duplicate requests to itself on subsequent ticks.
const inFlight = new Set();

const pollCamera = async (camera) => {
  if (inFlight.has(camera.id)) return;
  inFlight.add(camera.id);
  try {
    const frame = await fetchFrame(camera.streamUrl);
    await processFrame({
      buffer: frame,
      cameraId: camera.label,
      location: camera.location,
      tiles: camera.tiledScan,
    });
    await Camera.findByIdAndUpdate(camera._id, {
      lastPolledAt: new Date(),
      lastStatus: "ok",
      lastError: "",
    });
  } catch (err) {
    await Camera.findByIdAndUpdate(camera._id, {
      lastPolledAt: new Date(),
      lastStatus: "error",
      lastError: err.message,
    });
  } finally {
    inFlight.delete(camera.id);
  }
};

const tick = async () => {
  const cameras = await Camera.find({ sourceType: "remote", active: true, streamUrl: { $ne: "" } });
  const now = Date.now();
  for (const camera of cameras) {
    const dueAt = camera.lastPolledAt ? camera.lastPolledAt.getTime() + camera.pollIntervalSec * 1000 : 0;
    if (now >= dueAt) {
      // Fire-and-forget: a slow camera shouldn't delay every other camera's
      // poll on this tick.
      pollCamera(camera);
    }
  }
};

export const startCameraPoller = () => {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("Camera poller tick failed:", err.message));
  }, TICK_MS);
  console.log("Camera poller started");
};

export const stopCameraPoller = () => {
  clearInterval(intervalHandle);
  intervalHandle = null;
};
