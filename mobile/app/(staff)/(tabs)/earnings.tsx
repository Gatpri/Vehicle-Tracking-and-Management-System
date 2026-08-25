import { MyWallet } from "../../../src/components/MyWallet";

/**
 * Delivery-staff earnings. The whole screen is the shared MyWallet component,
 * which the admin area reuses with different wording.
 */
export default function StaffEarningsScreen() {
  return (
    <MyWallet
      title="Your earnings"
      subtitle="Delivery fees you have earned, ready to withdraw."
    />
  );
}
