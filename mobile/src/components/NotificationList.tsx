import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNotifications } from "../lib/NotificationContext";
import { Screen, Card, Heading, Muted, Button, Loading, Empty } from "./ui";
import { colors, spacing } from "../theme";
import { formatDateTime } from "../lib/types";

/**
 * The notifications screen, shared by every role.
 *
 * The web app hangs this off a bell in the header (NotificationBell.tsx); a
 * dropdown panel does not translate to a phone, so it is a full screen with a
 * tab badge instead.
 *
 * All state comes from NotificationContext rather than a fetch here: the badge
 * in the tab bar and this list must never disagree about the unread count, and
 * two independent fetches is how they would.
 */
export function NotificationList() {
  const { items, unread, loading, refresh, markRead, markAllRead } = useNotifications();

  if (loading) return <Loading label="Loading notifications…" />;

  return (
    <Screen onRefresh={refresh}>
      <View style={styles.head}>
        <Heading>Notifications</Heading>
        {unread > 0 ? <Button title="Mark all read" variant="ghost" small onPress={markAllRead} /> : null}
      </View>

      {items.length === 0 ? <Empty message="Nothing to catch up on." /> : null}

      {items.map((n) => (
        <Pressable key={n._id} onPress={() => (n.read ? null : markRead(n._id))}>
          <Card style={n.read ? undefined : styles.unread}>
            <View style={styles.row}>
              <View style={styles.main}>
                <Text style={styles.title}>{n.title || n.type || "Update"}</Text>
                {n.message ? <Muted>{n.message}</Muted> : null}
                <Text style={styles.time}>{formatDateTime(n.createdAt)}</Text>
              </View>
              {!n.read ? <View style={styles.dot} /> : null}
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unread: { borderColor: colors.blue600, backgroundColor: "#f8fbff" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
  time: { color: colors.slate400, fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue600, marginTop: 6 },
});
