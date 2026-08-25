import { useEffect } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useGoogleAuth, GOOGLE_CONFIGURED } from "../lib/useGoogleAuth";
import { Button } from "./ui";
import { colors, spacing } from "../theme";

/**
 * The "Continue with Google" button, plus its divider.
 *
 * This component exists to isolate a hook that cannot be called safely.
 * expo-auth-session throws during render when no OAuth client ID is set for
 * the current platform, and a hook cannot be called conditionally — so the
 * guard has to live at the component boundary instead. `GoogleButton` returns
 * null before `Inner` (which owns the hook) is ever mounted.
 *
 * The result is that a project with no OAuth clients configured simply shows
 * no Google button, rather than crashing the login screen.
 */
export function GoogleSignInButton({
  onToken,
}: {
  onToken: (sessionToken: string) => Promise<unknown>;
}) {
  // Deliberately checked before rendering Inner, never inside it.
  if (!GOOGLE_CONFIGURED) return null;
  return <Inner onToken={onToken} />;
}

function Inner({ onToken }: { onToken: (sessionToken: string) => Promise<unknown> }) {
  const google = useGoogleAuth(onToken);

  useEffect(() => {
    if (google.error) Alert.alert("Google sign-in failed", google.error);
  }, [google.error]);

  // `available` goes true once the auth request has been prepared, which takes
  // a tick. Rendering the button before then would let a tap no-op.
  if (!google.available) return null;

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.line} />
      </View>
      <Button
        title="Continue with Google"
        variant="outline"
        onPress={google.signIn}
        loading={google.busy}
      />
    </>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.slate200 },
  dividerText: { color: colors.slate400, fontSize: 13 },
});
