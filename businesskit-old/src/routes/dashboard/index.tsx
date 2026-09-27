/* eslint-disable @typescript-eslint/no-unused-vars */
// src/routes/dashboard/index.tsx
//
// WHAT:  Dashboard home — org overview, quick stats, deploy status, 4-column bottom cards.
// HOW:   Reads from AppContext (org, profiles, license, installedApps).
//        Fetches analytics + deployment status + settings + tax config via invoke() in useVisibleTask$.
//
// FLOW:
//   Mounts → reads ctx.org + ctx.license → shows org card
//           → invoke(get_profile_analytics) → stats grid
//           → apps grid (8 cards)
//           → bottom 4-column grid:
//               A. Business Details (settings + profile + fin_tax_configs, with digest fallback & tax app check)
//               B. BusinessKit Support (Email, WhatsApp, Telegram, Docs)
//               C. Important Links (Settings, Profile, Tax if installed, Deploy, Status)
//               D. Workspace & Invites (Team management, Public store URL + Copy)

import { component$, useSignal, useComputed$, useVisibleTask$, $, type QRL } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuLink,
  LuShoppingBag,
  LuUsers,
  LuMail,
  LuRocket,
  LuTrendingUp,
  LuArrowRight,
  LuCheck,
  LuAlertCircle,
  LuBuilding,
  LuReceipt,
  LuMapPin,
  LuPhone,
  LuGlobe,
  LuShieldCheck,
  LuSettings,
  LuMessageSquare,
  LuSend,
  LuExternalLink,
  LuCopy,
  LuHome,
  LuLayoutGrid,
  LuBot,
} from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { getProfileAnalytics, checkForUpdates } from "~/lib/ipc";
import type { ProfileAnalytics } from "~/lib/types";
import { AppsDashboardCard } from "~/components/AppsDashboardCard";
import { MobileAppDock } from "~/components/MobileAppDock";
import { NoProfileModal } from "~/components/NoProfileModal";

interface SettingsData {
  id?: string;
  profile_id?: string;
  site_title?: string | null;
  tagline?: string | null;
  site_description?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  timezone?: string | null;
  location?: string | null;
  country?: string | null;
  currency?: string | null;
  supported_currencies?: string | null;
  industry?: string | null;
  language?: string | null;
  theme?: string;
  updated_at?: number;
}

interface TaxConfigData {
  id?: string;
  profile_id?: string;
  regime?: string;
  country?: string;
  currency?: string;
  gstin?: string | null;
  legal_name?: string | null;
  dl_no?: string | null;
  address?: string | null;
  invoice_terms?: string | null;
  phone?: string | null;
  state_code?: string | null;
  default_bill_design?: string | null;
  header_top_text?: string | null;
  invoice_title_text?: string | null;
  digital_sign_url?: string | null;
  signatory_name?: string | null;
  jurisdiction_city?: string | null;
  auto_print_enabled?: number;
  pos_printer_type?: string | null;
  pos_printer_ip?: string | null;
  lut_number?: string | null;
  lut_valid_until?: number | null;
  einvoice_enabled?: number;
  eway_enabled?: number;
  tax_mode?: string;
  global_tax_rate?: number | null;
  global_tax_rate_id?: string | null;
  tax_inclusive?: number;
  watermark?: number;
  created_at?: number;
  updated_at?: number;
}

interface DashboardSessionCacheEntry {
  analytics: ProfileAnalytics | null;
  updateInfo: { current: string; latest: string; update_available: boolean } | null;
  settings: SettingsData | null;
  taxConfig: TaxConfigData | null;
  installedAppsList: string[];
}

const dashboardSessionCache = new Map<string, DashboardSessionCacheEntry>();

