import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useNotifications } from "../lib/NotificationContext";
import { colors, radius } from "../theme";

/**
 * The header notification button — icon only, with an unread count badge.
 *
 * Notifications are time-sensitive (a booking moved, an estimate to answer, a
 * payment request), so they get a fixed corner of the header rather than a
 * navigation entry someone has to go looking for. Icon-only is deliberate: it
 * sits in the header's action slot, where a label would crowd the title.
 *
 * `to` is passed in because the route differs per area — the customer and
 * staff groups each have their own notifications screen.
 */
export function NotificationBell({ to }: { to: string }) {
  const { unread } = useNotifications();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(to as never)}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      accessibilityRole="button"
      // The count belongs in the label too: the badge is colour and position
      // only, which a screen reader cannot convey.
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Text style={styles.glyph}>{"\u{1F514}"}</Text>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44pt wide keeps the touch target comfortable even though the glyph is
  // small; marginRight pulls it off the screen edge.
  btn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 },
  pressed: { opacity: 0.6 },
  glyph: { fontSize: 20, color: "#fff" },
  badge: {
    position: "absolute",
    top: 6,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: radius.pill,
    backgroundColor: colors.red500,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    // Separates the badge from a dark header when the two are close in tone.
    borderWidth: 1.5,
    borderColor: colors.navy900,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
