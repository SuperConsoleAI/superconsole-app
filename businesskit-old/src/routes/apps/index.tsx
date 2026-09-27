// src/routes/apps/index.tsx
//
// Apps page — lists all available BusinessKit apps organized by category.
//
// What this file does:
//   Renders all BusinessKit apps grouped by category (Business & POS, Marketing,
//   Content / Blog, CRM & Tools, Community, Store).
//   Installable apps feature on-demand schema provisioning and subscription gating.
//
// IPC commands used: get_installed_apps, install_app

import { component$, useSignal, useStylesScoped$, $, type QRL, useComputed$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuSearch, LuX } from "@qwikest/icons/lucide";
import type { AppsDashboardCardIconId } from "~/components/AppsDashboardCard";
import { AppsDashboardCard } from "~/components/AppsDashboardCard";
import { MobileAppDock } from "~/components/MobileAppDock";
import { designSystem } from "~/lib/design-system";
import { useAppContext } from "~/lib/app-context";
import { invoke } from "@tauri-apps/api/core";
import { version } from "../../../package.json";

export interface AppItem {
  id?: string; // present if installable on-demand
  name: string;
  description: string;
  tagline?: string;
  iconId: AppsDashboardCardIconId;
  href: string;
  color: string;
  category: string;
  status?: "live" | "coming";
  liveCaption?: string;
}

