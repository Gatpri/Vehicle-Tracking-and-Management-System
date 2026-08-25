import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "../../src/lib/useApi";
import { ProfileView } from "../../src/components/ProfileView";
import { Card, Heading, Muted, Badge, Button } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";
import { formatMoney, vehicleLabel, type Vehicle, type WalletInfo } from "../../src/lib/types";

/**
 * The customer account screen.
 *
 * ProfileView carries the identity and sign-out; what is added here is the
 * owner-specific context — the vehicles on the account and the wallet — so
 * that "my account" answers what a vehicle owner actually keeps here rather
 * than just repeating their email back at them.
 */
export default function CustomerProfileScreen() {
  const router = useRouter();
  const vehicles = useApi<Vehicle[]>("/vehicles/mine", (d) => d.vehicles ?? [], "Could not load your vehicles.");
  const wallet = useApi<WalletInfo | null>("/wallet", (d) => d.wallet ?? null, "Could not load your wallet.");

  const list = vehicles.data ?? [];

  return (
    <ProfileView>
      <Card>
        <View style={styles.head}>
          <Heading level={2}>My vehicles</Heading>
          <Button title="All" variant="ghost" small onPress={() => router.push("/(customer)/vehicles")} />
        </View>
        {list.length === 0 ? (
          <Muted>No vehicles registered yet.</Muted>
        ) : (
          list.slice(0, 4).map((v) => (
            <Pressable
              key={v._id}
              style={styles.row}
              onPress={() => router.push(`/(customer)/vehicle/${v._id}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{vehicleLabel(v)}</Text>
                <Muted>{v.numberPlate || "No plate recorded"}</Muted>
              </View>
              {/* A flagged vehicle is a reported-stolen one — worth surfacing
                  anywhere the vehicle is listed at all. */}
              {v.isFlagged ? <Badge status="stolen" /> : null}
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <View style={styles.head}>
          <Heading level={2}>Wallet</Heading>
          <Button title="Open" variant="ghost" small onPress={() => router.push("/(customer)/wallet")} />
        </View>
        <Text style={styles.balance}>{formatMoney(wallet.data?.balance)}</Text>
        <Muted>Available balance</Muted>
      </Card>

      <Card>
        <View style={styles.head}>
          <Heading level={2}>Service history</Heading>
        </View>
        <Muted>Every completed service on this account, with a month-by-month breakdown.</Muted>
        <Button
          title="View service history"
          variant="outline"
          onPress={() => router.push("/(customer)/service-history")}
          style={styles.action}
        />
      </Card>
    </ProfileView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: "600", color: colors.navy900, fontSize: 15 },
  balance: { fontSize: 26, fontWeight: "800", color: colors.navy900 },
  action: { marginTop: spacing.md },
});
