// src/components/app/AppTopbar.tsx
//
// WHAT:  Fixed topbar — same position as before (top: 2rem, left: 3rem, right: 0).
//        Right slot changes based on route:
//          /dashboard/c/* → Hide On Profile toggle + SEO button + Eye preview
//          /apps          → grid / list view toggle
//          everything else → <Slot name="actions" />
//
// HOW:   Reads AppContext (profile name, viewMode).
//        Reads CategoryCtx (isHidden, seoOpen, categorySlug, profileSlug).
//        Eye icon uses catCtx.profileSlug if set, falls back to active profile.slug.
//        No prop drilling. No data fetching.

import { component$, Slot, $, useSignal, useVisibleTask$, useContext } from "@builder.io/qwik";
import { useLocation, useNavigate, Link } from "@builder.io/qwik-city";
import { LuLayoutGrid, LuList, LuEye, LuRefreshCw, LuBarChart2, LuPanelLeft, LuBot, LuDatabase, LuSearch, LuX, LuMenu } from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { useCategoryCtx } from "~/lib/category-context";
import { CommunityCtx } from "~/lib/community-context";
import { StoreTabs } from "~/components/StoreTabs";
import { ContentTabs } from "~/components/ContentTabs";
import { JobTabs } from "~/components/JobTabs";
import { FormTabs } from "~/components/FormTabs";
import { FormsBuilderActions } from "~/components/app/FormsBuilderActions";
import { FormsSubmissionsActions } from "./FormsSubmissionsActions";
import { FormsResultsActions } from "./FormsResultsActions";
import { useFormsBuilderCtx } from "~/lib/forms-builder-context";
import { CommunityTabs } from "~/components/community/CommunityTabs";
import { SocialTabs } from "~/components/social/SocialTabs";
import { SettingTabs } from "~/components/SettingTabs";
import { CrmTabs } from "~/components/crm/CrmTabs";
import { PagesEditActions } from "~/components/app/PagesEditActions";
import { ProductTabs } from "~/components/shop/ProductTabs";
import { RestaurantTabs } from "~/components/shop/restaurant/RestaurantTabs";
import { StaysTabs } from "~/components/shop/stays/StaysTabs";
import { AccountTabs } from "~/components/account/AccountTabs";
import { TaxTabs } from "~/components/account/TaxTabs";
import { MediaTabs } from "~/components/media/MediaTabs";
import { AgentTabs } from "~/components/agents/AgentTabs";
import { ShopStaffSelector } from "~/components/shop/ShopStaffSelector";

const AppsIcon = (props: { style?: string }) => (
  <svg
    width="43" height="38" viewBox="0 0 43 38" fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={props.style}
  >
    <path
      fill-rule="evenodd" clip-rule="evenodd"
      d="M34.2 36.3C34.9 37.6 36.5 38 37.8 37.3C39.1 36.6 39.5 34.9 38.8 33.7L36.1 29H40C41.5 29 42.7 27.8 42.7 26.4C42.7 24.9 41.5 23.7 40 23.7H33L25.3 10.4C24 12.1 22.7 14.4 23.2 17.3L34.2 36.3ZM18.3 8.8L15.5 4C14.8 2.7 15.2 1.1 16.5 0.4C17.8 -0.4 19.4 0.1 20.1 1.3L21.3 3.4L22.5 1.3C23.3 0.1 24.9 -0.4 26.2 0.4C27.5 1.1 27.9 2.7 27.2 4L15.8 23.7H24.5C26.1 24.2 27.3 26 27.3 27.7C27.3 28.1 27.2 28.5 27.1 29H2.7C1.2 29 0 27.8 0 26.4C0 24.9 1.2 23.7 2.7 23.7H9.6L18.3 8.8ZM8 30C9.1 30 10.1 30.6 11.2 31.6L8.5 36.3C7.8 37.6 6.1 38 4.9 37.3C3.6 36.6 3.1 34.9 3.9 33.7L5.8 30.3C6.3 30.2 6.6 30.1 6.9 30.1C7.2 30 7.5 30 8 30Z"
      fill="currentColor"
    />
  </svg>
);

interface AppTopbarProps {
  title?: string;
  breadcrumb?: string[];
}