const ALL_APPS: ReadonlyArray<AppItem> = [
  // ── Business & POS ──────────────────────────────────────────────────────────
  {
    id: "shop",
    name: "Shop",
    description: "POS, billing, products & inventory",
    tagline: "Sell anything. Print bills. Track stock.",
    iconId: "shop",
    href: "/dashboard/shop",
    color: "#F97316",
    category: "Business & POS",
  },
  {
    id: "tax",
    name: "Tax",
    description: "GST/VAT, e-invoices, TDS & returns",
    tagline: "Indian GST, e-invoice & TDS filing.",
    iconId: "tax",
    href: "/dashboard/tax",
    color: "#14B8A6",
    category: "Business & POS",
  },
  {
    id: "accounts",
    name: "Accounts",
    description: "Double-entry books, bank & expenses",
    tagline: "P&L, bank reconciliation & journals.",
    iconId: "accounts",
    href: "/dashboard/accounts",
    color: "#6366F1",
    category: "Business & POS",
  },
  {
    category: "Business & POS",
    name: "Payroll",
    description: "Employees, attendance & payslips",
    iconId: "payroll",
    href: "/dashboard/payroll",
    color: "#EC4899",
    status: "coming",
  },

  // ── Marketing ───────────────────────────────────────────────────────────────
  {
    id: "links",
    name: "Link in Bio",
    description: "Your personal landing page",
    tagline: "Manage your links",
    iconId: "link-in-bio",
    href: "/dashboard/c/links/",
    color: "#3B82F6",
    category: "Marketing",
  },
  {
    category: "Marketing",
    name: "Website",
    description: "Publish your website in minutes",
    tagline: "Edit your site",
    iconId: "website",
    href: "/dashboard/pages/",
    color: "#0EA5E9",
    status: "live",
    liveCaption: "Edit your site",
  },
  {
    category: "Marketing",
    name: "CRM",
    description: "Manage your customers and deals",
    tagline: "Manage Your Leads",
    iconId: "crm",
    href: "/dashboard/crm/",
    color: "#14B8A6",
    status: "live",
    liveCaption: "Open CRM",
  },
  {
    id: "social",
    name: "Social",
    description: "Manage all your social media",
    tagline: "Post, schedule & analyze social.",
    iconId: "social",
    href: "/dashboard/social",
    color: "#8B5CF6",
    category: "Marketing",
  },
  {
    category: "Marketing",
    name: "GSC",
    description: "Google Search Console analytics",
    iconId: "website",
    href: "/dashboard/gsc",
    color: "#10B981",
    status: "coming",
  },
  {
    category: "Marketing",
    name: "Affiliate",
    description: "Manage affiliate programs",
    iconId: "link-in-bio",
    href: "/dashboard/affiliate",
    color: "#A855F7",
    status: "coming",
  },
  {
    category: "Marketing",
    name: "Ads",
    description: "Manage ad campaigns",
    iconId: "sponsorships",
    href: "/dashboard/ads/",
    color: "#3B82F6",
    status: "coming",
  },

  // ── Content / Blog ──────────────────────────────────────────────────────────
  {
    category: "Content / Blog",
    name: "Content",
    description: "Manage content hubs, blogs, docs & notes",
    tagline: "Manage your content hubs",
    iconId: "blog",
    href: "/dashboard/content/",
    color: "#10B981",
    status: "live",
    liveCaption: "Open content hubs",
  },
  {
    category: "Content / Blog",
    name: "Blog",
    description: "Write posts and grow your audience",
    iconId: "blog",
    href: "/dashboard/content/blog/",
    color: "#22C55E",
    status: "live",
    liveCaption: "Write a post",
  },
  {
    category: "Content / Blog",
    name: "Newsletter",
    description: "Send updates to your subscribers",
    iconId: "newsletter",
    href: "/dashboard/content/n/",
    color: "#F43F5E",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Content / Blog",
    name: "Notes",
    description: "Write and organize personal notes",
    iconId: "notes",
    href: "/dashboard/content/notes/",
    color: "#EAB308",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Content / Blog",
    name: "Docs",
    description: "Build public documentation",
    iconId: "docs",
    href: "/dashboard/content/docs/",
    color: "#6366F1",
    status: "live",
    liveCaption: "Open workspace",
  },

  // ── AI & Customer Engagement ───────────────────────────────────────────────
  {
    id: "chat-agent",
    name: "Chat Agent",
    description: "AI live chat & voice call support",
    tagline: "AI customer support & call logs.",
    iconId: "chat-agent",
    href: "/dashboard/chat",
    color: "#06B6D4",
    category: "AI & Customer Engagement",
  },
  {
    category: "AI & Customer Engagement",
    name: "Agents",
    description: "Custom AI agents & automations",
    tagline: "Build custom autonomous AI agents.",
    iconId: "agents",
    href: "/dashboard/agents",
    color: "#06B6D4",
    status: "live",
    liveCaption: "Open Agents",
  },
  {
    id: "forms",
    name: "Form",
    description: "Create beautiful forms and surveys",
    tagline: "Build forms & surveys.",
    iconId: "form",
    href: "/dashboard/forms",
    color: "#F97316",
    category: "AI & Customer Engagement",
  },
  {
    category: "AI & Customer Engagement",
    name: "Feedback",
    description: "Collect user feedback & votes",
    iconId: "form",
    href: "/dashboard/feedback",
    color: "#F59E0B",
    status: "coming",
  },
  {
    category: "AI & Customer Engagement",
    name: "Reviews",
    description: "Collect and showcase reviews",
    iconId: "testimonials",
    href: "/dashboard/testimonials",
    color: "#F43F5E",
    status: "coming",
  },
  {
    id: "jobs",
    name: "Jobs",
    description: "Post job listings and hire talent",
    tagline: "Manage job postings.",
    iconId: "jobs",
    href: "/dashboard/jobs",
    color: "#8B5CF6",
    category: "AI & Customer Engagement",
  },
  {
    category: "AI & Customer Engagement",
    name: "Directory",
    description: "Build a directory with listings",
    iconId: "directory",
    href: "/dashboard/content/",
    color: "#A855F7",
    status: "live",
    liveCaption: "Open directory",
  },

  // ── Community ───────────────────────────────────────────────────────────────
  {
    id: "community",
    name: "Community",
    description: "Build a community around your brand",
    tagline: "Host discussions, events & members.",
    iconId: "community",
    href: "/dashboard/community",
    color: "#EC4899",
    category: "Community",
  },

  // ── Store (Digital) ─────────────────────────────────────────────────────────
  {
    id: "store",
    name: "Store (Digital)",
    description: "Sell digital products, courses & services",
    tagline: "Sell downloads, courses, meetings & events.",
    iconId: "digital-download",
    href: "/dashboard/store",
    color: "#F59E0B",
    category: "Store (Digital)",
  },
  {
    category: "Store (Digital)",
    name: "Downloads",
    description: "Sell eBooks, PDFs, templates, and more",
    iconId: "digital-download",
    href: "/dashboard/store/digital-download/",
    color: "#F59E0B",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "Courses",
    description: "Publish multi-lesson learning paths",
    iconId: "store-courses",
    href: "/dashboard/store/courses/",
    color: "#6366F1",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "1:1 meetings",
    description: "Offer paid consultation calls",
    iconId: "meetings",
    href: "/dashboard/store/meeting/",
    color: "#EF4444",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "webinars",
    description: "Host one-off live events",
    iconId: "webinars",
    href: "/dashboard/store/webinar/",
    color: "#0EA5E9",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "Services",
    description: "Offer custom services and packages",
    iconId: "services",
    href: "/dashboard/store/service/",
    color: "#22C55E",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "Sponsorships",
    description: "Sell sponsored posts and shoutouts",
    iconId: "sponsorships",
    href: "/dashboard/store/sponsorship/",
    color: "#A855F7",
    status: "live",
    liveCaption: "Open workspace",
  },
  {
    category: "Store (Digital)",
    name: "Events",
    description: "Sell tickets and manage capacity",
    iconId: "events",
    href: "/dashboard/store/event/",
    color: "#F97316",
    status: "live",
    liveCaption: "Open workspace",
  },
];

