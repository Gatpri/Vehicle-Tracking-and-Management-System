import { useEffect } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useGoogleAuth, GOOGLE_CONFIGURED } from "../lib/useGoogleAuth";
import { colors, radius, spacing } from "../theme";

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
  label = "Continue with Google",
}: {
  onToken: (sessionToken: string) => Promise<unknown>;
  /** Lets the signup screen say "Sign up with Google" instead. */
  label?: string;
}) {
  // Deliberately checked before rendering Inner, never inside it.
  if (!GOOGLE_CONFIGURED) return null;
  return <Inner onToken={onToken} label={label} />;
}

function Inner({
  onToken,
  label,
}: {
  onToken: (sessionToken: string) => Promise<unknown>;
  label: string;
}) {
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
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.line} />
      </View>

      {/* Hand-rolled rather than the shared <Button/>: Google's brand
          guidelines put their mark to the left of the label, and Button takes
          only a title string. */}
      <Pressable
        onPress={google.signIn}
        disabled={google.busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.btn,
          pressed && !google.busy && styles.btnPressed,
          google.busy && styles.btnBusy,
        ]}
      >
        {google.busy ? (
          <ActivityIndicator size="small" color={colors.slate900} />
        ) : (
          <>
            <GoogleMark />
            <Text style={styles.btnText}>{label}</Text>
          </>
        )}
      </Pressable>
    </>
  );
}

/**
 * Google's "G", built from plain views.
 *
 * react-native-svg is not a dependency here, and pulling one in for a single
 * 18px glyph is not worth it. Four coloured quadrants under a white disc and a
 * blue bar read as the familiar mark at button size.
 */
function GoogleMark() {
  return (
    <View style={styles.gMark}>
      <View style={[styles.gQuad, styles.gTopLeft]} />
      <View style={[styles.gQuad, styles.gTopRight]} />
      <View style={[styles.gQuad, styles.gBottomLeft]} />
      <View style={[styles.gQuad, styles.gBottomRight]} />
      <View style={styles.gHole} />
      <View style={styles.gBar} />
    </View>
  );
}

const G_SIZE = 18;

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.slate200 },
  dividerText: { color: colors.slate400, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: "#fff",
    minHeight: 46,
  },
  btnPressed: { backgroundColor: colors.slate100 },
  btnBusy: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: "600", color: "#3c4043" },

  gMark: {
    width: G_SIZE,
    height: G_SIZE,
    borderRadius: G_SIZE / 2,
    overflow: "hidden",
  },
  gQuad: { position: "absolute", width: G_SIZE / 2, height: G_SIZE / 2 },
  gTopLeft: { top: 0, left: 0, backgroundColor: "#EA4335" },
  gTopRight: { top: 0, right: 0, backgroundColor: "#4285F4" },
  gBottomLeft: { bottom: 0, left: 0, backgroundColor: "#FBBC05" },
  gBottomRight: { bottom: 0, right: 0, backgroundColor: "#34A853" },
  /* The white centre that turns the disc into a ring. */
  gHole: {
    position: "absolute",
    top: G_SIZE * 0.28,
    left: G_SIZE * 0.28,
    width: G_SIZE * 0.44,
    height: G_SIZE * 0.44,
    borderRadius: (G_SIZE * 0.44) / 2,
    backgroundColor: "#fff",
  },
  /* The blue crossbar of the G, reaching in from the right. */
  gBar: {
    position: "absolute",
    top: G_SIZE * 0.42,
    right: 0,
    width: G_SIZE * 0.5,
    height: G_SIZE * 0.22,
    backgroundColor: "#4285F4",
  },
});
