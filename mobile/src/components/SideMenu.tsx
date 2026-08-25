import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { colors, radius, spacing } from "../theme";

/**
 * The sidebar, as a Modal panel rather than a drawer navigator.
 *
 * react-navigation's drawer cannot be used here. It wraps every screen in a
 * container that clips with overflow:'hidden', and it sizes that container
 * from useWindowDimensions while the scene inside is measured by onLayout. On
 * iOS those two disagree by the home-indicator strip, so the bottom ~105px of
 * every screen inside a drawer was painted but clipped out of hit-testing —
 * the tab bar, the chat send button and the drawer's own sign-out row all
 * rendered and none of them could be tapped. Removing the drawer fixed it
 * outright, which is what settled the diagnosis.
 *
 * A Modal renders *above* the screen in its own host view instead of wrapping
 * it, so nothing it does can clip the content underneath. The trade-off is
 * losing the edge-swipe gesture: the menu opens from the header button only.
 * That is a fair price for a tab bar that works.
 */

interface SideMenuValue {
  open: () => void;
  close: () => void;
}

const SideMenuContext = createContext<SideMenuValue | null>(null);

export interface MenuLink {
  label: string;
  icon: string;
  href: string;
}

const ROLE_LABELS: Record<string, string> = {
  customer: "Vehicle owner",
  "delivery-staff": "Delivery staff",
  "delivery-admin": "Delivery admin",
  workshop: "Workshop",
  admin: "Administrator",
  superadmin: "Administrator",
};

const initials = (first?: string, last?: string) =>
  `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "?";

/**
 * Wraps an area's screens so anything inside can open the menu. It renders no
 * container of its own around `children` — only the Modal alongside them —
 * which is the whole point.
 */
export function SideMenuProvider({ children, links }: { children: ReactNode; links: MenuLink[] }) {
  const [visible, setVisible] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  const go = (href: string) => {
    // Close first: pushing while the modal is still up leaves it covering the
    // screen it just navigated to.
    setVisible(false);
    router.push(href as never);
  };

  const confirmLogout = () => {
    setVisible(false);
    if (Platform.OS === "web") {
      void logout();
      return;
    }
    Alert.alert("Sign out", "You'll need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <SideMenuContext.Provider value={value}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
        // Without this the panel sits under the status bar on Android.
        statusBarTranslucent
      >
        {/* Tapping the dimmed area closes, the way a drawer's overlay does. */}
        <Pressable style={s.backdrop} onPress={close}>
          {/* Its own Pressable with no handler: taps inside the panel must not
              bubble up to the backdrop and dismiss it. */}
          <Pressable style={s.panel} onPress={() => {}}>
            <View style={s.header}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(user?.firstname, user?.lastname)}</Text>
              </View>
              <View style={s.headerText}>
                <Text style={s.name} numberOfLines={1}>
                  {[user?.firstname, user?.lastname].filter(Boolean).join(" ") || "Signed in"}
                </Text>
                <Text style={s.email} numberOfLines={1}>
                  {user?.email ?? ""}
                </Text>
                {user?.role ? (
                  <View style={s.rolePill}>
                    <Text style={s.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ScrollView style={s.list} contentContainerStyle={s.listContent}>
              {links.map((link) => (
                <Pressable
                  key={link.href}
                  onPress={() => go(link.href)}
                  style={({ pressed }) => [s.item, pressed && s.itemPressed]}
                >
                  <Text style={s.itemIcon}>{link.icon}</Text>
                  <Text style={s.itemLabel}>{link.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={s.footer}>
              <Pressable
                onPress={confirmLogout}
                style={({ pressed }) => [s.item, pressed && s.itemPressed]}
              >
                <Text style={s.itemIcon}>{"\u{1F6AA}"}</Text>
                <Text style={s.signOutLabel}>Sign out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SideMenuContext.Provider>
  );
}

/** The hamburger button, for a navigator's headerLeft. */
export function SideMenuButton() {
  const ctx = useContext(SideMenuContext);
  return (
    <Pressable
      onPress={() => ctx?.open()}
      style={({ pressed }) => [s.hamburger, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
    >
      <Text style={s.hamburgerGlyph}>{"☰"}</Text>
    </Pressable>
  );
}

export function useSideMenu(): SideMenuValue {
  return useContext(SideMenuContext) ?? { open: () => {}, close: () => {} };
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", flexDirection: "row" },
  panel: { width: "78%", maxWidth: 320, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    // Clears the status bar; the modal is translucent behind it.
    paddingTop: 56,
    backgroundColor: colors.navy900,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.blue700,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  headerText: { flex: 1, gap: 2 },
  name: { color: "#fff", fontWeight: "700", fontSize: 16 },
  email: { color: colors.slate400, fontSize: 12 },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    backgroundColor: colors.navy800,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  roleText: { color: colors.slate200, fontSize: 11, fontWeight: "600" },
  list: { flex: 1 },
  listContent: { paddingVertical: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  itemPressed: { backgroundColor: colors.slate100 },
  itemIcon: { fontSize: 18, width: 26 },
  itemLabel: { fontSize: 15, fontWeight: "600", color: colors.slate900 },
  signOutLabel: { fontSize: 15, fontWeight: "700", color: colors.red500 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingBottom: 28,
  },
  hamburger: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  hamburgerGlyph: { fontSize: 20, color: "#fff" },
});
