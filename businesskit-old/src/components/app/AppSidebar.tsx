/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/app/AppSidebar.tsx
//
// 1:1 port of businesskit-web/src/components/ThinSidebar.tsx
//
// Structure:
//   [Logo header]          — 3.2rem (mobile) / 3.4rem (desktop), border-bottom
//   [Profile switcher]     — avatar → dropdown with all org profiles + "New project"
//   [flex-1 nav]           — 7 items + theme toggle at bottom
//   [Bottom 4 icons]       — Profile · Settings · Deploy · ···(5-item submenu)

import {
  $,
  component$,
  useComputed$,
  useOnDocument,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { Link, useLocation, useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuBarChart2,
  LuDatabase,
  LuDollarSign,
  LuFileImage,
  LuLogOut,
  LuMail,
  LuMailCheck,
  LuMoon,
  LuMoreHorizontal,
  LuPlus,
  LuRocket,
  LuSettings,
  LuShoppingBag,
  LuSun,
  LuUser,
  LuWallet,
  LuCheck,
  LuArrowRight,
  LuFolderOpen,
  LuLink,
  LuPalette,
  LuCable,
  LuFingerprint,
  LuLandmark,
  LuFileText,
  LuUsers,
  LuRefreshCw,
  LuChevronsUpDown,
  LuExternalLink,
  LuAppWindow,
  LuX,
} from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { authStatus, signOut, switchProject, switchOrganization, getUserdbStatus, getProvisionStatus, openProfileWindow } from "~/lib/ipc";
import { triggerHaptic } from "~/lib/haptics";
import { UserSettingsModal } from "~/components/app/UserSettingsModal";

// ── Exact AppsIcon from ThinSidebar (businesskit flame) ──────────────────────
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

// ── DatabaseLinkIcon — exact SVG from ThinSidebar ────────────────────────────
const DatabaseLinkIcon = (props: { style?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style={props.style}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 12 21.5" />
    <path d="M21 5V8" />
    <path d="M3 12A9 3 0 0 0 12 14.5" />
    <g transform="translate(12, 10) scale(0.6)" stroke-width="3">
      <path d="M17 9V7A5 5 0 0 0 7 7v2" />
      <path d="M7 15v2a5 5 0 1 0 10 0v-2" />
      <line x1="12" x2="12" y1="8" y2="16" />
    </g>
  </svg>
);

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = {
  light: { surface: "#FFFFFF", border: "#D8D8D8", iconActive: "#000000", iconInactive: "#808080", activeBackground: "#f0f8ff" },
  dark: { surface: "#2C2C2C", border: "#444444", iconActive: "#FFFFFF", iconInactive: "#BFBFBF", activeBackground: "#141413" },
} as const;

// ── Nav items ──
const NAV_ITEMS = [
  { id: "apps", icon: "apps", href: "/apps", label: "Apps" },
  { id: "crm", icon: "crm", href: "/dashboard/crm", label: "CRM" },
  { id: "media", icon: "media", href: "/dashboard/media", label: "Media" },
  { id: "subscribers", icon: "mail", href: "/dashboard/content/subscribers", label: "Subscribers" },
  { id: "affiliate", icon: "dollar", href: "/affiliate", label: "Affiliate" },
];

// ── Bottom items (Profile, Settings, etc.) ─────────────────────────────
const BOTTOM_ITEMS = [
  { id: "profile", Icon: LuPalette, href: "/dashboard/settings/profile", label: "Profile" },
  { id: "settings", Icon: LuSettings, href: "/dashboard/settings", label: "Settings" },
];

const BTN = `width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:0.5rem;transition:background-color 0.15s ease;border:none;padding:0;text-decoration:none;background:transparent;`;
const ICON = `width:1rem;height:1rem;stroke-width:1.5px;`;

// ─────────────────────────────────────────────────────────────────────────────
export default component$(() => {
  const ctx = useAppContext();
  const loc = useLocation();
  const nav = useNavigate();

  const menuOpen = useSignal(false);
  const menuBtnRef = useSignal<HTMLElement>();
  const profileBtnRef = useSignal<HTMLElement>();
  const menuRef = useSignal<Element>();
  const profileRef = useSignal<Element>();
  const orgMenuRef = useSignal<Element>();
  const teamMenuRef = useSignal<Element>();
  const myProfilesMenuRef = useSignal<Element>();

  const userEmail = useSignal<string | null>(null);
  const userId = useSignal<string | null>(null);
  const userInitials = useSignal("BK");
  const profileOpen = useSignal(false);
  const orgMenuOpen = useSignal(false);
  const teamMenuOpen = useSignal(false);
  const myProfilesMenuOpen = useSignal(false);
  const switching = useSignal(false);
  const switchingOrg = useSignal(false);
  const showUserSettings = useSignal(false);

  const userAccess = useSignal<{ role: string; app_access: string[] } | null>(null);
  const teamProjects = useSignal<any[]>([]);
  const myProfiles = useSignal<any[]>([]);

  // Sync theme on first paint
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const stored = localStorage.getItem("bk-theme") as "light" | "dark" | null;
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const r = stored ?? (dark ? "dark" : "light");
    ctx.theme.value = r;
    document.documentElement.setAttribute("data-theme", r);
  });

  // Load user info from session
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const info: any = await authStatus();
      if (info?.email || info?.user?.email) {
        const email = info?.email || info?.user?.email;
        userEmail.value = email;
        userInitials.value = email.slice(0, 2).toUpperCase();
        if (info?.user?.id) userId.value = info.user.id;
        else if (info?.user_id) userId.value = info.user_id;
      }
      // Load RBAC
      const access: { role: string; app_access: string[] } = await invoke("get_my_access");
      userAccess.value = access;

      // Load invited team projects & owned personal profiles
      const [invited, owned] = await Promise.all([
        invoke<any[]>("get_my_invited_profiles").catch(() => []),
        invoke<any[]>("get_my_owned_profiles").catch(() => []),
      ]);
      teamProjects.value = invited || [];
      myProfiles.value = owned || [];
    } catch { /* ignore */ }
  });

  // Close dropdowns on outside click
  useOnDocument(
    "click",
    $((event) => {
      const target = event.target as Element;

      if (
        menuOpen.value &&
        menuRef.value &&
        !menuRef.value.contains(target) &&
        !menuBtnRef.value?.contains(target)
      ) {
        menuOpen.value = false;
      }

      if (
        profileOpen.value &&
        profileRef.value &&
        !profileRef.value.contains(target) &&
        !profileBtnRef.value?.contains(target) &&
        (!orgMenuRef.value || !orgMenuRef.value.contains(target)) &&
        (!teamMenuRef.value || !teamMenuRef.value.contains(target)) &&
        (!myProfilesMenuRef.value || !myProfilesMenuRef.value.contains(target))
      ) {
        profileOpen.value = false;
        orgMenuOpen.value = false;
        teamMenuOpen.value = false;
        myProfilesMenuOpen.value = false;
      }
    })
  );

  const palette = useComputed$(() => PALETTE[ctx.theme.value === "dark" ? "dark" : "light"]);

  const activeId = NAV_ITEMS.find((item) =>
    item.href === "/dashboard"
      ? loc.url.pathname === "/dashboard" || loc.url.pathname === "/dashboard/"
      : loc.url.pathname.startsWith(item.href)
  )?.id ?? "dashboard";

  const toggleTheme = $(() => {
    const next = ctx.theme.value === "light" ? "dark" : "light";
    ctx.theme.value = next;
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("bk-theme", next);
  });

  const handleSwitchProfile = $(async (id: string) => {
    triggerHaptic("medium");
    profileOpen.value = false;
    orgMenuOpen.value = false;
    teamMenuOpen.value = false;

    if (ctx.activeProfileId.value === id) {
      return;
    }

    // Show instant loading feedback (0ms)
    switching.value = true;

    try {
      await switchProject(id);

      const targetProfile = ctx.profiles.value.find(p => p.id === id);
      if (targetProfile && targetProfile.organization_id && targetProfile.organization_id !== ctx.org.value?.id) {
        const targetOrg = ctx.organizations.value.find(o => o.id === targetProfile.organization_id);
        if (targetOrg) {
          ctx.org.value = targetOrg;
        }
      }

      // Update active profile state synchronized with successful backend connection
      ctx.activeProfileId.value = id;
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem("bk-window-profile", id);
      localStorage.setItem("bk-active-profile", id);

      try {
        const ps = await getProvisionStatus();
        if (ps.has_userdb === false) {
          localStorage.removeItem(`bk-provisioned-${id}`);
          nav("/onboarding", { replaceState: true });
          return;
        }
        if (!ps.last_provisioned_at) {
          localStorage.removeItem(`bk-provisioned-${id}`);
          nav("/dashboard/settings/status", { replaceState: true });
          return;
        }
        localStorage.setItem(`bk-provisioned-${id}`, String(ps.last_provisioned_at));
      } catch (e) {
        console.warn("[AppSidebar] getProvisionStatus error:", e);
      }

      // Clean navigation replacing history entry so all stores and tables reload for the switched profile
      window.location.replace(`/dashboard?switch=${id}`);
    } catch (err) {
      console.error(err);
      switching.value = false;
    }
  });

  const handleSwitchOrg = $(async (id: string) => {
    triggerHaptic("medium");
    profileOpen.value = false;
    orgMenuOpen.value = false;
    teamMenuOpen.value = false;

    if (ctx.org.value?.id === id) {
      return;
    }
    switchingOrg.value = true;
    try {
      await switchOrganization(id);
      window.location.replace("/dashboard");
    } catch (err) {
      console.error(err);
      switchingOrg.value = false;
    }
  });

  const handleSignOut = $(async () => {
    menuOpen.value = false;
    try { await signOut(); } catch { /* ignore */ }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("bk-active-profile");
      localStorage.removeItem("bk-active-org");
      localStorage.removeItem("bk-window-profile");
      localStorage.removeItem("bk-user-session");
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("bk-") || key.startsWith("provisioned-"))) {
          localStorage.removeItem(key);
        }
      }
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }
    ctx.profiles.value = [];
    ctx.activeProfileId.value = "";
    ctx.org.value = null;
    ctx.organizations.value = [];
    ctx.installedApps.value = [];
    nav("/login", { replaceState: true });
  });

  const p = palette.value;

  // Active profile for avatar display
  const activeProfile = ctx.profiles.value.find(pr => pr.id === ctx.activeProfileId.value) || ctx.profiles.value[0];
  const profileInitials = activeProfile?.title?.slice(0, 2).toUpperCase() ?? userInitials.value;

  // Check license (Global license must be active for ANY premium plan to work)
  const licStatus = (ctx.license.value?.status || "").toLowerCase();
  const isLicensed = licStatus === "active" || licStatus === "grace" || licStatus === "trial";

  // Enforce per-profile soft restriction
  const profileAllocatedPlan = (activeProfile?.allocated_plan || "").trim().toUpperCase();
  const globalPlan = (ctx.license.value?.plan || "FREE").trim().toUpperCase();
  const isPro = profileAllocatedPlan !== ""
    ? (profileAllocatedPlan !== "FREE" && isLicensed)
    : (isLicensed && globalPlan !== "" && globalPlan !== "FREE");
  const effectivePlan = isPro ? (profileAllocatedPlan !== "FREE" && profileAllocatedPlan !== "" ? profileAllocatedPlan : globalPlan) : "FREE";
  const isExpanded = ctx.sidebarMode.value === "expanded" || ctx.mobileSidebarOpen.value;
  const isHidden = ctx.sidebarMode.value === "hidden";
  const isMobileOpen = ctx.mobileSidebarOpen.value;

  if (isHidden && !isMobileOpen) return null;

  // Total number of profiles is restricted by the GLOBAL license plan
  const effectiveGlobalPlan = isLicensed ? globalPlan : (profileAllocatedPlan !== "FREE" ? profileAllocatedPlan : "FREE");
  const maxProfiles = effectiveGlobalPlan === "BUSINESS" ? 10 : effectiveGlobalPlan === "PRO" ? 2 : 1;
  const canCreateProfile = ctx.profiles.value.length < maxProfiles;

  // Total number of organizations uses the same global license limits
  const maxOrgs = maxProfiles;
  const canCreateOrg = ctx.organizations.value.length < maxOrgs;

  return (
    <>
      {isMobileOpen && (
        <div
          class="mobile-sidebar-backdrop"
          onClick$={() => {
            ctx.mobileSidebarOpen.value = false;
          }}
        />
      )}
      <aside
        class={`app-sidebar ${isMobileOpen ? "mobile-open" : ""}`}
        style={`position:fixed;left:0;top:var(--titlebar-height, 2.1rem);bottom:0;width:var(--sidebar-width);max-width:var(--sidebar-width);display:flex;flex-direction:column;align-items:${isExpanded ? "stretch" : "center"};background-color:${p.surface};border-right:1px solid ${p.border};border-top:0px solid ${p.border};z-index:var(--z-sidebar, 30);box-sizing:border-box;transition:width 0.2s ease;`}
      >

        {/* ── Logo header ────────────────────────────────────────────────── */}
        <div style={`width:100%;height:calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));min-height:calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));max-height:calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));padding-top:env(safe-area-inset-top, 0px);flex-shrink:0;display:flex;align-items:center;justify-content:${isExpanded ? "space-between" : "center"};padding-left:${isExpanded ? "1rem" : "0"};padding-right:${isExpanded ? "1rem" : "0"};border-bottom:1px solid ${p.border};box-sizing:border-box;`}>
          <Link
            href="/dashboard"
            onClick$={() => { ctx.mobileSidebarOpen.value = false; }}
            style={`display:flex;align-items:center;gap:0.625rem;color:${p.iconActive};text-decoration:none;`}
          >
            {isExpanded ? (
              /* Apple-style icon (no glow) when open */
              <div style="width:1.85rem;height:1.85rem;border-radius:0.55rem;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                <svg width="28" height="28" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
                  <rect width="512" height="512" fill="url(#bk_logo_grad_sidebar)" />
                  <path d="M256 128C233.909 128 216 145.909 216 168C216 190.091 233.909 208 256 208C278.091 208 296 190.091 296 168C296 145.909 278.091 128 256 128ZM256 128V96M400 303C364.819 342.86 313.345 368 256 368C198.655 368 147.181 342.86 112 303M235.917 202.587L112 416M276.083 202.587L400 416" stroke="#F4F4F4" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" />
                  <defs>
                    <linearGradient id="bk_logo_grad_sidebar" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#BF2F00" />
                      <stop offset="1" stop-color="#D97757" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            ) : (
              /* Monotone outlined logo when collapsed */
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:1.5rem;height:1.5rem;flex-shrink:0;">
                <path
                  d="M14 4.66683C12.3892 4.66683 11.0833 5.97267 11.0833 7.5835C11.0833 9.19433 12.3892 10.5002 14 10.5002C15.6108 10.5002 16.9167 9.19433 16.9167 7.5835C16.9167 5.97267 15.6108 4.66683 14 4.66683ZM14 4.66683V2.3335M24.5 17.4272C21.9347 20.3337 18.1814 22.1668 14 22.1668C9.81858 22.1668 6.06531 20.3337 3.5 17.4272M12.5356 10.1055L3.5 25.6668M15.4644 10.1055L24.5 25.6668"
                  stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"
                />
              </svg>
            )}
            {isExpanded && <span style="font-weight:700;font-size:0.9375rem;letter-spacing:-0.01em;white-space:nowrap;">BusinessKit</span>}
          </Link>

          {/* Close button on mobile slide over */}
          <button
            type="button"
            class="mobile-sidebar-close-btn"
            onClick$={() => {
              ctx.mobileSidebarOpen.value = false;
            }}
            title="Close Menu"
            style="display:none;align-items:center;justify-content:center;width:1.85rem;height:1.85rem;border-radius:0.45rem;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;padding:0;"
          >
            <LuX style="width:1.15rem;height:1.15rem;" />
          </button>
        </div>

      {/* ── Profile switcher (top of nav — mirrors ThinSidebar) ────────── */}
      <div style={`position:relative;width:100%;margin-top:1rem;margin-bottom:0.65rem;display:flex;justify-content:${isExpanded ? "stretch" : "center"};padding:${isExpanded ? "0 0.625rem" : "0"};box-sizing:border-box;`}>
        <button
          ref={profileBtnRef}
          class="bk-profile-btn"
          onClick$={async (e) => {
            e.stopPropagation();
            triggerHaptic("light");
            profileOpen.value = !profileOpen.value;
            if (profileOpen.value) {
              try {
                const [invited, owned] = await Promise.all([
                  invoke<any[]>("get_my_invited_profiles").catch(() => []),
                  invoke<any[]>("get_my_owned_profiles").catch(() => []),
                ]);
                teamProjects.value = invited || [];
                myProfiles.value = owned || [];
              } catch { /* ignore */ }
            }
          }}
          title={activeProfile?.title ?? "Switch profile"}
          style={isExpanded
            ? "width:100%;display:flex;align-items:center;gap:0.5rem;padding:0.375rem 0.5rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.5rem;cursor:pointer;color:var(--text-primary);"
            : `${BTN} overflow:hidden; border-radius:1rem;`}
        >
          <div class="bk-profile-avatar" style={`width:1.75rem;height:1.75rem;border-radius:1rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;overflow:hidden;flex-shrink:0;`}>
            {switching.value || switchingOrg.value ? (
              <LuRefreshCw style="width:0.875rem;height:0.875rem;color:currentColor;animation:spin 0.7s linear infinite;" />
            ) : activeProfile?.avatar_url ? (
              <img src={activeProfile.avatar_url} width="28" height="28" style="width:100%;height:100%;object-fit:cover;" />
            ) : (
              profileInitials
            )}
          </div>
          {isExpanded && (
            <>
              <span style="font-size:0.8125rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left;">
                {activeProfile?.title ?? "Profile"}
              </span>
              {switching.value || switchingOrg.value ? (
                <LuRefreshCw style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;animation:spin 0.7s linear infinite;" />
              ) : (
                <LuChevronsUpDown style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
              )}
            </>
          )}
        </button>

        {/* Org switcher dropdown — matches screenshot pattern */}
        {profileOpen.value && (
          <div
            ref={profileRef}
            class="bk-dropdown-menu"
            style={isExpanded
              ? "position:absolute;top:100%;left:0.625rem;right:0.625rem;margin-top:0.35rem;min-width:13rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;flex-direction:column;z-index:10001;"
              : "position:absolute;top:0;left:100%;margin-left:0.5rem;min-width:13rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;flex-direction:column;z-index:10001;"}
          >
            {/* Organization Header */}
            {ctx.org.value && (
              <div style="padding:0.75rem 1rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border);">
                {ctx.org.value.name}
              </div>
            )}

            {/* Profiles List */}
            <div style="max-height:15rem; overflow-y:auto; padding:0.25rem 0;">
              {/* Own Profiles (Current Org) */}
              {ctx.profiles.value
                .filter(p => p.organization_id === ctx.org.value?.id)
                .map(profile => (
                  <div
                    key={profile.id}
                    class="bk-profile-row"
                    style={`display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0.65rem 0.35rem 1rem;${ctx.activeProfileId.value === profile.id ? 'background-color:var(--muted);' : ''}`}
                    onMouseEnter$={() => {
                      orgMenuOpen.value = false;
                      teamMenuOpen.value = false;
                      myProfilesMenuOpen.value = false;
                    }}
                  >
                    <button
                      class="bk-profile-item"
                      onClick$={(e) => {
                        e.stopPropagation();
                        handleSwitchProfile(profile.id);
                      }}
                      style="display:flex;align-items:center;gap:0.75rem;color:var(--text-primary);font-size:0.875rem;text-decoration:none;border:none;background:none;flex:1;min-width:0;cursor:pointer;font-family:inherit;text-align:left;padding:0;"
                    >
                      <div class="bk-profile-avatar" style={`width:1.5rem;height:1.5rem;border-radius:1.5rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;overflow:hidden;`}>
                        {profile.avatar_url ? <img src={profile.avatar_url} width="24" height="24" style="width:100%;height:100%;object-fit:cover;" /> : (profile.title?.slice(0, 2).toUpperCase() ?? "PR")}
                      </div>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;flex:1;">
                        {profile.title}
                      </span>
                    </button>
                    <div style="display:flex;align-items:center;gap:0.25rem;flex-shrink:0;">
                      {ctx.activeProfileId.value === profile.id ? (
                        <LuCheck style="width:1rem;height:1rem;color:var(--success);flex-shrink:0;" />
                      ) : (
                        <button
                          type="button"
                          class="desktop-only"
                          onClick$={(e) => {
                            e.stopPropagation();
                            profileOpen.value = false;
                            triggerHaptic("selection");
                            openProfileWindow(profile.id, profile.title);
                          }}
                          style="display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border-radius:0.375rem;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;transition:all 0.15s;"
                          title="Open profile in new window"
                          onMouseEnter$={(e: any) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                          onMouseLeave$={(e: any) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                        >
                          <LuExternalLink style="width:0.875rem;height:0.875rem;" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Create New Profile */}
            <div style="border-top:1px solid var(--border);">
              <button
                class="bk-profile-item"
                onMouseEnter$={() => {
                  orgMenuOpen.value = false;
                  teamMenuOpen.value = false;
                  myProfilesMenuOpen.value = false;
                }}
                onClick$={() => {
                  profileOpen.value = false;
                  if (canCreateProfile) {
                    nav("/onboarding");
                  } else {
                    alert(`Plan limit reached! You can only have up to ${maxProfiles} workspace(s) on your current plan. Please upgrade your plan in settings.`);
                    nav("/dashboard/settings?tab=plan");
                  }
                }}
                style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;text-decoration:none;"
              >
                <LuPlus style="width:1rem;height:1rem;flex-shrink:0;" />
                <span>Create New Profile</span>
              </button>
            </div>

            {/* New Window action (Desktop Only) */}
            <div class="desktop-only" style="border-top:1px solid var(--border); width:100%;">
              <button
                class="bk-profile-item"
                onMouseEnter$={() => {
                  orgMenuOpen.value = false;
                  teamMenuOpen.value = false;
                  myProfilesMenuOpen.value = false;
                }}
                onClick$={() => {
                  profileOpen.value = false;
                  const curProfile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
                  if (ctx.activeProfileId.value) {
                    triggerHaptic("selection");
                    openProfileWindow(ctx.activeProfileId.value, curProfile?.title);
                  }
                }}
                style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;text-decoration:none;"
              >
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  <LuAppWindow style="width:1rem;height:1rem;flex-shrink:0;" />
                  <span>New Window</span>
                </div>
                <span style="font-size:0.7rem;padding:0.1rem 0.35rem;border-radius:0.25rem;background:var(--muted);color:var(--text-secondary);font-weight:600;font-family:var(--font-mono, monospace);">
                  ⌘⇧N
                </span>
              </button>
            </div>

            {/* My Profiles trigger (Nested sub-menu) - shown when user has personal profiles outside the active organization */}
            {myProfiles.value.filter(p => p.organization_id !== ctx.org.value?.id).length > 0 && (
              <div style="border-top:1px solid var(--border); position:relative;">
                <button
                  class="bk-profile-item"
                  onClick$={() => {
                    myProfilesMenuOpen.value = !myProfilesMenuOpen.value;
                    if (myProfilesMenuOpen.value) {
                      teamMenuOpen.value = false;
                      orgMenuOpen.value = false;
                    }
                  }}
                  onMouseEnter$={() => {
                    myProfilesMenuOpen.value = true;
                    teamMenuOpen.value = false;
                    orgMenuOpen.value = false;
                  }}
                  style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;"
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span>My Profiles</span>
                    <span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:1rem;background:var(--muted);color:var(--text-secondary);font-weight:600;">
                      {myProfiles.value.filter(p => p.organization_id !== ctx.org.value?.id).length}
                    </span>
                  </div>
                  <LuArrowRight style="width:1rem;height:1rem;flex-shrink:0;" />
                </button>

                {/* Nested My Profiles Menu */}
                {myProfilesMenuOpen.value && (
                  <div
                    ref={myProfilesMenuRef}
                    class="bk-dropdown-menu"
                    style="position:absolute;top:0;left:100%;margin-left:0.5rem;min-width:15rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;z-index:60;"
                  >
                    {/* Header */}
                    <div style="padding:0.625rem 1rem;border-bottom:1px solid var(--border);">
                      <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                        Personal Workspaces
                      </div>
                    </div>

                    {/* My Profiles List */}
                    <div style="max-height:15rem; overflow-y:auto; padding:0.25rem 0;">
                      {myProfiles.value
                        .filter(p => p.organization_id !== ctx.org.value?.id)
                        .map(profile => {
                          const orgName = profile.organization_name || "Personal";
                          return (
                            <div
                              key={profile.id}
                              style={`display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0.65rem 0.35rem 1rem;${ctx.activeProfileId.value === profile.id ? 'background-color:var(--muted);' : ''}`}
                            >
                              <button
                                class="bk-profile-item"
                                onClick$={(e) => {
                                  e.stopPropagation();
                                  handleSwitchProfile(profile.id);
                                }}
                                style="display:flex;align-items:center;gap:0.75rem;color:var(--text-primary);font-size:0.875rem;text-decoration:none;border:none;background:none;flex:1;min-width:0;cursor:pointer;font-family:inherit;text-align:left;padding:0;"
                              >
                                <div class="bk-profile-avatar" style={`width:1.5rem;height:1.5rem;border-radius:1.5rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;overflow:hidden;`}>
                                  {profile.avatar_url ? <img src={profile.avatar_url} width="24" height="24" style="width:100%;height:100%;object-fit:cover;" /> : (profile.title?.slice(0, 2).toUpperCase() ?? "PR")}
                                </div>
                                <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
                                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">
                                    {profile.title}
                                  </span>
                                  <span style="font-size:0.7rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                    {orgName}
                                  </span>
                                </div>
                              </button>
                              <div style="display:flex;align-items:center;gap:0.25rem;flex-shrink:0;">
                                {ctx.activeProfileId.value === profile.id ? (
                                  <LuCheck style="width:1rem;height:1rem;color:var(--success);flex-shrink:0;" />
                                ) : (
                                  <button
                                    type="button"
                                    class="desktop-only"
                                    onClick$={(e) => {
                                      e.stopPropagation();
                                      profileOpen.value = false;
                                      myProfilesMenuOpen.value = false;
                                      triggerHaptic("selection");
                                      openProfileWindow(profile.id, profile.title);
                                    }}
                                    style="display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border-radius:0.375rem;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;transition:all 0.15s;"
                                    title="Open profile in new window"
                                    onMouseEnter$={(e: any) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                                    onMouseLeave$={(e: any) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                                  >
                                    <LuExternalLink style="width:0.875rem;height:0.875rem;" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Team Projects trigger (Nested sub-menu) */}
            {teamProjects.value.length > 0 && (
              <div style="border-top:1px solid var(--border); position:relative;">
                <button
                  class="bk-profile-item"
                  onClick$={() => {
                    teamMenuOpen.value = !teamMenuOpen.value;
                    if (teamMenuOpen.value) {
                      orgMenuOpen.value = false;
                      myProfilesMenuOpen.value = false;
                    }
                  }}
                  onMouseEnter$={() => {
                    teamMenuOpen.value = true;
                    orgMenuOpen.value = false;
                    myProfilesMenuOpen.value = false;
                  }}
                  style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;"
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span>Team Projects</span>
                    <span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:1rem;background:var(--muted);color:var(--text-secondary);font-weight:600;">
                      {teamProjects.value.length}
                    </span>
                  </div>
                  <LuArrowRight style="width:1rem;height:1rem;flex-shrink:0;" />
                </button>

                {/* Nested Team Projects Menu */}
                {teamMenuOpen.value && (
                  <div
                    ref={teamMenuRef}
                    class="bk-dropdown-menu"
                    style="position:absolute;top:0;left:100%;margin-left:0.5rem;min-width:15rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;z-index:60;"
                  >
                    {/* Header */}
                    <div style="padding:0.625rem 1rem;border-bottom:1px solid var(--border);">
                      <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                        Team Projects
                      </div>
                    </div>

                    {/* Team Projects List */}
                    <div style="max-height:15rem; overflow-y:auto; padding:0.25rem 0;">
                      {teamProjects.value.map(profile => {
                        const orgName = profile.organization_name || "Team Workspace";
                        return (
                          <div
                            key={profile.id}
                            style={`display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0.65rem 0.35rem 1rem;${ctx.activeProfileId.value === profile.id ? 'background-color:var(--muted);' : ''}`}
                          >
                            <button
                              class="bk-profile-item"
                              onClick$={(e) => {
                                e.stopPropagation();
                                handleSwitchProfile(profile.id);
                              }}
                              style="display:flex;align-items:center;gap:0.75rem;color:var(--text-primary);font-size:0.875rem;text-decoration:none;border:none;background:none;flex:1;min-width:0;cursor:pointer;font-family:inherit;text-align:left;padding:0;"
                            >
                              <div class="bk-profile-avatar" style={`width:1.5rem;height:1.5rem;border-radius:1.5rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;overflow:hidden;`}>
                                {profile.avatar_url ? <img src={profile.avatar_url} width="24" height="24" style="width:100%;height:100%;object-fit:cover;" /> : (profile.title?.slice(0, 2).toUpperCase() ?? "PR")}
                              </div>
                              <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">
                                  {profile.title}
                                </span>
                                <span style="font-size:0.7rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                  {orgName}
                                </span>
                              </div>
                            </button>
                            <div style="display:flex;align-items:center;gap:0.25rem;flex-shrink:0;">
                              {ctx.activeProfileId.value === profile.id ? (
                                <LuCheck style="width:1rem;height:1rem;color:var(--success);flex-shrink:0;" />
                              ) : (
                                <button
                                  type="button"
                                  class="desktop-only"
                                  onClick$={(e) => {
                                    e.stopPropagation();
                                    profileOpen.value = false;
                                    teamMenuOpen.value = false;
                                    triggerHaptic("selection");
                                    openProfileWindow(profile.id, profile.title);
                                  }}
                                  style="display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border-radius:0.375rem;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;transition:all 0.15s;"
                                  title="Open profile in new window"
                                  onMouseEnter$={(e: any) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                                  onMouseLeave$={(e: any) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                                >
                                  <LuExternalLink style="width:0.875rem;height:0.875rem;" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Switch org trigger */}
            <div style="border-top:1px solid var(--border); position:relative;">
              <button
                class="bk-profile-item"
                onClick$={() => {
                  orgMenuOpen.value = !orgMenuOpen.value;
                  if (orgMenuOpen.value) {
                    teamMenuOpen.value = false;
                    myProfilesMenuOpen.value = false;
                  }
                }}
                onMouseEnter$={() => {
                  orgMenuOpen.value = true;
                  teamMenuOpen.value = false;
                  myProfilesMenuOpen.value = false;
                }}
                style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;"
              >
                <span>Switch organization</span>
                <LuArrowRight style="width:1rem;height:1rem;flex-shrink:0;" />
              </button>

              {/* Nested Org Menu */}
              {orgMenuOpen.value && (
                <div
                  ref={orgMenuRef}
                  class="bk-dropdown-menu"
                  style="position:absolute;top:0;left:100%;margin-left:0.5rem;min-width:13rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;z-index:60;"
                >
                  {/* Email header */}
                  {userEmail.value && (
                    <div style="padding:0.625rem 1rem;border-bottom:1px solid var(--border);">
                      <div style="font-size:0.75rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        {userEmail.value}
                      </div>
                    </div>
                  )}

                  {/* Orgs List */}
                  <div style="max-height:15rem; overflow-y:auto; padding:0.25rem 0;">
                    {ctx.organizations.value
                      .filter(org => !userId.value || org.owner_user_id === userId.value)
                      .map(organization => (
                        <button
                          key={organization.id}
                          class="bk-profile-item"
                          data-org-id={organization.id}
                          onClick$={(e) => {
                            e.stopPropagation();
                            handleSwitchOrg(organization.id);
                          }}
                          disabled={switchingOrg.value}
                          style={`display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.5rem 1rem;color:var(--text-primary);font-size:0.875rem;text-decoration:none;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;${ctx.org.value?.id === organization.id ? 'background-color:var(--muted);' : ''}`}
                        >
                          <div style="display:flex;align-items:center;gap:0.75rem;">
                            <div class="bk-profile-avatar" style={`width:1.5rem;height:1.5rem;border-radius:0.25rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;`}>
                              {organization.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">
                              {organization.name}
                            </span>
                          </div>
                          {ctx.org.value?.id === organization.id && (
                            <LuCheck style="width:1rem;height:1rem;color:var(--success);flex-shrink:0;" />
                          )}
                        </button>
                      ))}
                  </div>

                  {/* Create organization */}
                  <div style="border-top:1px solid var(--border);">
                    <button
                      class="bk-profile-item"
                      onClick$={() => {
                        profileOpen.value = false;
                        orgMenuOpen.value = false;
                        if (canCreateOrg) {
                          nav("/create-org");
                        } else {
                          alert(`Plan limit reached! You can only have up to ${maxOrgs} organization(s) on your current plan. Please upgrade your plan in settings.`);
                          nav("/dashboard/settings?tab=plan");
                        }
                      }}
                      style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;text-decoration:none;"
                    >
                      <LuPlus style="width:1rem;height:1rem;flex-shrink:0;" />
                      <span>Create organization</span>
                    </button>
                  </div>

                  {/* Team Orgs */}
                  {userId.value && ctx.organizations.value.some(org => org.owner_user_id !== userId.value) && (
                    <div style="border-top:1px solid var(--border);">
                      <div style="padding:0.75rem 1rem 0.25rem 1rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-top:0.25rem;">
                        Team Orgs
                      </div>
                      <div style="max-height:10rem; overflow-y:auto; padding:0.25rem 0;">
                        {ctx.organizations.value
                          .filter(org => org.owner_user_id !== userId.value)
                          .map(organization => (
                            <button
                              key={organization.id}
                              class="bk-profile-item"
                              data-org-id={organization.id}
                              onClick$={(e) => {
                                e.stopPropagation();
                                handleSwitchOrg(organization.id);
                              }}
                              disabled={switchingOrg.value}
                              style={`display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.5rem 1rem;color:var(--text-primary);font-size:0.875rem;text-decoration:none;border:none;background:none;width:100%;cursor:pointer;font-family:inherit;text-align:left;${ctx.org.value?.id === organization.id ? 'background-color:var(--muted);' : ''}`}
                            >
                              <div style="display:flex;align-items:center;gap:0.75rem;">
                                <div class="bk-profile-avatar" style={`width:1.5rem;height:1.5rem;border-radius:0.25rem;background:${p.iconActive};color:${p.surface};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;`}>
                                  {organization.name.slice(0, 2).toUpperCase()}
                                </div>
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">
                                  {organization.name}
                                </span>
                              </div>
                              {ctx.org.value?.id === organization.id && (
                                <LuCheck style="width:1rem;height:1rem;color:var(--success);flex-shrink:0;" />
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Main nav (flex-1) ─────────────────── */}
      <nav style={`flex:1;display:flex;flex-direction:column;align-items:${isExpanded ? "stretch" : "center"};width:100%;padding:${isExpanded ? "0 0.625rem 0.75rem" : "0 0 0.75rem"};overflow-y:auto;min-height:0;row-gap:0.25rem;box-sizing:border-box;`}>
        {NAV_ITEMS.map(({ id, icon, href, label }) => {
          const isActive = id === activeId;
          const bg = isActive ? p.activeBackground : "transparent";

          let hasAccess = true;
          if (userAccess.value && userAccess.value.role !== "owner") {
            const apps = userAccess.value.app_access;
            if (!apps.includes("*")) {
              const defaultApps = ["apps", "links", "store", "content", "crm"];
              if (!defaultApps.includes(id)) {
                const mappedId = id === "sales" ? "crm" : id;
                if (!apps.includes(mappedId)) {
                  hasAccess = false;
                }
              }
            }
          }

          const color = hasAccess ? (isActive ? p.iconActive : p.iconInactive) : "var(--muted-foreground, #a1a1aa)";

          const iconEl = (() => {
            if (icon === "apps") return <AppsIcon style="width:1rem;height:1rem;flex-shrink:0;" />;
            if (icon === "db") return <DatabaseLinkIcon style="width:1rem;height:1rem;flex-shrink:0;" />;
            if (icon === "store") return <LuShoppingBag style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
            if (icon === "crm") return <LuUsers style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
            if (icon === "media") return <LuFileImage style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
            if (icon === "mail") return <LuMailCheck style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
            if (icon === "dollar") return <LuDollarSign style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
            return <LuShoppingBag style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />;
          })();

          if (!hasAccess) {
            return (
              <div
                key={id}
                title={`${label} (No Access)`}
                style={isExpanded
                  ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${color};background-color:transparent;opacity:0.5;cursor:not-allowed;box-sizing:border-box;`
                  : `${BTN} color:${color}; background-color:transparent; opacity: 0.5; cursor: not-allowed;`}
              >
                {iconEl}
                {isExpanded && <span style="font-size:0.8125rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{label}</span>}
              </div>
            );
          }

          return (
            <Link
              key={id}
              href={href}
              title={label}
              onClick$={() => { ctx.mobileSidebarOpen.value = false; }}
              style={isExpanded
                ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${color};background-color:${bg};text-decoration:none;transition:background-color 0.15s;box-sizing:border-box;`
                : `${BTN} color:${color}; background-color:${bg};`}
            >
              {iconEl}
              {isExpanded && <span style="font-size:0.8125rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{label}</span>}
            </Link>
          );
        })}

        {/* Theme toggle — in top nav section */}
        <button
          onClick$={toggleTheme}
          title={ctx.theme.value === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          style={isExpanded
            ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${p.iconInactive};background:transparent;border:none;cursor:pointer;font-size:0.8125rem;font-weight:500;transition:background-color 0.15s;box-sizing:border-box;`
            : `${BTN} color:${p.iconInactive}; cursor:pointer;`}
          onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
          onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          {ctx.theme.value === "dark" ? <LuSun style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" /> : <LuMoon style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />}
          {isExpanded && <span>{ctx.theme.value === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
      </nav>

      {/* ── Bottom controls ────────────────────────────────────── */}
      <div style={`margin-top:auto;display:flex;flex-direction:column;align-items:${isExpanded ? "stretch" : "center"};width:100%;flex-shrink:0;row-gap:0.25rem;padding:${isExpanded ? "0.75rem 0.625rem calc(2.75rem + env(safe-area-inset-bottom, 0px))" : "0.75rem 0 calc(2.75rem + env(safe-area-inset-bottom, 0px))"};box-sizing:border-box;border-top:1px solid ${p.border};`}>
        {/* Refresh App button */}
        <button
          onClick$={$(() => window.location.reload())}
          title="Refresh App"
          style={isExpanded
            ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${p.iconInactive};background:transparent;border:none;cursor:pointer;font-size:0.8125rem;font-weight:500;transition:background-color 0.15s;box-sizing:border-box;`
            : `${BTN} color:${p.iconInactive}; cursor:pointer;`}
          onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
          onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          <LuRefreshCw style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
          {isExpanded && <span>Refresh</span>}
        </button>

        {/* Bottom items */}
        {BOTTOM_ITEMS.map(({ id, Icon, href, label }) => {
          const isActive = loc.url.pathname.startsWith(href);
          return (
            <Link
              key={id}
              href={href}
              title={label}
              onClick$={() => { ctx.mobileSidebarOpen.value = false; }}
              style={isExpanded
                ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${isActive ? p.iconActive : p.iconInactive};background-color:${isActive ? p.activeBackground : "transparent"};text-decoration:none;transition:background-color 0.15s;box-sizing:border-box;`
                : `${BTN} color:${isActive ? p.iconActive : p.iconInactive}; background-color:${isActive ? p.activeBackground : "transparent"};`}
            >
              <Icon style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
              {isExpanded && <span style="font-size:0.8125rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{label}</span>}
            </Link>
          );
        })}

        {/* User menu button */}
        <div
          class="bk-user-menu-wrap"
          style={`position:relative;${isExpanded ? "width:100%;" : ""}`}
        >
          <button
            ref={menuBtnRef}
            type="button"
            onClick$={() => { menuOpen.value = !menuOpen.value; }}
            title="User menu"
            style={isExpanded
              ? `display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.45rem 0.625rem;border-radius:0.375rem;color:${p.iconInactive};background:transparent;border:none;cursor:pointer;font-size:0.8125rem;font-weight:500;transition:background-color 0.15s;box-sizing:border-box;`
              : `${BTN} color:${p.iconInactive}; cursor:pointer;`}
          >
            <LuMoreHorizontal style="width:1.125rem;height:1.125rem;flex-shrink:0;" />
            {isExpanded && <span>More options</span>}
          </button>

          {menuOpen.value && (
            <div
              ref={menuRef}
              class="bk-user-menu-dropdown"
              style={isMobileOpen
                ? "position:absolute;bottom:100%;left:0;right:0;margin-bottom:0.5rem;width:100%;max-height:min(380px, 60vh);overflow-y:auto;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;flex-direction:column;z-index:10001;box-sizing:border-box;"
                : "position:absolute;bottom:0.25rem;left:100%;margin-left:0.5rem;min-width:11rem;background-color:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;flex-direction:column;z-index:10001;"}
            >
              {/* 1 — signed in as */}
              {userEmail.value && (
                <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);">
                  <div style="font-size:0.6875rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Signed in as</div>
                  <div style="font-size:0.75rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;font-weight:500;">{userEmail.value}</div>
                </div>
              )}

              {/* 1.5 — About You (User Settings) */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; showUserSettings.value = true; }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;transition:background-color 0.15s;background:transparent;border:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuUser style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>About You</span>
              </button>

              {/* 2 — Settings */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuSettings style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Settings</span>
              </button>

              {/* 3 — Profile */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings/profile"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuPalette style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Profile</span>
              </button>

              {/* 3.5 — Team */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings/teams"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuUsers style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Team</span>
              </button>

              {/* 4 — Workspace Status */}
              <button
                onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings/status"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuDatabase style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>DB Status</span>
              </button>

              {/* 4.5 — Connections */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings/connections"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuCable style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Connections</span>
              </button>

              {/* 4.6 — Credentials */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/settings/credentials"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuFingerprint style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Credentials</span>
              </button>

              {/* 5 — Deploy */}
              <button onClick$={() => { menuOpen.value = false; ctx.mobileSidebarOpen.value = false; nav("/dashboard/deploy"); }}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;text-decoration:none;border-top:1px solid var(--border);transition:background-color 0.15s;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;width:100%;text-align:left;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuRocket style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Deploy</span>
              </button>

              {/* 5 — Sign out */}
              <button onClick$={handleSignOut}
                style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;border-top:1px solid var(--border);transition:background-color 0.15s;background:none;border-left:none;border-right:none;border-bottom:none;width:100%;cursor:pointer;border-radius:0 0 0.5rem 0.5rem;text-align:left;font-family:inherit;"
                onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LuLogOut style="width:1rem;height:1rem;stroke-width:1.5px;flex-shrink:0;" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* User settings modal ("About You") */}
      <UserSettingsModal
        isOpen={showUserSettings.value}
        onClose$={$(() => {
          showUserSettings.value = false;
        })}
      />
    </aside>
  </>
  );
});
