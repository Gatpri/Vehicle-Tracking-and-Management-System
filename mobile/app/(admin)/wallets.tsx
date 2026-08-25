import { AdminList, ListRow } from "../../src/components/AdminList";
import { Row } from "../../src/components/ui";
import { formatMoney, type WalletInfo, type UserRecord } from "../../src/lib/types";

/**
 * Ported from the web app's AdminWalletsPage.tsx — every wallet on the
 * platform, for accounting to check a balance while reviewing a payout.
 *
 * Read-only by design: money moves through bookings and withdrawals, never by
 * an admin editing a number here.
 */
type WalletRow = WalletInfo & { user?: UserRecord | string; float?: number; pendingWithdrawal?: number };

export default function AdminWalletsScreen() {
  return (
    <AdminList<WalletRow>
      title="Wallets"
      subtitle="Balances across the platform."
      path="/wallet/all"
      select={(d) => d.wallets ?? []}
      keyExtractor={(w) => w._id ?? String(w.user)}
      emptyMessage="No wallets yet."
      renderItem={(w) => (
        <ListRow
          title={
            typeof w.user === "object" && w.user
              ? `${w.user.firstname ?? ""} ${w.user.lastname ?? ""}`.trim() || w.user.email
              : "Wallet"
          }
          subtitle={typeof w.user === "object" && w.user ? w.user.role : undefined}
        >
          <Row label="Balance" value={formatMoney(w.balance)} />
          {/* `float` is the real eSewa money behind the virtual balances, and
              only the company wallet has it — see models/Wallet.js. */}
          {typeof w.float === "number" && w.float !== 0 ? (
            <Row label="Float" value={formatMoney(w.float)} />
          ) : null}
          {typeof w.pendingWithdrawal === "number" && w.pendingWithdrawal !== 0 ? (
            <Row label="Held for payout" value={formatMoney(w.pendingWithdrawal)} />
          ) : null}
        </ListRow>
      )}
    />
  );
}
