import { Stack } from "expo-router";

/**
 * The signed-out area. No guard of its own — the root layout already sends a
 * signed-in user out of here to their role's landing page.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
