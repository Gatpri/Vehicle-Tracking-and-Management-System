import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { GoogleSignInButton } from "../../src/components/GoogleSignInButton";
import { Button, Field, Heading, Muted } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";

/**
 * Ported from the web app's AUthentication_Components/Pages/Login.tsx.
 *
 * The request and the error handling are the same. Two things differ:
 *
 *   The response now carries a token, because config/clientKind.js sees the
 *   x-client header this app sends. signIn() puts it in the device keystore
 *   and then loads /me — the web version had nothing to store, since its
 *   session arrived as a cookie.
 *
 *   No navigate() call. The root layout's guard watches auth status and moves
 *   the user to landingPathFor(role) as soon as they are authenticated, so
 *   navigating here as well would race it.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post("/login", { email: email.trim(), password });
      if (result.data.success && result.data.token) {
        await signIn(result.data.token);
        return; // The route guard takes it from here.
      }
      // A success with no token means the backend did not recognise this as a
      // native client, which is a configuration problem rather than a bad
      // password — say so instead of showing "invalid credentials".
      Alert.alert("Sign-in failed", result.data.message || "The server did not return a session token.");
    } catch (err) {
      Alert.alert("Sign-in failed", getErrorMessage(err, "Could not sign you in."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Without this the keyboard covers the password field and the sign-in
      // button on shorter devices.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Heading>Welcome back</Heading>
          <Muted>Sign in to manage your vehicles, bookings and safety alerts.</Muted>
        </View>

        <View style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoComplete="current-password"
            editable={!busy}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          <Button title="Sign in" onPress={handleSubmit} loading={busy} />

          {/* Renders nothing until the OAuth client IDs exist — see
              components/GoogleSignInButton.tsx for why that guard cannot live
              inside this screen. */}
          <GoogleSignInButton onToken={signIn} />

          <Link href="/recover" style={styles.link}>
            <Text style={styles.linkText}>Forgot your password?</Text>
          </Link>
        </View>

        <View style={styles.footer}>
          <Muted>New here?</Muted>
          <Link href="/signup" style={styles.link}>
            <Text style={styles.linkText}>Create an account</Text>
          </Link>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgAlt },
  container: { padding: spacing.xl, gap: spacing.xxl, flexGrow: 1, justifyContent: "center" },
  header: { gap: spacing.sm },
  form: { gap: spacing.lg },
  footer: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "center" },
  link: { alignSelf: "center" },
  linkText: { color: colors.blue700, fontWeight: "600" },
});
