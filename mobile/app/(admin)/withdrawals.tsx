import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { getSocket } from "../../src/lib/socket";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatMoney, formatDateTime, type Withdrawal, type UserRecord } from "../../src/lib/types";

/**
 * Ported from the web app's AdminWithdrawalsPage.tsx — the payout queue.
 *
 * Approving moves real money, so both actions confirm first and a rejection
 * asks for a reason, which the requester sees on their own wallet screen.
 * Only a role holding withdrawal:review sees the buttons at all; everyone else
 * with withdrawal:read:any gets a read-only list, matching the web page.
 */
export default function AdminWithdrawalsScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canReview = hasPermission(user?.role, "withdrawal:review", user?.permissions ?? []);

  useEffect(() => {
    const socket = getSocket();
    const bump = () => setRefreshKey((k) => k + 1);
    socket.on("withdrawal:new", bump);
    return () => {
      socket.off("withdrawal:new", bump);
    };
  }, []);

  const approve = (w: Withdrawal, reload: () => void) => {
    Alert.alert("Approve this payout?", `${formatMoney(w.amount)} will be paid out.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          setBusyId(w._id);
          try {
            await api.patch(`/withdrawals/${w._id}/approve`);
            reload();
            setRefreshKey((k) => k + 1);
          } catch (err) {
            Alert.alert("Could not approve", getErrorMessage(err, "Please try again."));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const doReject = async (w: Withdrawal, reason: string, reload: () => void) => {
    setBusyId(w._id);
    try {
      await api.patch(`/withdrawals/${w._id}/reject`, { reason });
      reload();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not reject", getErrorMessage(err, "Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const reject = (w: Withdrawal, reload: () => void) => {
    // Alert.prompt is iOS-only — it does not exist on Android, so the platform
    // is checked explicitly rather than relying on a falsy return value (it
    // returns undefined on iOS too, which would make a ?? fallback fire on
    // both platforms and show two dialogs).
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Reject this payout",
        "Give a reason the requester will see.",
        (reason) => doReject(w, reason ?? "", reload)
      );
      return;
    }

    Alert.alert("Reject this payout?", "The requester will be told it was rejected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => doReject(w, "", reload) },
    ]);
  };

  return (
    <AdminList<Withdrawal & { user?: UserRecord | string }>
      title="Withdrawals"
      subtitle={canReview ? "Review and pay out requests." : "Payout requests across the platform."}
      path="/withdrawals"
      select={(d) => d.withdrawals ?? []}
      keyExtractor={(w) => w._id}
      emptyMessage="No withdrawal requests."
      refreshKey={refreshKey}
      renderItem={(w, reload) => {
        const pending = (w.status || "").toLowerCase() === "pending";
        return (
          <ListRow
            title={formatMoney(w.amount)}
            subtitle={
              typeof w.user === "object" && w.user
                ? `${w.user.firstname ?? ""} ${w.user.lastname ?? ""}`.trim() || w.user.email
                : undefined
            }
            trailing={<Badge status={w.status} />}
          >
            <Row label="Requested" value={formatDateTime(w.createdAt)} />
            {w.esewaId ? <Row label="eSewa ID" value={w.esewaId} /> : null}
            {w.rejectionReason ? <Row label="Reason" value={w.rejectionReason} /> : null}

            {canReview && pending ? (
              <View style={styles.actions}>
                <Button title="Approve" small loading={busyId === w._id} onPress={() => approve(w, reload)} />
                <Button title="Reject" variant="danger" small disabled={busyId === w._id} onPress={() => reject(w, reload)} />
              </View>
            ) : null}
          </ListRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
