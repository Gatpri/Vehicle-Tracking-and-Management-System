import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  RefreshControl,
} from "react-native";
import type { TextInputProps, ViewStyle } from "react-native";
import { colors, radius, spacing, shadow, statusColor } from "../theme";

/**
 * The shared primitives every screen is built from — the RN equivalents of the
 * web app's .uh-btn / .uh-card / .uh-page classes.
 *
 * These exist so the ported screens do not each hand-roll their own styling.
 * On the web that job was done by theme.css being global; RN has no global
 * stylesheet, so the reuse has to take the form of components.
 */

type ButtonVariant = "primary" | "orange" | "danger" | "ghost" | "outline";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const bg: Record<ButtonVariant, string> = {
    primary: colors.blue700,
    orange: colors.orange500,
    danger: colors.red500,
    ghost: colors.slate100,
    outline: "transparent",
  };
  const fg: Record<ButtonVariant, string> = {
    primary: "#fff",
    orange: "#fff",
    danger: "#fff",
    ghost: colors.navy900,
    outline: colors.navy900,
  };
  // `loading` implies disabled: a button showing a spinner must not queue a
  // second request if it is tapped again.
  const isOff = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      // The web used :hover, which does not exist on touch. Pressed-state
      // opacity is the native equivalent and the only feedback a tap gets.
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSm,
        { backgroundColor: bg[variant] },
        variant === "outline" && styles.btnOutline,
        isOff && styles.btnOff,
        pressed && !isOff && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg[variant]} />
      ) : (
        <Text style={[styles.btnText, small && styles.btnTextSm, { color: fg[variant] }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Heading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 | 3 }) {
  return <Text style={[styles.heading, level === 2 && styles.h2, level === 3 && styles.h3]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.slate400}
        style={styles.input}
        // Sensible native defaults the web got for free: iOS otherwise
        // capitalises the first letter of every field, including emails.
        autoCapitalize={props.autoCapitalize ?? "none"}
        {...props}
      />
    </View>
  );
}

/** Coloured state pill, matching how the web app renders booking status. */
export function Badge({ status }: { status?: string }) {
  const color = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a`, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{status || "unknown"}</Text>
    </View>
  );
}

/** Full-screen spinner for the initial load of a screen. */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.blue700} />
      {label ? <Text style={styles.mutedSpaced}>{label}</Text> : null}
    </View>
  );
}

/** Inline error with an optional retry — the offline case is routine here. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.errorCard}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button title="Try again" variant="ghost" small onPress={onRetry} style={styles.errorBtn} /> : null}
    </Card>
  );
}

/** What a list renders when it has loaded successfully and holds nothing. */
export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

/**
 * Standard screen wrapper: page padding plus pull-to-refresh, which is the
 * expected way to reload on mobile and has no web counterpart.
 */
export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      // contentInsetAdjustmentBehavior lets the navigator apply the tab-bar
      // and safe-area insets itself. Computing them here instead left the
      // scroll view's touch region disagreeing with what was drawn.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.screenContent}
      // Dragging the list puts the keyboard away — the expected gesture on
      // both platforms, and the main way out of a keyboard that has no visible
      // dismiss key.
      keyboardDismissMode="on-drag"
      // "handled" keeps buttons live while the keyboard is up. Without it the
      // first tap outside a field is swallowed dismissing the keyboard, so a
      // button under it appears not to work and has to be tapped twice.
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.blue700} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Label/value row — the mobile stand-in for the web's detail tables. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    // 44pt is the minimum comfortable touch target; the web's 10px padding
    // would land well under it.
    minHeight: 44,
  },
  btnSm: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 },
  btnOutline: { borderWidth: 1.5, borderColor: colors.slate200 },
  btnOff: { opacity: 0.55 },
  btnPressed: { opacity: 0.8 },
  btnText: { fontWeight: "600", fontSize: 15 },
  btnTextSm: { fontSize: 13 },
  card: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow(1),
  },
  heading: { fontSize: 24, fontWeight: "700", color: colors.navy900 },
  h2: { fontSize: 19 },
  h3: { fontSize: 16 },
  muted: { color: colors.slate600, lineHeight: 21 },
  mutedSpaced: { color: colors.slate600, marginTop: spacing.md },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.navy900 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.slate900,
    backgroundColor: colors.bg,
    minHeight: 46,
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  errorCard: { borderColor: colors.red500, backgroundColor: "#fef2f2", gap: spacing.md },
  errorText: { color: colors.red500, fontWeight: "500" },
  errorBtn: { alignSelf: "flex-start" },
  screen: { flex: 1, backgroundColor: colors.bgAlt },
  screenContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLabel: { color: colors.slate600, fontSize: 14 },
  rowValue: { color: colors.navy900, fontWeight: "600", fontSize: 14, flexShrink: 1, textAlign: "right" },
});
