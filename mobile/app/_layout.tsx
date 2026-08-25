import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../src/lib/AuthContext";
import { NotificationProvider } from "../src/lib/NotificationContext";
import { landingPathFor } from "../src/lib/roles";
import { Loading } from "../src/components/ui";
import { colors } from "../src/theme";

/**
 * The single place that decides which area of the app a signed-in user is
 * allowed to be in — the mobile counterpart of the web app's ProtectedRoute
 * plus its CatchAllRedirect, merged.
 *
 * On the web every route wrapped itself in a guard component. That does not
 * translate: expo-router builds the navigator from the file tree, so instead
 * of wrapping each screen this watches the active route group and redirects
 * when it does not match the signed-in role. One guard, not thirty-five.
 *
 * Per-screen role checks still exist inside each group's layout — this only
 * enforces the coarse "which of the three areas" question.
 */
function RouteGuard() {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // "loading" is not "signed out": redirecting during it would bounce every
    // returning user to the login screen on every cold start, before the
    // keystore read has even finished. Wait it out.
    if (status === "loading") return;

    // segments[0] is the route group: "(auth)", "(customer)", "(admin)" or
    // "(staff)".
    const group = segments[0] as string | undefined;
    const inAuthArea = group === "(auth)" || group === undefined;

    if (status === "anonymous") {
      if (!inAuthArea) router.replace("/login");
      return;
    }

    const home = landingPathFor(user?.role);

    // A signed-in user sitting on a login screen goes to their own landing
    // page. Which page that is depends on the role, and landingPathFor is the
    // same function the web app uses, so the two clients agree.
    if (inAuthArea) {
      router.replace(home as never);
      return;
    }

    // In a signed-in area, but the wrong one for this role — e.g. a customer
    // who deep-linked into /(admin). Send them to where they do belong.
    const allowedGroup = `(${home.split("/")[1]?.replace(/[()]/g, "")})`;
    if (group && group !== allowedGroup) {
      router.replace(home as never);
    }
  }, [status, user?.role, segments, router]);

  if (status === "loading") return <Loading label="Signing you in…" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        // flex:1 as well as the colour. The scene container is what every
        // screen in every group is laid out inside, and when it does not fill
        // the window the bottom of each screen falls outside the touchable
        // region — drawn, but never hit-tested.
        contentStyle: { flex: 1, backgroundColor: colors.bgAlt },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(customer)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(staff)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // GestureHandlerRootView must be the outermost view or swipe-back and any
    // gesture-driven component silently stops responding on Android.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* initialMetrics seeds the frame from a native constant read at startup.
          Without it the provider reports a zero frame until its first async
          measure lands, and anything laid out from an inset in that window can
          end up positioned against a size the touch system never agrees with. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AuthProvider>
          {/* Inside AuthProvider: it only subscribes once there is a session,
              and every role's screens read from it. */}
          <NotificationProvider>
            <StatusBar style="light" />
            <RouteGuard />
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
