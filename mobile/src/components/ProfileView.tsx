import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";
import { Screen, Card, Heading, Muted, Button, Row, Loading } from "./ui";
import { colors, radius, spacing } from "../theme";

/**
 * The account screen body, shared by the customer and staff areas.
 *
 * Both roles show the same identity block and the same sign-out; only the
 * extra cards differ, which is what `children` is for. Keeping one component
 * means the two cannot drift apart on how the account is presented.
 *
 * Everything here comes from /me via AuthContext. The endpoint returns
 * identity and role only — no phone or address — so this screen shows what is
 * actually known rather than rendering empty rows for fields the API does not
 * send.
 */

const initials = (first?: string, last?: string) =>
  `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "?";

const ROLE_LABELS: Record<string, string> = {
  customer: "Vehicle owner",
  "delivery-staff": "Delivery staff",
  "delivery-admin": "Delivery admin",
  workshop: "Workshop",
  admin: "Administrator",
  superadmin: "Administrator",
};

export function ProfileView({ children }: { children?: ReactNode }) {
  const { user, status, logout, refresh } = useAuth();

  const confirmLogout = () => {
    // Signing out drops the keystore token, so a mis-tap costs a full
    // re-login. Alert is the native confirm; on web it is a no-op shim, so
    // that platform goes straight through.
    if (Platform.OS === "web") {
      void logout();
      return;
    }
    Alert.alert("Sign out", "You'll need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  if (status === "loading") return <Loading label="Loading your profile..." />;

  const fullName = [user?.firstname, user?.lastname].filter(Boolean).join(" ");

  return (
    <Screen onRefresh={() => void refresh()}>
      <Card style={styles.idCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.firstname, user?.lastname)}</Text>
        </View>
        <Text style={styles.name}>{fullName || "Your account"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        {user?.role ? (
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Heading level={2}>Account details</Heading>
        <View style={styles.rows}>
          <Row label="Name" value={fullName || "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Role" value={user?.role ? ROLE_LABELS[user.role] ?? user.role : "—"} />
        </View>
        <Muted>
          Contact an administrator to change the name or email on this account.
        </Muted>
      </Card>

      {children}

      <Card style={styles.dangerCard}>
        <Heading level={2}>Session</Heading>
        <Muted>Signing out removes this device&apos;s saved login.</Muted>
        <Button title="Sign out" variant="danger" onPress={confirmLogout} style={styles.signOut} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  idCard: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.blue700,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 26 },
  name: { fontSize: 20, fontWeight: "700", color: colors.navy900 },
  email: { fontSize: 13, color: colors.slate600 },
  rolePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.slate100,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  roleText: { color: colors.navy900, fontSize: 12, fontWeight: "700" },
  rows: { marginVertical: spacing.sm },
  dangerCard: { gap: spacing.sm },
  signOut: { marginTop: spacing.sm },
});
