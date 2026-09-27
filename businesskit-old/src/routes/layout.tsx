/* eslint-disable @typescript-eslint/no-unused-vars, no-empty */
// src/routes/layout.tsx
//
// WHAT:  Root app shell — gate, sidebar, topbar, context provider.
//
// HOW:   On mount: invoke get_license_status + get_organization + get_projects.
//        Provides AppContext to every child route via useContextProvider.
//        Redirects: not logged in → /login | no org → /onboarding
//        All data fetched ONCE here — child routes read from context signals.
//
// FLOW:
//   Mount → invoke 3 commands → set context signals → render shell + <Slot />

import {
  component$,
  Slot,
  useContextProvider,
  useSignal,
  useVisibleTask$,
  type QRL,
  $,
} from "@builder.io/qwik";
import { useNavigate, useLocation } from "@builder.io/qwik-city";
import { AppContext, type AppContextState } from "~/lib/app-context";
import { CategoryCtx, type CategoryContextState } from "~/lib/category-context";
import { CommunityCtx, type CommunityContextState } from "~/lib/community-context";
import { SeoSettingsModal } from "~/components/SeoSettingsModal";
import {
  authStatus,
  getLicenseStatus,
  getOrganization,
  getProjects,
  getUserOrganizations,
  isCentralDbReady,
  switchProject,
  getActiveProfileId,
  getProvisionStatus,
} from "~/lib/ipc";
import { invoke } from "@tauri-apps/api/core";
import AppSidebar from "~/components/app/AppSidebar";
import AppTopbar from "~/components/app/AppTopbar";
import TitleBar from "~/components/app/TitleBar";
import { AgentChatSidebar } from "~/components/agents/AgentChatSidebar";
import { SqlRunnerSidebar } from "~/components/app/SqlRunnerSidebar";
import { PendingInvitesModal } from "~/components/PendingInvitesModal";
import type { LicenseStatus, Organization, Profile } from "~/lib/types";
import type { SettingsRow } from "~/lib/types";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";


// Routes that don't use the app shell
const PUBLIC_ROUTES = ["/login", "/auth", "/onboarding"];

/** Maps URL path segments → human-readable page names for the native title bar. */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard":                  "Dashboard",
  "/apps":                       "Apps",
  "/dashboard/profile":          "Links",
  "/dashboard/c/links":          "Links",
  "/dashboard/store":            "Store",
  "/dashboard/store/digital-download": "Digital Downloads",
  "/dashboard/store/courses":          "Courses",
  "/dashboard/store/event":            "Events",
  "/dashboard/store/listing":          "Listings",
  "/dashboard/store/meeting":          "Meetings",
  "/dashboard/store/service":          "Services",
  "/dashboard/jobs":                   "Jobs",
  "/dashboard/forms":                  "Forms",
  "/dashboard/store/sponsorship":      "Sponsorships",
  "/dashboard/store/webinar":          "Webinars",
  "/dashboard/community":              "Community",
  "/sales":                      "Sales",
  "/subscribers":                "Subscribers",
  "/dashboard/analytics":        "Analytics",
  "/affiliate":                  "Affiliate",
  "/dashboard/agents":           "Agents",
  "/dashboard/media":            "Media Library",
  "/dashboard/pages":            "Pages",
  "/dashboard/deploy":           "Deploy",
  "/dashboard/crm":              "CRM",
  "/dashboard/social":           "Social",
  "/dashboard/accounts":         "Accounts",
  "/dashboard/settings":         "Settings",
  "/dashboard/settings/profile": "Profile Settings",
  "/dashboard/settings/status":  "UserDB Status",
};

function routeLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const match = Object.keys(ROUTE_LABELS)
    .filter(k => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : "BusinessKit";
}

