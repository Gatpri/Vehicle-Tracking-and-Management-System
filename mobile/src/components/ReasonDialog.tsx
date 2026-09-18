import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "./ui";
import { colors, radius, shadow, spacing } from "../theme";

/**
 * "Tell us why" — the confirmation step for stopping a booking, used by the
 * customer cancelling and by a workshop rejecting.
 *
 * A component rather than Alert.prompt, which exists only on iOS: the same
 * call on Android silently renders a promptless alert, so the reason would
 * come back empty and the backend — which requires one — would reject every
 * cancellation made from an Android phone.
 *
 * The confirm button stays disabled until the text clears MIN_REASON_LENGTH,
 * mirroring the server's own floor so the user finds out before the round
 * trip rather than after it.
 */

// Must match MIN_REASON_LENGTH in backend_api/controllers/bookingController.js.
const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

export interface ReasonDialogProps {
  visible: boolean;
  title: string;
  /** One line of context above the box — what this reason will be used for. */
  message?: string;
  placeholder?: string;
  /** Label for the destructive action. */
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ReasonDialog({
  visible,
  title,
  message,
  placeholder = "Tell them why…",
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");

  // Clear on open, not on close: wiping it as the dialog dismisses makes the
  // text visibly vanish during the animation.
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LENGTH;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Tapping the backdrop dismisses, the way a native alert does. The
          sheet itself swallows the press so a tap inside never closes it. */}
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.centre}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder={placeholder}
              placeholderTextColor={colors.slate400}
              multiline
              numberOfLines={4}
              maxLength={MAX_REASON_LENGTH}
              autoFocus
              textAlignVertical="top"
              autoCapitalize="sentences"
              editable={!busy}
            />

            <Text style={styles.counter}>
              {tooShort
                ? `At least ${MIN_REASON_LENGTH} characters`
                : `${trimmed.length}/${MAX_REASON_LENGTH}`}
            </Text>

            <View style={styles.actions}>
              <Button title="Back" variant="ghost" small onPress={onCancel} disabled={busy} />
              <Button
                title={confirmLabel}
                variant="danger"
                small
                loading={busy}
                disabled={tooShort}
                onPress={() => onConfirm(trimmed)}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  centre: { flex: 1, justifyContent: "center", padding: spacing.lg },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow(2),
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.navy900 },
  message: { fontSize: 13, color: colors.slate600, lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 96,
    fontSize: 14,
    color: colors.navy900,
    backgroundColor: colors.bgAlt,
    marginTop: spacing.xs,
  },
  counter: { fontSize: 11, color: colors.slate400, textAlign: "right" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
