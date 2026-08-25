import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { Screen, Card, Heading, Muted, Button, Badge, Field, Loading, ErrorNote, Row } from "../../../src/components/ui";
import { colors, radius, spacing } from "../../../src/theme";
import {
  PhotoSlotGrid,
  choosePhoto,
  PLATE_ANGLES,
  VEHICLE_ANGLES,
  type PickedPhoto,
  type PlateAngle,
  type VehicleAngle,
} from "../../../src/components/VehiclePhotoPicker";
import { vehicleLabel, type Vehicle } from "../../../src/lib/types";

/**
 * Ported from the web app's VehicleDetailPage.tsx.
 *
 * Photos are the interesting part. They are captured per angle — two for the
 * plate, four for the vehicle — so each slot is replaced rather than appended
 * to, and a half-finished set shows which side is still missing.
 *
 * The upload is multipart as before, with an added "angle" part telling the
 * backend which slot the file belongs in.
 */
export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useApi<Vehicle | null>(
    id ? `/vehicles/${id}` : null,
    (d) => d.vehicle ?? null,
    "Could not load this vehicle."
  );

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", color: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const beginEdit = () => {
    setForm({ make: data?.make ?? "", model: data?.model ?? "", color: data?.color ?? "" });
    setEditing(true);
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await api.patch(`/vehicles/${id}`, form);
      setData(res.data.vehicle);
      setEditing(false);
    } catch (err) {
      Alert.alert("Could not save", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  /** Turns the stored [{url, angle}] list into the {angle: url} the grid wants. */
  const byAngle = <T extends string>(list?: { url: string; angle: string }[]) =>
    Object.fromEntries((list ?? []).map((p) => [p.angle, p.url])) as Partial<Record<T, string>>;

  const upload = async (kind: "plate" | "vehicle", angle: string, photo: PickedPhoto) => {
    setBusy(`${kind}:${angle}`);
    try {
      const body = new FormData();
      // RN's FormData takes this {uri, name, type} shape rather than a File.
      body.append("image", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
      body.append("kind", kind);
      // The angle makes this a slot: re-shooting "front" replaces the front
      // photo rather than appending a second one.
      body.append("angle", angle);
      const res = await api.post(`/vehicles/${id}/photos`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setData(res.data.vehicle);
    } catch (err) {
      Alert.alert("Upload failed", getErrorMessage(err, "Could not save that photo."));
    } finally {
      setBusy(null);
    }
  };

  const clearSlot = (kind: "plate" | "vehicle", angle: string) => {
    const list = kind === "plate" ? data?.plateImages : data?.vehicleImages;
    const hit = (list ?? []).find((p) => p.angle === angle);
    if (hit) removePhoto(hit.url, kind);
  };

  const removePhoto = (url: string, kind: "vehicle" | "plate") => {
    Alert.alert("Remove this photo?", undefined, [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await api.delete(`/vehicles/${id}/photos`, { data: { url, kind } });
            setData(res.data.vehicle);
          } catch (err) {
            Alert.alert("Could not remove", getErrorMessage(err, "Please try again."));
          }
        },
      },
    ]);
  };

  const deleteVehicle = () => {
    Alert.alert("Delete this vehicle?", "This cannot be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vehicles/${id}`);
            router.replace("/(customer)/vehicles");
          } catch (err) {
            Alert.alert("Could not delete", getErrorMessage(err, "Please try again."));
          }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Loading vehicle…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <ErrorNote message="This vehicle could not be found." />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.head}>
        <View style={styles.headMain}>
          <Heading>{vehicleLabel(data)}</Heading>
          <Muted>{data.numberPlate || "No plate recorded"}</Muted>
        </View>
        {data.isFlagged ? <Badge status="stolen" /> : <Badge status={data.status || "active"} />}
      </View>

      {data.isFlagged ? (
        <Card style={styles.flagged}>
          <Text style={styles.flaggedText}>
            This vehicle is flagged as stolen. Any CCTV sighting raises an alert automatically.
          </Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.cardHead}>
          <Heading level={2}>Details</Heading>
          {!editing ? <Button title="Edit" variant="ghost" small onPress={beginEdit} /> : null}
        </View>

        {editing ? (
          <View style={styles.form}>
            <Field label="Make" value={form.make} onChangeText={(v) => setForm({ ...form, make: v })} autoCapitalize="words" />
            <Field label="Model" value={form.model} onChangeText={(v) => setForm({ ...form, model: v })} autoCapitalize="words" />
            <Field label="Colour" value={form.color} onChangeText={(v) => setForm({ ...form, color: v })} autoCapitalize="words" />
            <View style={styles.formActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} style={styles.flex} />
              <Button title="Save" onPress={save} loading={busy === "save"} style={styles.flex} />
            </View>
          </View>
        ) : (
          <>
            <Row label="Make" value={data.make || "—"} />
            <Row label="Model" value={data.model || "—"} />
            <Row label="Year" value={data.year ? String(data.year) : "—"} />
            <Row label="Colour" value={data.color || "—"} />
            <Row label="Plate" value={data.numberPlate || "—"} />
          </>
        )}
      </Card>

      <Card>
        <PhotoSlotGrid
          title="Number plate photos"
          hint="Front and back. This is what a CCTV plate read is checked against."
          angles={PLATE_ANGLES}
          photos={byAngle(data.plateImages)}
          busyAngle={busy?.startsWith("plate:") ? (busy.slice(6) as PlateAngle) : null}
          onPick={(angle) => choosePhoto((photo) => void upload("plate", angle, photo))}
          onClear={(angle) => clearSlot("plate", angle)}
        />
      </Card>

      <Card>
        <PhotoSlotGrid
          title="Vehicle photos"
          hint="All four sides, so the vehicle can be identified from any angle."
          angles={VEHICLE_ANGLES}
          photos={byAngle(data.vehicleImages)}
          busyAngle={busy?.startsWith("vehicle:") ? (busy.slice(8) as VehicleAngle) : null}
          onPick={(angle) => choosePhoto((photo) => void upload("vehicle", angle, photo))}
          onClear={(angle) => clearSlot("vehicle", angle)}
        />
      </Card>

      <View style={styles.actions}>
        <Button
          title="Service history"
          variant="outline"
          onPress={() => router.push(`/(customer)/vehicle/${id}/history`)}
        />
        <Button title="Track this vehicle" variant="outline" onPress={() => router.push(`/(customer)/tracking/${id}`)} />
        <Button title="Delete vehicle" variant="danger" onPress={deleteVehicle} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  headMain: { flex: 1 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  flagged: { borderColor: colors.red500, backgroundColor: "#fef2f2" },
  flaggedText: { color: colors.red500, fontWeight: "600", lineHeight: 20 },
  form: { gap: spacing.md },
  formActions: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  actions: { gap: spacing.md },
});
