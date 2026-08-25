import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "../../src/lib/useApi";
import { useAuth } from "../../src/lib/AuthContext";
import { Screen, Card, Heading, Muted, Button, Loading, ErrorNote } from "../../src/components/ui";
import { colors, spacing, shadow } from "../../src/theme";
import type { UserRecord, Booking, SosAlert, Withdrawal } from "../../src/lib/types";

/**
 * The admin landing screen.
 *
 * The web dashboard.tsx is primarily account administration — a table per
 * role, with create and promote forms. That is a poor fit for a phone, and it
 * is not what someone opening an admin app on the move needs first. So this is
 * an overview: live counts that each open the screen where the work is done,
 * with account management kept on its own screen (users.tsx).
 */
export default function AdminDashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const users = useApi<UserRecord[]>("/users", (d) => d.users ?? [], "Could not load users.");
  const bookings = useApi<Booking[]>("/bookings", (d) => d.bookings ?? [], "Could not load bookings.");
  const sos = useApi<SosAlert[]>("/sos", (d) => d.alerts ?? [], "Could not load SOS alerts.");
  const withdrawals = useApi<Withdrawal[]>(
    "/withdrawals",
    (d) => d.withdrawals ?? [],
    "Could not load withdrawals."
  );

  const refreshAll = () => {
    users.refresh();
    bookings.refresh();
    sos.refresh();
    withdrawals.refresh();
  };

  const activeSos = (sos.data ?? []).filter((a) => (a.status || "").toLowerCase() === "active").length;
  const pendingBookings = (bookings.data ?? []).filter((b) => b.status === "pending").length;
  const pendingWithdrawals = (withdrawals.data ?? []).filter(
    (w) => (w.status || "").toLowerCase() === "pending"
  ).length;

  if (users.loading && bookings.loading) return <Loading label="Loading dashboard…" />;

  return (
    <Screen refreshing={users.refreshing} onRefresh={refreshAll}>
      <View>
        <Muted>Signed in as</Muted>
        <Heading>{`${user?.firstname ?? ""} ${user?.lastname ?? ""}`.trim() || "Admin"}</Heading>
        <Muted>{user?.role}</Muted>
      </View>

      {/* Anything actively wrong goes first and in red — an admin opening this
          on a phone is usually checking whether something needs them now. */}
      {activeSos > 0 ? (
        <Card style={styles.alert}>
          <Text style={styles.alertCount}>{activeSos}</Text>
          <Text style={styles.alertLabel}>active SOS {activeSos === 1 ? "alert" : "alerts"}</Text>
          <Button title="Open SOS alerts" variant="danger" small onPress={() => router.push("/(admin)/sos")} />
        </Card>
      ) : null}

      <View style={styles.tiles}>
        <Tile label="Pending bookings" value={pendingBookings} onPress={() => router.push("/(admin)/bookings")} />
        <Tile label="Pending payouts" value={pendingWithdrawals} onPress={() => router.push("/(admin)/withdrawals")} />
        <Tile label="Users" value={(users.data ?? []).length} onPress={() => router.push("/(admin)/users")} />
        <Tile label="Bookings" value={(bookings.data ?? []).length} onPress={() => router.push("/(admin)/bookings")} />
      </View>

      {users.error ? <ErrorNote message={users.error} onRetry={users.reload} /> : null}

      <Card>
        <Heading level={2}>Manage</Heading>
        <View style={styles.links}>
          <Button title="Users and accounts" variant="outline" onPress={() => router.push("/(admin)/users")} />
          <Button title="Workshops" variant="outline" onPress={() => router.push("/(admin)/workshops")} />
          <Button title="Deliveries" variant="outline" onPress={() => router.push("/(admin)/deliveries")} />
          <Button title="CCTV sightings" variant="outline" onPress={() => router.push("/(admin)/cctv")} />
        </View>
      </Card>

      <Button title="Sign out" variant="ghost" onPress={logout} />
    </Screen>
  );
}

function Tile({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Button title="Open" variant="ghost" small onPress={onPress} />
    </Card>
  );
}

const styles = StyleSheet.create({
  alert: { borderColor: colors.red500, backgroundColor: "#fef2f2", gap: spacing.sm, ...shadow(2) },
  alertCount: { fontSize: 40, fontWeight: "800", color: colors.red500 },
  alertLabel: { color: colors.red500, fontWeight: "600" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: "45%", gap: spacing.xs },
  tileValue: { fontSize: 30, fontWeight: "800", color: colors.navy900 },
  tileLabel: { color: colors.slate600, fontSize: 13 },
  links: { gap: spacing.md, marginTop: spacing.md },
});
