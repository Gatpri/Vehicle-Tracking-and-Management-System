import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import api, { getErrorMessage } from "../../src/lib/api";
import { Button, Field, Heading, Muted } from "../../src/components/ui";
import { colors, radius, shadow, spacing } from "../../src/theme";

/**
 * Ported from the web app's Signin.tsx (the registration screen), and now
 * following the same three-stage workflow it does rather than the earlier
 * fire-and-forget version:
 *
 *   form  -> POST /register, which stores a PendingUser and emails a link
 *   sent  -> a centered "check your email" card that polls
 *            /registration-status until the link is clicked
 *   done  -> "account created" confirmation, then on to /login
 *
 * The polling is what lets the app react to a link opened *outside* it (in
 * Mail or Safari), which is the only place the verification can happen. Without
 * it the user would have to guess when to come back and sign in.
 */

/** Matches the web app's VERIFY_POLL_MS. */
const VERIFY_POLL_MS = 3000;
/** How long the success card sits before the screen moves to /login. */
const REDIRECT_DELAY_MS = 2000;

type Stage = "form" | "sent" | "verified";

export default function SignupScreen() {
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const router = useRouter();

  // Poll only while waiting. A failed poll is deliberately swallowed: the
  // phone may briefly lose wifi while the user switches to their mail app, and
  // an error banner there would be noise — the next tick simply retries.
  useEffect(() => {
    if (stage !== "sent" || !pendingEmail) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get("/registration-status", { params: { email: pendingEmail } });
        if (res.data.verified) {
          clearInterval(interval);
          setStage("verified");
        }
      } catch (err) {
        console.warn("registration-status poll failed:", err);
      }
    }, VERIFY_POLL_MS);

    return () => clearInterval(interval);
  }, [stage, pendingEmail]);

  // Separate from the poll so the "Account created" card is actually seen
  // before the screen changes under the user.
  useEffect(() => {
    if (stage !== "verified") return;
    const timer = setTimeout(() => router.replace("/login"), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage, router]);

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
      const trimmedEmail = email.trim();
      const res = await api.post("/register", {
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: trimmedEmail,
        password,
      });
      if (res.data.success) {
        setPendingEmail(trimmedEmail);
        setStage("sent");
        return;
      }
      Alert.alert("Could not register", res.data.message || "Please try again.");
    } catch (err) {
      // express-validator returns { errors: [{ msg }] } rather than a single
      // message, so "Invalid email format" would otherwise be lost behind the
      // generic fallback — which is exactly the case the user hits most.
      const data = (err as { response?: { data?: { errors?: { msg: string }[] } } })?.response?.data;
      const validationError = data?.errors?.[0]?.msg;
      Alert.alert("Could not register", validationError || getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  // Lets the user correct a typo'd address without killing the app: drops back
  // to the form (which stops the poll) with the fields still filled in.
  const useDifferentEmail = () => {
    setStage("form");
    setPendingEmail("");
  };

  if (stage === "sent" || stage === "verified") {
    const verified = stage === "verified";
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <View style={[styles.badge, verified && styles.badgeOk]}>
            <Text style={styles.badgeText}>{verified ? "✓" : "✉"}</Text>
          </View>

          <Text style={styles.cardTitle}>
            {verified ? "Account created!" : "Verification email sent"}
          </Text>

          <Text style={styles.cardText}>
            {verified
              ? "Your email is verified and your account is ready. Taking you to sign in…"
              : "We sent a verification link to"}
          </Text>

          {!verified && <Text style={styles.cardEmail}>{pendingEmail}</Text>}

          {!verified && (
            <>
              <Text style={styles.cardText}>
                Open your mail app and tap the link to finish creating your account. This screen
                updates on its own once you do.
              </Text>
              <View style={styles.waiting}>
                <ActivityIndicator size="small" color={colors.blue700} />
                <Text style={styles.waitingText}>Waiting for verification…</Text>
              </View>
              <Button title="Use a different email" variant="ghost" onPress={useDifferentEmail} />
            </>
          )}
        </View>
      </View>
    );
  }

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
            // iOS capitalises the first letter by default, which turns a typed
            // address into "You@example.com" and fails the server's isEmail().
            autoCapitalize="none"
            autoCorrect={false}
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

  // The "centered square message" — one card, vertically and horizontally
  // centered, with nothing else competing for attention on the screen.
  centered: {
    flex: 1,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    ...shadow(2),
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.blue700,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  badgeOk: { backgroundColor: colors.green500 },
  badgeText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  cardTitle: { fontSize: 20, fontWeight: "700", color: colors.navy900, textAlign: "center" },
  cardText: { fontSize: 15, color: colors.slate600, textAlign: "center", lineHeight: 22 },
  cardEmail: { fontSize: 15, fontWeight: "700", color: colors.navy900, textAlign: "center" },
  waiting: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  waitingText: { fontSize: 14, color: colors.slate400 },
});
