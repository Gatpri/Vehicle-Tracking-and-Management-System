import { MyWallet } from "../../src/components/MyWallet";

/**
 * An admin's own wallet — the same component the delivery-staff earnings
 * screen uses, matching how the web router reused AdminMyWalletPage for both.
 */
export default function AdminMyWalletScreen() {
  return (
    <MyWallet
      title="Your balance"
      subtitle="Your personal balance on the platform."
    />
  );
}