function isNewerVersion(latestTag: string, currentVer: string): boolean {
  const cleanLatest = latestTag.replace(/^v/, "").trim();
  const cleanCurrent = currentVer.replace(/^v/, "").trim();
  if (!cleanLatest || !cleanCurrent) return false;
  if (cleanLatest === cleanCurrent) return false;

  const latestParts = cleanLatest.split(".").map((n) => parseInt(n, 10) || 0);
  const currentParts = cleanCurrent.split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < len; i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function getOsDownloadInfo(tag = "v0.0.20", assets: any[] = []): { osName: string; url: string; ext: string } {
  const cleanTag = tag.startsWith("v") ? tag : `v${tag}`;
  const version = cleanTag.replace(/^v/, "");

  if (typeof navigator === "undefined") {
    return {
      osName: "macOS (Apple Silicon)",
      url: `https://github.com/businesskitai/businesskit/releases/download/${cleanTag}/BusinessKit_${version}_aarch64.dmg`,
      ext: ".dmg",
    };
  }
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || "";

  if (ua.includes("mac") || platform.includes("mac")) {
    const isIntel = ua.includes("intel") || platform.includes("macintel");
    const dmgAsset = assets.find((a: any) =>
      typeof a.name === "string" &&
      a.name.endsWith(".dmg") &&
      (isIntel ? a.name.includes("x64") : a.name.includes("aarch64"))
    ) || assets.find((a: any) => typeof a.name === "string" && a.name.endsWith(".dmg"));

    const url = dmgAsset?.browser_download_url ||
      `https://github.com/businesskitai/businesskit/releases/download/${cleanTag}/BusinessKit_${version}_${isIntel ? "x64" : "aarch64"}.dmg`;

    return {
      osName: isIntel ? "macOS (Intel)" : "macOS (Apple Silicon)",
      url,
      ext: ".dmg",
    };
  } else if (ua.includes("win") || platform.includes("win")) {
    const exeAsset = assets.find((a: any) =>
      typeof a.name === "string" &&
      (a.name.endsWith(".exe") || a.name.endsWith(".msi"))
    );
    const url = exeAsset?.browser_download_url ||
      `https://github.com/businesskitai/businesskit/releases/download/${cleanTag}/BusinessKit_${version}_x64-setup.exe`;
    return {
      osName: "Windows",
      url,
      ext: ".exe",
    };
  } else if (ua.includes("linux") || platform.includes("linux")) {
    const linuxAsset = assets.find((a: any) =>
      typeof a.name === "string" &&
      (a.name.endsWith(".AppImage") || a.name.endsWith(".deb"))
    );
    const url = linuxAsset?.browser_download_url ||
      `https://github.com/businesskitai/businesskit/releases/download/${cleanTag}/BusinessKit_${version}_amd64.AppImage`;
    return {
      osName: "Linux",
      url,
      ext: ".AppImage",
    };
  } else if (ua.includes("android")) {
    const apkAsset = assets.find((a: any) =>
      typeof a.name === "string" && a.name.endsWith(".apk")
    );
    const url = apkAsset?.browser_download_url ||
      `https://github.com/businesskitai/businesskit/releases/download/${cleanTag}/app-universal-release.apk`;
    return {
      osName: "Android",
      url,
      ext: ".apk",
    };
  }
  return {
    osName: "Latest Release",
    url: `https://github.com/businesskitai/businesskit/releases/tag/${cleanTag}`,
    ext: "",
  };
}

function categoryLabel(slug: string): string {
  const map: Record<string, string> = {
    links: "Links", about: "About", landing: "Landing", all: "All Links",
    books: "Books", courses: "Courses", events: "Events", gallery: "Gallery",
    faqs: "FAQs", feed: "Feed", gears: "Gears", groups: "Groups",
    movies: "Movies", music: "Music", news: "News", newsletter: "Newsletter",
    portfolio: "Portfolio", shop: "Shop", startups: "Startups",
    tools: "Tools", wears: "Wears", store: "Store", downloads: "Downloads",
  };
  return map[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

export default component$<AppTopbarProps>(({ title = "Dashboard", breadcrumb }) => {
  const ctx = useAppContext();
  const catCtx = useCategoryCtx();
  const commCtx = useContext(CommunityCtx);
  const loc = useLocation();
  const nav = useNavigate();

  const isDashboard = loc.url.pathname === "/dashboard" || loc.url.pathname === "/dashboard/";
  const isApps = loc.url.pathname.startsWith("/apps");
  const isCatPage = loc.url.pathname.startsWith("/dashboard/c/");
  const isAnalytics = loc.url.pathname.includes("/analytics");
  const isBillingAnalytics = loc.url.pathname.includes("/billing/analytics");
  const isForms = loc.url.pathname.startsWith("/dashboard/forms");
  // Forms detail sub-routes
  const isFormsDetail = isForms && /\/dashboard\/forms\/[^/]+\/(edit|submissions|summary|analytics)/.test(loc.url.pathname);
  const isFormsEdit = isForms && loc.url.pathname.includes("/edit");
  const isFormsSubmissions = isForms && loc.url.pathname.includes("/submissions");
  const isFormsSummary = isForms && loc.url.pathname.includes("/summary");
  const isCommunity = loc.url.pathname.startsWith("/dashboard/community/");
  const isSocial = loc.url.pathname.startsWith("/dashboard/social");
  const isCrm = loc.url.pathname.startsWith("/dashboard/crm");
  const isCrmDeals = loc.url.pathname === "/dashboard/crm/deals" || loc.url.pathname === "/dashboard/crm/deals/";
  const isPagesEdit = loc.url.pathname.includes("/dashboard/pages/") && loc.url.pathname.includes("/edit");
  const isAccounts = loc.url.pathname.startsWith("/dashboard/accounts");
  const isTax = loc.url.pathname.startsWith("/dashboard/tax") || loc.url.pathname.startsWith("/dashboard/shop/tax");

  // Safe: root layout always provides this context
  const rootBuilder = useFormsBuilderCtx();

  const lastUpdated = useSignal<string | null>(null);
  const isRefreshing = useSignal(false);
  const dynamicBreadcrumb = useSignal<string[] | null>(null);
  const topbarStaffId = useSignal<string | null>(null);
  const currentAppVersion = useSignal("0.0.20");
  const latestReleaseTag = useSignal<string | null>(null);
  const hasUpdate = useSignal(false);
  const latestReleaseAssets = useSignal<any[]>([]);

  // Fetch running app version and check latest GitHub release
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const ver = await getVersion();
        if (ver) currentAppVersion.value = ver;
      } catch {
        // browser / non-tauri context
      }

      // Check updater plugin first if available
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update && update.available) {
          hasUpdate.value = true;
          if (update.version) {
            latestReleaseTag.value = update.version.startsWith("v") ? update.version : `v${update.version}`;
          }
        }
      } catch {
        // updater plugin check fallback
      }

      const res = await fetch("https://api.github.com/repos/businesskitai/businesskit/releases/latest");
      if (res.ok) {
        const data = await res.json();
        if (data && data.tag_name) {
          latestReleaseTag.value = data.tag_name;
          if (isNewerVersion(data.tag_name, currentAppVersion.value)) {
            hasUpdate.value = true;
          }
        }
        if (data && Array.isArray(data.assets)) {
          latestReleaseAssets.value = data.assets;
        }
      }
    } catch (e) {
      console.error("Failed to check for updates:", e);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const handler = (e: any) => {
      if (e.detail && e.detail.pageTitle) {
        dynamicBreadcrumb.value = ["Pages", e.detail.pageTitle];
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        ctx.agentChatOpen.value = !ctx.agentChatOpen.value;
        localStorage.setItem("bk-agent-chat-open", ctx.agentChatOpen.value ? "true" : "false");
      }
    };
    const openChatHandler = () => {
      ctx.agentChatOpen.value = true;
      localStorage.setItem("bk-agent-chat-open", "true");
    };

    document.addEventListener('page-status', handler);
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('open-agent-chat', openChatHandler);

    return () => {
      document.removeEventListener('page-status', handler);
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('open-agent-chat', openChatHandler);
    };
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    dynamicBreadcrumb.value = null;
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const currentPath = track(() => loc.url.pathname);
    if (!currentPath.includes("/analytics")) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (isBillingAnalytics) {
        // Get last_aggregated_at from billing analytics row
        const data: any = await invoke("shop_get_billing_analytics", {});
        if (data && data.last_aggregated_at && data.last_aggregated_at !== "never") {
          const dt = new Date(data.last_aggregated_at);
          const fDate = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          const fTime = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          lastUpdated.value = `${fDate}, ${fTime}`;
        } else {
          lastUpdated.value = null;
        }
      } else {
        const profileData: any = await invoke("get_profile_analytics");
        if (profileData) {
          if (profileData.last_aggregated_at && profileData.last_aggregated_at > 0) {
            const date = new Date(profileData.last_aggregated_at * 1000);
            const formattedDate = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const formattedTime = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            lastUpdated.value = `${formattedDate}, ${formattedTime}`;
          } else {
            lastUpdated.value = "Never aggregated";
          }
        } else {
          lastUpdated.value = "No data yet";
        }
      }
    } catch (e: any) {
      console.error(e);
      lastUpdated.value = null;
    }
  });


  // Profile slug for preview — use context value (set by category page) or fall back
  const activeProfile = ctx.profiles.value.find((p) => p.id === ctx.activeProfileId.value);
  const profileSlugFb = activeProfile?.slug ?? "";
  const profileSlug = catCtx.profileSlug.value || profileSlugFb;
  const categorySlug = catCtx.categorySlug.value || loc.url.pathname.split("/").pop() || "links";

  const licenseExpired =
    ctx.license.value !== null &&
    (ctx.license.value.status === "cancelled" || ctx.license.value.status === "grace");



  // TopBar height = 3.2rem (mobile) / 3.4rem (desktop) + safe area inset. Sticky so it stays visible while scrolling.
  // Left = 0 (width 100%) — app-main already has margin-left so no need to offset here.
  const topbarStyle = `
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    min-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    max-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    padding-top: env(safe-area-inset-top, 0px);
    padding-left: var(--topbar-padding-x, 1.5rem);
    padding-right: var(--topbar-padding-x, 1.5rem);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    box-sizing: border-box;
    flex-shrink: 0;
  `;

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bk-pulse {
          0% { transform: scale(0.9); opacity: 0.9; }
          70%, 100% { transform: scale(2.4); opacity: 0; }
        }
        .bk-topbar-logo {
          display: none !important;
          align-items: center;
          justify-content: center;
        }
        .bk-topbar-logo.is-sidebar-hidden {
          display: flex !important;
        }
        .topbar-apps-btn {
          display: none !important;
          align-items: center;
          justify-content: center;
        }
        .topbar-apps-btn.is-sidebar-hidden {
          display: inline-flex !important;
        }
        .panel-sidebar-toggle-btn {
          display: inline-flex !important;
        }
        .mobile-only-menu-btn {
          display: none !important;
        }
        @media (max-width: 768px) {
          .bk-topbar-logo {
            display: flex !important;
          }
          .topbar-apps-btn {
            display: inline-flex !important;
          }
          .panel-sidebar-toggle-btn {
            display: none !important;
          }
          .mobile-only-menu-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
      {/* License warning banner */}
      {licenseExpired && (
        <div style="background:#F59E0B;color:#000;font-size:0.8125rem;font-weight:500;padding:5px 1.5rem;display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ⚠ License expired.
          <a href="https://businesskit.io/billing" target="_blank" style="font-weight:700;text-decoration:underline;">Renew →</a>
        </div>
      )}

      <div class="app-topbar" style={topbarStyle}>

        {/* Left — page title or tabs */}
        <div style="display:flex;align-items:center;min-width:0;gap:0.75rem;">
          {/* BusinessKit Logo: Always on mobile, on desktop/tablet only when sidebar is hidden */}
          <Link
            href="/dashboard"
            title="BusinessKit"
            class={`bk-topbar-logo ${ctx.sidebarMode.value === "hidden" ? "is-sidebar-hidden" : ""}`}
            style="width:var(--header-box-height, 3.4rem);height:var(--header-box-height, 3.4rem);margin-left:calc(-1 * var(--topbar-padding-x, 1.5rem));border-right:1px solid var(--border);color:var(--text-primary);text-decoration:none;flex-shrink:0;box-sizing:border-box;"
          >
            <div style="width:1.85rem;height:1.85rem;border-radius:0.55rem;overflow:hidden;display:flex;align-items:center;justify-content:center;">
              <svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
                <rect width="512" height="512" fill="url(#bk_logo_grad_topbar)"/>
                <path d="M256 128C233.909 128 216 145.909 216 168C216 190.091 233.909 208 256 208C278.091 208 296 190.091 296 168C296 145.909 278.091 128 256 128ZM256 128V96M400 303C364.819 342.86 313.345 368 256 368C198.655 368 147.181 342.86 112 303M235.917 202.587L112 416M276.083 202.587L400 416" stroke="#F4F4F4" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="bk_logo_grad_topbar" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#BF2F00"/>
                    <stop offset="1" stop-color="#D97757"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </Link>
          {isApps ? (
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <h1 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;white-space:nowrap;">
                Apps
              </h1>
              {/* Search bar on left end (desktop only) */}
              <div class="hide-on-mobile" style="position:relative;display:flex;align-items:center;">
                <LuSearch style="position:absolute;left:0.55rem;width:0.85rem;height:0.85rem;color:var(--text-secondary);pointer-events:none;" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={ctx.appsSearchQuery.value}
                  onInput$={(e) => { ctx.appsSearchQuery.value = (e.target as HTMLInputElement).value; }}
                  style="height:2rem;width:180px;padding:0 1.6rem 0 1.75rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);font-size:0.78rem;outline:none;transition:all 0.2s ease;box-sizing:border-box;"
                  onFocus$={(e: any) => { e.target.style.width = "230px"; e.target.style.borderColor = "var(--primary, #3b82f6)"; }}
                  onBlur$={(e: any) => { e.target.style.width = "180px"; e.target.style.borderColor = "var(--border)"; }}
                />
                {ctx.appsSearchQuery.value && (
                  <button
                    type="button"
                    onClick$={() => { ctx.appsSearchQuery.value = ""; }}
                    style="position:absolute;right:0.35rem;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px;border-radius:9999px;"
                    title="Clear search"
                  >
                    <LuX style="width:0.75rem;height:0.75rem;" />
                  </button>
                )}
              </div>
            </div>
          ) : isCatPage && !isAnalytics && categorySlug !== "all" && categorySlug !== "about" ? (
            <div style="display:flex;gap:0.25rem;background:var(--surface-3);padding:2px;border-radius:0.5rem;height:32px;align-items:center;box-sizing:border-box;">
              <button
                type="button"
                onClick$={() => catCtx.activeTab.value = "Links"}
                style={`padding:0 0.75rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;display:flex;align-items:center;height:100%;box-sizing:border-box;transition:background 0.15s;border:none;cursor:pointer;${catCtx.activeTab.value === "Links" ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:var(--text-secondary);'}`}
              >
                {categoryLabel(categorySlug)}
              </button>
              <button
                type="button"
                onClick$={() => catCtx.activeTab.value = "Analytics"}
                style={`padding:0 0.75rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;display:flex;align-items:center;height:100%;box-sizing:border-box;transition:background 0.15s;border:none;cursor:pointer;${catCtx.activeTab.value === "Analytics" ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:var(--text-secondary);'}`}
              >
                Analytics
              </button>
            </div>
          ) : isFormsDetail ? (
            /* Form title in left slot — same position as page title */
            <h1 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">
              {rootBuilder.formTitle.value || "Untitled Form"}
            </h1>
          ) : (breadcrumb || dynamicBreadcrumb.value) && (breadcrumb || dynamicBreadcrumb.value)!.length > 1 ? (
            <h1 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;display:flex;align-items:center;gap:0;">
              {(breadcrumb || dynamicBreadcrumb.value)!.slice(0, -1).map((c, i) => (
                <span key={i} style="display:flex;align-items:center;">
                  {c === "Pages" ? (
                    <Link href="/dashboard/pages" style="color:var(--text-secondary);font-weight:500;text-decoration:none;transition:color 0.15s;" onMouseEnter$={(e: any) => e.target.style.color = "var(--text-primary)"} onMouseLeave$={(e: any) => e.target.style.color = "var(--text-secondary)"}>
                      {c}
                    </Link>
                  ) : (
                    <span style="color:var(--text-secondary);font-weight:500;">{c}</span>
                  )}
                  <span style="color:var(--text-secondary);opacity:0.5;margin:0 0.25rem;">/</span>
                </span>
              ))}
              <span style="color:var(--text-primary);font-weight:700;">{(breadcrumb || dynamicBreadcrumb.value)![(breadcrumb || dynamicBreadcrumb.value)!.length - 1]}</span>
            </h1>
          ) : (
            <h1 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              {isCommunity && commCtx.communityTitle.value
                ? commCtx.communityTitle.value
                : isSocial ? "Social"
                  : isCrm ? "CRM"
                    : isAccounts ? "Accounts"
                      : isTax ? "Tax"
                        : loc.url.pathname.startsWith("/dashboard/shop") ? (
                            <Link href="/dashboard/shop" style="color:inherit;text-decoration:none;" class="hover:underline">
                              Shop
                            </Link>
                          )
                          : loc.url.pathname.startsWith("/dashboard/agents") ? "Agents"
                          : loc.url.pathname.startsWith("/dashboard/media") ? "Media Library"
                            : loc.url.pathname.startsWith("/dashboard/pages") ? "Pages"
                            : loc.url.pathname.startsWith("/dashboard/content/subscribers") ? "Subscribers"
                              : loc.url.pathname.startsWith("/dashboard/content/n") ? "Newsletter"
                                : title === "n" || title === "N" ? "Newsletter"
                                  : title}
            </h1>
          )}
        </div>

        {/* Center — tabs per section */}
        <div style="display:flex;justify-content:center;">
          <Slot />
          {loc.url.pathname.startsWith("/dashboard/store") && (
            <StoreTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/content") && (
            <ContentTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/jobs") && (
            <JobTabs />
          )}
          {isForms && (
            <FormTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/community/") && loc.params.communityId && (
            <CommunityTabs communityId={loc.params.communityId} />
          )}
          {(loc.url.pathname.startsWith("/dashboard/settings") || loc.url.pathname.startsWith("/dashboard/deploy")) && (
            <SettingTabs />
          )}
          {isSocial && (
            <SocialTabs />
          )}
          {isCrm && (
            <CrmTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/shop/stays") ? (
            <StaysTabs />
          ) : loc.url.pathname.startsWith("/dashboard/shop/restaurant") ? (
            <RestaurantTabs />
          ) : isTax ? (
            <TaxTabs />
          ) : loc.url.pathname.startsWith("/dashboard/shop") && loc.url.pathname.replace(/\/$/, "") !== "/dashboard/shop" ? (
            <ProductTabs />
          ) : null}
          {isAccounts && (
            <AccountTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/media") && (
            <MediaTabs />
          )}
          {loc.url.pathname.startsWith("/dashboard/agents") && (
            <AgentTabs />
          )}
        </div>

        {/* Right — route-specific actions */}
        <div style="display:flex;gap:0.5rem;align-items:center;justify-content:flex-end;">

          {isAnalytics && (
            <div style="display:flex;align-items:center;gap:0.75rem;">
              {lastUpdated.value && (
                <span style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;">
                  <span class="hide-on-mobile">Last updated: {lastUpdated.value}</span>
                  <span class="show-on-mobile">
                    {lastUpdated.value.includes(", ")
                      ? lastUpdated.value.split(", ").slice(1).join(", ")
                      : lastUpdated.value}
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick$={$(async () => {
                  if (isRefreshing.value) return;
                  isRefreshing.value = true;
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    if (isBillingAnalytics) {
                      // Await aggregate so spinner stays on while it runs
                      await invoke("shop_aggregate_billing_analytics", {});
                      // Re-read fresh data and update topbar date
                      const data: any = await invoke("shop_get_billing_analytics", {});
                      if (data && data.last_aggregated_at && data.last_aggregated_at !== "never") {
                        const dt2 = new Date(data.last_aggregated_at);
                        const fDate2 = dt2.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                        const fTime2 = dt2.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        lastUpdated.value = `${fDate2}, ${fTime2}`;
                      }
                      // Signal layout to update its context with fresh data
                      window.dispatchEvent(new CustomEvent("analytics-refresh"));
                    } else if (isSocial) {
                      const profileId = localStorage.getItem("bk-active-profile");
                      if (profileId) {
                        await invoke("sync_social_analytics", { profileId });
                        await invoke("sync_social_posts_analytics", { profileId });
                      }
                      await nav(loc.url.pathname, { forceReload: true });
                    } else {
                      await invoke("aggregate_analytics", { forceRefresh: true, force_refresh: true });
                      const profileData: any = await invoke("get_profile_analytics");
                      if (profileData && profileData.last_aggregated_at && profileData.last_aggregated_at > 0) {
                        const date = new Date(profileData.last_aggregated_at * 1000);
                        const formattedDate = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                        const formattedTime = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        lastUpdated.value = `${formattedDate}, ${formattedTime}`;
                      }
                      await nav(loc.url.pathname, { forceReload: true });
                    }
                  } catch (e: any) {
                    console.error("Refresh failed:", e);
                  } finally {
                    isRefreshing.value = false;
                  }
                })}
                style="display:inline-flex;align-items:center;height:2rem;width:2rem;justify-content:center;border-radius:0.5rem;cursor:pointer;border:1px solid var(--border);background:var(--surface-1);color:var(--text-secondary);transition:all 0.2s;"
                title={isBillingAnalytics ? "Refresh Billing Analytics" : isSocial ? "Sync Social Analytics" : "Force Refresh Analytics"}
              >
                <LuRefreshCw style={`width:1rem;height:1rem; transition: transform 0.3s; ${isRefreshing.value ? 'animation: spin 1s linear infinite;' : ''}`} />
              </button>
            </div>
          )}

          {isCatPage && !isAnalytics ? (
            <>
              <button
                type="button"
                class="hide-on-mobile"
                onClick$={() => nav("/dashboard/c/analytics")}
                style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:0.375rem;cursor:pointer;background:transparent;color:var(--text-secondary);transition:background 0.15s,color 0.15s;hover:background:var(--surface-2);"
                title="View Analytics"
              >
                <LuBarChart2 style="width: 1.125rem; height: 1.125rem;" />
              </button>

              {/* Hide On Profile toggle */}
              <button
                type="button"
                onClick$={$(async () => {
                  const newVal = !catCtx.isHidden.value;
                  catCtx.isHidden.value = newVal;
                  if (catCtx.onHiddenSave$.value) {
                    await catCtx.onHiddenSave$.value(newVal);
                  }
                })}
                aria-pressed={catCtx.isHidden.value}
                style={`
                  display:inline-flex;align-items:center;gap:0.5rem;
                  height:2rem;padding:0 0.75rem;border-radius:0.5rem;
                  font-size:0.8125rem;font-weight:500;cursor:pointer;
                  border:1px solid ${catCtx.isHidden.value ? "var(--accent)" : "var(--border)"};
                  background:transparent;
                  color:${catCtx.isHidden.value ? "var(--accent)" : "var(--text-secondary)"};
                  white-space:nowrap;
                `}
              >
                <span class="hide-on-mobile">Hide on Profile</span>
                <span style={`
                  position:relative;display:inline-flex;align-items:center;
                  width:2rem;height:1.125rem;border-radius:9999px;flex-shrink:0;
                  background:${catCtx.isHidden.value ? "var(--accent)" : "var(--muted)"};
                  transition:background 0.2s;
                `}>
                  <span style={`
                    position:absolute;top:50%;left:0.125rem;
                    width:0.875rem;height:0.875rem;border-radius:9999px;
                    background:var(--surface-2);
                    transform:translateY(-50%) translateX(${catCtx.isHidden.value ? "0.875rem" : "0"});
                    transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);
                  `} />
                </span>
              </button>

              {/* SEO */}
              <button
                type="button"
                class="hide-on-mobile"
                onClick$={$(() => { catCtx.seoOpen.value = true; })}
                style="display:inline-flex;align-items:center;height:2rem;padding:0 0.75rem;border-radius:0.5rem;font-size:0.8125rem;font-weight:500;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-secondary);white-space:nowrap;"
              >
                SEO
              </button>

              {/* Eye — live preview */}
              <a
                href={`https://${profileSlug}.businesskit.co/${categorySlug}`}
                target="_blank"
                title="Live preview"
                class="hide-on-mobile"
                style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:0.5rem;border:1px solid var(--border);background:transparent;color:var(--text-secondary);text-decoration:none;"
              >
                <LuEye style="width:0.875rem;height:0.875rem;" />
              </a>
            </>

          ) : isFormsEdit ? (
            /* Build tab — full actions: Share | View | Settings | Save | Publish */
            <FormsBuilderActions />

          ) : isFormsSubmissions ? (
            /* Submissions tab — export only */
            <FormsSubmissionsActions />

          ) : isFormsSummary ? (
            /* Summary tab — share + settings only, no Save/Publish */
            <FormsResultsActions />

          ) : isApps ? (
            <div style="display:flex;align-items:center;gap:0.5rem;">
              {/* Staff Selector — only on desktop breakpoint if shop app is installed */}
              {(ctx.installedApps.value || []).includes("shop") && (
                <div class="hide-on-mobile" style="display:inline-flex;align-items:center;">
                  <ShopStaffSelector
                    selectedStaffId={topbarStaffId}
                    variant="button"
                  />
                </div>
              )}

              {/* Grid / list toggle */}
              <div style="display:flex;gap:2px;background:var(--surface-3);padding:3px;border-radius:6px;">
                <button
                  onClick$={() => { ctx.viewMode.value = "grid"; }}
                  title="Grid"
                  style={`padding:4px 5px;border-radius:4px;border:none;cursor:pointer;display:flex;align-items:center;transition:all 0.15s;${ctx.viewMode.value === "grid" ? "background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.08);" : "background:transparent;color:var(--text-secondary);"}`}
                >
                  <LuLayoutGrid style="width:14px;height:14px;" />
                </button>
                <button
                  onClick$={() => { ctx.viewMode.value = "list"; }}
                  title="List"
                  style={`padding:4px 5px;border-radius:4px;border:none;cursor:pointer;display:flex;align-items:center;transition:all 0.15s;${ctx.viewMode.value === "list" ? "background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.08);" : "background:transparent;color:var(--text-secondary);"}`}
                >
                  <LuList style="width:14px;height:14px;" />
                </button>
              </div>
            </div>

          ) : isPagesEdit ? (
            <PagesEditActions />
          ) : isCrmDeals ? (
            <button
              onClick$={() => window.dispatchEvent(new CustomEvent('open-add-deal'))}
              style="background: var(--text-primary); color: var(--surface-1); height: 2rem; padding: 0 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; border: none; cursor: pointer; display: flex; justify-content: center; align-items: center; box-sizing: border-box;"
            >
              + Add Deal
            </button>
          ) : isDashboard ? (
            <div style="display:flex;align-items:center;gap:0.5rem;">
              {/* Direct OS-specific Download Update button on Desktop breakpoint (shown only when a newer version is available) */}
              {hasUpdate.value && latestReleaseTag.value && (
                <button
                  type="button"
                  class="hide-on-mobile"
                  onClick$={$(async () => {
                    const dl = getOsDownloadInfo(latestReleaseTag.value || "", latestReleaseAssets.value);
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      await invoke("shop_open_url", { url: dl.url });
                    } catch {
                      if (typeof window !== "undefined") {
                        window.open(dl.url, "_blank");
                      }
                    }
                  })}
                  title={`Direct download BusinessKit ${latestReleaseTag.value} for ${getOsDownloadInfo(latestReleaseTag.value || "", latestReleaseAssets.value).osName}`}
                  style="display:inline-flex;align-items:center;gap:0.4rem;height:2rem;padding:0 0.65rem;border-radius:0.5rem;font-size:0.75rem;font-weight:600;background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);cursor:pointer;transition:all 0.15s ease;white-space:nowrap;"
                >
                  {/* Alert radio / pulsing indicator */}
                  <span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:8px;height:8px;flex-shrink:0;">
                    <span style="position:absolute;width:100%;height:100%;border-radius:9999px;background:#f59e0b;opacity:0.75;animation:bk-pulse 1.6s cubic-bezier(0,0,0.2,1) infinite;" />
                    <span style="position:relative;width:5px;height:5px;border-radius:9999px;background:#f59e0b;" />
                  </span>
                  <span>Update {latestReleaseTag.value}</span>
                </button>
              )}
              <Slot name="actions" />
            </div>
          ) : (
            <Slot name="actions" />
          )}

          {/* Secret / Invisible SQL Runner Launcher Button (on Settings/Status and Deploy pages, placed right BEFORE Apps icon) */}
          {(loc.url.pathname.includes("/settings/status") || loc.url.pathname.includes("/dashboard/deploy")) && (
            <button
              type="button"
              onClick$={$(() => {
                ctx.sqlRunnerOpen.value = !ctx.sqlRunnerOpen.value;
              })}
              title="SQL Editor & Runner"
              style="width:1.5rem;height:2rem;border:none;background:transparent;opacity:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:-0.25rem;flex-shrink:0;"
              onMouseEnter$={(e, el) => {
                el.style.opacity = "0.35";
              }}
              onMouseLeave$={(e, el) => {
                el.style.opacity = "0";
              }}
            >
              <LuDatabase style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
            </button>
          )}

          {/* Apps button — opens /apps on click (shown on mobile only + on desktop/tablet only when sidebar is fully collapsed) */}
          {!loc.url.pathname.startsWith("/apps") && (
            <Link
              href="/apps"
              title="Apps"
              class={`topbar-apps-btn ${ctx.sidebarMode.value === "hidden" ? "is-sidebar-hidden" : ""}`}
              style="width:2rem;height:2rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);color:var(--text-secondary);cursor:pointer;transition:all 0.15s ease;flex-shrink:0;text-decoration:none;"
              onMouseEnter$={(e, el) => {
                el.style.color = "var(--text-primary)";
                el.style.borderColor = "var(--text-secondary)";
              }}
              onMouseLeave$={(e, el) => {
                el.style.color = "var(--text-secondary)";
                el.style.borderColor = "var(--border)";
              }}
            >
              <AppsIcon style="width:1rem;height:1rem;flex-shrink:0;" />
            </Link>
          )}

          {/* Agent Chat Launcher Button */}
          <button
            type="button"
            onClick$={$(() => {
              ctx.agentChatOpen.value = !ctx.agentChatOpen.value;
              localStorage.setItem("bk-agent-chat-open", ctx.agentChatOpen.value ? "true" : "false");
            })}
            title="Autonomous Agent Chat (Cmd+J / Ctrl+J)"
            style={`display:inline-flex;align-items:center;justify-content:center;gap:0.375rem;height:2rem;padding:0 0.625rem;border-radius:0.5rem;border:1px solid ${ctx.agentChatOpen.value ? "var(--accent, #6366f1)" : "rgba(99,102,241,0.3)"};background:${ctx.agentChatOpen.value ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)"};color:#6366f1;font-size:0.75rem;font-weight:500;cursor:pointer;outline:none;box-sizing:border-box;transition:all 0.15s ease;flex-shrink:0;`}
          >
            <LuBot style="width:0.875rem;height:0.875rem;" />
            <span class="hide-on-mobile">Agent</span>
            <span style="width:0.375rem;height:0.375rem;border-radius:9999px;background:#10b981;display:inline-block;" />
          </button>

          {/* Panel Left — 3-state sidebar toggle: Open (expanded) -> Collapse (icon-only) -> Hide (Desktop & Tablet) */}
          <button
            type="button"
            class="panel-sidebar-toggle-btn"
            onClick$={$(() => {
              let next: "expanded" | "collapsed" | "hidden" = "expanded";
              if (ctx.sidebarMode.value === "expanded") next = "collapsed";
              else if (ctx.sidebarMode.value === "collapsed") next = "hidden";
              else if (ctx.sidebarMode.value === "hidden") next = "expanded";

              ctx.sidebarMode.value = next;
              localStorage.setItem("bk-sidebar-mode", next);
            })}
            style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);color:var(--text-secondary);cursor:pointer;transition:all 0.15s ease;flex-shrink:0;"
            title={`Sidebar mode: ${ctx.sidebarMode.value} (click to toggle Open / Collapse / Hide)`}
          >
            <LuPanelLeft style="width:1rem;height:1rem;" />
          </button>

          {/* Mobile Menu Hamburger Button — opens AppSidebar as slide over on mobile (Right end) */}
          <button
            type="button"
            class="mobile-only-menu-btn"
            onClick$={$(() => {
              ctx.mobileSidebarOpen.value = true;
            })}
            title="Open Menu"
            style="display:none;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);color:var(--text-secondary);cursor:pointer;transition:all 0.15s ease;flex-shrink:0;padding:0;box-sizing:border-box;"
          >
            <LuMenu style="width:1.05rem;height:1.05rem;" />
          </button>
        </div>
      </div>
    </>
  );
});
