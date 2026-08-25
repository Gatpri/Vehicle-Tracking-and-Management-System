import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Screen, Card, Heading, Muted, Button, Badge, Field, Loading, ErrorNote, Empty, Row } from "./ui";
import { colors, spacing, shadow } from "../theme";
import { formatMoney, formatDate, type WalletInfo, type Transaction, type Withdrawal } from "../lib/types";

/**
 * Earnings and payouts for a staff member — the mobile version of the web
 * app's AdminMyWalletPage.tsx, which the web router also reused for both the
 * admin area and the delivery-staff area.
 *
 * Kept as a shared component for the same reason: an admin and a driver want
 * exactly the same thing here (what have I earned, pay it out), and the
 * endpoints are identical. Only the wording differs.
 *
 * Unlike the customer wallet there is no top-up — money arrives here by doing
 * the work, not by paying in.
 */
export function MyWallet({ title, subtitle }: { title: string; subtitle: string }) {
  const wallet = useApi<WalletInfo | null>("/wallet", (d) => d.wallet ?? null, "Could not load your wallet.");
  const transactions = useApi<Transaction[]>(
    "/wallet/transactions",
    (d) => d.transactions ?? [],
    "Could not load your transactions."
  );
  const withdrawals = useApi<Withdrawal[]>(
    "/withdrawals/mine",
    (d) => d.withdrawals ?? [],
    "Could not load your withdrawals."
  );

  const [amount, setAmount] = useState("");
  const [esewaId, setEsewaId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshAll = () => {
    wallet.refresh();
    transactions.refresh();
    withdrawals.refresh();
  };

  const request = async () => {
    const amountNpr = Number(amount);
    if (!amountNpr || amountNpr <= 0) {
      Alert.alert("Enter an amount", "Type how much you want paid out, in rupees.");
      return;
    }
    if (!esewaId.trim()) {
      Alert.alert("eSewa ID needed", "Enter the eSewa ID the money should be sent to.");
      return;
    }
    setBusy(true);
    try {
      // Rupees on the way in, paisa on the way out — the backend's convention.
      await api.post("/withdrawals", {
        amountNpr,
        esewaId: esewaId.trim(),
        accountName: name.trim(),
      });
      setAmount("");
      Alert.alert("Requested", "Your payout is awaiting review.");
      refreshAll();
    } catch (err) {
      Alert.alert("Could not request", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (wallet.loading) return <Loading label="Loading your earnings…" />;

  return (
    <Screen refreshing={wallet.refreshing} onRefresh={refreshAll}>
      <Card style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{title}</Text>
        <Text style={styles.balanceAmount}>{formatMoney(wallet.data?.balance)}</Text>
        <Text style={styles.balanceHint}>{subtitle}</Text>
      </Card>

      {wallet.error ? <ErrorNote message={wallet.error} onRetry={wallet.reload} /> : null}

      <Card>
        <Heading level={2}>Request a payout</Heading>
        <Field
          label="Amount (Rs)"
          value={amount}
          onChangeText={setAmount}
          placeholder="500"
          keyboardType="number-pad"
          editable={!busy}
        />
        <Field
          label="eSewa ID"
          value={esewaId}
          onChangeText={setEsewaId}
          placeholder="98XXXXXXXX"
          keyboardType="phone-pad"
          editable={!busy}
        />
        <Field
          label="Account name"
          value={name}
          onChangeText={setName}
          placeholder="As registered with eSewa"
          autoCapitalize="words"
          editable={!busy}
        />
        <Button title="Request payout" variant="orange" onPress={request} loading={busy} />
      </Card>

      <Heading level={2}>Payouts</Heading>
      {(withdrawals.data ?? []).length === 0 ? (
        <Empty message="No payout requests yet." />
      ) : (
        (withdrawals.data ?? []).map((w) => (
          <Card key={w._id}>
            <View style={styles.head}>
              <Text style={styles.title}>{formatMoney(w.amount)}</Text>
              <Badge status={w.status} />
            </View>
            <Row label="Requested" value={formatDate(w.createdAt)} />
            {w.rejectionReason ? <Row label="Reason" value={w.rejectionReason} /> : null}
          </Card>
        ))
      )}

      <Heading level={2}>Earnings</Heading>
      {(transactions.data ?? []).length === 0 ? (
        <Empty message="No earnings recorded yet." />
      ) : (
        (transactions.data ?? []).map((t) => (
          <Card key={t._id}>
            <View style={styles.head}>
              <View style={styles.main}>
                <Text style={styles.title}>{t.description || t.type}</Text>
                <Muted>{formatDate(t.createdAt)}</Muted>
              </View>
              <Text style={styles.amount}>{formatMoney(t.amount)}</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.navy900, borderColor: colors.navy800, ...shadow(2) },
  balanceLabel: { color: colors.slate400, fontSize: 13, fontWeight: "600" },
  balanceAmount: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: spacing.xs },
  balanceHint: { color: colors.slate400, fontSize: 12, marginTop: spacing.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
  amount: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
});
