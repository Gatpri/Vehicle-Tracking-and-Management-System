import { Tabs } from "expo-router";
import { Text } from "react-native";
import type { ColorValue } from "react-native";
import { SideMenuButton } from "../../../src/components/SideMenu";
import { NotificationBell } from "../../../src/components/NotificationBell";
import { colors } from "../../../src/theme";

/**
 * The delivery driver's primary destinations, as a bottom tab bar.
 *
 * Mirrors the customer split: the screens used on every shift sit on the tab
 * bar, the account and support live in the side menu, notifications in the
 * header. This is a shorter list because the role is — it is a field job with
 * a couple of screens, not a back-office one.
 *
 * The header is drawn here rather than by the parent, which is a plain Stack
 * with this group set headerless — otherwise the two would stack.
 */
const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function StaffTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // The tabs draw their own header: the parent is a plain Stack that
        // leaves this group headerless, so the menu button and bell live here.
        headerShown: true,
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerLeft: () => <SideMenuButton />,
        headerRight: () => <NotificationBell to="/(staff)/notifications" />,
        tabBarActiveTintColor: colors.blue700,
        tabBarInactiveTintColor: colors.slate400,
        // No explicit height or bottom padding: the navigator measures the
        // bar itself and applies the safe-area inset. Overriding the height
        // here left the drawn bar and its hit region disagreeing, so the
        // buttons rendered but never received a tap.
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.slate200 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        // flex:1 as well as the colour — a scene short of the window leaves
        // the bottom of the screen drawn but not hit-tested.
        sceneStyle: { flex: 1, backgroundColor: colors.bgAlt },
      }}
    >
      <Tabs.Screen name="deliveries" options={{ title: "Deliveries", tabBarIcon: icon("\u{1F4E6}") }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: icon("\u{1F4B0}") }} />
    </Tabs>
  );
}