export default component$(() => {
  const ctx = useAppContext();

  // UpdateInfo type inline (matches ipc.ts return type)
  type UpdateInfo = { current: string; latest: string; update_available: boolean };

  const nav = useNavigate();
  const installingApp = useSignal<string | null>(null);

  const makeInstallHandler = (appId: string, href: string): QRL<() => void> =>
    $(async () => {
      if (installingApp.value) return;
      installingApp.value = appId;
      try {
        const updated = await invoke<string[]>("install_app", { appId });
        ctx.installedApps.value = updated;
        installedAppsList.value = updated;
        nav(href);
      } catch (e) {
        console.error("[dashboard] install_app failed:", e);
      } finally {
        installingApp.value = null;
      }
    });

  const analytics = useSignal<ProfileAnalytics | null>(null);
  const updateInfo = useSignal<UpdateInfo | null>(null);
  const settings = useSignal<SettingsData | null>(null);
  const taxConfig = useSignal<TaxConfigData | null>(null);
  const installedAppsList = useSignal<string[]>([]);
  const statsLoading = useSignal(true);
  const deployLoading = useSignal(true);
  const businessLoading = useSignal(true);
  const copiedUrl = useSignal(false);
  const noProfileDismissed = useSignal(false);
  const showNoProfileModal = useComputed$(() => {
    return !ctx.loading.value && ctx.profiles.value.length === 0 && !noProfileDismissed.value;
  });

  // In-Memory Session Cache (Profile Scoped) — 0ms instant render on revisit with background revalidation
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const profileId = track(() => ctx.activeProfileId.value);

    if (!profileId) return; // wait for layout boot to set profile

    // 1. Instant Cache Hydration
    if (dashboardSessionCache.has(profileId)) {
      const cached = dashboardSessionCache.get(profileId)!;
      analytics.value = cached.analytics;
      updateInfo.value = cached.updateInfo;
      settings.value = cached.settings;
      taxConfig.value = cached.taxConfig;
      installedAppsList.value = cached.installedAppsList;
      statsLoading.value = false;
      deployLoading.value = false;
      businessLoading.value = false;
    } else {
      statsLoading.value = true;
      deployLoading.value = true;
      businessLoading.value = true;
    }

    // 2. Background Revalidation (Stale-While-Revalidate)
    const [fetchedAnalytics, fetchedUpdate, fetchedSettings, fetchedTaxConfig, fetchedApps] = await Promise.all([
      getProfileAnalytics().catch(() => null),
      checkForUpdates().catch(() => null),
      invoke<SettingsData>("get_settings").catch(() => null),
      invoke<TaxConfigData>("fin_get_tax_config").catch(() => null),
      invoke<string[]>("get_installed_apps").catch(() => []),
    ]);

    if (fetchedAnalytics) analytics.value = fetchedAnalytics;
    if (fetchedUpdate) updateInfo.value = fetchedUpdate;
    if (fetchedSettings) settings.value = fetchedSettings;
    if (fetchedTaxConfig) taxConfig.value = fetchedTaxConfig;
    installedAppsList.value = Array.isArray(fetchedApps) ? fetchedApps : [];

    dashboardSessionCache.set(profileId, {
      analytics: analytics.value,
      updateInfo: updateInfo.value,
      settings: settings.value,
      taxConfig: taxConfig.value,
      installedAppsList: installedAppsList.value,
    });

    statsLoading.value = false;
    deployLoading.value = false;
    businessLoading.value = false;
  });

  const org = ctx.org.value;
  const license = ctx.license.value;
  const profile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
  // Profile uses 'title' field (matches DB column name)
  const profileTitle = profile?.title ?? "";
  const profileSlug = profile?.slug ?? "";
  const stats = analytics.value;

  const planColor = license?.plan === "business"
    ? "var(--accent)"
    : license?.plan === "pro"
      ? "var(--success)"
      : "var(--text-muted)";

  // Check if Tax app is installed (from profile_apps table / context)
  const isTaxInstalled = Boolean(
    installedAppsList.value.includes("tax") || ctx.installedApps.value?.includes("tax")
  );

  // Business Details / Digest calculation
  const hasTaxConfig = Boolean(
    taxConfig.value && (taxConfig.value.regime || taxConfig.value.gstin || taxConfig.value.legal_name)
  );
  const legalOrBusinessName =
    taxConfig.value?.legal_name || settings.value?.site_title || profileTitle || org?.name || "Business Entity";
  const taglineOrDesc =
    settings.value?.tagline || settings.value?.industry || profile?.bio || "Commerce & Services";
  const country = taxConfig.value?.country || settings.value?.country || "IN";
  const currency = taxConfig.value?.currency || settings.value?.currency || "INR";
  const location =
    taxConfig.value?.address ||
    (taxConfig.value?.jurisdiction_city
      ? `${taxConfig.value.jurisdiction_city}${taxConfig.value.state_code ? ` (${taxConfig.value.state_code})` : ""}`
      : settings.value?.location) ||
    "Location not configured";
  const taxId =
    taxConfig.value?.gstin ||
    taxConfig.value?.dl_no ||
    (hasTaxConfig && taxConfig.value?.regime ? `Regime: ${taxConfig.value.regime}` : null);
  const phone = taxConfig.value?.phone || null;
  const billDesign = taxConfig.value?.default_bill_design || "dotmatrix";
  const taxMode = taxConfig.value?.tax_mode || "item";

  // Dynamic TLD from userDB settings.country: if "IN" use .in, otherwise .io
  const userCountry = (settings.value?.country ?? "IN").trim().toUpperCase();
  const domainSuffix = userCountry === "IN" ? "businesskit.in" : "businesskit.io";
  const supportEmail = `support@${domainSuffix}`;
  const docsUrl = `https://${domainSuffix}/docs`;

  // Subdomain URL format: https://{profileSlug}.businesskit.in or .io
  const displayDomain = profileSlug ? `${profileSlug}.${domainSuffix}` : domainSuffix;
  const publicUrl = profileSlug ? `https://${profileSlug}.${domainSuffix}` : `https://${domainSuffix}`;

  const handleCopyUrl = $(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      copiedUrl.value = true;
      setTimeout(() => {
        copiedUrl.value = false;
      }, 2000);
    } catch { /* noop */ }
  });

  return (
    <div class="dashboard-root">

      {/* Welcome card */}
      <div class="welcome-card-wrap">
        <div class="card welcome-card">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <h1 style="font-size:1.25rem;font-weight:700;color:var(--text-primary);letter-spacing:-0.02em">
                {org?.name ?? "Your Workspace"}
              </h1>
              <span class="badge badge-accent" style={`background:${planColor}1a;color:${planColor}`}>
                {license?.plan ?? "starter"}
              </span>
            </div>
            {profile && (
              <p class="text-sm text-secondary">
                <strong style="color:var(--text-primary)">{profileTitle}</strong>
                <span style="margin-left:8px;color:var(--text-muted)">— {displayDomain}</span>
              </p>
            )}
          </div>

          <div class="welcome-card-buttons">
            <Link href="/dashboard/deploy" class="btn btn-primary">
              <LuRocket style="width:14px;height:14px" />
              Deploy
            </Link>
            <Link href="/dashboard/settings/profile" class="btn btn-secondary">
              Edit profile
            </Link>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div class="stats-grid-wrap">
        {statsLoading.value ? (
          <div class="stats-grid">
            {[0, 1, 2, 3].map(i => (
              <div key={i} class="stat-card">
                <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px" />
                <div class="skeleton" style="height:32px;width:60px" />
              </div>
            ))}
          </div>
        ) : (
          <div class="stats-grid">
            <StatCard
              icon={LuTrendingUp}
              label="Total visits"
              value={fmt(stats?.total_visits)}
              color="var(--accent)"
            />
            <StatCard
              icon={LuLink}
              label="Link clicks"
              value={fmt(stats?.total_link_clicks)}
              color="var(--success)"
            />
            <StatCard
              icon={LuShoppingBag}
              label="Revenue"
              value={fmtCents(stats?.total_revenue)}
              color="var(--warning)"
            />
            <StatCard
              icon={LuUsers}
              label="Unique visitors"
              value={fmt(stats?.unique_visits)}
              color="var(--accent)"
            />
          </div>
        )}
      </div>

      {/* Apps Grid — 8 cards: installed installable apps first, filled by default/free SaaS apps */}
      {(() => {
        const activeInstalledList = ctx.installedApps.value || installedAppsList.value || [];
        const activeProfile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
        const profileAllocatedPlan = (activeProfile?.allocated_plan || "").trim().toUpperCase();
        const licStatus = (ctx.license.value?.status || "").toLowerCase();
        const isLicActive = licStatus === "active" || licStatus === "grace" || licStatus === "trial";
        const globalPlan = (ctx.license.value?.plan || "").trim().toUpperCase();

        const isPro = profileAllocatedPlan !== ""
          ? (profileAllocatedPlan !== "FREE" && isLicActive)
          : (isLicActive && globalPlan !== "" && globalPlan !== "FREE");
        const showUpgrade = !isPro;

        // Map of installable apps definitions
        const installableAppsMap: Record<string, {
          id: string; name: string; description: string; tagline: string;
          iconId: any; href: string; color: string; isInstallable: true;
        }> = {
          shop: { id: "shop", name: "Shop", description: "POS, billing, products & inventory", tagline: "Sell anything. Print bills. Track stock.", iconId: "shop", href: "/dashboard/shop", color: "#F97316", isInstallable: true },
          tax: { id: "tax", name: "Tax", description: "GST/VAT, e-invoices, TDS & returns", tagline: "Indian GST, e-invoice & TDS filing.", iconId: "tax", href: "/dashboard/tax", color: "#14B8A6", isInstallable: true },
          accounts: { id: "accounts", name: "Accounts", description: "Double-entry books, bank & expenses", tagline: "P&L, bank reconciliation & journals.", iconId: "accounts", href: "/dashboard/accounts", color: "#6366F1", isInstallable: true },
          payroll: { id: "payroll", name: "Payroll", description: "Employees, attendance & payslips", tagline: "Monthly payroll runs & payslip PDFs.", iconId: "payroll", href: "/dashboard/payroll", color: "#EC4899", isInstallable: true },
          chat: { id: "chat-agent", name: "Chat Agent", description: "AI live chat & voice call support", tagline: "AI customer support & call logs.", iconId: "chat-agent", href: "/dashboard/chat", color: "#06B6D4", isInstallable: true },
          "chat-agent": { id: "chat-agent", name: "Chat Agent", description: "AI live chat & voice call support", tagline: "AI customer support & call logs.", iconId: "chat-agent", href: "/dashboard/chat", color: "#06B6D4", isInstallable: true },
          agents: { id: "agents", name: "Agents", description: "Custom AI agents & automations", tagline: "Build custom autonomous AI agents.", iconId: "agents", href: "/dashboard/agents", color: "#06B6D4", isInstallable: true },
          social: { id: "social", name: "Social", description: "Manage all your social media", tagline: "Post, schedule & analyze social.", iconId: "social", href: "/dashboard/social", color: "#8B5CF6", isInstallable: true },
          community: { id: "community", name: "Community", description: "Build a community around your brand", tagline: "Host discussions, events & members.", iconId: "community", href: "/dashboard/community", color: "#EC4899", isInstallable: true },
          gsc: { id: "gsc", name: "GSC", description: "Google Search Console analytics", tagline: "Track SEO performance.", iconId: "website", href: "/dashboard/gsc", color: "#10B981", isInstallable: true },
          feedback: { id: "feedback", name: "Feedback", description: "Collect user feedback & votes", tagline: "Feature requests & bug reports.", iconId: "form", href: "/dashboard/feedback", color: "#F59E0B", isInstallable: true },
          review: { id: "review", name: "Reviews", description: "Collect and showcase reviews", tagline: "Gather customer reviews.", iconId: "testimonials", href: "/dashboard/testimonials", color: "#F43F5E", isInstallable: true },
          affiliate: { id: "affiliate", name: "Affiliate", description: "Manage affiliate programs", tagline: "Track referrals & payouts.", iconId: "link-in-bio", href: "/dashboard/affiliate", color: "#A855F7", isInstallable: true },
          forms: { id: "forms", name: "Form", description: "Create beautiful forms and surveys", tagline: "Build forms & surveys.", iconId: "form", href: "/dashboard/forms", color: "#F97316", isInstallable: true },
          jobs: { id: "jobs", name: "Jobs", description: "Post job listings and hire talent", tagline: "Manage job postings.", iconId: "jobs", href: "/dashboard/jobs", color: "#8B5CF6", isInstallable: true },
          links: { id: "links", name: "Link in Bio", description: "Your personal landing page", tagline: "Manage your links", iconId: "link-in-bio", href: "/dashboard/c/links/", color: "#3B82F6", isInstallable: true },
          store: { id: "store", name: "Store (Digital)", description: "Sell digital products, courses & services", tagline: "Sell downloads, courses & events.", iconId: "digital-download", href: "/dashboard/store", color: "#F59E0B", isInstallable: true },
        };

        // Free / Default always-open SaaS apps list
        const defaultSaasApps: Array<{
          id: string; name: string; description: string; tagline: string;
          iconId: any; href: string; color: string; isInstallable: false;
        }> = [
            { id: "website", name: "Website", description: "Publish your website in minutes", tagline: "Edit your site", iconId: "website", href: "/dashboard/pages/", color: "#0EA5E9", isInstallable: false },
            { id: "crm", name: "CRM", description: "Manage your customers and deals", tagline: "Manage Your Leads", iconId: "crm", href: "/dashboard/crm/", color: "#14B8A6", isInstallable: false },
            { id: "agents", name: "Agents", description: "Custom AI agents & automations", tagline: "Autonomous AI agents", iconId: "agents", href: "/dashboard/agents", color: "#06B6D4", isInstallable: false },
            { id: "blog", name: "Blog", description: "Write posts and grow your audience", tagline: "Write a post", iconId: "blog", href: "/dashboard/content/blog/", color: "#22C55E", isInstallable: false },
            { id: "newsletter", name: "Newsletter", description: "Send updates to subscribers", tagline: "Open workspace", iconId: "newsletter", href: "/dashboard/content/n/", color: "#F43F5E", isInstallable: false },
            { id: "notes", name: "Notes", description: "Write and organize personal notes", tagline: "Open workspace", iconId: "notes", href: "/dashboard/content/notes/", color: "#EAB308", isInstallable: false },
            { id: "docs", name: "Docs", description: "Build public documentation", tagline: "Open workspace", iconId: "docs", href: "/dashboard/content/docs/", color: "#6366F1", isInstallable: false },
            { id: "directory", name: "Directory", description: "Build a directory with listings", tagline: "Open directory", iconId: "directory", href: "/dashboard/content/", color: "#A855F7", isInstallable: false },
          ];

        // 1. Top priority: Agents app card (free & default, always 1st slot)
        const agentsCard = {
          id: "agents",
          name: "Agents",
          description: "Custom AI agents & automations",
          tagline: "Autonomous AI agents",
          iconId: "agents" as const,
          href: "/dashboard/agents",
          color: "#06B6D4",
          isInstallable: false as const,
        };

        // 2. Installed installable cards (excluding agents to prevent duplication)
        const installedCards = activeInstalledList
          .filter(appId => appId !== "agents")
          .map(appId => installableAppsMap[appId])
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        // 3. Free / Default SaaS apps to fill remaining slots (excluding agents and installed)
        const seenHrefs = new Set<string>([agentsCard.href, ...installedCards.map(c => c.href)]);
        const fillCards = defaultSaasApps.filter(app => !seenHrefs.has(app.href));

        // Priority order: Agents first -> installed apps -> free / other apps
        const displayCards = [agentsCard, ...installedCards, ...fillCards].slice(0, 8);

        return (
          <div class="dash-apps-wrap" style="width: 100%; margin-bottom: 0;">
            <div class="dash-apps-slider" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; width: 100%;">
              {displayCards.map(app => {
                if (app.isInstallable) {
                  const isInstalled =
                    (app.id === "store"
                      ? (activeInstalledList.includes("store") || activeInstalledList.includes("store-digital") || activeInstalledList.includes("store_digital"))
                      : (app.id === "links" || app.id === "link-in-bio")
                        ? (activeInstalledList.includes("links") || activeInstalledList.includes("link-in-bio") || activeInstalledList.includes("link_in_bio"))
                        : activeInstalledList.includes(app.id)) ||
                    (app.id === "chat-agent" && activeInstalledList.includes("chat"));
                  const isFreeApp = app.id === "store" || app.id === "links" || app.id === "link-in-bio";
                  const cardUpgradeRequired = !isInstalled && showUpgrade && !isFreeApp;
                  const isInstalling = installingApp.value === app.id;
                  return (
                    <AppsDashboardCard
                      key={app.id}
                      href={cardUpgradeRequired ? "/dashboard/settings?tab=plan" : app.href}
                      backgroundImageUrl=""
                      label={cardUpgradeRequired ? "PREMIUM" : (isInstalled ? "INSTALLED" : "INSTALL")}
                      title={app.name}
                      subtitle={app.description}
                      appName={app.name}
                      appDescription={cardUpgradeRequired ? "Upgrade required" : (isInstalled ? (app.tagline ?? "Tap to open") : (app.tagline ?? "Install app"))}
                      footerColor={app.color}
                      iconId={app.iconId}
                      ctaLabel={cardUpgradeRequired ? "Upgrade" : (isInstalled ? "Open" : "Install")}
                      installable={!cardUpgradeRequired && !isInstalled}
                      isInstalled={isInstalled && !cardUpgradeRequired}
                      installing={isInstalling}
                      upgradeRequired={cardUpgradeRequired}
                      onInstall$={cardUpgradeRequired ? $(() => { nav("/dashboard/settings?tab=plan"); }) : makeInstallHandler(app.id, app.href)}
                      layout="list"
                    />
                  );
                }

                return (
                  <AppsDashboardCard
                    key={app.id}
                    href={app.href}
                    backgroundImageUrl=""
                    label="OPEN"
                    title={app.name}
                    subtitle={app.description}
                    appName={app.name}
                    appDescription={app.tagline}
                    footerColor={app.color}
                    iconId={app.iconId}
                    ctaLabel="Open"
                    layout="list"
                  />
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Bottom 4-column Grid */}
      <div class="bottom-grid-wrap" style="width: 100%; margin-top: var(--space-lg); margin-bottom: 0;">
        <div class="bottom-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; width: 100%;">

          {/* Card A: Business Details */}
          <div class="dash-bottom-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); min-height: 280px; height: 100%; box-sizing: border-box;">
            <div class="card-header-row" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
              <div class="card-icon-wrap" style="width: 34px; height: 34px; border-radius: var(--radius-sm); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--border); color: var(--text-secondary);">
                <LuBuilding style="width:17px;height:17px" />
              </div>
              <div style="flex:1;min-width:0">
                <h2 class="card-title-text" style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; margin: 0;">Business Details</h2>
                <p class="text-xs text-muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {isTaxInstalled && hasTaxConfig
                    ? "Tax & Compliance Profile"
                    : isTaxInstalled
                      ? "Tax Configuration Pending"
                      : "Profile & Settings Summary"}
                </p>
              </div>
            </div>

            {businessLoading.value ? (
              <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px">
                <div class="skeleton" style="height:18px;width:70%" />
                <div class="skeleton" style="height:12px;width:90%" />
                <div class="skeleton" style="height:12px;width:50%" />
              </div>
            ) : (
              <div class="card-body-content" style="display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between;">
                {/* Business Identity */}
                <div>
                  <div class="font-semibold text-sm" style="color:var(--text-primary);line-height:1.3;word-break:break-word">
                    {legalOrBusinessName}
                  </div>
                  {taglineOrDesc && (
                    <div class="text-xs text-secondary" style="margin-top:2px;line-height:1.3">
                      {taglineOrDesc}
                    </div>
                  )}
                </div>

                {/* Details List */}
                <div class="info-list" style="display: flex; flex-direction: column; gap: 7px;">
                  {/* Tax ID or Status */}
                  <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                    <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">
                      {isTaxInstalled && hasTaxConfig ? (taxConfig.value?.regime === "GST" ? "GSTIN" : "Tax ID") : "Compliance"}
                    </span>
                    <span class="info-val-primary font-mono" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {isTaxInstalled ? (
                        taxId ? (
                          taxId
                        ) : (
                          <span style="color:var(--warning);font-family:var(--font-family);font-size:0.75rem">Setup Pending</span>
                        )
                      ) : (
                        <span style="color:var(--text-secondary);font-family:var(--font-family);font-size:0.75rem">Standard Profile</span>
                      )}
                    </span>
                  </div>

                  {/* Country & Currency */}
                  <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                    <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Region / Cur</span>
                    <span class="info-val-primary" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {country} • {currency}
                    </span>
                  </div>

                  {/* Location / Address */}
                  <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                    <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Location</span>
                    <span class="info-val-primary text-truncate-val" title={location} style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;">
                      {location}
                    </span>
                  </div>

                  {/* Billing / Web Store */}
                  {isTaxInstalled && hasTaxConfig ? (
                    <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                      <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Billing</span>
                      <span class="info-val-primary" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform:capitalize">
                        {billDesign} • {taxMode === "global" ? "Flat" : "Itemized"}
                      </span>
                    </div>
                  ) : (
                    <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                      <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Web Store</span>
                      <span class="info-val-primary font-mono text-truncate-val" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; font-size:0.7rem">
                        {displayDomain}
                      </span>
                    </div>
                  )}

                  {isTaxInstalled && phone && (
                    <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                      <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Contact</span>
                      <span class="info-val-primary" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{phone}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action — only show Tax link if Tax app is installed */}
                <div class="card-footer-action" style="margin-top: auto; padding-top: 10px;">
                  {isTaxInstalled ? (
                    <Link
                      href="/dashboard/tax/settings"
                      class="bottom-card-btn"
                    >
                      <div class="bottom-btn-left">
                        <LuReceipt style="width:14px;height:14px;flex-shrink:0" />
                        <span>{hasTaxConfig ? "Manage Tax & Billing" : "Configure Tax Regime"}</span>
                      </div>
                      <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                    </Link>
                  ) : (
                    <Link
                      href="/dashboard/settings/profile"
                      class="bottom-card-btn"
                    >
                      <div class="bottom-btn-left">
                        <LuBuilding style="width:14px;height:14px;flex-shrink:0" />
                        <span>Edit Profile Details</span>
                      </div>
                      <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Card B: BusinessKit Support */}
          <div class="dash-bottom-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); min-height: 280px; height: 100%; box-sizing: border-box;">
            <div class="card-header-row" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
              <div class="card-icon-wrap" style="width: 34px; height: 34px; border-radius: var(--radius-sm); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--border); color: var(--text-secondary);">
                <LuMessageSquare style="width:17px;height:17px" />
              </div>
              <div style="flex:1;min-width:0">
                <h2 class="card-title-text" style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; margin: 0;">BusinessKit Support</h2>
                <p class="text-xs text-muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  Help desk & developer channels
                </p>
              </div>
            </div>

            <div class="card-body-content" style="display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between;">
              <div class="info-list" style="display: flex; flex-direction: column; gap: 7px;">
                {/* Email */}
                <a
                  href={`mailto:${supportEmail}`}
                  class="support-channel-item"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div class="channel-left">
                    <LuMail style="width:14px;height:14px;flex-shrink:0" />
                    <div class="channel-text">
                      <div class="channel-title">Email Support</div>
                      <div class="channel-subtitle">{supportEmail}</div>
                    </div>
                  </div>
                  <LuArrowRight class="channel-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </a>

                {/* WhatsApp */}
                <a
                  href="https://wa.me/919122772798"
                  class="support-channel-item"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div class="channel-left">
                    <LuPhone style="width:14px;height:14px;flex-shrink:0" />
                    <div class="channel-text">
                      <div class="channel-title">WhatsApp Support</div>
                      <div class="channel-subtitle">Instant help & onboarding</div>
                    </div>
                  </div>
                  <LuArrowRight class="channel-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </a>

                {/* Telegram */}
                <a
                  href="https://t.me/BusinessKitInBot"
                  class="support-channel-item"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div class="channel-left">
                    <LuSend style="width:14px;height:14px;flex-shrink:0" />
                    <div class="channel-text">
                      <div class="channel-title">Telegram Community</div>
                      <div class="channel-subtitle">@businesskit channel & updates</div>
                    </div>
                  </div>
                  <LuArrowRight class="channel-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </a>
              </div>

              <div class="card-footer-action" style="margin-top: auto; padding-top: 10px;">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="bottom-card-btn"
                >
                  <div class="bottom-btn-left">
                    <LuGlobe style="width:14px;height:14px;flex-shrink:0" />
                    <span>Documentation & Guides</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </a>
              </div>
            </div>
          </div>

          {/* Card C: Important Links */}
          <div class="dash-bottom-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); min-height: 280px; height: 100%; box-sizing: border-box;">
            <div class="card-header-row" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
              <div class="card-icon-wrap" style="width: 34px; height: 34px; border-radius: var(--radius-sm); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--border); color: var(--text-secondary);">
                <LuLink style="width:17px;height:17px" />
              </div>
              <div style="flex:1;min-width:0">
                <h2 class="card-title-text" style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; margin: 0;">Important Links</h2>
                <p class="text-xs text-muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  Essential controls & tools
                </p>
              </div>
            </div>

            <div class="card-body-content" style="display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between;">
              <div class="info-list" style="display: flex; flex-direction: column; gap: 7px;">
                <Link href="/dashboard/settings/profile" class="bottom-card-btn">
                  <div class="bottom-btn-left">
                    <LuBuilding style="width:14px;height:14px;flex-shrink:0" />
                    <span>Profile & Branding</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>

                <Link href="/dashboard/settings" class="bottom-card-btn">
                  <div class="bottom-btn-left">
                    <LuSettings style="width:14px;height:14px;flex-shrink:0" />
                    <span>Workspace Settings</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>

                {isTaxInstalled ? (
                  <Link href="/dashboard/tax/settings" class="bottom-card-btn">
                    <div class="bottom-btn-left">
                      <LuReceipt style="width:14px;height:14px;flex-shrink:0" />
                      <span>Tax & Compliance</span>
                    </div>
                    <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                  </Link>
                ) : (
                  <Link href="/apps" class="bottom-card-btn">
                    <div class="bottom-btn-left">
                      <LuShoppingBag style="width:14px;height:14px;flex-shrink:0" />
                      <span>Install Apps Store</span>
                    </div>
                    <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                  </Link>
                )}

                <Link href="/dashboard/deploy" class="bottom-card-btn">
                  <div class="bottom-btn-left">
                    <LuRocket style="width:14px;height:14px;flex-shrink:0" />
                    <span>Deploy & Edge Sync</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>

                <Link href="/dashboard/settings/status" class="bottom-card-btn">
                  <div class="bottom-btn-left">
                    <LuShieldCheck style="width:14px;height:14px;flex-shrink:0" />
                    <span>Database & Health</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>
              </div>

              <div class="card-footer-action" style="margin-top: auto; padding-top: 10px;">
                <Link
                  href="/dashboard/settings"
                  class="bottom-card-btn"
                >
                  <div class="bottom-btn-left">
                    <LuSettings style="width:14px;height:14px;flex-shrink:0" />
                    <span>View All Settings</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>
              </div>
            </div>
          </div>

          {/* Card D: Workspace & Invites */}
          <div class="dash-bottom-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); min-height: 280px; height: 100%; box-sizing: border-box;">
            <div class="card-header-row" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
              <div class="card-icon-wrap" style="width: 34px; height: 34px; border-radius: var(--radius-sm); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--border); color: var(--text-secondary);">
                <LuUsers style="width:17px;height:17px" />
              </div>
              <div style="flex:1;min-width:0">
                <h2 class="card-title-text" style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; margin: 0;">Workspace & Invites</h2>
                <p class="text-xs text-muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  Collaborate & share access
                </p>
              </div>
            </div>

            <div class="card-body-content" style="display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between;">
              <div class="info-list" style="display: flex; flex-direction: column; gap: 7px;">
                <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                  <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Workspace</span>
                  <span class="info-val-primary font-semibold" style="color: var(--text-primary); font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {org?.name ?? "Personal Workspace"}
                  </span>
                </div>

                <div class="info-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem;">
                  <span class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0;">Plan Level</span>
                  <span class="info-val-primary" style="color: var(--text-primary); font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform:uppercase;font-size:0.7rem;font-weight:700;color:var(--accent)">
                    {license?.plan ?? "Starter"}
                  </span>
                </div>

                {/* Public Store Link & Copy */}
                <div style="margin-top:2px">
                  <div class="info-label-muted" style="color: var(--text-muted); font-weight: 500; flex-shrink: 0; font-size:0.7rem;margin-bottom:2px">
                    Public Store URL:
                  </div>
                  <div class="url-copy-box">
                    <span class="font-mono text-truncate-val" style="font-size:0.7rem;color:var(--text-secondary)">
                      {displayDomain}
                    </span>
                    <button
                      type="button"
                      class="url-copy-btn"
                      onClick$={handleCopyUrl}
                      title={copiedUrl.value ? "Copied" : "Copy public URL"}
                      aria-label="Copy public URL"
                    >
                      {copiedUrl.value ? (
                        <LuCheck style="width:12px;height:12px;color:var(--success)" />
                      ) : (
                        <LuCopy style="width:12px;height:12px" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div class="card-footer-action" style="margin-top: auto; padding-top: 10px; display:flex;flex-direction:column;gap:6px">
                <Link
                  href="/dashboard/settings/profile"
                  class="bottom-card-btn"
                >
                  <div class="bottom-btn-left">
                    <LuHome style="width:14px;height:14px;flex-shrink:0" />
                    <span>Set Home Page</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>

                <Link
                  href="/dashboard/settings/teams"
                  class="bottom-card-btn"
                >
                  <div class="bottom-btn-left">
                    <LuUsers style="width:14px;height:14px;flex-shrink:0" />
                    <span>Manage Team & Invites</span>
                  </div>
                  <LuExternalLink class="bottom-btn-arrow" style="width:12px;height:12px;flex-shrink:0" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* iPhone 4-Icon Mobile Dock (mobile breakpoint only) */}
      <MobileAppDock active="home" />

      {/* Prompt popup when no profile is created */}
      {showNoProfileModal.value && (
        <NoProfileModal onDismiss$={$(() => { noProfileDismissed.value = true; })} />
      )}
    </div>
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n?: number | null) =>
  n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const fmtCents = (n?: number | null) =>
  n == null ? "—" : `$${(n / 100).toFixed(0)}`;

interface StatCardProps {
  icon: any;
  label: string;
  value: string;
  color: string;
}

const StatCard = component$<StatCardProps>(({ icon: Icon, label, value, color }) => (
  <div class="stat-card">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
      <Icon style={`width:14px;height:14px;color:${color}`} />
      <span class="stat-label" style="margin:0">{label}</span>
    </div>
    <div class="stat-value">{value}</div>
  </div>
));

export const head: DocumentHead = {
  title: "Dashboard — BusinessKit",
};