const CATEGORIES = [
  "Business & POS",
  "Marketing",
  "Content / Blog",
  "AI & Customer Engagement",
  "Community",
  "Store (Digital)",
];

const LIVE_LABELS = ["LIVE NOW", "TRY NOW", "NEW EVENT"] as const;

const PAGE_STYLE = `
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    width: 100%;
    box-sizing: border-box;
  }

  @container app-content (max-width: 560px) {
    .apps-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
  }

  @container app-content (min-width: 561px) and (max-width: 860px) {
    .apps-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container app-content (min-width: 861px) and (max-width: 1180px) {
    .apps-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container app-content (min-width: 1181px) {
    .apps-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .install-section {
    margin-bottom: 2rem;
  }

  .category-section {
    margin-bottom: 2rem;
  }

  .category-section:last-child {
    margin-bottom: 0;
  }

  .category-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: transparent;
    color: var(--text-primary);
    padding: 0.25rem 0.75rem;
    border-radius: ${designSystem.borderRadius.pill};
    border: 1px solid var(--border);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    box-sizing: border-box;
  }

  .category-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-secondary);
    opacity: 0.8;
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .category-section {
      margin-bottom: 2rem;
    }
    .category-section:last-child {
      margin-bottom: 0;
    }
    .apps-grid {
      gap: 0.5rem;
    }
  }

  .mobile-search-wrapper {
    display: none;
    margin-bottom: 1rem;
    width: 100%;
  }

  @media (max-width: 768px) {
    .mobile-search-wrapper {
      display: block;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(PAGE_STYLE);
  const ctx = useAppContext();
  const viewMode = ctx.viewMode.value;
  const nav = useNavigate();

  // ── Installed apps state ──────────────────────────────────────────────────
  const installingApp = useSignal<string | null>(null);
  const installedAppsList = useComputed$(() => ctx.installedApps.value || []);

  const searchQuery = useComputed$(() => (ctx.appsSearchQuery.value || "").toLowerCase().trim());

  const filteredApps = useComputed$(() => {
    const q = searchQuery.value;
    if (!q) return ALL_APPS;
    return ALL_APPS.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      (a.tagline && a.tagline.toLowerCase().includes(q))
    );
  });

  const showProductsCard = useComputed$(() => {
    const q = searchQuery.value;
    if (!q) return true;
    return "products & inventory".includes(q) || "products".includes(q) || "stock ledger".includes(q) || "inventory".includes(q);
  });

  const showRestaurantCard = useComputed$(() => {
    const q = searchQuery.value;
    if (!q) return true;
    return "restaurant & café".includes(q) || "restaurant".includes(q) || "tables, kot tickets".includes(q) || "café".includes(q) || "cafe".includes(q);
  });

  const showStaysCard = useComputed$(() => {
    const q = searchQuery.value;
    if (!q) return true;
    return "hotel & stays".includes(q) || "hotel".includes(q) || "stays".includes(q) || "rooms, reservations".includes(q);
  });

  const hasAnyResults = useComputed$(() => {
    if (filteredApps.value.length > 0) return true;
    if (searchQuery.value && viewMode === "list") {
      if (showProductsCard.value || showRestaurantCard.value || showStaysCard.value) return true;
    }
    return false;
  });

  // ── Install handler factory ───────────────────────────────────────────────
  const makeInstallHandler = (appId: string, href: string): QRL<() => void> =>
    $(async () => {
      if (installingApp.value) return; // already installing something
      installingApp.value = appId;
      try {
        const updated = await invoke<string[]>("install_app", { appId });
        ctx.installedApps.value = updated;
        // Navigate to the app after install
        nav(href);
      } catch (e) {
        console.error("[apps] install_app failed:", e);
      } finally {
        installingApp.value = null;
      }
    });

  const activeProfile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
  const profileAllocatedPlan = (activeProfile?.allocated_plan || "").trim().toUpperCase();

  const licStatus = (ctx.license.value?.status || "").toLowerCase();
  const isLicActive = licStatus === "active" || licStatus === "grace" || licStatus === "trial";
  const globalPlan = (ctx.license.value?.plan || "").trim().toUpperCase();

  const isPro = profileAllocatedPlan !== ""
    ? (profileAllocatedPlan !== "FREE" && isLicActive)
    : (isLicActive && globalPlan !== "" && globalPlan !== "FREE");

  const showUpgrade = !isPro;
  const isShopInstalled = installedAppsList.value.includes("shop") && isPro;
  const isStoreInstalled = installedAppsList.value.includes("store") || installedAppsList.value.includes("store-digital") || installedAppsList.value.includes("store_digital");
  const isLinksInstalled = installedAppsList.value.includes("links") || installedAppsList.value.includes("link-in-bio") || installedAppsList.value.includes("link_in_bio");

  const renderAppCard = (app: AppItem, index: number, layout: "grid" | "list") => {
    if (app.id) {
      const isInstalled =
        (app.id === "store"
          ? isStoreInstalled
          : app.id === "links" || app.id === "link-in-bio"
            ? isLinksInstalled
            : installedAppsList.value.includes(app.id)) ||
        (app.id === "chat-agent" && installedAppsList.value.includes("chat"));
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
          appDescription={cardUpgradeRequired ? "Upgrade required" : (isInstalled ? "Tap to open" : (app.tagline ?? "Install app"))}
          footerColor={app.color}
          iconId={app.iconId}
          ctaLabel={cardUpgradeRequired ? "Upgrade" : (isInstalled ? "Open" : "Install")}
          installable={!cardUpgradeRequired && !isInstalled}
          isInstalled={isInstalled && !cardUpgradeRequired}
          installing={isInstalling}
          upgradeRequired={cardUpgradeRequired}
          onInstall$={cardUpgradeRequired ? $(() => { nav("/dashboard/settings?tab=plan") }) : makeInstallHandler(app.id, app.href)}
          layout={layout}
        />
      );
    }

    if (app.category === "Store (Digital)") {
      return (
        <AppsDashboardCard
          key={app.name}
          href={isStoreInstalled ? app.href : "/dashboard/store"}
          backgroundImageUrl=""
          label={isStoreInstalled ? "ACTIVE" : "REQUIRES STORE"}
          title={app.name}
          subtitle={app.description}
          appName={app.name}
          appDescription={isStoreInstalled ? (app.liveCaption ?? "Open workspace") : "Requires Store app installed"}
          footerColor={app.color}
          iconId={app.iconId}
          ctaLabel={isStoreInstalled ? "Open" : "Install Store"}
          installable={!isStoreInstalled}
          isInstalled={isStoreInstalled}
          installing={installingApp.value === "store"}
          faded={!isStoreInstalled}
          onInstall$={isStoreInstalled ? undefined : makeInstallHandler("store", "/dashboard/store")}
          layout={layout}
        />
      );
    }

    const isLive = app.status === "live";
    const liveLabel = LIVE_LABELS[index % LIVE_LABELS.length];
    return (
      <AppsDashboardCard
        key={app.name}
        href={app.href}
        disabled={!isLive}
        backgroundImageUrl={layout === "grid" ? "https://cdn.prod.website-files.com/5b964cdb39ac8923aa9f2207/697a6a8b867df1eb08ad63fb_app-bg-1.avif" : ""}
        label={isLive ? liveLabel : "COMING SOON"}
        title={app.name}
        subtitle={app.description}
        appName={app.name}
        appDescription={isLive ? (app.liveCaption ?? "Open") : "Coming soon"}
        footerColor={app.color}
        iconId={app.iconId}
        ctaLabel={isLive ? "Open" : "Soon"}
        layout={layout}
      />
    );
  };

  return (
    <div class="apps-page-root">
      {/* Mobile Searchbar — shown on page top on mobile breakpoint */}
      <div class="mobile-search-wrapper">
        <div style="position:relative;display:flex;align-items:center;width:100%;">
          <LuSearch style="position:absolute;left:0.75rem;width:0.95rem;height:0.95rem;color:var(--text-secondary);pointer-events:none;" />
          <input
            type="text"
            placeholder="Search apps..."
            value={ctx.appsSearchQuery.value}
            onInput$={(e) => { ctx.appsSearchQuery.value = (e.target as HTMLInputElement).value; }}
            style="height:2.35rem;width:100%;padding:0 2.2rem 0 2.25rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;outline:none;box-sizing:border-box;box-shadow:0 1px 2px rgba(0,0,0,0.04);"
          />
          {ctx.appsSearchQuery.value && (
            <button
              type="button"
              onClick$={() => { ctx.appsSearchQuery.value = ""; }}
              style="position:absolute;right:0.5rem;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;"
              title="Clear search"
            >
              <LuX style="width:0.9rem;height:0.9rem;" />
            </button>
          )}
        </div>
      </div>

      {!hasAnyResults.value ? (
        <div style="text-align:center;padding:3rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;margin-bottom:2rem;">
          <div style="font-size:1rem;font-weight:600;color:var(--text-primary);margin-bottom:0.35rem;">
            No apps found
          </div>
          <div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1rem;">
            No apps matching "{ctx.appsSearchQuery.value}"
          </div>
          <button
            type="button"
            onClick$={() => { ctx.appsSearchQuery.value = ""; }}
            style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.4rem 0.85rem;border-radius:0.375rem;font-size:0.78rem;font-weight:600;background:var(--surface-3);color:var(--text-primary);border:1px solid var(--border);cursor:pointer;"
          >
            Clear Search
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <section class="apps-grid">
          {filteredApps.value.map((app, index) => renderAppCard(app, index, "grid"))}
        </section>
      ) : (
        <div>
          {CATEGORIES.map((category) => {
            const categoryApps = filteredApps.value.filter((a) => a.category === category);
            const isBusinessPos = category === "Business & POS";
            const showBusinessSubApps = isBusinessPos && (showProductsCard.value || showRestaurantCard.value || showStaysCard.value);

            if (categoryApps.length === 0 && !showBusinessSubApps) return null;

            return (
              <div key={category} class="category-section">
                <div class="category-badge">
                  <span class="category-badge-dot" />
                  <span>{category}</span>
                </div>
                <div class="apps-grid">
                  {categoryApps.map((app, index) => renderAppCard(app, index, "list"))}

                  {/* ── Shop & Storefront Sub-apps inside Business & POS ── */}
                  {isBusinessPos && (
                    <>
                      {showProductsCard.value && (
                        <AppsDashboardCard
                          key="products"
                          href={isShopInstalled ? "/dashboard/shop/products/" : (showUpgrade ? "/dashboard/settings?tab=plan" : "/dashboard/shop")}
                          backgroundImageUrl=""
                          label={isShopInstalled ? "ACTIVE" : "REQUIRES SHOP"}
                          title="Products & Inventory"
                          subtitle="Stock ledger & reorder rules"
                          appName="Products"
                          appDescription={isShopInstalled ? "Open Products workspace" : "Requires Shop app installed"}
                          footerColor="#F97316"
                          iconId="shop"
                          ctaLabel={isShopInstalled ? "Open" : "Install Shop"}
                          installable={!isShopInstalled}
                          isInstalled={isShopInstalled}
                          installing={installingApp.value === "shop"}
                          faded={!isShopInstalled}
                          onInstall$={isShopInstalled ? undefined : (showUpgrade ? $(() => { nav("/dashboard/settings?tab=plan"); }) : makeInstallHandler("shop", "/dashboard/shop"))}
                          layout="list"
                        />
                      )}
                      {showRestaurantCard.value && (
                        <AppsDashboardCard
                          key="restaurant"
                          href={isShopInstalled ? "/dashboard/shop/restaurant/" : (showUpgrade ? "/dashboard/settings?tab=plan" : "/dashboard/shop")}
                          backgroundImageUrl=""
                          label={isShopInstalled ? "ACTIVE" : "REQUIRES SHOP"}
                          title="Restaurant & Café"
                          subtitle="Tables, KOT tickets & kitchen display"
                          appName="Restaurant"
                          appDescription={isShopInstalled ? "Open Restaurant workspace" : "Requires Shop app installed"}
                          footerColor="#F97316"
                          iconId="shop"
                          ctaLabel={isShopInstalled ? "Open" : "Install Shop"}
                          installable={!isShopInstalled}
                          isInstalled={isShopInstalled}
                          installing={installingApp.value === "shop"}
                          faded={!isShopInstalled}
                          onInstall$={isShopInstalled ? undefined : (showUpgrade ? $(() => { nav("/dashboard/settings?tab=plan"); }) : makeInstallHandler("shop", "/dashboard/shop"))}
                          layout="list"
                        />
                      )}
                      {showStaysCard.value && (
                        <AppsDashboardCard
                          key="stays"
                          href={isShopInstalled ? "/dashboard/shop/stays/" : (showUpgrade ? "/dashboard/settings?tab=plan" : "/dashboard/shop")}
                          backgroundImageUrl=""
                          label={isShopInstalled ? "ACTIVE" : "REQUIRES SHOP"}
                          title="Hotel & Stays"
                          subtitle="Rooms, reservations & front desk"
                          appName="Hotel / Stays"
                          appDescription={isShopInstalled ? "Open Stays workspace" : "Requires Shop app installed"}
                          footerColor="#D97757"
                          iconId="shop"
                          ctaLabel={isShopInstalled ? "Open" : "Install Shop"}
                          installable={!isShopInstalled}
                          isInstalled={isShopInstalled}
                          installing={installingApp.value === "shop"}
                          faded={!isShopInstalled}
                          onInstall$={isShopInstalled ? undefined : (showUpgrade ? $(() => { nav("/dashboard/settings?tab=plan"); }) : makeInstallHandler("shop", "/dashboard/shop"))}
                          layout="list"
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:1rem;">
        BusinessKit v{version}
      </div>

      {/* iPhone 4-Icon Mobile Dock (mobile breakpoint only) */}
      <MobileAppDock active="apps" />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Apps — BusinessKit",
};
