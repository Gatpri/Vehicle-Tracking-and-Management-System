import { useEffect, useMemo } from "react";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../src/lib/AuthContext";
import { SideMenuProvider, SideMenuButton, type MenuLink } from "../../src/components/SideMenu";
import { NotificationBell } from "../../src/components/NotificationBell";
import { hasPermission } from "../../src/lib/permissions";
import { landingPathFor, FULL_ADMIN_ROLES } from "../../src/lib/roles";
import { colors } from "../../src/theme";

/**
 * The admin area — the mobile counterpart of the web app's AdminLayout.
 *
 * A Stack plus a Modal side menu rather than a drawer. react-navigation's
 * drawer clips its content with overflow:'hidden' against a container sized
 * from useWindowDimensions, while the scene inside is measured by onLayout; on
 * iOS those disagree by the home-indicator strip, leaving the bottom ~105px of
 * every screen painted but untouchable. The menu keeps the same shape — it is
 * simply rendered above the screen instead of wrapped around it.
 *
 * Every entry stays permission-gated with the same checks the web nav used, so
 * a role never sees a link to a screen the server would refuse. Screens hidden
 * this way remain routable by deep link, which is why each one re-checks on
 * its own and the backend re-checks again.
 */
export default function AdminLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const role = user?.role;
  const extra = user?.permissions ?? [];

  // delivery-admin reaches this group too (it is not in ADMIN_AREA_ROLES but
  // has its own screens here), so the landing check uses landingPathFor rather
  // than a role list.
  useEffect(() => {
    if (role && landingPathFor(role) === "/login") router.replace("/login");
  }, [role, router]);

  const links = useMemo<MenuLink[]>(() => {
    const can = (permission: string) => hasPermission(role, permission, extra);
    const all: Array<MenuLink & { show: boolean }> = [
      { label: "Dashboard", icon: "\u{1F4CA}", href: "/(admin)/dashboard", show: FULL_ADMIN_ROLES.includes(role ?? "") },
      { label: "Bookings", icon: "\u{1F4C5}", href: "/(admin)/bookings", show: can("booking:read:any") },
      { label: "Workshops", icon: "\u{1F527}", href: "/(admin)/workshops", show: can("workshop:create") || can("workshop:request-update") },
      { label: "Deliveries", icon: "\u{1F4E6}", href: "/(admin)/deliveries", show: can("delivery:manage") },
      { label: "Delivery staff", icon: "\u{1F9D1}", href: "/(admin)/delivery-staff", show: can("deliverystaff:manage") || can("deliverystaff:delete") },
      { label: "Staff locations", icon: "\u{1F4CD}", href: "/(admin)/staff-locations", show: can("deliverystaff:location:any") },
      { label: "CCTV", icon: "\u{1F4F9}", href: "/(admin)/cctv", show: can("cctv:read") },
      { label: "SOS alerts", icon: "\u{1F6A8}", href: "/(admin)/sos", show: can("sos:read:any") },
      { label: "Theft reports", icon: "\u{1F6A8}", href: "/(admin)/theft-reports", show: can("theft:manage") },
      { label: "Chat", icon: "\u{1F4AC}", href: "/(admin)/chat", show: can("chat:read:any") },
      { label: "Withdrawals", icon: "\u{1F4B8}", href: "/(admin)/withdrawals", show: can("withdrawal:read:any") },
      { label: "Wallets", icon: "\u{1F45B}", href: "/(admin)/wallets", show: can("wallet:read:any") },
      { label: "My wallet", icon: "\u{1F4B3}", href: "/(admin)/my-wallet", show: true },
      { label: "Users", icon: "\u{1F465}", href: "/(admin)/users", show: can("user:read") && can("user:create") },
    ];
    return all.filter((l) => l.show).map(({ show: _show, ...link }) => link);
  }, [role, extra]);

  return (
    <SideMenuProvider links={links}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy900 },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          // Admin has no tab bar, so the menu button belongs on this header.
          headerLeft: () => <SideMenuButton />,
          headerRight: () => <NotificationBell to="/(admin)/notifications" />,
          contentStyle: { flex: 1, backgroundColor: colors.bgAlt },
        }}
      >
        <Stack.Screen name="dashboard" options={{ title: "Dashboard" }} />
        <Stack.Screen name="bookings" options={{ title: "Bookings" }} />
        <Stack.Screen name="workshops" options={{ title: "Workshops" }} />
        <Stack.Screen name="deliveries" options={{ title: "Deliveries" }} />
        <Stack.Screen name="delivery-staff" options={{ title: "Delivery staff" }} />
        <Stack.Screen name="staff-locations" options={{ title: "Staff locations" }} />
        <Stack.Screen name="cctv" options={{ title: "CCTV" }} />
        <Stack.Screen name="sos" options={{ title: "SOS alerts" }} />
        <Stack.Screen name="theft-reports" options={{ title: "Theft reports" }} />
        <Stack.Screen name="chat" options={{ title: "Chat" }} />
        <Stack.Screen name="withdrawals" options={{ title: "Withdrawals" }} />
        <Stack.Screen name="wallets" options={{ title: "Wallets" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="my-wallet" options={{ title: "My wallet" }} />
        <Stack.Screen name="users" options={{ title: "Users" }} />
      </Stack>
    </SideMenuProvider>
  );
}
