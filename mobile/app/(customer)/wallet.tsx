import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useApi } from "../../src/lib/useApi";
import { openEsewaCheckout } from "../../src/lib/esewa";
import { Screen, Card, Heading, Muted, Button, Badge, Field, Loading, ErrorNote, Empty, Row } from "../../src/components/ui";
import { colors, spacing, shadow } from "../../src/theme";
import { formatMoney, formatDate, type WalletInfo, type Transaction, type Withdrawal } from "../../src/lib/types";

/**
 * Ported from the web app's WalletPage.tsx — balance, top-up, withdrawals and
 * the transaction ledger.
 *
 * Watch the units. Everything the API returns is paisa (formatMoney divides),
 * but top-up and withdrawal are *sent* as `amountNpr` in rupees. That
 * asymmetry is the backend's convention, and both directions are exercised on
 * this one screen, so it is the easiest place to get wrong.
 */
export default function WalletScreen() {
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

  const [topupAmount, setTopupAmount] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdEsewaId, setWdEsewaId] = useState("");
  const [wdName, setWdName] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshAll = () => {
    wallet.refresh();
    transactions.refresh();
    withdrawals.refresh();
  };

  const topup = async () => {
    const amountNpr = Number(topupAmount);
    if (!amountNpr || amountNpr <= 0) {
      Alert.alert("Enter an amount", "Type how much you want to add, in rupees.");
      return;
    }
    setBusy(true);
    try {
      // Sent in rupees, deliberately — see the note at the top of this file.
      const res = await api.post("/wallet/topup/initiate", { amountNpr });
      await openEsewaCheckout(res.data.url, res.data.fields);
      setTopupAmount("");
      // The browser closing does not mean the payment succeeded; eSewa tells
      // the backend directly, so refetch to find out what actually happened.
      refreshAll();
    } catch (err) {
      Alert.alert("Could not start top-up", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const requestWithdrawal = async () => {
    const amountNpr = Number(wdAmount);
    if (!amountNpr || amountNpr <= 0) {
      Alert.alert("Enter an amount", "Type how much you want to withdraw, in rupees.");
      return;
    }
    if (!wdEsewaId.trim()) {
      Alert.alert("eSewa ID needed", "Enter the eSewa ID the money should be sent to.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/withdrawals", {
        amountNpr,
        esewaId: wdEsewaId.trim(),
        accountName: wdName.trim(),
      });
      setWdAmount("");
      Alert.alert("Requested", "Your withdrawal is awaiting review.");
      refreshAll();
    } catch (err) {
      Alert.alert("Could not request", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (wallet.loading) return <Loading label="Loading your wallet…" />;

  return (
    <Screen refreshing={wallet.refreshing} onRefresh={refreshAll}>
      <Card style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        <Text style={styles.balanceAmount}>{formatMoney(wallet.data?.balance)}</Text>
      </Card>

      {wallet.error ? <ErrorNote message={wallet.error} onRetry={wallet.reload} /> : null}

      <Card>
        <Heading level={2}>Add money</Heading>
        <Muted>Top up through eSewa.</Muted>
        <Field
          label="Amount (Rs)"
          value={topupAmount}
          onChangeText={setTopupAmount}
          placeholder="1000"
          keyboardType="number-pad"
          editable={!busy}
        />
        <Button title="Top up with eSewa" onPress={topup} loading={busy} />
      </Card>

      <Card>
        <Heading level={2}>Withdraw</Heading>
        <Muted>Paid out to your eSewa account after review.</Muted>
        <Field
          label="Amount (Rs)"
          value={wdAmount}
          onChangeText={setWdAmount}
          placeholder="500"
          keyboardType="number-pad"
          editable={!busy}
        />
        <Field
          label="eSewa ID"
          value={wdEsewaId}
          onChangeText={setWdEsewaId}
          placeholder="98XXXXXXXX"
          keyboardType="phone-pad"
          editable={!busy}
        />
        <Field
          label="Account name"
          value={wdName}
          onChangeText={setWdName}
          placeholder="As registered with eSewa"
          autoCapitalize="words"
          editable={!busy}
        />
        <Button title="Request withdrawal" variant="orange" onPress={requestWithdrawal} loading={busy} />
      </Card>

      <Heading level={2}>Withdrawals</Heading>
      {(withdrawals.data ?? []).length === 0 ? (
        <Empty message="No withdrawal requests yet." />
      ) : (
        (withdrawals.data ?? []).map((w) => (
          <Card key={w._id}>
            <View style={styles.head}>
              <Text style={styles.title}>{formatMoney(w.amount)}</Text>
              <Badge status={w.status} />
            </View>
            <Row label="Requested" value={formatDate(w.createdAt)} />
            {w.esewaId ? <Row label="To" value={w.esewaId} /> : null}
            {w.rejectionReason ? <Row label="Reason" value={w.rejectionReason} /> : null}
          </Card>
        ))
      )}

      <Heading level={2}>Transactions</Heading>
      {(transactions.data ?? []).length === 0 ? (
        <Empty message="No transactions yet." />
      ) : (
        (transactions.data ?? []).map((t) => (
          <Card key={t._id}>
            <View style={styles.head}>
              <View style={styles.headMain}>
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
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  headMain: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
  amount: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
});
