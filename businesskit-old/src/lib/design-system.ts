// src/lib/design-system.ts
//
// Design system tokens for BusinessKit desktop app.
// Exact copy of businesskit-web/src/lib/design-system.ts
// CSS variables are applied in global.css via [data-theme="light"] / [data-theme="dark"]

export type ThemeColors = {
  surface1: string;
  surface2: string;
  surface3: string;
  overlay: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  border: string;
  muted: string;
  fieldFill: string;
  success: string;
  warning: string;
  error: string;
  badgeBackground: string;
  badgeText: string;
  buttonPrimaryBackground: string;
  buttonPrimaryText: string;
  buttonSecondaryBackground: string;
  buttonSecondaryText: string;
  buttonSecondaryBorder: string;
  cardButtonBackground: string;
};

export type Theme = { colors: ThemeColors };

// ── Light theme ───────────────────────────────────────────────────────────────
export const lightTheme: Theme = {
  colors: {
    surface1:                "#F4F2ED",
    surface2:                "#FFFFFF",
    surface3:                "#F5F5F5",
    overlay:                 "rgba(44, 52, 64, 0.08)",
    textPrimary:             "#000000",
    textSecondary:           "#808080",
    accent:                  "#14161A",
    accentHover:             "#0A7BC7",
    accentSoft:              "#F5F5F5",
    border:                  "#D8D8D8",
    muted:                   "#F0EEE7",
    fieldFill:               "#F5F5F5",
    success:                 "#10B981",
    warning:                 "#F59E0B",
    error:                   "#EF4444",
    badgeBackground:         "#F5F5F5",
    badgeText:               "#808080",
    buttonPrimaryBackground: "#14161A",
    buttonPrimaryText:       "#FFFFFF",
    buttonSecondaryBackground: "transparent",
    buttonSecondaryText:     "#14161A",
    buttonSecondaryBorder:   "#14161A",
    cardButtonBackground:    "#F5F5F5",
  },
} as const;

// ── Dark theme ────────────────────────────────────────────────────────────────
export const darkTheme: Theme = {
  colors: {
    surface1:                "#383838",
    surface2:                "#2C2C2C",
    surface3:                "#141413",
    overlay:                 "rgba(15, 23, 42, 0.35)",
    textPrimary:             "#FAF9F5",
    textSecondary:           "#9C9A92",
    accent:                  "#ffffff",
    accentHover:             "#0A7BC7",
    accentSoft:              "#383838",
    border:                  "#444444",
    muted:                   "#323232",
    fieldFill:               "#242424",
    success:                 "#10B981",
    warning:                 "#F59E0B",
    error:                   "#EF4444",
    badgeBackground:         "#383838",
    badgeText:               "#BFBFBF",
    buttonPrimaryBackground: "#FFFFFF",
    buttonPrimaryText:       "#14161A",
    buttonSecondaryBackground: "transparent",
    buttonSecondaryText:     "#FFFFFF",
    buttonSecondaryBorder:   "#FFFFFF",
    cardButtonBackground:    "#383838",
  },
} as const;

// ── Typography ────────────────────────────────────────────────────────────────
export const typography = {
  fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  sizes: {
    xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem",
    xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem", "5xl": "3rem",
  },
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────────
export const spacing = {
  xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem",
  xl: "2rem", "2xl": "3rem", "3xl": "4rem", "4xl": "6rem",
} as const;

export const padding = {
  tight: spacing.xs, base: spacing.md, relaxed: spacing.lg, spacious: spacing.xl,
} as const;

// ── Border radius ─────────────────────────────────────────────────────────────
export const borderRadius = {
  none: "0", sm: "0.125rem", md: "0.375rem", lg: "0.5rem",
  xl: "0.75rem", "2xl": "1.5rem", pill: "2.5rem", full: "9999px",
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────
export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.15)",
  lg: "0 18px 38px rgb(14 14 24 / 0.45)",
  xl: "0 32px 70px rgb(24 182 246 / 0.25)",
} as const;

// ── Transitions ───────────────────────────────────────────────────────────────
export const transitions = {
  fast: "150ms ease", normal: "250ms ease", slow: "400ms ease",
} as const;

// ── Breakpoints ───────────────────────────────────────────────────────────────
export const breakpoints = {
  sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
} as const;

// ── Component tokens ──────────────────────────────────────────────────────────
export const components = {
  sidebar: {
    thinWidth: "3rem",       // 48px — matches ThinSidebar
    padding: spacing.xl,
    itemPadding: "12px 16px",
    itemGap: "12px",
    borderRadius: borderRadius.md,
    zIndex: 30,
  },
  topbar: {
    height: "3rem",          // 48px
    zIndex: 20,
  },
  navigation: {
    itemHeight: "2rem",      // 32px icon buttons
    iconSize: "1rem",        // 16px
    logoSize: "1.125rem",    // 18px
    profileSize: "2rem",     // 32px
  },
  cards: {
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    gap: spacing.md,
    minWidth: "175px",
  },
  buttons: {
    height: "40px",
    padding: "0.375rem 0.75rem",
    borderRadius: borderRadius.md,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
} as const;

// ── Sidebar palette (from ThinSidebar SIDEBAR_THEME) ─────────────────────────
export const sidebarTheme = {
  light: {
    surface:          "#FFFFFF",
    border:           "#D8D8D8",
    iconActive:       "#000000",
    iconInactive:     "#808080",
    activeBackground: "#f0f8ff",
  },
  dark: {
    surface:          "#2C2C2C",
    border:           "#444444",
    iconActive:       "#FFFFFF",
    iconInactive:     "#BFBFBF",
    activeBackground: "#141413",
  },
} as const;

// ── Main export ───────────────────────────────────────────────────────────────
export const designSystem = {
  themes:       { light: lightTheme, dark: darkTheme },
  typography,
  spacing,
  padding,
  borderRadius,
  shadows,
  transitions,
  breakpoints,
  components,
  sidebarTheme,
} as const;

export const defaultTheme = lightTheme;
