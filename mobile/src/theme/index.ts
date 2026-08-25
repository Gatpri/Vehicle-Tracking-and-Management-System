/**
 * Design tokens ported from the web app's src/styles/theme.css.
 *
 * The hex values are copied exactly rather than re-picked, so the two clients
 * are recognisably the same product. What changes is the delivery: CSS custom
 * properties become a plain object, since React Native has no cascade and no
 * var(). Spacing and radii are numbers, not "14px" strings — RN styles take
 * density-independent numbers.
 */
export const colors = {
  navy950: "#0a1120",
  navy900: "#0f1e3a",
  navy800: "#16294f",
  blue600: "#2563eb",
  blue700: "#1d4ed8",
  orange500: "#f97316",
  orange600: "#ea580c",
  green500: "#16a34a",
  red500: "#ef4444",
  slate900: "#0f172a",
  slate600: "#475569",
  slate400: "#94a3b8",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  bg: "#ffffff",
  bgAlt: "#f8fafc",
} as const;

export const radius = { sm: 8, md: 14, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;

/**
 * The web app loads Inter and Poppins from Google Fonts. Rather than ship font
 * files for a first pass, this maps to each platform's system UI face, which
 * is what a native app is expected to use anyway. Swapping in expo-font later
 * means changing only this object.
 */
export const fonts = {
  body: undefined as string | undefined,
  heading: undefined as string | undefined,
} as const;

/**
 * RN has no box-shadow. iOS uses the shadow* family, Android only elevation,
 * so a usable shadow has to set both — hence a helper instead of a token.
 */
export const shadow = (level: 1 | 2 = 1) => ({
  shadowColor: colors.slate900,
  shadowOpacity: level === 1 ? 0.08 : 0.14,
  shadowRadius: level === 1 ? 10 : 18,
  shadowOffset: { width: 0, height: level === 1 ? 4 : 8 },
  elevation: level === 1 ? 2 : 6,
});

/** Status colours, matching how the web app colours booking/delivery states. */
export const statusColor = (status?: string): string => {
  const s = (status || "").toLowerCase();
  if (["completed", "approved", "paid", "delivered", "resolved", "active"].includes(s)) return colors.green500;
  if (["pending", "requested", "in-progress", "in_progress", "assigned"].includes(s)) return colors.orange500;
  if (["cancelled", "canceled", "rejected", "failed", "stolen"].includes(s)) return colors.red500;
  return colors.slate400;
};
