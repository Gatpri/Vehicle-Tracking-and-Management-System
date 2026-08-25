import { useCallback, useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { getSocket } from "../../src/lib/socket";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { LiveCameraTile } from "../../src/components/LiveCameraTile";
import { Badge, Button, Card, Field, Heading, Muted, Row } from "../../src/components/ui";
import { colors, radius, spacing } from "../../src/theme";
import { formatDateTime, vehicleLabel, type Camera, type CameraSighting } from "../../src/lib/types";

/**
 * The mobile CCTV screen — the same three jobs as the web AdminCctvPage:
 * watch a live feed with detection running, manage the camera registry, and
 * read the sightings log.
 *
 * Where the web page enumerates the desktop's USB webcams with
 * navigator.mediaDevices, this picks between the phone's own back and front
 * cameras — that is what "device selection" means on a handset. Registered
 * remote cameras (the IP/RTSP ones the backend auto-polls) are listed and can
 * be added here too, so a phone in the field can commission a camera without
 * finding a laptop.
 *
 * Endpoints are unchanged: /cctv/scan, /cctv/detect-preview and /cameras are
 * exactly what the web client calls.
 */

type Mode = "sightings" | "live" | "cameras";

/** A live tile bound to one of the phone's physical cameras. Local-only and
 *  never persisted — it matches the web page's DeviceSlot, which exists only
 *  while the tab is open, because there is no fixed address to poll. */
interface DeviceSlot {
  id: string;
  label: string;
  facing: "back" | "front";
}

export default function AdminCctvScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<Mode>("sightings");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ plate?: string; confidence?: number; image?: string } | null>(null);

  const [slots, setSlots] = useState<DeviceSlot[]>([]);
  const [nextFacing, setNextFacing] = useState<"back" | "front">("back");

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [savingCamera, setSavingCamera] = useState(false);

  const canSubmit = hasPermission(user?.role, "cctv:submit", user?.permissions ?? []);
  const canManage = hasPermission(user?.role, "cctv:manage", user?.permissions ?? []);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const socket = getSocket();
    // A sighting of a flagged vehicle is exactly what this screen exists for.
    socket.on("theft:sighting", bump);
    return () => {
      socket.off("theft:sighting", bump);
    };
  }, [bump]);

  const loadCameras = useCallback(async () => {
    try {
      const res = await api.get("/cameras");
      setCameras(res.data.cameras ?? []);
    } catch {
      // The registry is secondary to the live feed; a failure here should not
      // take the screen down.
    }
  }, []);

  useEffect(() => {
    if (mode !== "cameras") return;
    loadCameras();
    // While the registry is on screen, keep the auto-poll status fresh — it is
    // the visible proof detection keeps running with nobody touching it.
    const id = setInterval(loadCameras, 5000);
    return () => clearInterval(id);
  }, [mode, loadCameras]);

  const addSlot = () => {
    const label = `phone-${nextFacing}-${slots.length + 1}`;
    setSlots((prev) => [...prev, { id: `${Date.now()}`, label, facing: nextFacing }]);
    setMode("live");
  };

  const addCamera = async () => {
    const label = newLabel.trim();
    const streamUrl = newUrl.trim();
    if (!label) {
      Alert.alert("Label needed", "Give the camera a name.");
      return;
    }
    if (!streamUrl) {
      Alert.alert("Stream URL needed", "A remote camera needs the URL the backend can poll.");
      return;
    }
    setSavingCamera(true);
    try {
      await api.post("/cameras", { label, sourceType: "remote", streamUrl });
      setNewLabel("");
      setNewUrl("");
      loadCameras();
    } catch (err) {
      Alert.alert("Could not add camera", getErrorMessage(err, "The camera was not saved."));
    } finally {
      setSavingCamera(false);
    }
  };

  const removeCamera = (id: string, label: string) => {
    Alert.alert("Remove camera", `Stop polling ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/cameras/${id}`);
            loadCameras();
          } catch (err) {
            Alert.alert("Could not remove", getErrorMessage(err, "The camera is still registered."));
          }
        },
      },
    ]);
  };

  /** Photograph a plate from the library/camera roll flow — kept from the
   *  original screen for the case where the plate is already a photo. */
  const scanFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera needed", "Allow camera access to photograph a plate.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setScanning(true);
      setLastScan(null);

      const formData = new FormData();
      formData.append("image", {
        uri: asset.uri,
        name: asset.fileName || "plate.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);

      const res = await api.post("/cctv/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        // Plate recognition runs two YOLO stages on the sidecar, which takes
        // noticeably longer than a normal request.
        timeout: 60000,
      });

      setLastScan({
        plate: res.data.sighting?.recognizedPlateText,
        confidence: res.data.sighting?.confidence,
        image: asset.uri,
      });
      bump();
    } catch (err) {
      Alert.alert("Scan failed", getErrorMessage(err, "Could not read that plate."));
    } finally {
      setScanning(false);
    }
  };

  const tabs = (
    <View style={styles.tabs}>
      {(["sightings", "live", "cameras"] as Mode[]).map((m) => (
        <Text
          key={m}
          onPress={() => setMode(m)}
          style={[styles.tab, mode === m && styles.tabOn]}
        >
          {m === "sightings" ? "Sightings" : m === "live" ? "Live" : "Cameras"}
        </Text>
      ))}
    </View>
  );

  const header = (
    <View>
      {tabs}

      {mode === "live" && canSubmit ? (
        <Card>
          <Heading level={2}>Live detection</Heading>
          <Muted>
            Point the phone at traffic and the recogniser reads plates as they pass. A stolen
            match raises the same alert the desk cameras do.
          </Muted>

          <View style={styles.facingRow}>
            <Button
              title="Back camera"
              variant={nextFacing === "back" ? "primary" : "outline"}
              small
              onPress={() => setNextFacing("back")}
            />
            <Button
              title="Front camera"
              variant={nextFacing === "front" ? "primary" : "outline"}
              small
              onPress={() => setNextFacing("front")}
            />
          </View>
          <Button title="Add camera tile" onPress={addSlot} />

          <View style={styles.tiles}>
            {slots.map((slot) => (
              <LiveCameraTile
                key={slot.id}
                label={slot.label}
                facing={slot.facing}
                onRemove={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
                onSighting={bump}
              />
            ))}
            {slots.length === 0 ? (
              <Muted>No live tiles yet — pick a camera and add one.</Muted>
            ) : null}
          </View>
        </Card>
      ) : null}

      {mode === "cameras" ? (
        <Card>
          <Heading level={2}>Registered cameras</Heading>
          <Muted>
            Remote cameras the backend polls on its own. Unlike a phone tile, these keep
            watching when nobody has the app open.
          </Muted>

          {cameras.map((c) => (
            <View key={c._id} style={styles.cameraRow}>
              <View style={styles.cameraInfo}>
                <Text style={styles.cameraLabel}>{c.label}</Text>
                <Muted>{c.streamUrl || c.sourceType}</Muted>
                <Text
                  style={[
                    styles.cameraStatus,
                    c.lastStatus === "ok" && { color: colors.green500 },
                    c.lastStatus === "error" && { color: colors.red500 },
                  ]}
                >
                  {c.lastStatus === "never"
                    ? "Not polled yet"
                    : c.lastStatus === "ok"
                      ? `OK · ${formatDateTime(c.lastPolledAt ?? undefined)}`
                      : `Error · ${c.lastError || "poll failed"}`}
                </Text>
              </View>
              {canManage ? (
                <Button title="Remove" variant="danger" small onPress={() => removeCamera(c._id, c.label)} />
              ) : null}
            </View>
          ))}
          {cameras.length === 0 ? <Muted>No remote cameras registered.</Muted> : null}

          {canManage ? (
            <View style={styles.addBox}>
              <Heading level={3}>Add a remote camera</Heading>
              <Field label="Label" value={newLabel} onChangeText={setNewLabel} placeholder="north-gate" />
              <Field
                label="Stream URL"
                value={newUrl}
                onChangeText={setNewUrl}
                placeholder="http://192.168.1.50/snapshot.jpg"
                autoCapitalize="none"
              />
              <Button title="Add camera" onPress={addCamera} loading={savingCamera} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {mode === "sightings" && canSubmit ? (
        <Card>
          <Heading level={2}>Scan a plate</Heading>
          <Muted>Photograph a number plate and the recogniser will read it.</Muted>

          {lastScan ? (
            <View style={styles.result}>
              {lastScan.image ? <Image source={{ uri: lastScan.image }} style={styles.preview} /> : null}
              <Text style={styles.plate}>{lastScan.plate || "No plate found"}</Text>
              {typeof lastScan.confidence === "number" ? (
                <Muted>{`Confidence ${(lastScan.confidence * 100).toFixed(0)}%`}</Muted>
              ) : null}
            </View>
          ) : null}

          <Button title="Take a photo" onPress={scanFromCamera} loading={scanning} />
        </Card>
      ) : null}
    </View>
  );

  return (
    <AdminList<CameraSighting>
      title="CCTV"
      subtitle={mode === "sightings" ? "Plates the cameras have read, newest first." : undefined}
      // The fetch always runs: useApi leaves `loading` true for a null path,
      // which would hide the Live and Cameras tabs behind a permanent spinner.
      // The rows are filtered out below instead, which costs one cached
      // request and keeps the tab switch instant.
      path="/cctv/sightings"
      select={(d) => d.sightings ?? []}
      keyExtractor={(s) => s._id}
      emptyMessage={mode === "sightings" ? "No sightings recorded yet." : ""}
      refreshKey={refreshKey}
      header={header}
      renderItem={(s) =>
        mode !== "sightings" ? null : (
        <ListRow
          title={s.recognizedPlateText || "Unreadable plate"}
          subtitle={s.cameraId}
          trailing={
            s.matchedStolen ? (
              <Badge status="stolen" />
            ) : typeof s.confidence === "number" ? (
              <Badge status={s.confidence >= 0.8 ? "confident" : "uncertain"} />
            ) : undefined
          }
        >
          <Row label="Seen" value={formatDateTime(s.createdAt)} />
          {s.matchedVehicle ? <Row label="Vehicle" value={vehicleLabel(s.matchedVehicle)} /> : null}
          {typeof s.confidence === "number" ? (
            <Row label="Confidence" value={`${(s.confidence * 100).toFixed(0)}%`} />
          ) : null}
          {s.imageUrl ? <Image source={{ uri: s.imageUrl }} style={styles.thumb} /> : null}
        </ListRow>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.slate100,
    color: colors.slate600,
    fontWeight: "600",
    overflow: "hidden",
  },
  tabOn: { backgroundColor: colors.navy900, color: colors.bg },
  facingRow: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.sm },
  tiles: { marginTop: spacing.md },
  cameraRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  cameraInfo: { flex: 1 },
  cameraLabel: { fontWeight: "700", color: colors.navy900 },
  cameraStatus: { fontSize: 12, color: colors.slate600, marginTop: 2 },
  addBox: { marginTop: spacing.md, gap: spacing.sm },
  result: { alignItems: "center", gap: spacing.sm, marginVertical: spacing.md },
  preview: { width: "100%", height: 160, borderRadius: radius.sm, backgroundColor: colors.slate100 },
  plate: { fontSize: 22, fontWeight: "800", color: colors.navy900, letterSpacing: 1 },
  thumb: { width: "100%", height: 140, borderRadius: radius.sm, backgroundColor: colors.slate100, marginTop: spacing.md },
});
