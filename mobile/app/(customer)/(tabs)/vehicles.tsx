import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { Screen, Card, Heading, Muted, Button, Badge, Field, Loading, ErrorNote, Empty } from "../../../src/components/ui";
import {
  PhotoSlotGrid,
  choosePhoto,
  PLATE_ANGLES,
  VEHICLE_ANGLES,
  type PickedPhoto,
  type PlateAngle,
  type VehicleAngle,
} from "../../../src/components/VehiclePhotoPicker";
import { colors, spacing } from "../../../src/theme";
import { vehicleLabel, type Vehicle } from "../../../src/lib/types";

/**
 * Ported from the web app's VehiclesPage.tsx — list plus a registration form.
 *
 * The web rendered the form inline above the list. Here it is a modal sheet:
 * on a narrow screen an always-visible form would push the list, which is the
 * thing people open this screen for, below the fold.
 *
 * Photos are captured during registration rather than only afterwards. A plate
 * shot is the reference a CCTV match is compared against, so a vehicle
 * registered without one is far less useful if it is ever reported stolen —
 * and asking at registration is the moment the owner is holding their phone
 * next to the vehicle.
 */
export default function VehiclesScreen() {
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload } = useApi<Vehicle[]>(
    "/vehicles/mine",
    (d) => d.vehicles ?? [],
    "Could not load your vehicles."
  );

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [form, setForm] = useState({ make: "", model: "", year: "", numberPlate: "", color: "" });

  // Held locally until the vehicle exists: the upload endpoint is
  // /vehicles/:id/photos, and there is no id before the POST succeeds.
  const [plates, setPlates] = useState<Partial<Record<PlateAngle, PickedPhoto>>>({});
  const [shots, setShots] = useState<Partial<Record<VehicleAngle, PickedPhoto>>>({});

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm({ make: "", model: "", year: "", numberPlate: "", color: "" });
    setPlates({});
    setShots({});
    setProgress(null);
  };

  const uploadOne = async (id: string, kind: "plate" | "vehicle", angle: string, photo: PickedPhoto) => {
    const body = new FormData();
    // RN's FormData takes this {uri, name, type} shape rather than a File.
    body.append("image", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
    body.append("kind", kind);
    body.append("angle", angle);
    await api.post(`/vehicles/${id}/photos`, body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const submit = async () => {
    if (!form.make.trim() || !form.model.trim() || !form.numberPlate.trim()) {
      Alert.alert("Missing details", "Make, model and number plate are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/vehicles", {
        make: form.make.trim(),
        model: form.model.trim(),
        // The field is a text input but the API expects a number; an empty or
        // non-numeric entry is sent as undefined rather than NaN.
        year: form.year.trim() ? Number(form.year.trim()) : undefined,
        numberPlate: form.numberPlate.trim(),
        color: form.color.trim() || undefined,
      });

      const id: string | undefined = res.data?.vehicle?._id;
      const queued = [
        ...Object.entries(plates).map(([angle, p]) => ["plate", angle, p] as const),
        ...Object.entries(shots).map(([angle, p]) => ["vehicle", angle, p] as const),
      ].filter(([, , p]) => !!p);

      if (id && queued.length) {
        // Sequential, not Promise.all: these are large multipart bodies on a
        // phone connection, and firing six at once is how uploads time out.
        // The count also gives the owner something honest to watch.
        for (let i = 0; i < queued.length; i++) {
          const [kind, angle, photo] = queued[i];
          setProgress(`Uploading photo ${i + 1} of ${queued.length}...`);
          try {
            await uploadOne(id, kind, angle, photo!);
          } catch {
            // One failed photo must not discard the registered vehicle — the
            // owner can add it again from the vehicle's own screen.
          }
        }
      }

      setOpen(false);
      reset();
      reload();
    } catch (err) {
      Alert.alert("Could not register", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (loading) return <Loading label="Loading your vehicles…" />;

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <View style={styles.head}>
          <Heading>Your vehicles</Heading>
          <Button title="Add" small onPress={() => setOpen(true)} />
        </View>

        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {!error && (data ?? []).length === 0 ? (
          <Empty message="No vehicles yet. Add one to start booking services." />
        ) : null}

        {(data ?? []).map((v) => (
          <Pressable key={v._id} onPress={() => router.push(`/(customer)/vehicle/${v._id}`)}>
            <Card>
              <View style={styles.row}>
                <View style={styles.main}>
                  <Text style={styles.title}>{vehicleLabel(v)}</Text>
                  <Muted>
                    {[v.numberPlate, v.year ? String(v.year) : null, v.color].filter(Boolean).join(" · ") ||
                      "No details recorded"}
                  </Muted>
                </View>
                {v.isFlagged ? <Badge status="stolen" /> : <Badge status={v.status || "active"} />}
              </View>
            </Card>
          </Pressable>
        ))}
      </Screen>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        {/* The sheet is tall enough to sit under the keyboard, so it has to
            lift with it — otherwise the Save button ends up behind the keys
            with no way to reach it. */}
        <KeyboardAvoidingView
          style={styles.flexFill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              {/* keyboardShouldPersistTaps keeps buttons live while the
                  keyboard is up: without it the first tap only dismisses the
                  keyboard and the button appears not to work. */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.sheetBody}
                showsVerticalScrollIndicator={false}
              >
                <Heading level={2}>Register a vehicle</Heading>

                <Field label="Make" value={form.make} onChangeText={set("make")} placeholder="Toyota" autoCapitalize="words" />
                <Field label="Model" value={form.model} onChangeText={set("model")} placeholder="Corolla" autoCapitalize="words" />
                <Field
                  label="Year"
                  value={form.year}
                  onChangeText={set("year")}
                  placeholder="2019"
                  keyboardType="number-pad"
                  // A number pad has no return key on iOS, so without this the
                  // keyboard has no way to be dismissed at all.
                  returnKeyType="done"
                  onSubmitEditing={() => {}}
                />
                <Field
                  label="Number plate"
                  value={form.numberPlate}
                  onChangeText={set("numberPlate")}
                  placeholder="BA 2 PA 1234"
                  autoCapitalize="characters"
                />
                <Field label="Colour" value={form.color} onChangeText={set("color")} placeholder="White" autoCapitalize="words" />

                <PhotoSlotGrid
                  title="Number plate photos"
                  hint="Front and back. This is what a CCTV plate read is checked against."
                  angles={PLATE_ANGLES}
                  photos={Object.fromEntries(
                    Object.entries(plates).map(([k, v]) => [k, v?.uri])
                  ) as Partial<Record<PlateAngle, string>>}
                  onPick={(angle) => choosePhoto((photo) => setPlates((p) => ({ ...p, [angle]: photo })))}
                  onClear={(angle) => setPlates((p) => ({ ...p, [angle]: undefined }))}
                />

                <PhotoSlotGrid
                  title="Vehicle photos"
                  hint="All four sides, so the vehicle can be identified from any angle."
                  angles={VEHICLE_ANGLES}
                  photos={Object.fromEntries(
                    Object.entries(shots).map(([k, v]) => [k, v?.uri])
                  ) as Partial<Record<VehicleAngle, string>>}
                  onPick={(angle) => choosePhoto((photo) => setShots((p) => ({ ...p, [angle]: photo })))}
                  onClear={(angle) => setShots((p) => ({ ...p, [angle]: undefined }))}
                />

                <Muted>Photos are optional — you can add them later from the vehicle's page.</Muted>

                {progress ? <Text style={styles.progress}>{progress}</Text> : null}

                <View style={styles.sheetActions}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      setOpen(false);
                      reset();
                    }}
                    style={styles.flex}
                    disabled={busy}
                  />
                  <Button title="Save" onPress={submit} loading={busy} style={styles.flex} />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 16 },
  flexFill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Capped so the sheet cannot grow past the screen once the photo grids are
    // in it; the body scrolls instead.
    maxHeight: "88%",
  },
  sheetBody: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
  progress: { fontSize: 13, color: colors.blue700, fontWeight: "600", textAlign: "center" },
});
