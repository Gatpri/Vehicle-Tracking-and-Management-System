import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ProfileView } from "../../src/components/ProfileView";
import { Card, Heading, Muted, Button } from "../../src/components/ui";
import { spacing } from "../../src/theme";

/**
 * The delivery-staff account screen.
 *
 * Deliberately thin: ProfileView already carries identity and sign-out, and a
 * driver's numbers live on Earnings — repeating the balance here would mean a
 * second wallet fetch that can disagree with the screen that owns it.
 */
export default function StaffProfileScreen() {
  const router = useRouter();

  return (
    <ProfileView>
      <Card>
        <Heading level={2}>Earnings</Heading>
        <Muted>Delivery fees you have earned, and withdrawals.</Muted>
        <Button
          title="View earnings"
          variant="outline"
          onPress={() => router.push("/(staff)/earnings")}
          style={styles.action}
        />
      </Card>
    </ProfileView>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.md },
});
