import { Stack } from "expo-router";
import { SideMenuProvider, type MenuLink } from "../../src/components/SideMenu";
import { colors } from "../../src/theme";

/**
 * The delivery-staff area — the mobile counterpart of the web app's
 * StaffLayout.
 *
 * A Stack plus a Modal side menu, for the same reason as the customer area:
 * react-navigation's drawer clips its content with overflow:'hidden' against a
 * container sized from useWindowDimensions while the scene inside is measured
 * by onLayout, and on iOS the two disagree by the home-indicator strip. That
 * left the bottom ~105px of every screen drawn but untouchable.
 *
 * Still a deliberately short list: this is a field role with a couple of jobs,
 * not a back-office one.
 */

const LINKS: MenuLink[] = [
  { label: "Deliveries", icon: "\u{1F4E6}", href: "/(staff)/deliveries" },
  { label: "Profile", icon: "\u{1F464}", href: "/(staff)/profile" },
  { label: "Support chat", icon: "\u{1F4AC}", href: "/(staff)/chat" },
];

export default function StaffLayout() {
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
        {/* The tab navigator draws its own header. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen name="profile" options={{ title: "Profile" }} />
        <Stack.Screen name="chat" options={{ title: "Support chat" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      </Stack>
    </SideMenuProvider>
  );
}
