import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { LocationPicker } from "../../../src/components/LocationPicker";
import { Screen, Card, Heading, Muted, Button, Badge, Field, ErrorNote, Empty, Row } from "../../../src/components/ui";
import { colors, radius, spacing, shadow } from "../../../src/theme";
import { formatDateTime, vehicleLabel, type SosAlert, type Vehicle } from "../../../src/lib/types";

/**
 * Emergency SOS — one button, two outcomes.
 *
 * Tapping SOS asks what happened, because the two cases diverge in what they
 * do afterwards:
 *
 *   "I need help"    → an SOS alert with the device's position. Nothing else
 *                      is touched.
 *
 *   "Vehicle stolen" → an SOS alert *and* a theft report, which sets
 *                      vehicle.status = "stolen". That flag is the only thing
 *                      the CCTV pipeline matches against (cctvController.js),
 *                      so without it a stolen vehicle is never detected by a
 *                      camera.
 *
 * The choice exists precisely so those stay distinct: every SOS filing a theft
 * report would flag a vehicle as stolen over a flat tyre, and an SOS that
 * never filed one would leave the recognition models with nothing to detect.
 */
type SosMode = null | "help" | "theft";
export default function SosScreen() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data, refreshing, error, refresh, reload } = useApi<SosAlert[]>(
    "/sos/mine",
    (d) => d.alerts ?? [],
    "Could not load your alerts."
  );
  const vehicles = useApi<Vehicle[]>("/vehicles/mine", (d) => d.vehicles ?? [], "Could not load your vehicles.");

  // Which branch the SOS button opened, if any.
  const [mode, setMode] = useState<SosMode>(null);

  // Theft report — moved here from the Safety screen, which now shows only the
  // heatmap and the reports you have already filed.
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [theftLocation, setTheftLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [filing, setFiling] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location required",
          "An SOS without a location cannot be acted on. Allow location access and try again."
        );
        return;
      }

      // Highest accuracy available: this is the one place where waiting a
      // couple of extra seconds for a better fix is unambiguously worth it.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });

      await api.post("/sos", {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        message,
      });

      setMessage("");
      Alert.alert("SOS sent", "Your location has been shared with the response team.");
      reload();
    } catch (err) {
      Alert.alert("Could not send SOS", getErrorMessage(err, "Please try again."));
    } finally {
      setSending(false);
    }
  };

  const confirm = () => {
    Alert.alert("Send an SOS?", "Your current location will be shared with the response team.", [
      { text: "Cancel", style: "cancel" },
      { text: "Send SOS", style: "destructive", onPress: send },
    ]);
  };

  const fileReport = () => {
    if (!vehicleId) {
      Alert.alert("Choose a vehicle", "Select which vehicle was taken.");
      return;
    }
    if (!theftLocation) {
      Alert.alert("Location needed", "Mark where the vehicle was lost from.");
      return;
    }

    Alert.alert(
      "File a theft report?",
      "This flags the vehicle as stolen so any CCTV sighting raises an alert.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "File report",
          style: "destructive",
          onPress: async () => {
            setFiling(true);
            try {
              // The theft report goes first: it is the part that flags the
              // vehicle for CCTV, so if only one of the two succeeds it should
              // be this one.
              await api.post("/theft-reports", {
                vehicleId,
                lat: theftLocation.lat,
                lng: theftLocation.lng,
                description,
              });

              // ...and an SOS alongside it, so the theft appears on the
              // admins' live alert board rather than only in a report list.
              try {
                const plate = (vehicles.data ?? []).find((v) => v._id === vehicleId)?.numberPlate;
                await api.post("/sos", {
                  lat: theftLocation.lat,
                  lng: theftLocation.lng,
                  message: `Vehicle stolen${plate ? ` — ${plate}` : ""}${description ? `: ${description}` : ""}`,
                });
              } catch {
                // The report already succeeded and is what matters; a failed
                // alert must not suggest the theft was not recorded.
              }

              setDescription("");
              setTheftLocation(null);
              setLocationLabel("");
              setVehicleId("");
              setMode(null);
              Alert.alert("Theft reported", "The vehicle is flagged and admins have been alerted.");
              vehicles.reload();
              reload();
            } catch (err) {
              Alert.alert("Could not file report", getErrorMessage(err, "Please try again."));
            } finally {
              setFiling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Heading>Emergency SOS</Heading>
      <Muted>Sends your live location to the response team straight away.</Muted>

      <Card style={styles.sosCard}>
        <Button
          title="SEND SOS"
          variant="danger"
          onPress={() => setMode(mode ? null : "help")}
          disabled={sending}
        />

        {!mode ? (
          <Muted>Tap for emergency help or to report a theft.</Muted>
        ) : (
          <View style={styles.choice}>
            {/* The two cases diverge in what they do to the vehicle, so the
                choice is made up front rather than inferred. */}
            <Pressable onPress={() => setMode("help")}>
              <View style={[styles.option, mode === "help" && styles.optionOn]}>
                <Text style={styles.optionTitle}>I need help</Text>
                <Text style={styles.optionBody}>Breakdown, accident, feeling unsafe</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setMode("theft")}>
              <View style={[styles.option, mode === "theft" && styles.optionOn]}>
                <Text style={styles.optionTitle}>My vehicle was stolen</Text>
                <Text style={styles.optionBody}>Flags it so CCTV cameras watch for it</Text>
              </View>
            </Pressable>
          </View>
        )}

        {mode === "help" ? (
          <>
            <Field
              label="Optional message"
              value={message}
              onChangeText={setMessage}
              placeholder="e.g. flat tyre on the highway"
              autoCapitalize="sentences"
              editable={!sending}
            />
            <Button title="Send alert with my location" variant="danger" onPress={confirm} loading={sending} />
          </>
        ) : null}
      </Card>

      {mode === "theft" ? (
        <Card>
          <Heading level={2}>Report a stolen vehicle</Heading>
          <Muted>Filing a report flags the vehicle so any CCTV sighting raises an alert.</Muted>

          <View style={styles.form}>
            <Text style={styles.label}>Vehicle</Text>
            {(vehicles.data ?? []).length === 0 ? (
              <Muted>You have no vehicles registered.</Muted>
            ) : (
              <View style={styles.chips}>
                {(vehicles.data ?? []).map((v) => (
                  <Pressable key={v._id} onPress={() => setVehicleId(v._id)}>
                    <View style={[styles.chip, vehicleId === v._id && styles.chipOn]}>
                      <Text style={[styles.chipText, vehicleId === v._id && styles.chipTextOn]}>
                        {vehicleLabel(v)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <Field
              label="What happened?"
              value={description}
              onChangeText={setDescription}
              placeholder="Where it was parked, when you noticed"
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
            />

            <Text style={styles.label}>From where vehicle was lost?</Text>
            {/* Tap the map, drag the pin, or use the device position — a
                stolen vehicle is rarely taken from where the owner is standing
                when they file, so GPS alone is not enough. */}
            <LocationPicker
              value={theftLocation}
              onChange={setTheftLocation}
              onAddressResolved={setLocationLabel}
              height={260}
            />
            {locationLabel ? <Muted>{locationLabel}</Muted> : null}

            <Button
              title="Report theft & alert admins"
              variant="danger"
              onPress={fileReport}
              loading={filing}
            />
          </View>
        </Card>
      ) : null}

      <Heading level={2}>Your past alerts</Heading>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!error && (data ?? []).length === 0 ? <Empty message="You have not raised any alerts." /> : null}

      {(data ?? []).map((a) => (
        <Card key={a._id}>
          <View style={styles.head}>
            <Text style={styles.title}>{a.message || "SOS alert"}</Text>
            <Badge status={a.status} />
          </View>
          <Row label="Raised" value={formatDateTime(a.createdAt)} />
          {a.location?.lat != null && a.location?.lng != null ? (
            <Row label="Location" value={`${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`} />
          ) : null}
          {/* A "theft" alert was raised by the CCTV pipeline rather than by
              the user, so it is worth labelling as such. */}
          {a.kind === "theft" ? <Row label="Source" value="CCTV theft detection" /> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sosCard: { borderColor: colors.red500, gap: spacing.md, ...shadow(2) },
  choice: { gap: spacing.sm },
  option: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
    gap: 2,
  },
  optionOn: { borderColor: colors.red500, backgroundColor: "#fef2f2" },
  optionTitle: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
  optionBody: { color: colors.slate600, fontSize: 12.5 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15, flex: 1 },
  form: { gap: spacing.md, marginTop: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.navy900 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
});
