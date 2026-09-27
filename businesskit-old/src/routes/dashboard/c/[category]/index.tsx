/* eslint-disable @typescript-eslint/no-unused-vars, no-empty */
// src/routes/dashboard/c/[category]/index.tsx
//
// WHAT:  Dynamic category page — shows links for the selected category slug.
//        CategorySidebar is rendered HERE as a sticky left column inside
//        app-content. No position:fixed needed — avoids WKWebView clipping.
//
// HOW:   The page wraps its content in a full-bleed flex row that negates
//        app-content's 2rem padding so the sidebar starts flush to the edge.
//        Left column: CategorySidebar (sticky, height fills viewport).
//        Right column: scrollable page content with its own padding.
//
// FLOW:
//   Mount → getLinks() + getProfile() + getPageSettings() (parallel IPC)
//   useTask$(track category) → filter allLinks by category_id === slug
//   useVisibleTask$ → push slug/profileSlug/seoSettings into CategoryCtx
//                     so AppTopbar can render Hide/SEO/Eye buttons
//   Cleanup (unmount) → clear CategoryCtx so AppTopbar reverts to default

import {
  $, component$, useComputed$, useContext, useSignal,
  useStylesScoped$, useTask$, useVisibleTask$,
} from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: [
      { category: "links" }, { category: "all" }, { category: "about" }, { category: "feed" },
      { category: "tools" }, { category: "startups" }, { category: "features" }, { category: "forms" },
      { category: "compare" }, { category: "alternative" }, { category: "shorturl" }, { category: "page" },
      { category: "featured" }, { category: "projects" }, { category: "testimonials" }, { category: "books" },
      { category: "courses" }, { category: "downloads" }, { category: "news" }, { category: "newsletter" },
      { category: "docs" }, { category: "blog" }, { category: "guides" }, { category: "notes" },
      { category: "prompt" }, { category: "posts" }, { category: "store" }, { category: "shop" },
      { category: "gears" }, { category: "wears" }, { category: "sponsorship" }, { category: "merch" },
      { category: "services" }, { category: "listing" }, { category: "menu" }, { category: "booking" },
      { category: "portfolio" }, { category: "movies" }, { category: "music" }, { category: "gallery" },
      { category: "skills" }, { category: "videos" }, { category: "podcast" }, { category: "events" },
      { category: "faqs" }, { category: "groups" }, { category: "meeting" }, { category: "jobs" },
      { category: "community" }, { category: "webinar" }, { category: "marketing" }, { category: "directory" },
      { category: "crm" }, { category: "chat" }, { category: "tax" }, { category: "accounts" },
      { category: "payroll" }, { category: "social" }, { category: "feedback" }, { category: "review" },
      { category: "affiliate" }, { category: "webinars" }, { category: "sponsorships" }, { category: "meetings" },
      { category: "ai-tools" }, { category: "membership" }, { category: "subscription" },
    ],
  };
};
import { LinkModal } from "~/components/LinkModal";
import { CategorySidebar } from "~/components/CategorySidebar";
import { PageTypesModal, CATEGORY_GROUPS } from "~/components/PageTypesModal";
import { getLinks, getProfile, getPageSettings } from "~/lib/ipc";
import { deleteLink, updateLink, reorderLinks, updatePageSettings, updateProfile, getCategoryAnalytics, getSingleCategoryAnalytics, getLinkPage, upsertLinkPage } from "~/lib/ipc";
import { LinksAnalytics } from "~/components/LinksAnalytics";
import { SingleLinksAnalytics } from "~/components/SingleLinksAnalytics";
import { useCategoryCtx } from "~/lib/category-context";
import { useAppContext } from "~/lib/app-context";
import type { LinkRow, SettingsRow } from "~/lib/types";
import { LuPencil, LuTrash2, LuExternalLink, LuBarChart2 } from "@qwikest/icons/lucide";
import styles from "./category.css?inline";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default component$(() => {
  useStylesScoped$(styles);
  const loc = useLocation();
  const catCtx = useCategoryCtx();
  const appCtx = useAppContext();

  // ── Data ──────────────────────────────────────────────────────────────────
  const profileData = useSignal<any>(null);
  const allLinks = useSignal<LinkRow[]>([]);
  const seoSettings = useSignal<import("~/lib/types").LinkPageRow | SettingsRow | null>(null);
  const loading = useSignal(true);
  const loadError = useSignal<string | null>(null);

  // ── Visibility state ──────────────────────────────────────────────────────
  const isSavingVisibility = useSignal(false);
  const localHomeVisibility = useSignal<Record<string, boolean>>({});
  const localHomeVisibilityTitles = useSignal<Record<string, string>>({});
  const localHomeVisibilityDescriptions = useSignal<Record<string, string>>({});

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const collapsed = useSignal(false);
  const enabledCats = useSignal<string[]>(["links"]);
  const pageTypesOpen = useSignal(false);
  const pageTypesSaving = useSignal(false);

  // ── Filtered view for current category ────────────────────────────────────
  const categoryLinks = useSignal<LinkRow[]>([]);
  const categoryAnalytics = useSignal<import("~/lib/types").CategoryAnalyticsRow[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const searchQuery = useSignal("");
  const draggedId = useSignal<string | null>(null);

  // ── Link modal ────────────────────────────────────────────────────────────
  const modalOpen = useSignal(false);
  const editingLink = useSignal<LinkRow | null>(null);
  const profileIdSig = useSignal<string | null>(null);

  // ── Tabs & Analytics ──────────────────────────────────────────────────────
  const activeTab = catCtx.activeTab;
  const fullCategoryAnalytics = useSignal<import("~/lib/types").CategoryAnalyticsRow | null>(null);
  const loadingCategoryAnalytics = useSignal(false);

  const selectedAnalyticsLinkId = useSignal<string | null>(null);
  const selectedAnalyticsLinkTitle = useSignal<string>("");

  // ── Load data on first paint ──────────────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => appCtx.loading.value);
    track(() => appCtx.activeProfileId.value);

    if (appCtx.loading.value || !appCtx.activeProfileId.value) {
      return;
    }

    try {
      loading.value = true;
      loadError.value = null;

      const [profile, links, linkPageRow, analytics] = await Promise.all([
        getProfile().catch((e) => { console.warn("[category] getProfile failed:", e); return null; }),
        getLinks().catch((e) => { console.warn("[category] getLinks failed:", e); return [] as LinkRow[]; }),
        getLinkPage(loc.params.category).catch((e) => { console.warn("[category] getLinkPage failed:", e); return null; }),
        getCategoryAnalytics().catch((e) => { console.warn("[category] getCategoryAnalytics failed:", e); return []; }),
      ]);

      if (profile) {
        profileData.value = profile;
        profileIdSig.value = profile.id;
        try {
          const parsed = JSON.parse(profile.enabled_categories || "[]") as string[];
          enabledCats.value = [...new Set(["links", ...parsed])];
        } catch { /* keep default ["links"] */ }
        catCtx.profileSlug.value = profile.slug;
        catCtx.profileTitle.value = profile.title;
      }

      allLinks.value = links || [];
      categoryAnalytics.value = analytics || [];
      seoSettings.value = linkPageRow;
      catCtx.seoSettings.value = linkPageRow;
      catCtx.onSeoSave$.value = $(async (data: any) => {
        if (!profileData.value) return;
        catCtx.seoSaving.value = true;
        try {
          const updated = await upsertLinkPage({
            profile_id: profileData.value.id,
            category_slug: loc.params.category,
            ...data
          });
          seoSettings.value = updated;
          catCtx.seoSettings.value = updated;
          catCtx.seoOpen.value = false;
        } finally {
          catCtx.seoSaving.value = false;
        }
      });
      catCtx.onHiddenSave$.value = $(async (hidden: boolean) => {
        if (!profileData.value) return;
        const slug = catCtx.categorySlug.value;
        if (!slug) return;

        let visObj: Record<string, boolean> = {};
        try {
          if (profileData.value.category_visibility) {
            visObj = JSON.parse(profileData.value.category_visibility);
          }
        } catch (e) { }

        visObj[slug] = hidden;
        const newVisStr = JSON.stringify(visObj);

        profileData.value = { ...profileData.value, category_visibility: newVisStr };
        await updateProfile({ category_visibility: newVisStr });
      });
    } catch (e) {
      loadError.value = String(e);
    } finally {
      loading.value = false;
    }

    // Clear CategoryCtx when navigating away from category pages
    return () => { catCtx.categorySlug.value = ""; };
  });

  const currentCategory = useComputed$(() => loc.params.category);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const tab = track(() => activeTab.value);
    const cat = track(() => currentCategory.value);

    if (tab === "Analytics" && cat !== "all" && cat !== "about") {
      loadingCategoryAnalytics.value = true;
      try {
        const data = await getSingleCategoryAnalytics(cat);
        fullCategoryAnalytics.value = data;
      } catch (e) {
        console.error("Failed to load category analytics:", e);
      } finally {
        loadingCategoryAnalytics.value = false;
      }
    }
  });

  useTask$(({ track }) => {
    const slug = track(() => currentCategory.value);
    const links = track(() => allLinks.value);
    if (slug === "all") {
      categoryLinks.value = links;
    } else {
      categoryLinks.value = links.filter((l) => (l.category_slug || l.category_id) === slug);
    }
    catCtx.categorySlug.value = slug;
  });

  useTask$(({ track }) => {
    const slug = track(() => currentCategory.value);
    const profile = track(() => profileData.value);

    if (profile) {
      let visibilityRaw = "{}";
      if (slug === "all") visibilityRaw = profile.home_visibility || "{}";
      else if (slug === "about") visibilityRaw = profile.about_visibility || "{}";

      try {
        const parsed = JSON.parse(visibilityRaw);
        const visibility: Record<string, boolean> = {};
        const titles: Record<string, string> = {};
        const descriptions: Record<string, string> = {};

        for (const [key, val] of Object.entries(parsed)) {
          if (typeof val === 'boolean') {
            visibility[key] = val;
          } else if (val && typeof val === 'object') {
            visibility[key] = (val as any).visible === true;
            if (typeof (val as any).title === 'string') titles[key] = (val as any).title;
            if (typeof (val as any).description === 'string') descriptions[key] = (val as any).description;
          }
        }
        localHomeVisibility.value = visibility;
        localHomeVisibilityTitles.value = titles;
        localHomeVisibilityDescriptions.value = descriptions;
      } catch (e) {
        localHomeVisibility.value = {};
        localHomeVisibilityTitles.value = {};
        localHomeVisibilityDescriptions.value = {};
      }

      // Sync "Hide on Profile" state for the current category
      let isCatHidden = false;
      try {
        if (profile.category_visibility) {
          const catVis = JSON.parse(profile.category_visibility);
          isCatHidden = catVis[slug] === true;
        }
      } catch (e) { }
      catCtx.isHidden.value = isCatHidden;
    }
  });

  useTask$(({ track }) => {
    const isCollapsed = track(() => collapsed.value);
    catCtx.sidebarCollapsed.value = isCollapsed;
  });

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredLinks = useComputed$(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return categoryLinks.value;
    return categoryLinks.value.filter((l) =>
      [l.title, l.description ?? "", l.url, l.keywords ?? ""]
        .some((f) => f.toLowerCase().includes(q))
    );
  });



  const label = categoryLabel(currentCategory.value);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd$ = $(() => { editingLink.value = null; modalOpen.value = true; });
  const openEdit$ = $((link: LinkRow) => { editingLink.value = link; modalOpen.value = true; });

  const handleLinkSaved$ = $(async (saved: LinkRow) => {
    const idx = allLinks.value.findIndex((l) => l.id === saved.id);
    allLinks.value = idx >= 0
      ? allLinks.value.map((l) => l.id === saved.id ? saved : l)
      : [saved, ...allLinks.value];
    modalOpen.value = false;
    editingLink.value = null;
  });

  const handleDelete$ = $(async (linkId: string) => {
    if (!window.confirm("Delete this link?")) return;
    try {
      await deleteLink(linkId);
      allLinks.value = allLinks.value.filter((l) => l.id !== linkId);
    } catch (e) { console.error("Delete failed:", e); }
  });

  const handleToggle$ = $(async (link: LinkRow) => {
    try {
      const updated = await updateLink(link.id, { is_active: !link.is_active });
      allLinks.value = allLinks.value.map((l) => l.id === updated.id ? updated : l);
    } catch (e) { console.error("Toggle failed:", e); }
  });

  const handleDrop$ = $(async (targetId: string) => {
    const from = draggedId.value;
    if (!from || from === targetId) { draggedId.value = null; return; }
    const arr = [...categoryLinks.value];
    const fi = arr.findIndex((l) => l.id === from);
    const ti = arr.findIndex((l) => l.id === targetId);
    if (fi < 0 || ti < 0) { draggedId.value = null; return; }
    const [moved] = arr.splice(fi, 1);
    arr.splice(ti, 0, moved);
    const reordered = arr.map((l, i) => ({ ...l, order_index: i }));
    allLinks.value = allLinks.value.map((l) => reordered.find((r) => r.id === l.id) ?? l);
    draggedId.value = null;
    await reorderLinks(reordered);
  });

  const handleToggleCategoryVisibility = $((slug: string) => {
    localHomeVisibility.value = {
      ...localHomeVisibility.value,
      [slug]: !localHomeVisibility.value[slug],
    };
  });

  const handleSaveVisibility = $(async () => {
    if (!profileData.value) return;
    isSavingVisibility.value = true;
    try {
      const sanitized: Record<string, any> = {};
      for (const [key, isVisible] of Object.entries(localHomeVisibility.value)) {
        if (isVisible) {
          sanitized[key] = {
            visible: true,
            title: localHomeVisibilityTitles.value[key] || "",
            description: localHomeVisibilityDescriptions.value[key] || "",
          };
        }
      }
      const dataStr = JSON.stringify(sanitized);
      const updateData: any = {};
      if (currentCategory.value === "all") updateData.home_visibility = dataStr;
      else if (currentCategory.value === "about") updateData.about_visibility = dataStr;

      await updateProfile(updateData);

      // Update local profile state
      if (currentCategory.value === "all") profileData.value = { ...profileData.value, home_visibility: dataStr };
      else if (currentCategory.value === "about") profileData.value = { ...profileData.value, about_visibility: dataStr };

    } catch (e) {
      console.error("Save visibility failed:", e);
    } finally {
      isSavingVisibility.value = false;
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── CategorySidebar column ── */}
      <CategorySidebar
        collapsed={collapsed}
        allLinks={allLinks}
        enabledCategories={enabledCats}
        onToggle$={$(() => { collapsed.value = !collapsed.value; })}
        onManageCms$={$(() => { pageTypesOpen.value = true; })}
      />

      {/* ── Main content column ── */}
      <div style="flex:1;overflow-y:auto;padding:0;min-width:0;">

        {/* Tab switch moved to AppTopbar */}
        {activeTab.value === "Analytics" && currentCategory.value !== "all" && currentCategory.value !== "about" ? (
          <div style="width: 100%; box-sizing: border-box;">
            {loadingCategoryAnalytics.value ? (
              <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                  <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;" />
                  <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 150ms;" />
                  <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 300ms;" />
                </div>
                <div style="height: 300px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 450ms;" />
              </div>
            ) : (
              <LinksAnalytics data={fullCategoryAnalytics.value || { total_views: 0, total_clicks: 0 }} />
            )}
          </div>
        ) : (
          <>
            {/* Stats and Toolbar */}
            {currentCategory.value !== "all" && currentCategory.value !== "about" && (
              <>
                <div class="category-stats">
                  <div class="stat-card">
                    <h3>Total Links</h3>
                    <div class="stat-value">{Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(categoryAnalytics.value.find((a) => (a.category_slug || a.category_id) === currentCategory.value)?.total_links || 0)}</div>
                    <div class="stat-description">in this category</div>
                  </div>
                  <div class="stat-card">
                    <h3>Active Links</h3>
                    <div class="stat-value">{Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(categoryAnalytics.value.find((a) => (a.category_slug || a.category_id) === currentCategory.value)?.active_links || 0)}</div>
                    <div class="stat-description">currently visible</div>
                  </div>
                  <div class="stat-card">
                    <h3>Total Clicks</h3>
                    <div class="stat-value">{Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(categoryAnalytics.value.find((a) => (a.category_slug || a.category_id) === currentCategory.value)?.total_clicks || 0)}</div>
                    <div class="stat-description">total lifetime</div>
                  </div>
                </div>

                <div class="links-toolbar">
                  <button class="add-link-btn" onClick$={openAdd$}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add {label}
                  </button>
                  <div class="search-bar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      placeholder={`Search ${label.toLowerCase()}…`}
                      value={searchQuery.value}
                      onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
                    />
                  </div>
                  <span class="links-count">{filteredLinks.value.length} of {categoryLinks.value.length}</span>
                </div>
              </>
            )}

            {/* Visibility Settings OR Links table */}
            <div class="links-section">
              {(currentCategory.value === "all" || currentCategory.value === "about") ? (
                <div style="padding: 2rem; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 1.5rem;">
                  <div style="display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr));">
                    {Object.values(CATEGORY_GROUPS).flat()
                      .filter((cat) =>
                        cat.slug !== "all" &&
                        cat.slug !== "about" &&
                        enabledCats.value.includes(cat.slug)
                      )
                      .map((category) => {
                        const categorySlug = category.slug;
                        const isVisible = localHomeVisibility.value[categorySlug] === true;
                        const Icon = category.icon;
                        return (
                          <div
                            key={categorySlug}
                            style={`display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: 0.5rem; border: 1px solid ${isVisible ? 'var(--accent)' : 'var(--border)'}; background: var(--surface-2); transition: border-color 0.2s, box-shadow 0.2s; ${isVisible ? 'box-shadow: 0 1px 3px rgba(0,0,0,0.1);' : ''}`}
                          >
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                              <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500; font-size: 0.875rem;">
                                <Icon width={18} height={18} style="color: var(--accent); flex-shrink: 0;" />
                                <span>{category.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick$={() => handleToggleCategoryVisibility(categorySlug)}
                                disabled={isSavingVisibility.value}
                                style={`position: relative; width: 2.75rem; height: 1.5rem; border-radius: 0.5rem; border: none; padding: 0; cursor: pointer; background: ${isVisible ? "var(--accent)" : "var(--muted)"}; transition: background-color 0.2s;`}
                              >
                                <span
                                  style={`position: absolute; top: 50%; left: 0.15rem; width: 1.2rem; height: 1.2rem; border-radius: 0.5rem; background: var(--surface-2); box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: transform 0.2s; transform: ${isVisible ? 'translate(1.25rem, -50%)' : 'translate(0, -50%)'};`}
                                ></span>
                              </button>
                            </div>
                            {category.description && (
                              <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0; line-height: 1.4;">
                                {category.description}
                              </p>
                            )}
                            {isVisible && (
                              <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; width: 100%;">
                                <label style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary);">Section Title</label>
                                <input
                                  type="text"
                                  value={localHomeVisibilityTitles.value[categorySlug] ?? category.name}
                                  onInput$={(e) => {
                                    localHomeVisibilityTitles.value = {
                                      ...localHomeVisibilityTitles.value,
                                      [categorySlug]: (e.target as HTMLInputElement).value
                                    };
                                  }}
                                  placeholder={category.name}
                                  style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem;"
                                />
                                <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0;">Leave as-is to show default, or clear to hide heading</p>

                                <label style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); margin-top: 0.25rem;">Section Description</label>
                                <textarea
                                  rows={2}
                                  value={localHomeVisibilityDescriptions.value[categorySlug] ?? ""}
                                  onInput$={(e) => {
                                    localHomeVisibilityDescriptions.value = {
                                      ...localHomeVisibilityDescriptions.value,
                                      [categorySlug]: (e.target as HTMLTextAreaElement).value,
                                    };
                                  }}
                                  placeholder={category.description ?? "Add section description"}
                                  style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem; resize: vertical; font-family: inherit;"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                    <button
                      type="button"
                      onClick$={handleSaveVisibility}
                      disabled={isSavingVisibility.value}
                      style={`display: inline-flex; align-items: center; justify-content: center; padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none; background: var(--accent); color: var(--surface-2); font-weight: 500; cursor: pointer; opacity: ${isSavingVisibility.value ? 0.6 : 1}; transition: opacity 0.2s;`}
                    >
                      {isSavingVisibility.value ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : loading.value ? (
                <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                  <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
                    <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
                    <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                  </div>
                  <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 150ms;">
                    <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
                    <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                  </div>
                  <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 300ms;">
                    <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                    <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
                    <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
                  </div>
                </div>
              ) : loadError.value ? (
                <div class="empty-state"><p style="color:var(--error);">{loadError.value}</p></div>
              ) : filteredLinks.value.length === 0 ? (
                <div class="empty-state">
                  {searchQuery.value ? (
                    <>
                      <p>No results for "{searchQuery.value}"</p>
                      <button class="add-link-btn" onClick$={() => { searchQuery.value = ""; }}>Clear</button>
                    </>
                  ) : (
                    <>
                      <p>No {label.toLowerCase()} yet.</p>
                      <button class="add-link-btn" onClick$={openAdd$}>Add your first link</button>
                    </>
                  )}
                </div>
              ) : (
                <div class="table-scroll">
                  <table class="links-table">
                    <thead>
                      <tr>
                        <th style="width:2rem;" />
                        <th>Title</th>
                        <th>URL</th>
                        <th>Status</th>
                        <th style="text-align:right;">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLinks.value.map((link) => (
                        <tr
                          key={link.id}
                          draggable={!searchQuery.value}
                          onDragStart$={() => { draggedId.value = link.id; }}
                          onDragOver$={(e) => { e.preventDefault(); }}
                          onDrop$={() => handleDrop$(link.id)}
                          style={draggedId.value === link.id ? "opacity:0.5;" : ""}
                        >
                          <td>
                            <span class="drag-handle">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                                <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                                <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                              </svg>
                            </span>
                          </td>
                          <td>
                            <div class="link-title-cell">
                              {link.image_url
                                ? <img src={link.image_url} alt="" width={32} height={32} />
                                : <div class="link-placeholder-sm">{link.title.charAt(0).toUpperCase()}</div>}
                              <span>{link.title}</span>
                            </div>
                          </td>
                          <td class="link-url-cell">{link.url}</td>
                          <td>
                            <button
                              type="button"
                              class={`status-toggle${link.is_active ? " active" : ""}`}
                              onClick$={() => handleToggle$(link)}
                            />
                          </td>
                          <td>
                            <div class="link-actions-cell">
                              <button type="button" class="icon-btn" onClick$={() => {
                                selectedAnalyticsLinkId.value = link.id;
                                selectedAnalyticsLinkTitle.value = link.title;
                              }}>
                                <LuBarChart2 style="width:1rem;height:1rem;" />
                              </button>
                              <button type="button" class="icon-btn" onClick$={() => openEdit$(link)}>
                                <LuPencil style="width:1rem;height:1rem;" />
                              </button>
                              <a href={link.url} target="_blank" class="icon-btn">
                                <LuExternalLink style="width:1rem;height:1rem;" />
                              </a>
                              <button type="button" class="icon-btn danger" onClick$={() => handleDelete$(link.id)}>
                                <LuTrash2 style="width:1rem;height:1rem;" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <LinkModal
        open={modalOpen}
        editingLink={editingLink}
        profileId={profileIdSig}
        onSaved$={handleLinkSaved$}
        activeCategory={currentCategory.value}
      />
      <PageTypesModal
        open={pageTypesOpen}
        enabled={enabledCats}
        saving={pageTypesSaving}
        onSave$={async (enabled) => {
          pageTypesSaving.value = true;
          try {
            const newCats = [...new Set(["links", ...enabled])];
            await updateProfile({
              enabled_categories: JSON.stringify(newCats),
            });
            enabledCats.value = newCats;
            pageTypesOpen.value = false;
          } catch (e) {
            console.error("Failed to update profile", e);
          } finally {
            pageTypesSaving.value = false;
          }
        }}
      />

      {selectedAnalyticsLinkId.value && (
        <SingleLinksAnalytics
          linkId={selectedAnalyticsLinkId.value}
          linkTitle={selectedAnalyticsLinkTitle.value}
          onClose$={$(() => { selectedAnalyticsLinkId.value = null; })}
        />
      )}
    </>
  );
});
