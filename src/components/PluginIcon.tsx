/**
 * PluginIcon — renders the official brand SVG logo for a plugin using
 * @ridemountainpig/svgl-react, with graceful fallback to a Lucide Puzzle icon.
 *
 * svgl-react naming convention (confirmed by inspecting fill values):
 *   *Light = dark-colored logo (fill ≈ #1b1f23) → for light backgrounds
 *   *Dark  = light-colored logo (fill ≈ #fff)   → for dark backgrounds
 *
 * For logos that only have one variant (or are already multi-colour),
 * we render them as-is with no dark-mode treatment.
 *
 * For monochrome logos with distinct Light/Dark variants (GitHub),
 * we render both and toggle via dark:hidden / hidden dark:block.
 */
import { Blocks } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Figma,
  Linear,
  GitHubDark,
  GitHubLight,
  Shopify,
  Slack,
  Notion,
  Supabase,
  Stripe,
  Gmail,
  Google,
  Telegram,
  GoogleAnalytics,
  TursoDark,
  TursoLight,
} from "@ridemountainpig/svgl-react";

type SvgComponent = React.FC<React.SVGProps<SVGSVGElement>>;

/** Single-variant logos (already multi-colour or safe on both backgrounds). */
const SINGLE_MAP: Record<string, SvgComponent> = {
  figma: Figma,
  linear: Linear,
  shopify: Shopify,
  slack: Slack,
  notion: Notion,
  supabase: Supabase,
  stripe: Stripe,
  gmail: Gmail,
  google_drive: Google,
  google: Google,
  ga4: GoogleAnalytics,
  telegram: Telegram,
};

/** Dual-variant logos: Light (black) shown in light mode, Dark (white) shown in dark mode. */
const DUAL_MAP: Record<string, { light: SvgComponent; dark: SvgComponent }> = {
  github: { light: GitHubLight, dark: GitHubDark },
  turso: { light: TursoLight, dark: TursoDark },
};

export function PluginIcon({
  pluginId,
  iconUrl,
  className,
  size = 20,
}: {
  pluginId: string;
  iconUrl?: string | null;
  className?: string;
  size?: number;
}) {
  const id = pluginId.toLowerCase();

  // 1. Explicit iconUrl from DB.
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        className={cn("rounded object-contain", className)}
      />
    );
  }

  // 2. Dual light/dark variant (e.g. GitHub).
  const dual = DUAL_MAP[id];
  if (dual) {
    return (
      <span className={cn("shrink-0 inline-flex", className)} style={{ width: size, height: size }}>
        <dual.light width={size} height={size} className="dark:hidden" />
        <dual.dark  width={size} height={size} className="hidden dark:block" />
      </span>
    );
  }

  // 3. Single-variant brand logo.
  const Logo = SINGLE_MAP[id];
  if (Logo) {
    return (
      <Logo
        width={size}
        height={size}
        className={cn("shrink-0", className)}
      />
    );
  }

  
  // 3.5. Simpleicons fallback for known missing ones
  const simpleIconsList = ["buffer", "airtable"];
  if (simpleIconsList.includes(id)) {
    return (
      <img
        src={`https://cdn.simpleicons.org/${id}/currentColor`}
        alt=""
        width={size}
        height={size}
        className={cn("rounded object-contain dark:invert", className)}
      />
    );
  }

  // 4. Generic fallback.
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-primary/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Blocks
        style={{ width: size * 0.6, height: size * 0.6 }}
        className="text-primary"
        strokeWidth={1.5}
      />
    </div>
  );
}
