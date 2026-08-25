import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import api, { getErrorMessage } from "../../src/lib/api";
import { Button, Field, Heading, Muted } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";

/**
 * Ported from the web app's Signin.tsx (the registration screen).
 *
 * POSTs the same four fields to /register. Note this does NOT sign the user in:
 * the backend creates a PendingUser and emails a verification link, so there is
 * no session to store yet — the user verifies by email, then signs in.
 */
export default function SignupScreen() {
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!firstname.trim() || !lastname.trim() || !email.trim() || !password) {
      Alert.alert("Missing details", "Fill in every field to continue.");
      return;
    }
    // Checked here as well as on the server so the user is told immediately,
    // rather than after a round-trip.
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Re-enter the same password in both fields.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/register", {
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        password,
      });
      if (res.data.success) {
        Alert.alert(
          "Check your email",
          "We sent you a verification link. Open it, then come back and sign in.",
          [{ text: "OK", onPress: () => router.replace("/login") }]
        );
        return;
      }
      Alert.alert("Could not register", res.data.message || "Please try again.");
    } catch (err) {
      Alert.alert("Could not register", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Heading>Create your account</Heading>
          <Muted>Track your vehicles, book services and raise safety alerts.</Muted>
        </View>

        <View style={styles.form}>
          <Field
            label="First name"
            value={firstname}
            onChangeText={setFirstname}
            placeholder="Ram"
            autoCapitalize="words"
            editable={!busy}
          />
          <Field
            label="Last name"
            value={lastname}
            onChangeText={setLastname}
            placeholder="Shrestha"
            autoCapitalize="words"
            editable={!busy}
          />
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
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            editable={!busy}
          />
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your password"
            secureTextEntry
            editable={!busy}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          <Button title="Create account" onPress={handleSubmit} loading={busy} />
        </View>

        <View style={styles.footer}>
          <Muted>Already have an account?</Muted>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgAlt },
  container: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: "center" },
  header: { gap: spacing.sm },
  form: { gap: spacing.lg },
  footer: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "center" },
  link: {},
  linkText: { color: colors.blue700, fontWeight: "600" },
});
