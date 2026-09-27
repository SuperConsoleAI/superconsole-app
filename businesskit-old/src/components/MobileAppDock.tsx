// src/components/MobileAppDock.tsx
//
// iPhone Dock Navigation Component (Icon-Only)
// Specs: 386pt Dock Card width, 52pt app icon boxes with 13px squircle curvature,
// ultra-clear frosted glass backdrop with safe-area spacing and refined 1px strokes.

import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { LuHome, LuUsers, LuBot, LuCog } from "@qwikest/icons/lucide";

export interface MobileAppDockProps {
  active?: "home" | "apps" | "crm" | "agents" | "settings" | "shop" | "store";
}

// ── Exact AppsIcon from ThinSidebar / AppSidebar (businesskit flame) ─────────
const AppsIcon = (props: { style?: string }) => (
  <svg
    width="43"
    height="38"
    viewBox="0 0 43 38"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={props.style}
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M34.2 36.3C34.9 37.6 36.5 38 37.8 37.3C39.1 36.6 39.5 34.9 38.8 33.7L36.1 29H40C41.5 29 42.7 27.8 42.7 26.4C42.7 24.9 41.5 23.7 40 23.7H33L25.3 10.4C24 12.1 22.7 14.4 23.2 17.3L34.2 36.3ZM18.3 8.8L15.5 4C14.8 2.7 15.2 1.1 16.5 0.4C17.8 -0.4 19.4 0.1 20.1 1.3L21.3 3.4L22.5 1.3C23.3 0.1 24.9 -0.4 26.2 0.4C27.5 1.1 27.9 2.7 27.2 4L15.8 23.7H24.5C26.1 24.2 27.3 26 27.3 27.7C27.3 28.1 27.2 28.5 27.1 29H2.7C1.2 29 0 27.8 0 26.4C0 24.9 1.2 23.7 2.7 23.7H9.6L18.3 8.8ZM8 30C9.1 30 10.1 30.6 11.2 31.6L8.5 36.3C7.8 37.6 6.1 38 4.9 37.3C3.6 36.6 3.1 34.9 3.9 33.7L5.8 30.3C6.3 30.2 6.6 30.1 6.9 30.1C7.2 30 7.5 30 8 30Z"
      fill="currentColor"
    />
  </svg>
);

const STYLES = `
  .iphone-mobile-dock {
    display: none;
  }

  @media (max-width: 768px) {
    .iphone-mobile-dock {
      display: flex !important;
      position: fixed !important;
      bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)) !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      z-index: 99 !important;
      align-items: center !important;
      justify-content: space-around !important;
      gap: 10px !important;
      width: calc(100% - 1.5rem) !important;
      max-width: 386px !important;
      padding: 10px 12px !important;
      background: rgba(30, 30, 35, 0.42) !important;
      backdrop-filter: blur(40px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(40px) saturate(200%) !important;
      border-radius: 22px !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      box-shadow: 
        0 16px 40px rgba(0, 0, 0, 0.24),
        0 2px 8px rgba(0, 0, 0, 0.08),
        inset 0 1px 0.5px rgba(255, 255, 255, 0.35) !important;
      box-sizing: border-box !important;
      user-select: none !important;
    }

    .dock-app-item {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      text-decoration: none !important;
      position: relative !important;
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      -webkit-tap-highlight-color: transparent !important;
    }

    .dock-app-item:active {
      transform: scale(0.92) !important;
    }

    .dock-app-icon {
      width: 52px !important;
      height: 52px !important;
      border-radius: 13px !important;
      background: linear-gradient(145deg, rgba(38, 38, 42, 0.95) 0%, rgba(20, 20, 19, 0.98) 100%) !important;
      backdrop-filter: blur(24px) saturate(190%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(190%) !important;
      border: 1px solid rgba(255, 255, 255, 0.14) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.22), inset 0 -1px 0.5px rgba(0, 0, 0, 0.35) !important;
      position: relative !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    .dock-app-icon::before {
      content: "" !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 50% !important;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.02) 70%, transparent 100%) !important;
      pointer-events: none !important;
      border-top-left-radius: 12px !important;
      border-top-right-radius: 12px !important;
    }

    .dock-app-icon::after {
      content: "" !important;
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 40% !important;
      background: linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0%, transparent 100%) !important;
      pointer-events: none !important;
      border-bottom-left-radius: 12px !important;
      border-bottom-right-radius: 12px !important;
    }

    .dock-app-icon svg {
      width: 24px !important;
      height: 24px !important;
      stroke-width: 1px !important;
      color: #9c9a92 !important;
      transition: color 0.2s ease, transform 0.2s ease !important;
      position: relative !important;
      z-index: 1 !important;
    }

    .dock-app-item.active .dock-app-icon {
      background: linear-gradient(145deg, rgba(54, 54, 60, 0.98) 0%, rgba(26, 26, 25, 1) 100%) !important;
      border-color: rgba(255, 255, 255, 0.42) !important;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.45), inset 0 -1px 1px rgba(0, 0, 0, 0.25) !important;
    }

    .dock-app-item.active .dock-app-icon svg {
      color: #ffffff !important;
      transform: scale(1.06) !important;
      stroke-width: 1.25px !important;
    }

    .dock-app-dot {
      display: none !important;
      width: 4px !important;
      height: 4px !important;
      border-radius: 50% !important;
      background: #ffffff !important;
      box-shadow: 0 0 6px #ffffff !important;
      position: absolute !important;
      bottom: -6px !important;
    }

    .dock-app-item.active .dock-app-dot {
      display: block !important;
    }

    .has-android-3button .iphone-mobile-dock {
      bottom: calc(3.75rem + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

export const MobileAppDock = component$<MobileAppDockProps>((props) => {
  useStylesScoped$(STYLES);

  return (
    <nav class="iphone-mobile-dock" aria-label="Mobile Navigation Dock">
      <Link href="/dashboard" class={`dock-app-item ${props.active === "home" ? "active" : ""}`} title="Home">
        <div class="dock-app-icon">
          <LuHome />
        </div>
        <span class="dock-app-dot" />
      </Link>

      <Link href="/apps" class={`dock-app-item ${props.active === "apps" ? "active" : ""}`} title="Apps">
        <div class="dock-app-icon">
          <AppsIcon />
        </div>
        <span class="dock-app-dot" />
      </Link>

      <Link href="/dashboard/crm" class={`dock-app-item ${props.active === "crm" ? "active" : ""}`} title="CRM">
        <div class="dock-app-icon">
          <LuUsers />
        </div>
        <span class="dock-app-dot" />
      </Link>

      <Link href="/dashboard/agents" class={`dock-app-item ${props.active === "agents" ? "active" : ""}`} title="Agents">
        <div class="dock-app-icon">
          <LuBot />
        </div>
        <span class="dock-app-dot" />
      </Link>

      <Link href="/dashboard/settings" class={`dock-app-item ${props.active === "settings" ? "active" : ""}`} title="Settings">
        <div class="dock-app-icon">
          <LuCog />
        </div>
        <span class="dock-app-dot" />
      </Link>
    </nav>
  );
});






