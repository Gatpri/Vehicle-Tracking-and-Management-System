import { Tabs } from "expo-router";
import { Text } from "react-native";
import type { ColorValue } from "react-native";
import { SideMenuButton } from "../../../src/components/SideMenu";
import { NotificationBell } from "../../../src/components/NotificationBell";
import { colors } from "../../../src/theme";

/**
 * The customer's primary destinations, as a bottom tab bar.
 *
 * These five are the things an owner reaches for repeatedly, so they get the
 * thumb-reachable bar. The occasional destinations — profile, service history,
 * support chat, safety map, wallet — live in the side menu, reached from the
 * header button, and notifications sit in the header as an icon.
 *
 * "(tabs)" is a route group, so it adds no path segment — /(customer)/home
 * still resolves, and no existing router.push had to change.
 *
 * The header is drawn here rather than by the parent, which is a plain Stack
 * with this group set headerless — otherwise the two would stack.
 */

// Emoji stand in for an icon set. Swapping in @expo/vector-icons later is a
// change to this one function.
const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // The tabs draw their own header now: the parent is a plain Stack that
        // leaves this group headerless, so the menu button and the bell live
        // here rather than one level up.
        headerShown: true,
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerLeft: () => <SideMenuButton />,
        headerRight: () => <NotificationBell to="/(customer)/notifications" />,
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
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: icon("\u{1F3E0}") }} />
      <Tabs.Screen name="vehicles" options={{ title: "Vehicles", tabBarIcon: icon("\u{1F697}") }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("\u{1F4C5}") }} />
      <Tabs.Screen name="workshops" options={{ title: "Workshops", tabBarIcon: icon("\u{1F527}") }} />
      <Tabs.Screen name="sos" options={{ title: "SOS", tabBarIcon: icon("\u{1F6A8}") }} />
    </Tabs>
  );
}
