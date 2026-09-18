import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LocationPicker } from "../../../src/components/LocationPicker";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import {
  Screen,
  Card,
  Heading,
  Muted,
  Button,
  Field,
  Loading,
  ErrorNote,
  Row,
} from "../../../src/components/ui";
import { colors, radius, spacing } from "../../../src/theme";
import { formatMoney, vehicleLabel, type Workshop, type Vehicle } from "../../../src/lib/types";

/**
 * Ported from the web app's WorkshopDetailPage.tsx — workshop details plus the
 * booking form.
 *
 * The booking payload is identical to the web version, including the delivery
 * branch, and so is the way a pickup location is chosen: a map you tap, with
 * "use my location" as one option rather than the only one. This used to take
 * the device's GPS fix and nothing else, which quietly assumed the customer
 * was standing next to the vehicle — they are routinely not, and there was no
 * way to correct it.
 */
export default function WorkshopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const workshop = useApi<Workshop | null>(
    id ? `/workshops/${id}` : null,
    (d) => d.workshop ?? null,
    "Could not load this workshop."
  );
  const vehicles = useApi<Vehicle[]>("/vehicles/mine", (d) => d.vehicles ?? [], "Could not load your vehicles.");

  const [vehicleId, setVehicleId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  /**
   * Open (or reopen) this customer's thread with this workshop, then jump to
   * the chat tab. Messaging a garage starts here rather than on the chat page:
   * by this point the customer has already chosen which workshop they mean.
   */
  const chatWithWorkshop = async () => {
    setOpeningChat(true);
    try {
      await api.post("/chat/channels/open", { channel: "workshop", workshopId: id });
      router.push("/(customer)/chat");
    } catch (err) {
      Alert.alert("Could not open chat", getErrorMessage(err, "Please try again."));
    } finally {
      setOpeningChat(false);
    }
  };

  // Default to the workshop's first service, matching the web page, so the
  // form is never submitted with nothing selected.
  useEffect(() => {
    const first = workshop.data?.servicesOffered?.[0]?.serviceType;
    if (first && !serviceType) setServiceType(first);
  }, [workshop.data, serviceType]);

  useEffect(() => {
    const first = vehicles.data?.[0]?._id;
    if (first && !vehicleId) setVehicleId(first);
  }, [vehicles.data, vehicleId]);

  const submit = async () => {
    if (!vehicleId) {
      Alert.alert("No vehicle", "Register a vehicle before booking a service.");
      return;
    }
    if (!serviceType) {
      Alert.alert("No service selected", "Choose the service you need.");
      return;
    }
    // Mirrors the web page's guard: a delivery with no pickup point cannot be
    // assigned to anyone.
    if (deliveryRequested && !pickup) {
      Alert.alert("Pickup location needed", "Set your pickup location so staff can collect the vehicle.");
      return;
    }

    setBusy(true);
    try {
      await api.post("/bookings", {
        vehicleId,
        workshopId: id,
        serviceType,
        description,
        deliveryRequested,
        ...(deliveryRequested && pickup
          ? { pickupLocation: { ...pickup, address: pickupAddress } }
          : {}),
      });
      Alert.alert("Booking requested", "The workshop will confirm shortly.", [
        { text: "OK", onPress: () => router.replace("/(customer)/bookings") },
      ]);
    } catch (err) {
      Alert.alert("Could not book", getErrorMessage(err, "Failed to create booking."));
    } finally {
      setBusy(false);
    }
  };

  if (workshop.loading) return <Loading label="Loading workshop…" />;
  if (workshop.error) return <ErrorNote message={workshop.error} onRetry={workshop.reload} />;
  if (!workshop.data) return <ErrorNote message="This workshop could not be found." />;

  const w = workshop.data;

  return (
    <Screen refreshing={workshop.refreshing} onRefresh={workshop.refresh}>
      <View>
        <Heading>{w.name}</Heading>
        <Muted>{w.address || w.area || w.region || "Address not listed"}</Muted>
      </View>

      <Button
        title="Chat with this workshop"
        variant="outline"
        onPress={chatWithWorkshop}
        loading={openingChat}
      />

      <Card>
        <Heading level={2}>Details</Heading>
        <Row
          label="Rating"
          value={w.rating?.count ? `${(w.rating.average ?? 0).toFixed(1)} (${w.rating.count})` : "Not yet rated"}
        />
        {w.contactPhone ? <Row label="Phone" value={w.contactPhone} /> : null}
        {w.brandsSupported?.length ? <Row label="Brands" value={w.brandsSupported.join(", ")} /> : null}
        {w.bikeTypes?.length ? <Row label="Handles" value={w.bikeTypes.join(", ")} /> : null}
      </Card>

      <Card>
        <Heading level={2}>Services</Heading>
        {(w.servicesOffered ?? []).length === 0 ? (
          <Muted>This workshop has not listed its services yet.</Muted>
        ) : (
          (w.servicesOffered ?? []).map((s) => (
            <Pressable key={s.serviceType} onPress={() => setServiceType(s.serviceType)}>
              <View style={[styles.service, serviceType === s.serviceType && styles.serviceOn]}>
                <Text style={styles.serviceName}>{s.serviceType}</Text>
                {/* basePrice is paisa — formatMoney does the divide. */}
                <Text style={styles.servicePrice}>{formatMoney(s.basePrice)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <Heading level={2}>Book a service</Heading>

        <Text style={styles.label}>Vehicle</Text>
        {(vehicles.data ?? []).length === 0 ? (
          <Muted>Register a vehicle first — you can do that from the Vehicles tab.</Muted>
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

        <Text style={styles.label}>Selected service</Text>
        <Text style={styles.selected}>{serviceType || "Tap a service above"}</Text>

        <Field
          label="What is wrong?"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the problem"
          multiline
          numberOfLines={3}
          autoCapitalize="sentences"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.label}>Request pickup</Text>
            <Muted>Delivery staff collect the vehicle from you.</Muted>
          </View>
          <Switch
            value={deliveryRequested}
            onValueChange={setDeliveryRequested}
            trackColor={{ true: colors.blue700, false: colors.slate200 }}
          />
        </View>

        {deliveryRequested ? (
          <View style={styles.pickup}>
            <Text style={styles.label}>Pickup location</Text>
            <Muted>
              Tap the map where staff should collect the vehicle, or use your current
              location — then drag the pin to fine-tune.
            </Muted>
            {/* The same picker the SOS screen uses. "Current location" is one
                of its buttons rather than the only way in: the vehicle is
                often not where the customer is standing when they book — at
                home while they are at work, or already at a relative's. */}
            <LocationPicker
              value={pickup}
              onChange={setPickup}
              onAddressResolved={(resolved) => {
                // Prefill the label only while the customer hasn't typed their
                // own — theirs always wins. Matches the web page's behaviour.
                setPickupAddress((current) => (current.trim() ? current : resolved));
              }}
              height={260}
            />
            <Field
              label="Landmark or note (optional)"
              value={pickupAddress}
              onChangeText={setPickupAddress}
              placeholder="Near the school gate"
              autoCapitalize="sentences"
            />
          </View>
        ) : null}

        <Button title="Request booking" onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  service: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    marginTop: spacing.xs,
  },
  serviceOn: { borderColor: colors.blue700, backgroundColor: "#eff6ff" },
  serviceName: { color: colors.navy900, fontWeight: "600", flex: 1 },
  servicePrice: { color: colors.slate600, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600", color: colors.navy900, marginTop: spacing.md },
  selected: { color: colors.blue700, fontWeight: "700", marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.blue700, borderColor: colors.blue700 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  switchText: { flex: 1 },
  pickup: { gap: spacing.md, marginTop: spacing.md },
});
