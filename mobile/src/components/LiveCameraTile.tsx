import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as Location from "expo-location";
import api from "../lib/api";
import { Button } from "./ui";
import { colors, radius, spacing } from "../theme";
import type { DetectedPlate } from "../lib/types";

/**
 * One live camera feed with plate detection running over it — the phone's
 * equivalent of the web CameraTile in AdminCctvPage.tsx.
 *
 * The web tile grabs frames off a <video> into a <canvas> and posts the blob.
 * React Native has neither, so the frame comes from CameraView.takePictureAsync
 * instead. Everything downstream is deliberately identical: the same
 * /cctv/detect-preview endpoint, the same 1.5s cadence, the same in-flight
 * guard, and the same "boxes over the feed" result — so a plate read on a
 * laptop and on a phone are the same detection, not two implementations that
 * drifted.
 *
 * The overlay is absolutely-positioned Views rather than canvas strokes. Box
 * coordinates come back in the captured frame's pixel space, so they are
 * scaled to the on-screen preview size before being drawn.
 */

/** Matches the web tile's interval — fast enough to feel live, slow enough
 *  that two YOLO stages on the sidecar keep up. */
const TICK_MS = 1500;

/** Frames are downscaled before upload: a full-resolution phone photo is
 *  several megabytes, which a 1.5s loop cannot move over wifi. */
const CAPTURE_QUALITY = 0.5;