export default component$(() => {
  const nav = useNavigate();
  const loc = useLocation();

  const license = useSignal<LicenseStatus | null>(null);
  const org = useSignal<Organization | null>(null);
  const organizations = useSignal<Organization[]>([]);
  const profiles = useSignal<Profile[]>([]);
  const activeProfileId = useSignal<string | null>(null);
  const installedApps = useSignal<string[] | null>(null);
  const pendingInvites = useSignal<any[]>([]);
  const theme = useSignal<"light" | "dark">("light");
  const loading = useSignal(true);
  const viewMode = useSignal<"grid" | "list">("list");
  const sidebarMode = useSignal<"expanded" | "collapsed" | "hidden">("expanded");
  const agentChatOpen = useSignal(false);
  const agentChatWidth = useSignal(420);
  const sqlRunnerOpen = useSignal(false);
  const sqlRunnerInitialQuery = useSignal("");
  const appsSearchQuery = useSignal("");
  const mobileSidebarOpen = useSignal(false);
  const bootStep = useSignal("Initializing...");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const saved = localStorage.getItem("bk-sidebar-mode") as "expanded" | "collapsed" | "hidden" | null;
    if (saved && ["expanded", "collapsed", "hidden"].includes(saved)) {
      sidebarMode.value = saved;
    }
    const savedChatOpen = localStorage.getItem("bk-agent-chat-open");
    if (savedChatOpen === "true") {
      agentChatOpen.value = true;
    }

    // Android 3-button navigation bar detection
    const updateNavDetection = () => {
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        const diff = window.screen.height - window.innerHeight;
        const has3Buttons = diff >= 36 || (window.screen.availHeight < window.screen.height - 30);
        if (has3Buttons) {
          document.documentElement.classList.add("has-android-3button");
        } else {
          document.documentElement.classList.remove("has-android-3button");
        }
      }
    };
    updateNavDetection();
    window.addEventListener("resize", updateNavDetection, { passive: true });

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+K / Ctrl+Shift+K / Cmd+Shift+E to toggle SQL Runner
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "K" || e.key === "k" || e.key === "E" || e.key === "e")) {
        e.preventDefault();
        sqlRunnerOpen.value = !sqlRunnerOpen.value;
      }
      if (e.key === "Escape" && sqlRunnerOpen.value) {
        sqlRunnerOpen.value = false;
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("resize", updateNavDetection);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  });

  // Provide AppContext to all children
  useContextProvider(AppContext, {
    license, org, organizations, profiles, activeProfileId, installedApps, theme, loading, viewMode, sidebarMode, agentChatOpen, agentChatWidth, sqlRunnerOpen, sqlRunnerInitialQuery, appsSearchQuery, mobileSidebarOpen,
  } satisfies AppContextState);

  // ── CategoryCtx — shared between category pages and AppTopbar ────────────
  const catSlug        = useSignal("");
  const catProfSlug    = useSignal("");
  const catProfTitle   = useSignal("");
  const catHidden      = useSignal(false);
  const catSeoOpen     = useSignal(false);
  const catSeoSettings = useSignal<import("~/lib/types").LinkPageRow | SettingsRow | null>(null);
  const catSeoSaving   = useSignal(false);
  const catOnSeoSave   = useSignal<QRL<(data: any) => Promise<void>> | null>(null);
  const catOnHiddenSave = useSignal<QRL<(hidden: boolean) => Promise<void>> | null>(null);
  const catSidebarCollapsed = useSignal(false);
  const catActiveTab   = useSignal<"Links" | "Analytics">("Links");
  useContextProvider(CategoryCtx, {
    categorySlug:  catSlug,
    profileSlug:   catProfSlug,
    profileTitle:  catProfTitle,
    isHidden:      catHidden,
    seoOpen:       catSeoOpen,
    seoSettings:   catSeoSettings,
    seoSaving:     catSeoSaving,
    onSeoSave$:    catOnSeoSave,
    onHiddenSave$: catOnHiddenSave,
    sidebarCollapsed: catSidebarCollapsed,
    activeTab:     catActiveTab,
  } satisfies CategoryContextState);

  // ── FormsBuilderCtx — shared between forms edit page and AppTopbar ───────────
  const fbTitle      = useSignal("");
  const fbDirty      = useSignal(false);
  const fbSaving     = useSignal(false);
  const fbPublished  = useSignal(false);
  const fbPublishing = useSignal(false);
  const fbDoSave     = useSignal<QRL<() => Promise<void>> | null>(null);
  const fbTogglePub  = useSignal<QRL<() => Promise<void>> | null>(null);
  useContextProvider(FormsBuilderCtx, {
    formTitle:     fbTitle,
    dirty:         fbDirty,
    saving:        fbSaving,
    published:     fbPublished,
    publishing:    fbPublishing,
    doSave:        $(async () => { if (fbDoSave.value) await fbDoSave.value(); }),
    togglePublish: $(async () => { if (fbTogglePub.value) await fbTogglePub.value(); }),
    // expose the writable signal slots so the edit page can install its QRLs
    _doSaveSlot:     fbDoSave,
    _togglePubSlot:  fbTogglePub,
  });

  // ── CommunityCtx ─────────────────────────────────────────────────────────────
  const commTitle = useSignal("");
  useContextProvider(CommunityCtx, {
    communityTitle: commTitle,
  } satisfies CommunityContextState);

  // Apply saved theme on mount + register fullscreen keyboard shortcut
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const saved = localStorage.getItem("bk-theme") as "light" | "dark" | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const t = saved ?? preferred;
    theme.value = t;
    document.documentElement.setAttribute("data-theme", t);

    // ── Fullscreen shortcut: Cmd+Ctrl+F (macOS standard) ───────────────────
    // Uses toggleFullscreen IPC which calls set_simple_fullscreen on macOS
    // so ●●● traffic lights stay visible (Chrome-like behaviour).
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        import("~/lib/ipc").then(({ toggleFullscreen }) => toggleFullscreen()).catch(() => {});
      }
      // Cmd+Shift+N / Ctrl+Shift+N: Open New Window for active profile
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const curProfile = profiles.value.find(p => p.id === activeProfileId.value);
        if (activeProfileId.value) {
          import("~/lib/ipc").then(({ openProfileWindow }) => {
            openProfileWindow(activeProfileId.value!, curProfile?.title);
          }).catch(() => {});
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // ── Listen for deep links (e.g. businesskit://invite?token=...) ─────────
    import("@tauri-apps/plugin-deep-link").then(({ onOpenUrl }) => {
      onOpenUrl(async (urls) => {
        console.log("Deep link received (onOpenUrl):", urls);
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          await win.unminimize();
          await win.show();
          await win.setFocus();
          const { invoke } = await import("@tauri-apps/api/core");
          const fetchedInvites = await invoke<any[]>("get_my_pending_invites");
          if (fetchedInvites && fetchedInvites.length > 0) {
            pendingInvites.value = fetchedInvites;
          }
        } catch (e) {
          console.error("Failed to fetch invites on deep link:", e);
        }
      });
    });

    // Fallback trap from single-instance
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("scheme-request-received", async (event) => {
        console.log("Deep link received (scheme-request-received):", event.payload);
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          await win.unminimize();
          await win.show();
          await win.setFocus();
          const { invoke } = await import("@tauri-apps/api/core");
          const fetchedInvites = await invoke<any[]>("get_my_pending_invites");
          if (fetchedInvites && fetchedInvites.length > 0) {
            pendingInvites.value = fetchedInvites;
          }
        } catch (e) {
          console.error("Failed to process fallback deep link:", e);
        }
      });
    });

    // ── Window Focus Listener: Auto-sync active profile to Rust backend ──────
    const onWindowFocus = () => {
      const myProfile = (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("bk-window-profile") : null) || activeProfileId.value;
      if (myProfile) {
        import("~/lib/ipc").then(({ getActiveProfileId, switchProject }) => {
          getActiveProfileId().then(currentRustId => {
            if (currentRustId && currentRustId !== myProfile) {
              switchProject(myProfile).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    };
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onWindowFocus);
    };
  });

  // ── Native window title: "ProfileName · RouteName" ───────────────────────
  // Updates whenever active profile or route changes.
  // Uses Tauri v2 getCurrentWindow().setTitle() — works on macOS, iOS,
  // Android (Activity label) and Windows (window caption).
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => activeProfileId.value);
    const pathname = track(() => loc.url.pathname);
    mobileSidebarOpen.value = false;

    const activeProfile = profiles.value.find(p => p.id === activeProfileId.value);
    const profileName = activeProfile?.title ?? org.value?.name ?? "BusinessKit";
    const page = routeLabel(window.location.pathname);
    const title = profileName ? `${profileName} · ${page}` : page;

    // Tauri v2 async — fire-and-forget, no await needed in useVisibleTask$
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => { document.title = title; }); // fallback for web/dev
  });


  // Boot sequence — runs once on mount and on auth-changed
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ cleanup }) => {
    let unlistenAuth: (() => void) | undefined;

    const runBoot = async (isAuthTriggered = false) => {
      const path = loc.url.pathname;
      const isPublic = PUBLIC_ROUTES.some((r) => path.startsWith(r));

    try {
      // ── Step 1: Check keychain session (instant, no network) ────────────────
      bootStep.value = "Checking session...";
      const session = await authStatus();

      if (!session && !isPublic) {
        nav("/login", { replaceState: true });
        loading.value = false;
        return;
      }

      // ── Step 2: Wait for Central DB to be ready (max 3s, 150ms polls) ───────
      // Rust setup_app() connects Turso async — this eliminates the startup race.
      // First check is instant (DB is usually ready by the time the frontend loads).
      bootStep.value = "Connecting to database...";
      const DB_READY_TIMEOUT = 3_000;
      const DB_POLL_MS = 150;
      const dbStart = Date.now();
      let dbReady = false;
      try { dbReady = await isCentralDbReady(); } catch { /* not ready yet */ }
      while (!dbReady && Date.now() - dbStart < DB_READY_TIMEOUT) {
        await new Promise((r) => setTimeout(r, DB_POLL_MS));
        try { dbReady = await isCentralDbReady(); } catch { /* not ready yet */ }
      }
      if (!dbReady) console.warn("Central DB readiness timeout — proceeding anyway");

      // ── Step 3: Load license + org + profiles + apps + invites ─────────────────────────
      bootStep.value = "Loading data...";
      let bootErr = "";
      const [lic, fetchedOrg, fetchedProfiles, fetchedOrganizations, fetchedInvites] = await Promise.all([
        getLicenseStatus().catch((e) => { bootErr += `LicErr:${e} `; return null; }),
        getOrganization().catch((e) => { bootErr += `OrgErr:${e} `; return null; }),
        getProjects().catch((e) => { bootErr += `ProjErr:${e} `; return [] as Profile[]; }),
        getUserOrganizations().catch((e) => { bootErr += `UserOrgErr:${e} `; return [] as Organization[]; }),
        import("@tauri-apps/api/core").then(m => m.invoke("get_my_pending_invites")).catch((e) => { bootErr += `InvErr:${e} `; return [] as any[]; }),
      ]) as [LicenseStatus | null, Organization | null, Profile[], Organization[], any[]];

      if (bootErr) {
        console.warn("[boot] Non-fatal boot warnings:", bootErr);
      }

      // Save invites to a new signal
      pendingInvites.value = fetchedInvites;

      let activeOrg = fetchedOrg;
      let finalProfiles = fetchedProfiles;

      // If org not in Rust state yet but user has orgs, auto-switch to first one
      if (!activeOrg && fetchedOrganizations.length > 0) {
        bootStep.value = "Switching organization...";
        activeOrg = fetchedOrganizations[0];
        try {
          const { switchOrganization, getProjects: refetchProjects } = await import("~/lib/ipc");
          await switchOrganization(activeOrg.id);
          finalProfiles = await refetchProjects().catch(() => [] as Profile[]);
        } catch (e) {
          console.error("Auto-switch org failed:", e);
        }
      }

      // If still no profiles AND we have an active session, retry once after 400ms.
      // Mobile can have a slight delay between DB connect completing and queries succeeding.
      if (finalProfiles.length === 0 && session) {
        console.warn("[boot] No profiles on first attempt — retrying in 400ms...");
        await new Promise((r) => setTimeout(r, 400));
        try {
          const { getProjects: refetchProjects, getUserOrganizations: refetchOrgs } = await import("~/lib/ipc");
          const [retryProfiles, retryOrgs] = await Promise.all([
            refetchProjects().catch(() => [] as Profile[]),
            refetchOrgs().catch(() => [] as Organization[]),
          ]);
          if (retryProfiles.length > 0) {
            finalProfiles = retryProfiles;
            console.log("[boot] Retry succeeded, got profiles:", retryProfiles.length);
          }
          if (retryOrgs.length > 0 && !activeOrg) {
            activeOrg = retryOrgs[0];
            fetchedOrganizations.push(...retryOrgs);
          }
        } catch (e) {
          console.error("[boot] Retry failed:", e);
        }
      }

      // ── Step 4: Resolve active profile ───────────────────────────────────────
      // Priority:
      //   1. ?switch=profileId or ?profile=profileId — explicit window / sidebar navigation
      //   2. sessionStorage (bk-window-profile) — strictly isolated per window on reload
      //   3. Rust in-memory state  — survives webview reloads if single window
      //   4. localStorage (bk-active-profile) — global fallback on fresh app launch
      //   5. First profile  — fallback on first ever launch
      const searchParams = new URLSearchParams(window.location.search);
      const switchParam = searchParams.get("switch") || searchParams.get("profile");
      const windowStoredId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("bk-window-profile") : null;
      const requestedId = switchParam || windowStoredId || null;

      // Check Rust state (survives webview reload)
      let rustActiveId: string | null = null;
      try { rustActiveId = await getActiveProfileId(); } catch {}

      // localStorage fallback (survives app restart)
      const storedId = localStorage.getItem("bk-active-profile");

      const resolvedId =
        (requestedId && finalProfiles.find(p => p.id === requestedId) ? requestedId : null) ??
        (rustActiveId && finalProfiles.find(p => p.id === rustActiveId) ? rustActiveId : null) ??
        (storedId   && finalProfiles.find(p => p.id === storedId)   ? storedId   : null) ??
        finalProfiles[0]?.id ?? null;

      // Persist choice so window reload retains its own profile & app restart remembers
      if (resolvedId) {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("bk-window-profile", resolvedId);
        localStorage.setItem("bk-active-profile", resolvedId);
      } else {
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("bk-window-profile");
        localStorage.removeItem("bk-active-profile");
      }

      license.value = lic;
      org.value = activeOrg;
      profiles.value = finalProfiles;
      organizations.value = fetchedOrganizations.length > 0
        ? fetchedOrganizations
        : activeOrg ? [activeOrg] : [];
      activeProfileId.value = resolvedId;

      // Sync Rust state to the resolved profile and fetch apps
      if (resolvedId) {
        bootStep.value = "Connecting to profile...";
        try {
          await Promise.race([
            switchProject(resolvedId),
            new Promise((_, reject) => setTimeout(() => reject(new Error("switchProject timeout")), 6000)),
          ]);
          console.log("[boot] switchProject OK for:", resolvedId);
          // If requestedId was from an invited/team org outside initial finalProfiles, refresh org, profiles & license
          if (requestedId && !finalProfiles.some(p => p.id === requestedId)) {
            const [syncedOrg, syncedProfiles, syncedLic] = await Promise.all([
              getOrganization().catch(() => null),
              getProjects().catch(() => [] as Profile[]),
              getLicenseStatus().catch(() => null),
            ]);
            if (syncedOrg) org.value = syncedOrg;
            if (syncedProfiles.length > 0) {
              finalProfiles = syncedProfiles;
              profiles.value = syncedProfiles;
            }
            if (syncedLic) license.value = syncedLic;
          }
        } catch (e) {
          console.warn("[boot] switchProject notice:", e);
        }

        // Fetch installed apps
        bootStep.value = "Fetching apps...";
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const [apps, s] = await Promise.race([
            Promise.all([
              invoke<string[]>("get_installed_apps").catch(() => []),
              invoke<any>("get_settings").catch(() => null),
            ]),
            new Promise<any>((resolve) => setTimeout(() => resolve([[], null]), 4000)),
          ]);
          installedApps.value = apps || [];
          if (s?.currency) {
            const { setGlobalCurrency } = await import("~/lib/fin-format");
            setGlobalCurrency(s.currency);
          }
        } catch (e) {
          console.error("[boot] get_installed_apps FAILED:", e);
          installedApps.value = [];
        }

        // Log full Rust state so we can diagnose which guard is None
        try {
          const debug = await Promise.race([
            (window as any).__TAURI__?.core?.invoke?.("get_app_debug") ??
              import("@tauri-apps/api/core").then(m => m.invoke("get_app_debug")),
            new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 2000)),
          ]);
          console.log("[boot] Rust state:", debug);
        } catch (e) { /* web mode — ignore */ }
      }

      // Check if active profile's UserDB needs provisioning or configuration.
      // Uses lightweight get_provision_status (Central DB only — no UserDB queries).
      if (resolvedId && !isPublic) {
        bootStep.value = "Checking database status...";
        const statusPath = "/dashboard/settings/status";
        const credsPath = "/dashboard/settings/credentials";
        const onboardingPath = "/onboarding";
        if (path !== statusPath && path !== credsPath && path !== onboardingPath) {
          try {
            const ps = await Promise.race([
              getProvisionStatus(),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error("getProvisionStatus timeout")), 4000)),
            ]);
            if (ps.has_userdb === false) {
              localStorage.removeItem(`bk-provisioned-${resolvedId}`);
              nav(onboardingPath);
              return;
            }
            if (!ps.last_provisioned_at) {
              localStorage.removeItem(`bk-provisioned-${resolvedId}`);
              nav(statusPath);
              return;
            }
            localStorage.setItem(`bk-provisioned-${resolvedId}`, String(ps.last_provisioned_at));
          } catch (e) {
            console.warn("[boot] getProvisionStatus check:", e);
          }
        }
      }

      // Clean ?switch= from URL so refreshes don't re-fire the switch
      if (requestedId) {
        window.history.replaceState({}, "", window.location.pathname);
      }

        // Only redirect to /onboarding when no profiles exist.
        // If profiles loaded, the user has data — don't send them to onboarding.
        if (finalProfiles.length === 0 && (!isPublic || isAuthTriggered)) {
          if (session) {
            try {
              const { getProjects: refetchProjects } = await import("~/lib/ipc");
              const freshProjects = await refetchProjects();
              if (freshProjects.length > 0) {
                finalProfiles = freshProjects;
                profiles.value = freshProjects;
                if (!activeProfileId.value) {
                  activeProfileId.value = freshProjects[0].id;
                }
              }
            } catch (e) {
              console.error("[boot] Profile refetch failed:", e);
            }
          }

          if (finalProfiles.length === 0) {
            nav("/onboarding", { replaceState: true });
            return;
          }
        }

        // ── Step 5: Route ────────────────────────────────────────────────────────
        if ((!isPublic && (path === "/" || path === "")) || isAuthTriggered) {
          nav("/dashboard", { replaceState: true });
        }
      } catch (e) {
        console.error("Boot error:", e);
        if (!isPublic) nav("/login", { replaceState: true });
      } finally {
        loading.value = false;
      }
    };

    // Listen for auth state change from Rust (e.g. after login completes)
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("auth-changed", async () => {
        loading.value = true;
        await runBoot(true);
      }).then((u) => {
        unlistenAuth = u;
      });
    });

    await runBoot(false);

    cleanup(() => {
      if (unlistenAuth) unlistenAuth();
    });
  });


  const path     = loc.url.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => path.startsWith(r));

  // Public routes — no shell
  if (isPublic) return <Slot />;

  // Loading boot state
  if (loading.value) {
    return (
      <div style="position:fixed;inset:0;width:100vw;width:100%;height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;background:var(--surface-1);z-index:99999;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
          <div class="spinner" style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite" />
          <span class="text-sm text-secondary" style="font-weight:500;">Starting BusinessKit…</span>
          <span class="text-xs text-secondary" style="opacity: 0.6;">{bootStep.value}</span>
        </div>
      </div>
    );
  }

  const pageTitle = (() => {
    const p = loc.url.pathname;
    if (p.includes("/dashboard/c/analytics")) {
      return "Clicks Analytics";
    }
    if (p.startsWith("/dashboard/c/")) {
      return loc.params?.category
        ? (loc.params.category.charAt(0).toUpperCase() + loc.params.category.slice(1))
        : "Links";
    }
    if (p.startsWith("/dashboard/content/")) {
      return loc.params?.["cms-slug"]
        ? (loc.params["cms-slug"].charAt(0).toUpperCase() + loc.params["cms-slug"].slice(1))
        : "Content";
    }
    return routeLabel(p);
  })();

  const isCatPage = loc.url.pathname.startsWith("/dashboard/c/");
  const isAnalyticsPage = loc.url.pathname.includes("/analytics");
  const catWidth = isCatPage && !isAnalyticsPage
    ? (catSidebarCollapsed.value ? "var(--sidebar-collapsed-width, 3.6rem)" : "14rem")
    : "0px";

  const sidebarWidthVal =
    sidebarMode.value === "hidden"
      ? "0px"
      : sidebarMode.value === "collapsed"
      ? "var(--sidebar-collapsed-width, 3.6rem)"
      : "14rem";

  const agentPanelWidthVal = agentChatOpen.value ? `${agentChatWidth.value}px` : "0px";

  return (
    <div
      class={["app-layout", agentChatOpen.value ? "agent-open" : ""]}
      style={`--sidebar-width: ${sidebarWidthVal}; --agent-panel-width: ${agentPanelWidthVal};`}
    >
      <TitleBar title={pageTitle} />
      <AppSidebar />
      <div
        class={["app-main", agentChatOpen.value ? "agent-open" : ""]}
        style={`padding-left: ${catWidth}; margin-right: ${agentPanelWidthVal}; transition: padding-left 0.2s ease, margin-left 0.2s ease, margin-right 0.2s ease;`}
      >
        <AppTopbar title={pageTitle} />
        <main class="app-content">
          <Slot />
        </main>
      </div>
      <AgentChatSidebar />
      <SqlRunnerSidebar />
      <SeoSettingsModal
        open={catSeoOpen}
        profileTitle={catProfTitle.value}
        initialValues={catSeoSettings}
        saving={catSeoSaving}
        onSave$={async (data) => { if (catOnSeoSave.value) await catOnSeoSave.value(data); }}
      />
      
      {pendingInvites.value.length > 0 && (
        <PendingInvitesModal
          invites={pendingInvites.value}
          onComplete$={$(() => {
            // Remove the completed invite locally
            pendingInvites.value = [];
            // Refresh route cleanly via Qwik SPA navigation
            nav(loc.url.pathname);
          })}
        />
      )}
    </div>
  );
});
