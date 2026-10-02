/**
 * Navbar Components & Metric Constants
 * Central export point for all top-level workspace page navbars.
 * Provides shared constants and variables for consistent toggle heights and layout metrics.
 */
export { InboxNavbar } from "./InboxNavbar";
export { TasksNavbar } from "./TasksNavbar";
export { SessionsNavbar } from "./SessionsNavbar";
export { UsageNavbar } from "./UsageNavbar";
export { AgentsNavbar } from "./AgentsNavbar";
export { CustomizeNavbar } from "./CustomizeNavbar";
export { SettingsNavbar } from "./SettingsNavbar";

/**
 * Standard height metrics for navbar toggle containers and buttons.
 * Outer container: 26px (1.625rem, reduced by 0.125rem from 1.75rem / 28px).
 * Inner button: 22px (1.375rem) for pixel-perfect vertical centering with 1px border + 1px padding.
 */
export const NAVBAR_TOGGLE_HEIGHT = "1.625rem"; // 26px
export const NAVBAR_TOGGLE_BUTTON_HEIGHT = "1.375rem"; // 22px

export const NAVBAR_TOGGLE_CONTAINER_CLASS =
  "flex h-[26px] items-center gap-0.5 rounded-md border bg-background p-[1px]";
export const NAVBAR_TOGGLE_BUTTON_CLASS =
  "flex h-[22px] items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors";