export function LiveCameraTile({
  label,
  facing = "back",
  onRemove,
  onSighting,
}: {
  label: string;
  facing?: CameraType;
  onRemove: () => void;
  onSighting?: () => void;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [liveDetect, setLiveDetect] = useState(false);
  const [plates, setPlates] = useState<DetectedPlate[]>([]);
  const [match, setMatch] = useState<{ plateNumber: string; stolen: boolean } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // The interval closure reads these refs rather than state: state captured at
  // interval-creation time would be stale, and the in-flight flag must be
  // synchronous so a slow response cannot stack overlapping requests.
  const liveDetectRef = useRef(false);
  const inFlightRef = useRef(false);
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);
  // Natural size of the captured frame, needed to map box coords onto the
  // preview, plus the preview's own measured size.
  const frameSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const clear = () => {
    setPlates([]);
    setMatch(null);
    setText("");
  };

  const stop = () => {
    setActive(false);
    setLiveDetect(false);
    liveDetectRef.current = false;
    clear();
  };

  // Stop detecting when the tile goes away, otherwise the interval keeps
  // firing requests for a camera nobody is looking at.
  useEffect(() => () => { liveDetectRef.current = false; }, []);

  const start = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setActive(true);
  };

  /** A JPEG of the current frame, as multipart form data. */
  const grabFrame = async (): Promise<FormData | null> => {
    const cam = cameraRef.current;
    if (!cam) return null;
    const photo = await cam.takePictureAsync({
      quality: CAPTURE_QUALITY,
      // The bytes go straight to the server; skipping base64 keeps a big
      // string off the JS thread every tick.
      base64: false,
      // No shutter animation/sound on a background polling loop.
      shutterSound: false,
      // Deliberately NOT skipProcessing. It is the faster path, but on Android
      // it returns the sensor's raw orientation — several Samsung and Sony
      // devices hand back a frame rotated 90/180/270 degrees. That would feed
      // the detector a sideways plate and put every box in the wrong place,
      // which costs far more than the processing it saves.
      skipProcessing: false,
    });
    if (!photo?.uri) return null;
    if (photo.width && photo.height) {
      frameSizeRef.current = { width: photo.width, height: photo.height };
    }
    const form = new FormData();
    form.append("image", {
      uri: photo.uri,
      name: "preview.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
    return form;
  };

  const runTick = async () => {
    if (inFlightRef.current || !liveDetectRef.current) return;
    inFlightRef.current = true;
    try {
      const form = await grabFrame();
      if (!form) return;
      // Identifies the sighting if this frame holds a stolen plate, and tells
      // the owner where their vehicle was seen.
      form.append("cameraId", label);
      const here = geoRef.current;
      if (here) {
        form.append("lat", String(here.lat));
        form.append("lng", String(here.lng));
      }

      const res = await api.post("/cctv/detect-preview", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });

      // The loop may have been switched off while this was in flight.
      if (!liveDetectRef.current) return;

      if (!res.data.detected) {
        clear();
        return;
      }

      setText(res.data.text || "");
      setMatch(res.data.match ?? null);
      // A full-frame fallback read has text but no box; it is still a real
      // detection, so it is shown with box: null and simply not outlined.
      const found: DetectedPlate[] = res.data.plates?.length
        ? res.data.plates
        : res.data.cropImage || res.data.box
          ? [{
              box: res.data.box ?? null,
              text: res.data.text || "",
              textConfidence: res.data.textConfidence ?? 0,
              cropImage: res.data.cropImage ?? null,
            }]
          : [];
      setPlates(found);
      if (res.data.match?.stolen) onSighting?.();
    } catch {
      // Transient failures in a fast polling loop are not worth alerting on —
      // the next tick tries again.
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!liveDetect) return;
    const id = setInterval(runTick, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDetect]);

  const toggleLiveDetect = async () => {
    const next = !liveDetect;
    setLiveDetect(next);
    liveDetectRef.current = next;
    if (!next) {
      clear();
      return;
    }
    // Best-effort: a missing location still raises the alert, it just cannot
    // say where. Detection is never blocked on the permission prompt.
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({});
        geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      geoRef.current = null;
    }
  };

  /** One-off scan that records a sighting, as opposed to the preview loop. */
  const scanOnce = async () => {
    setBusy(true);
    try {
      const form = await grabFrame();
      if (!form) return;
      form.append("cameraId", label);
      await api.post("/cctv/scan", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      onSighting?.();
    } catch {
      // Surfaced by the caller's own list refresh; a failed manual scan is
      // retried by pressing the button again.
    } finally {
      setBusy(false);
    }
  };

  // Box coords are in captured-frame pixels; the preview is a different size,
  // so scale before drawing. The preview fills the tile, so the larger of the
  // two ratios is the one actually applied, with the overflow centred.
  const boxStyle = (box: NonNullable<DetectedPlate["box"]>) => {
    const frame = frameSizeRef.current;
    if (!frame || !previewSize.width || !previewSize.height) return null;
    const scale = Math.max(previewSize.width / frame.width, previewSize.height / frame.height);
    const offsetX = (previewSize.width - frame.width * scale) / 2;
    const offsetY = (previewSize.height - frame.height * scale) / 2;
    return {
      left: (box.x - box.width / 2) * scale + offsetX,
      top: (box.y - box.height / 2) * scale + offsetY,
      width: box.width * scale,
      height: box.height * scale,
    };
  };

  const stolenText = match?.stolen ? text : undefined;

  return (
    <View style={styles.tile}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.remove} onPress={() => { stop(); onRemove(); }}>Remove</Text>
      </View>

      <View
        style={styles.videoWrap}
        onLayout={(e) => setPreviewSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        {active ? (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
            {plates.map((p, i) => {
              if (!p.box) return null;
              const pos = boxStyle(p.box);
              if (!pos) return null;
              // Only the plate that actually matched a stolen vehicle turns
              // red; others in the same frame stay green.
              const stolen = Boolean(stolenText) && p.text === stolenText;
              const color = stolen ? colors.red500 : colors.green500;
              return (
                <View key={`${p.text}-${i}`} style={[styles.box, pos, { borderColor: color }]}>
                  <Text style={[styles.boxLabel, { backgroundColor: color }]} numberOfLines={1}>
                    {stolen
                      ? `${p.text} — STOLEN`
                      : `${p.text || "plate"} (${p.box.confidence.toFixed(0)}%)`}
                  </Text>
                </View>
              );
            })}
            {liveDetect ? (
              <View style={styles.liveBadge}>
                <ActivityIndicator size="small" color={colors.bg} />
                <Text style={styles.liveBadgeText}>Detecting</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Camera off</Text>
          </View>
        )}
      </View>

      {/* Every plate located in this frame, blown up under the feed, so several
          vehicles at once each get their own readable panel. */}
      {liveDetect && plates.some((p) => p.cropImage) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pops}>
          {plates.filter((p) => p.cropImage).map((p, i) => {
            const stolen = Boolean(stolenText) && p.text === stolenText;
            return (
              <View key={`${p.text}-pop-${i}`} style={[styles.pop, stolen && styles.popStolen]}>
                <Image source={{ uri: p.cropImage as string }} style={styles.popImage} />
                <Text style={styles.popText}>{p.text || "—"}</Text>
                <Text style={styles.popMeta}>{`${(p.textConfidence * 100).toFixed(0)}%`}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {match?.stolen ? (
        <View style={styles.alert}>
          <Text style={styles.alertText}>{`Stolen vehicle detected — ${match.plateNumber}`}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {active ? (
          <>
            <Button
              title={liveDetect ? "Stop live detect" : "Live detect"}
              onPress={toggleLiveDetect}
              variant={liveDetect ? "danger" : "primary"}
            />
            <Button title="Scan now" onPress={scanOnce} loading={busy} variant="ghost" />
            <Button title="Stop" onPress={stop} variant="outline" />
          </>
        ) : (
          <Button title="Start camera" onPress={start} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.slate100,
  },
  label: { fontWeight: "700", color: colors.navy900 },
  remove: { color: colors.red500, fontWeight: "600" },
  videoWrap: { height: 220, backgroundColor: colors.navy950 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.slate400 },
  box: { position: "absolute", borderWidth: 2, borderRadius: 2 },
  boxLabel: {
    position: "absolute",
    top: -20,
    left: -2,
    color: colors.navy950,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: "hidden",
  },
  liveBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(15,30,58,0.75)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  liveBadgeText: { color: colors.bg, fontSize: 11, fontWeight: "600" },
  pops: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pop: {
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    padding: spacing.xs,
    alignItems: "center",
    minWidth: 110,
  },
  popStolen: { borderColor: colors.red500, borderWidth: 2 },
  popImage: { width: 100, height: 40, borderRadius: 2, backgroundColor: colors.slate100 },
  popText: { fontWeight: "800", color: colors.navy900, letterSpacing: 1, marginTop: 2 },
  popMeta: { fontSize: 11, color: colors.slate600 },
  alert: {
    backgroundColor: colors.red500,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  alertText: { color: colors.bg, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
});
