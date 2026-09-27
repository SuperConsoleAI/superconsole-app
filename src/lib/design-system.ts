/**
 * SuperConsole Design System — Standard Shadcn Token Contract
 *
 * This module defines the canonical design tokens modeled strictly on shadcn/ui's
 * standard CSS variable token contract:
 *   --background / --foreground
 *   --card / --card-foreground
 *   --popover / --popover-foreground
 *   --primary / --primary-foreground
 *   --secondary / --secondary-foreground
 *   --muted / --muted-foreground
 *   --accent / --accent-foreground
 *   --destructive / --destructive-foreground
 *   --border / --input / --ring
 *   --sidebar / --sidebar-foreground
 *   --sidebar-primary / --sidebar-primary-foreground
 *   --sidebar-accent / --sidebar-accent-foreground
 *   --sidebar-border / --sidebar-ring
 *   --toggle-box / --toggle-box-hover / --toggle-circle
 *
 * Flow: All tokens reference CSS variables directly. The theme stylesheets (src/index.css)
 * define the concrete color palettes for light and dark modes, ensuring zero hardcoded hex
 * in TypeScript/TSX code and full runtime theme reactivity.
 */

export const tokenVariables = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
  terminal: "--terminal-bg",
  icon: "--icon",
  toggleBox: "--toggle-box",
  toggleBoxHover: "--toggle-box-hover",
  toggleCircle: "--toggle-circle",
} as const;

export type TokenKey = keyof typeof tokenVariables;

/**
 * Standard Shadcn Token Contract referencing CSS variables directly.
 * Guarantees zero hardcoded hex and consistent theme inheritance across all UI layers.
 */
export const tokens: Record<TokenKey, string> = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  card: "var(--card)",
  cardForeground: "var(--card-foreground)",
  popover: "var(--popover)",
  popoverForeground: "var(--popover-foreground)",
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  secondary: "var(--secondary)",
  secondaryForeground: "var(--secondary-foreground)",
  muted: "var(--muted)",
  mutedForeground: "var(--muted-foreground)",
  accent: "var(--accent)",
  accentForeground: "var(--accent-foreground)",
  destructive: "var(--destructive)",
  destructiveForeground: "var(--destructive-foreground)",
  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",
  sidebar: "var(--sidebar)",
  sidebarForeground: "var(--sidebar-foreground)",
  sidebarPrimary: "var(--sidebar-primary)",
  sidebarPrimaryForeground: "var(--sidebar-primary-foreground)",
  sidebarAccent: "var(--sidebar-accent)",
  sidebarAccentForeground: "var(--sidebar-accent-foreground)",
  sidebarBorder: "var(--sidebar-border)",
  sidebarRing: "var(--sidebar-ring)",
  terminal: "var(--terminal-bg)",
  icon: "var(--icon)",
  toggleBox: "var(--toggle-box)",
  toggleBoxHover: "var(--toggle-box-hover)",
  toggleCircle: "var(--toggle-circle)",
};

export type ShadcnTokens = typeof tokens;

/** Dark and light token contracts both reference standard CSS variables */
export const darkTokens = tokens;
export const lightTokens = tokens;

/**
 * Safely resolves a CSS custom property from document root at runtime.
 */
export function getCssVar(name: string, fallback = ""): string {
  if (typeof window === "undefined" || !document?.documentElement) {
    return fallback;
  }
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

/**
 * Computes all active theme color values from the DOM root at runtime.
 * Useful for canvas-based renderers like xterm.js that require concrete computed values.
 */
export function getComputedTokens(): Record<TokenKey, string> {
  const result = {} as Record<TokenKey, string>;
  for (const [key, varName] of Object.entries(tokenVariables)) {
    result[key as TokenKey] = getCssVar(varName);
  }
  return result;
}

export const designSystem = {
  tokens,
  tokenVariables,
  getCssVar,
  getComputedTokens,
} as const;

export default designSystem;
