import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../lib/AuthContext";
import { colors, radius, spacing } from "../theme";

/**
 * The owner's breaking-news interrupt when a camera spots their stolen vehicle.
 *
 * A port of the web app's src/components/TheftAlertOverlay.tsx, and deliberately
 * the same flow rather than a phone-specific reinvention: the same two ways an
 * alert arrives, the same side-by-side photo comparison, the same two answers,
 * and the same POST to /cctv/theft-alerts/:id/respond.
 *
 * Until this existed the mobile app received "theft:sighting" and did nothing
 * with it but bump a refresh counter, so an owner whose vehicle was detected
 * was never actually asked — and step 7 of the pipeline (owner responds ->
 * SOS raised -> admins notified) could never happen from a phone at all.
 *
 * Two ways an alert arrives, both needed:
 *
 *   socket   — live, but only reaches an owner who is online at that second.
 *   GET /cctv/my-theft-alerts on mount — catches a detection that happened
 *              while they were logged out, which is exactly when it matters.
 */

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

export default function TheftAlertOverlay() {
  const [alert, setAlert] = useState<SightingAlert | null>(null);
  const [sending, setSending] = useState<"confirm" | "deny" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { user: me } = useAuth();

  // The socket subscription below is mounted once, so reading `me` from the
  // closure would pin it to whoever was signed in at mount — which is null on
  // first render, before the token has been exchanged for a user. A ref lets
  // the handler see the current user without resubscribing on every change.
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    let cancelled = false;

    api
      .get("/cctv/my-theft-alerts")
      .then((res) => {
        if (cancelled) return;
        const pending: SightingAlert[] = res.data.sightings ?? [];
        // Only fills an empty slot: a live socket alert that arrived while this
        // request was in flight is the newer event and must not be replaced.
        if (pending.length > 0) setAlert((current) => current ?? pending[0]);
      })
      .catch(() => {
        // Not signed in yet, or offline. The socket path still covers the live
        // case and the next mount retries, so this is not surfaced.
      });

    const socket = getSocket();
    const onSighting = (sighting: SightingAlert) => {
      // The same event goes to every admin (for their CCTV banner) as well as
      // to the owner's own room. Only the owner gets the full-screen
      // interrupt — an admin must never be told someone else's car is theirs.
      const myId = meRef.current?.id;
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
  const seenAt =
    alert.location?.lat != null && alert.location?.lng != null ? alert.location : null;

  /**
   * Both answers reach the admin SOS queue — confirming raises an active
   * emergency, declining files it as pending for review. The server reads the
   * camera frame, the vehicle photo and the camera's location back off the
   * sighting itself, so this request cannot be pointed at another vehicle.
   */
  const respond = async (confirmed: boolean) => {
    setSending(confirmed ? "confirm" : "deny");
    setFailure(null);

    let coords: { lat?: number; lng?: number } = {};
    if (confirmed) {
      // Location is a bonus, never a blocker: the server falls back to where
      // the camera saw the vehicle, which is the more useful coordinate
      // anyway. Permission is only asked for on a confirm, since a denial
      // does not need the owner's position at all.
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        // No fix available — fall through and let the server use the camera's.
      }
    }

    try {
      await api.post(`/cctv/theft-alerts/${alert._id}/respond`, { confirmed, ...coords });
      setAlert(null);
    } catch (err) {
      // Shown inline rather than in an Alert.alert: a second modal over this
      // one would hide the very thing the owner is trying to answer.
      setFailure(getErrorMessage(err, "Could not send your response. Try again."));
    } finally {
      setSending(null);
    }
  };

  const openMap = () => {
    if (!seenAt) return;
    void Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${seenAt.lat}&mlon=${seenAt.lng}#map=17/${seenAt.lat}/${seenAt.lng}`
    );
  };

  const busy = sending !== null;

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.root}>
        {/* Deliberately no close control. This is an interrupt: the owner
            answers it, and the server records either answer so it is never
            shown again. A dismissable alert would silently lose the response
            the whole pipeline is waiting on. */}
        <View style={styles.ticker}>
          <Text style={styles.tickerTag}>BREAKING</Text>
          <Text style={styles.tickerText} numberOfLines={2}>
            Your vehicle has been spotted by a live camera
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.plate}>{vehicle?.plateNumber ?? "Your vehicle"}</Text>
          <Text style={styles.sub}>
            {[vehicle?.color, vehicle?.make, vehicle?.model].filter(Boolean).join(" ")}
          </Text>

          {/* Side by side so the owner can actually verify rather than take our
              word for it — the camera frame against their own registered photo. */}
          <View style={styles.shots}>
            <View style={styles.shot}>
              {alert.imageUrl ? (
                <Image source={{ uri: alert.imageUrl }} style={styles.shotImage} />
              ) : (
                <View style={[styles.shotImage, styles.shotMissing]} />
              )}
              <Text style={styles.caption}>
                {`Camera frame · ${alert.confidence?.toFixed(0) ?? "?"}% read`}
              </Text>
            </View>

            {vehicle?.images?.[0] ? (
              <View style={styles.shot}>
                <Image source={{ uri: vehicle.images[0] }} style={styles.shotImage} />
                <Text style={styles.caption}>Your registered photo</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.facts}>
            <Fact label="Camera" value={alert.cameraId} />
            <Fact label="Seen at" value={new Date(alert.createdAt).toLocaleString()} />
            {seenAt ? (
              <Fact
                label="Location"
                value={`${seenAt.lat!.toFixed(5)}, ${seenAt.lng!.toFixed(5)} — open map`}
                onPress={openMap}
              />
            ) : (
              <Fact label="Location" value="Camera has no location set" />
            )}
          </View>

          <Text style={styles.prompt}>
            Is this your vehicle, and was it taken without your permission?
          </Text>

          {failure ? <Text style={styles.failure}>{failure}</Text> : null}

          <Pressable
            onPress={() => respond(true)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              styles.btnSos,
              busy && styles.btnOff,
              pressed && !busy && styles.btnPressed,
            ]}
          >
            {sending === "confirm" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnSosText}>YES — CONFIRM &amp; SEND SOS</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => respond(false)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              styles.btnGhost,
              busy && styles.btnOff,
              pressed && !busy && styles.btnPressed,
            ]}
          >
            {sending === "deny" ? (
              <ActivityIndicator color={colors.slate200} />
            ) : (
              <Text style={styles.btnGhostText}>Not confirmed</Text>
            )}
          </Pressable>

          <Text style={styles.fineprint}>
            Confirming shares your location, this camera frame and your vehicle details with
            admins immediately so they can start tracking. Either answer is recorded — this
            alert won&apos;t be shown again.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Fact({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text
        style={[styles.factValue, onPress && styles.factLink]}
        onPress={onPress}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy950 },

  ticker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.red500,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.md,
  },
  tickerTag: {
    color: colors.red500,
    backgroundColor: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
    overflow: "hidden",
  },
  tickerText: { flex: 1, color: "#fff", fontSize: 13.5, fontWeight: "700" },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },

  plate: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  sub: { color: colors.slate400, fontSize: 15, marginBottom: spacing.sm },

  shots: { flexDirection: "row", gap: spacing.sm },
  shot: { flex: 1, gap: 4 },
  shotImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    backgroundColor: colors.navy800,
  },
  shotMissing: { borderWidth: 1, borderColor: colors.navy800 },
  caption: { color: colors.slate400, fontSize: 10.5 },

  facts: {
    backgroundColor: colors.navy900,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 6,
  },
  factRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  factLabel: { color: colors.slate400, fontSize: 12.5 },
  factValue: { color: "#fff", fontSize: 12.5, flexShrink: 1, textAlign: "right" },
  factLink: { color: "#93c5fd", textDecorationLine: "underline" },

  prompt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  failure: { color: "#fecaca", fontSize: 13, marginBottom: spacing.xs },

  btn: {
    minHeight: 52,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  btnSos: { backgroundColor: colors.red500 },
  btnSosText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.4 },
  btnGhost: { borderWidth: 1, borderColor: colors.navy800 },
  btnGhostText: { color: colors.slate200, fontSize: 14, fontWeight: "700" },
  btnOff: { opacity: 0.5 },
  btnPressed: { opacity: 0.8 },

  fineprint: {
    color: colors.slate400,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: spacing.lg,
  },
});
