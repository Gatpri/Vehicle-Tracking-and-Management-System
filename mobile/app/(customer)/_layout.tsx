import { Stack } from "expo-router";
import { SideMenuProvider, type MenuLink } from "../../src/components/SideMenu";
import { colors } from "../../src/theme";

/**
 * The customer area — the mobile counterpart of the web app's AppLayout.
 *
 * A Stack, deliberately not a Drawer. react-navigation's drawer wraps every
 * screen in a container that clips with overflow:'hidden', sized from
 * useWindowDimensions while the scene inside is measured by onLayout. On iOS
 * those disagree by the home-indicator strip, so the bottom ~105px of every
 * screen was painted but clipped out of hit-testing — the tab bar, the chat
 * send button and the drawer's own sign-out row all rendered and none could be
 * tapped. Replacing the drawer with a Stack fixed it outright.
 *
 * The sidebar itself is unchanged in spirit: SideMenuProvider renders it as a
 * Modal above the screen rather than as a container around it. Same links,
 * same header, same sign-out; it just no longer clips what it contains.
 *
 * Navigation is still split three ways:
 *   - bottom tabs, in (tabs)/_layout: home, vehicles, bookings, workshops, sos;
 *   - the side menu: the links below;
 *   - the header: notifications, as an icon.
 *
 * Role enforcement is not repeated here: the root layout already keeps
 * non-customers out of this group entirely.
 */

/**
 * The side menu.
 *
 * Labels name the destination, not the mechanism. "Support chat" was the odd
 * one out — it described the channel rather than what you get, and someone
 * looking for a person to talk to does not scan for the word "chat". Each
 * label now answers "what do I tap when I want X":
 *
 *   Messages      — the conversation list, whoever is on the other end.
 *   Help & FAQ    — the answers, the walkthrough, and every way to reach us.
 *
 * Help sits last, above nothing else, which is where people look for it.
 */
const LINKS: MenuLink[] = [
  { label: "Home", icon: "\u{1F3E0}", href: "/(customer)/home" },
  { label: "My profile", icon: "\u{1F464}", href: "/(customer)/profile" },
  { label: "Service history", icon: "\u{1F4CA}", href: "/(customer)/service-history" },
  { label: "Messages", icon: "\u{1F4AC}", href: "/(customer)/chat" },
  { label: "Safety map", icon: "\u{1F5FA}", href: "/(customer)/safety" },
  { label: "Wallet", icon: "\u{1F4B3}", href: "/(customer)/wallet" },
  { label: "Help & FAQ", icon: "\u{2753}", href: "/(customer)/help" },
];

export default function CustomerLayout() {
  return (
    <SideMenuProvider links={LINKS}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy900 },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { flex: 1, backgroundColor: colors.bgAlt },
          // Chevron only. Without this iOS labels the back button with the
          // previous route's name, which for the tab group is the literal
          // "(tabs)" — a router internal that should never reach the user.
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        {/* The tab navigator draws its own header, so this one must not add a
            second above it. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Side-menu destinations: pushed onto the stack, so each gets a back
            button to wherever it was opened from. */}
        <Stack.Screen name="profile" options={{ title: "My profile" }} />
        <Stack.Screen name="service-history" options={{ title: "Service history" }} />
        <Stack.Screen name="chat" options={{ title: "Messages" }} />
        <Stack.Screen name="safety" options={{ title: "Safety map" }} />
        <Stack.Screen name="wallet" options={{ title: "Wallet" }} />
        <Stack.Screen name="help" options={{ title: "Help & FAQ" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />

        {/* Detail screens, pushed from a list. */}
        <Stack.Screen name="vehicle/[id]" options={{ title: "Vehicle" }} />
        <Stack.Screen name="vehicle/[id]/history" options={{ title: "Service history" }} />
        <Stack.Screen name="workshop/[id]" options={{ title: "Workshop" }} />
        <Stack.Screen name="tracking/[vehicleId]" options={{ title: "Tracking" }} />
      </Stack>
    </SideMenuProvider>
  );
}
