import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../src/lib/AuthContext";
import { useApi } from "../../../src/lib/useApi";
import { Screen, Card, Heading, Muted, Button, Badge } from "../../../src/components/ui";
import { colors, radius, spacing, shadow } from "../../../src/theme";
import { formatMoney, vehicleLabel, type Vehicle, type Booking, type WalletInfo } from "../../../src/lib/types";

/**
 * The signed-in customer landing screen — the mobile counterpart of the web
 * app's home.tsx.
 *
 * The web page opens with a marketing hero, because that URL is also the
 * public front door. A native app has no anonymous visitors on this screen, so
 * the hero is replaced by what a signed-in owner actually wants first: their
 * wallet balance, their vehicles, and the next booking.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const vehicles = useApi<Vehicle[]>("/vehicles/mine", (d) => d.vehicles ?? [], "Could not load your vehicles.");
  const bookings = useApi<Booking[]>("/bookings/mine", (d) => d.bookings ?? [], "Could not load your bookings.");
  const wallet = useApi<WalletInfo | null>("/wallet", (d) => d.wallet ?? null, "Could not load your wallet.");

  const refreshAll = () => {
    vehicles.refresh();
    bookings.refresh();
    wallet.refresh();
  };

  // "Active" is anything not finished — what the owner needs to keep an eye on.
  const active = (bookings.data ?? []).filter(
    (b) => !["completed", "cancelled", "canceled"].includes((b.status || "").toLowerCase())
  );

  return (
    <Screen refreshing={vehicles.refreshing || bookings.refreshing} onRefresh={refreshAll}>
      <View style={styles.greeting}>
        <Muted>Welcome back</Muted>
        <Heading>{user?.firstname || "there"}</Heading>
      </View>

      <Pressable onPress={() => router.push("/(customer)/wallet")}>
        <Card style={styles.walletCard}>
          <Text style={styles.walletLabel}>Wallet balance</Text>
          <Text style={styles.walletAmount}>{formatMoney(wallet.data?.balance)}</Text>
          <Text style={styles.walletHint}>Tap to top up or withdraw</Text>
        </Card>
      </Pressable>

      <View style={styles.actions}>
        <Button title="Book a service" onPress={() => router.push("/(customer)/workshops")} style={styles.action} />
        <Button
          title="Raise SOS"
          variant="danger"
          onPress={() => router.push("/(customer)/sos")}
          style={styles.action}
        />
      </View>

      <Card>
        <View style={styles.cardHead}>
          <Heading level={2}>Your vehicles</Heading>
          <Button title="All" variant="ghost" small onPress={() => router.push("/(customer)/vehicles")} />
        </View>
        {(vehicles.data ?? []).length === 0 ? (
          <Muted>No vehicles registered yet.</Muted>
        ) : (
          (vehicles.data ?? []).slice(0, 3).map((v) => (
            <Pressable
              key={v._id}
              style={styles.listRow}
              onPress={() => router.push(`/(customer)/vehicle/${v._id}`)}
            >
              <View style={styles.listMain}>
                <Text style={styles.listTitle}>{vehicleLabel(v)}</Text>
                <Muted>{v.numberPlate || "No plate recorded"}</Muted>
              </View>
              {/* A flagged vehicle is a reported-stolen one — the single most
                  important thing this screen can surface. */}
              {v.isFlagged ? <Badge status="stolen" /> : null}
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <View style={styles.cardHead}>
          <Heading level={2}>Active bookings</Heading>
          <Button title="All" variant="ghost" small onPress={() => router.push("/(customer)/bookings")} />
        </View>
        {active.length === 0 ? (
          <Muted>Nothing in progress right now.</Muted>
        ) : (
          active.slice(0, 3).map((b) => (
            <View key={b._id} style={styles.listRow}>
              <View style={styles.listMain}>
                <Text style={styles.listTitle}>{b.serviceType || "Service"}</Text>
                <Muted>{vehicleLabel(typeof b.vehicle === "object" ? b.vehicle : undefined)}</Muted>
              </View>
              <Badge status={b.status} />
            </View>
          ))
        )}
      </Card>

      {/* Safety, chat, notifications and sign-out used to be stacked here
          because the tab bar had no room for them. They live in the drawer
          now, which is reachable from every screen rather than only this one;
          what stays is the shortcut to the spending overview, which is new
          and would otherwise go unnoticed. */}
      <View style={styles.secondary}>
        <Button
          title="Service history"
          variant="outline"
          onPress={() => router.push("/(customer)/service-history")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: spacing.xs },
  walletCard: { backgroundColor: colors.navy900, borderColor: colors.navy800, ...shadow(2) },
  walletLabel: { color: colors.slate400, fontSize: 13, fontWeight: "600" },
  walletAmount: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: spacing.xs },
  walletHint: { color: colors.slate400, fontSize: 12, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  listMain: { flex: 1, gap: 2 },
  listTitle: { fontWeight: "600", color: colors.navy900, fontSize: 15 },
  secondary: { gap: spacing.md },
});
