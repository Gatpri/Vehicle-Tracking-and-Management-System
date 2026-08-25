import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import api, { getErrorMessage } from "../../src/lib/api";
import { Button, Field, Heading, Muted } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";

/**
 * Password recovery: the web app's Recover.tsx and reset_password.tsx combined
 * into one screen with three stages.
 *
 * The web split these across two routes because an emailed link had to land
 * somewhere. Here the user stays in the app the whole time and types the OTP
 * they were sent, so separate routes would only add navigation for its own
 * sake — the backend flow (send-otp, verify-otp, reset-password) is unchanged.
 */
type Stage = "email" | "otp" | "reset";

export default function RecoverScreen() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const sendOtp = async () => {
    if (!email.trim()) {
      Alert.alert("Missing email", "Enter the email address on your account.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/send-otp", { email: email.trim() });
      if (res.data.success) {
        setStage("otp");
        Alert.alert("Code sent", "Check your email for a one-time code.");
      } else {
        Alert.alert("Could not send code", res.data.message || "Please try again.");
      }
    } catch (err) {
      Alert.alert("Could not send code", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert("Missing code", "Enter the code from your email.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/verify-otp", { email: email.trim(), otp: otp.trim() });
      if (res.data.success) {
        // The server hands back a short-lived token that authorises the reset;
        // it is held only in state, never persisted — it is not a session.
        setResetToken(res.data.resetToken);
        setStage("reset");
      } else {
        Alert.alert("Incorrect code", res.data.message || "Check the code and try again.");
      }
    } catch (err) {
      Alert.alert("Incorrect code", getErrorMessage(err, "Check the code and try again."));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Re-enter the same password in both fields.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/reset-password", {
        email: email.trim(),
        newPassword: password,
        resetToken,
      });
      if (res.data.success) {
        Alert.alert("Password updated", "Sign in with your new password.", [
          { text: "OK", onPress: () => router.replace("/login") },
        ]);
      } else {
        Alert.alert("Could not reset", res.data.message || "Please try again.");
      }
    } catch (err) {
      Alert.alert("Could not reset", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Heading>Reset your password</Heading>
          <Muted>
            {stage === "email"
              ? "We will email you a one-time code."
              : stage === "otp"
              ? `Enter the code we sent to ${email}.`
              : "Choose a new password."}
          </Muted>
        </View>

        <View style={styles.form}>
          {stage === "email" ? (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
                onSubmitEditing={sendOtp}
                returnKeyType="send"
              />
              <Button title="Send code" onPress={sendOtp} loading={busy} />
            </>
          ) : null}

          {stage === "otp" ? (
            <>
              <Field
                label="One-time code"
                value={otp}
                onChangeText={setOtp}
                placeholder="123456"
                keyboardType="number-pad"
                editable={!busy}
                onSubmitEditing={verifyOtp}
                returnKeyType="go"
              />
              <Button title="Verify code" onPress={verifyOtp} loading={busy} />
              <Button title="Send it again" variant="ghost" small onPress={sendOtp} disabled={busy} />
            </>
          ) : null}

          {stage === "reset" ? (
            <>
              <Field
                label="New password"
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
                placeholder="Repeat your new password"
                secureTextEntry
                editable={!busy}
                onSubmitEditing={resetPassword}
                returnKeyType="go"
              />
              <Button title="Update password" onPress={resetPassword} loading={busy} />
            </>
          ) : null}
        </View>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>Back to sign in</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgAlt },
  container: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: "center" },
  header: { gap: spacing.sm },
  form: { gap: spacing.lg },
  link: { alignSelf: "center" },
  linkText: { color: colors.blue700, fontWeight: "600" },
});
