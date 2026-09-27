/* eslint-disable @typescript-eslint/no-unused-vars, no-empty */
// src/routes/settings/profile/index.tsx
import { component$, useSignal, useTask$, useVisibleTask$, useStylesScoped$, useStore, useComputed$, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  LuFacebook, LuGithub, LuInstagram, LuLink, LuLinkedin,
  LuMail, LuMapPin, LuPhone, LuSave,
  LuTwitter, LuUpload, LuUser, LuVideo, LuYoutube,
  LuRotateCcw, LuSearch, LuChevronDown, LuLayers, LuShoppingBag,
  LuFolder, LuFileText, LuX, LuLayoutGrid, LuCheck
} from "@qwikest/icons/lucide";

import AppSidebar from "~/components/app/AppSidebar";
import AppTopbar from "~/components/app/AppTopbar";

import { getProfile, updateProfile } from "~/lib/ipc";
import { useAppContext } from "~/lib/app-context";
import type { ProfileRow } from "~/lib/types";
import {
  PROFILE_THEME_DEFAULT, PROFILE_THEME_PATTERNS, PROFILE_THEME_FONTS,
  normalizeProfileTheme, resolvePatternStyle, resolveButtonTextColor,
  type ProfileThemeSettings
} from "~/lib/profile-theme";
import { isReservedSlug } from "~/lib/reserved-slugs";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

import styles from "./profile.css?inline";
import { SettingsContext } from "../layout";

const SOCIAL_LINK_DEFINITIONS = [
  { key: "website", label: "Website", icon: LuLink, placeholder: "https://yourwebsite.com", type: "url" },
  { key: "email", label: "Email", icon: LuMail, placeholder: "you@email.com", type: "email" },
  { key: "phone", label: "Phone", icon: LuPhone, placeholder: "+1 (555) 123-4567", type: "tel" },
  { key: "location", label: "Location", icon: LuMapPin, placeholder: "City, Country", type: "text" },
  { key: "instagram", label: "Instagram", icon: LuInstagram, placeholder: "https://instagram.com/username", type: "url" },
  { key: "twitter", label: "X", icon: LuTwitter, placeholder: "https://x.com/username", type: "url" },
  { key: "tiktok", label: "TikTok", icon: LuVideo, placeholder: "https://tiktok.com/@username", type: "url" },
  { key: "github", label: "GitHub", icon: LuGithub, placeholder: "https://github.com/username", type: "url" },
  { key: "linkedin", label: "LinkedIn", icon: LuLinkedin, placeholder: "https://linkedin.com/in/username", type: "url" },
  { key: "youtube", label: "YouTube", icon: LuYoutube, placeholder: "https://youtube.com/@username", type: "url" },
  { key: "facebook", label: "Facebook", icon: LuFacebook, placeholder: "https://facebook.com/username", type: "url" },
];
const SOCIAL_ICON_MAP: Record<string, any> = SOCIAL_LINK_DEFINITIONS.reduce((acc, d) => ({ ...acc, [d.key]: d.icon }), {});

const DEFAULT_HOME_CATEGORIES = [
  { slug: "all", name: "All Links", type: "Category", path: "/all" },
  { slug: "links", name: "Links", type: "Category", path: "/c/links" },
  { slug: "startups", name: "Startups", type: "Category", path: "/c/startups" },
  { slug: "tools", name: "Tools", type: "Category", path: "/c/tools" },
  { slug: "books", name: "Books", type: "Category", path: "/c/books" },
  { slug: "courses", name: "Courses", type: "Category", path: "/c/courses" },
  { slug: "feed", name: "Feed", type: "Category", path: "/c/feed" },
  { slug: "about", name: "About", type: "Category", path: "/about" },
  { slug: "gears", name: "Gears", type: "Category", path: "/c/gears" },
  { slug: "newsletter", name: "Newsletter", type: "Category", path: "/c/newsletter" },
  { slug: "featured", name: "Featured", type: "Category", path: "/c/featured" },
  { slug: "portfolio", name: "Portfolio", type: "Category", path: "/c/portfolio" },
];

export default component$(() => {
  useStylesScoped$(styles);

  const profileState = useSignal<ProfileRow | null>(null);
  
  const activeTab = useSignal<"profile" | "social" | "theme">("profile");

  const slug = useSignal("");
  const title = useSignal("");
  const bioField = useSignal("");
  const about = useSignal("");
  const avatarUrl = useSignal("");
  const avatarPreview = useSignal("");
  const avatarPickerOpen = useSignal(false);
  const avatarUploadOpen = useSignal(false);
  const homePage = useSignal("");
  const homePageSearch = useSignal("");
  const isDropdownOpen = useSignal(false);
  const isPublic = useSignal(true);

  const availableCategories = useSignal<{ slug: string; name: string; type: string; path: string }[]>(DEFAULT_HOME_CATEGORIES);
  const availablePages = useSignal<{ slug: string; name: string; type: string; path: string }[]>([]);
  const availableProducts = useSignal<{ slug: string; name: string; type: string; path: string }[]>([]);
  const availableShopItems = useSignal<{ slug: string; name: string; type: string; path: string }[]>([]);

  const socialLinks = useSignal<Record<string, string>>({});
  
  const themeForm = useStore<ProfileThemeSettings>({ ...PROFILE_THEME_DEFAULT });

  const isRunning = useSignal({ basics: false, social: false, theme: false });
  const basicsMessage = useSignal<{ type: "success" | "error"; text: string } | null>(null);
  const socialMessage = useSignal<{ type: "success" | "error"; text: string } | null>(null);
  const themeMessage = useSignal<{ type: "success" | "error"; text: string } | null>(null);

  const ctx = useAppContext();

  const settingsCtx = useContext(SettingsContext);
  const loading = settingsCtx.loading;
  const loadError = useSignal<string | null>(null);

  const loadDropdownData = $(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Custom Pages (/pages)
      try {
        const pages: any = await invoke("get_pages_by_profile");
        if (Array.isArray(pages)) {
          availablePages.value = pages.map((pg) => ({
            slug: `/${pg.slug}`,
            name: pg.title || pg.slug,
            type: "Page",
            path: `/${pg.slug}`,
          }));
        }
      } catch (e) {}

      // Digital Products (/products)
      try {
        const prods: any = await invoke("get_products", {});
        if (Array.isArray(prods)) {
          availableProducts.value = prods.map((prod) => ({
            slug: `/d/${prod.slug}`,
            name: prod.title || prod.slug,
            type: "Product",
            path: `/d/${prod.slug}`,
          }));
        }
      } catch (e) {}

      // Shop Items (/shop_items)
      try {
        const items: any = await invoke("shop_list_items", {});
        if (Array.isArray(items)) {
          availableShopItems.value = items.map((it) => ({
            slug: `/p/${it.slug}`,
            name: it.name || it.slug,
            type: "Shop Item",
            path: `/p/${it.slug}`,
          }));
        }
      } catch (e) {}
    } catch (e) {}
  });

  useTask$(({ track }) => {
    track(() => settingsCtx.profile);
    const p = settingsCtx.profile;
    if (p) {
      profileState.value = p;
      slug.value = p.slug || "";
      title.value = p.title || "";
      bioField.value = p.bio || "";
      about.value = p.about || "";
      avatarUrl.value = p.avatar_url || "";
      avatarPreview.value = p.avatar_url || "";
      homePage.value = p.home_page || "";

      // Parse enabled categories if available
      if (p.enabled_categories) {
        try {
          const parsed = JSON.parse(p.enabled_categories);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const customCats = parsed.map((cSlug) => ({
              slug: String(cSlug),
              name: String(cSlug).charAt(0).toUpperCase() + String(cSlug).slice(1),
              type: "Category",
              path: String(cSlug) === "about" ? "/about" : String(cSlug) === "all" ? "/all" : `/c/${cSlug}`,
            }));
            // Merge with default categories
            const map = new Map<string, any>();
            DEFAULT_HOME_CATEGORIES.forEach((cat) => map.set(cat.slug, cat));
            customCats.forEach((cat) => map.set(cat.slug, cat));
            availableCategories.value = Array.from(map.values());
          }
        } catch (e) {}
      }

      const sLinks: Record<string, string> = {};
      if (p.social_links) {
        try {
          const arr = JSON.parse(p.social_links);
          if (Array.isArray(arr)) {
            arr.forEach(i => { if (i.platform && i.url) sLinks[String(i.platform).toLowerCase()] = i.url; });
          }
        } catch(e) {}
      }
      socialLinks.value = sLinks;

      if (p.profile_theme) {
        try {
          const th = JSON.parse(p.profile_theme);
          Object.assign(themeForm, normalizeProfileTheme(th));
        } catch(e) {}
      }
    } else if (settingsCtx.error) {
      loadError.value = settingsCtx.error;
    }
  });

  // Fetch available pages, products, and shop items for the Home Page dropdown on mount
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadDropdownData();
  });

  const filteredHomeOptions = useComputed$(() => {
    const q = homePageSearch.value.trim().toLowerCase();

    const filterList = (list: { slug: string; name: string; type: string; path: string }[]) => {
      if (!q) return list.slice(0, 5);
      return list
        .filter((item) => item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
        .slice(0, 5);
    };

    return {
      categories: filterList(availableCategories.value),
      pages: filterList(availablePages.value),
      products: filterList(availableProducts.value),
      shopItems: filterList(availableShopItems.value),
    };
  });

  const selectedItemDisplay = useComputed$(() => {
    const val = homePage.value.trim().toLowerCase();
    if (!val) return "Default (All Links)";
    
    // Check in categories
    const cat = availableCategories.value.find((c) => c.slug.toLowerCase() === val || c.path.toLowerCase() === val);
    if (cat) return `${cat.name} (${cat.path})`;

    // Check in pages
    const pg = availablePages.value.find((p) => p.slug.toLowerCase() === val || p.path.toLowerCase() === val);
    if (pg) return `${pg.name} (${pg.path})`;

    // Check in products
    const prod = availableProducts.value.find((p) => p.slug.toLowerCase() === val || p.path.toLowerCase() === val);
    if (prod) return `${prod.name} (${prod.path})`;

    // Check in shop items
    const shop = availableShopItems.value.find((s) => s.slug.toLowerCase() === val || s.path.toLowerCase() === val);
    if (shop) return `${shop.name} (${shop.path})`;

    return val;
  });

  const themePreview = useComputed$(() => {
    const previewTheme = normalizeProfileTheme({ ...PROFILE_THEME_DEFAULT, ...themeForm });
    const patternStyle = resolvePatternStyle(previewTheme.backgroundPattern, previewTheme);
    const backgroundImages: string[] = [];
    if (previewTheme.backgroundImageUrl) backgroundImages.push(`url(${previewTheme.backgroundImageUrl})`);
    if (patternStyle.backgroundImage) backgroundImages.push(patternStyle.backgroundImage);

    const containerStyle: Record<string, string> = {
      backgroundColor: previewTheme.backgroundColor,
      color: previewTheme.textColor,
      borderColor: previewTheme.borderColor,
      "--card-button-bg": previewTheme.cardButtonColor,
    };
    containerStyle.backgroundImage = backgroundImages.length > 0 ? backgroundImages.join(", ") : "none";
    if (patternStyle.backgroundSize) containerStyle.backgroundSize = patternStyle.backgroundSize;
    if (patternStyle.backgroundPosition) containerStyle.backgroundPosition = patternStyle.backgroundPosition;
    if (patternStyle.backgroundRepeat) containerStyle.backgroundRepeat = patternStyle.backgroundRepeat;

    return {
      container: containerStyle,
      card: { backgroundColor: previewTheme.cardColor, color: previewTheme.textColor, borderColor: previewTheme.borderColor },
      button: { backgroundColor: previewTheme.buttonColor, color: resolveButtonTextColor(previewTheme.buttonColor, previewTheme.textColor) },
      cardButton: { backgroundColor: previewTheme.cardButtonColor, color: resolveButtonTextColor(previewTheme.cardButtonColor, previewTheme.textColor), border: `1px solid ${previewTheme.borderColor}` },
      muted: { color: previewTheme.inactiveTextColor },
      theme: previewTheme,
    } as const;
  });

  const socialPreview = useComputed$(() =>
    SOCIAL_LINK_DEFINITIONS
      .map((d) => {
        const v = socialLinks.value[d.key];
        if (!v) return null;
        return { key: d.key, label: d.label, href: v, value: v };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );

  return (
    <>
      {loading ? (
          <div style="display:flex;align-items:center;justify-content:center;height:12rem;color:var(--text-secondary);">Loading...</div>
        ) : loadError.value ? (
          <div style="padding:2rem;color:#f87171;font-size:0.875rem;word-break:break-word;">Error: {loadError.value}</div>
        ) : (
          <section class="profile-main">
            <div class="form-wrapper">
              <div class="form-card">
                <div class="tab-list">
                  <button type="button" class={`tab-trigger ${activeTab.value === "profile" ? "active" : ""}`} onClick$={() => { activeTab.value = "profile"; }}>Profile Info</button>
                  <button type="button" class={`tab-trigger ${activeTab.value === "social" ? "active" : ""}`} onClick$={() => { activeTab.value = "social"; }}>Social Links</button>
                  <button type="button" class={`tab-trigger ${activeTab.value === "theme" ? "active" : ""}`} onClick$={() => { activeTab.value = "theme"; }}>Profile Theme</button>
                </div>

                {activeTab.value === "profile" ? (
                  <div class="tab-panel">
                    {basicsMessage.value && <div class={`action-message ${basicsMessage.value.type}`}>{basicsMessage.value.text}</div>}
                    <form preventdefault:submit class="form-fields" onSubmit$={async () => {
                      isRunning.value.basics = true;
                      try {
                        const cleanSlug = slug.value.trim().toLowerCase();
                        if (!cleanSlug) {
                          basicsMessage.value = { type: "error", text: "Profile handle (username) cannot be empty" };
                          isRunning.value.basics = false;
                          return;
                        }
                        if (isReservedSlug(cleanSlug)) {
                          basicsMessage.value = { type: "error", text: `'${cleanSlug}' is a reserved system handle and cannot be used` };
                          isRunning.value.basics = false;
                          return;
                        }

                        await updateProfile({
                          slug: cleanSlug,
                          title: title.value,
                          bio: bioField.value || null,
                          avatar_url: avatarUrl.value || null,
                          about: about.value || null,
                          home_page: homePage.value || null,
                        });
                        await settingsCtx.refresh();
                        basicsMessage.value = { type: "success", text: "Profile details saved" };
                        setTimeout(() => { basicsMessage.value = null; }, 3500);
                      } catch (e: any) {
                        basicsMessage.value = { type: "error", text: String(e) };
                      } finally {
                        isRunning.value.basics = false;
                      }
                    }}>
                      <div class="field-group">
                        <label class="field-label">Profile Picture</label>
                        <div class="avatar-field">
                          <div class="avatar-preview">
                            {avatarPreview.value ? <img src={avatarPreview.value} alt="Profile"  width="32" height="32" /> : <LuUser class="w-8 h-8" />}
                          </div>
                          <div class="avatar-controls">
                            <div class="avatar-row" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <input
                                class="text-input"
                                placeholder="https://"
                                value={avatarUrl.value}
                                onInput$={(e) => { avatarUrl.value = (e.target as HTMLInputElement).value; avatarPreview.value = avatarUrl.value; }}
                                style={{ flex: 1 }}
                              />
                              <button
                                type="button"
                                class="button-outlined"
                                title="Browse Media Library"
                                onClick$={() => { avatarPickerOpen.value = true; }}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "2.5rem", height: "2.5rem", padding: 0, cursor: "pointer", flexShrink: 0 }}
                              >
                                <LuFolder class="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                class="button-primary"
                                title="Upload New Media"
                                onClick$={() => { avatarUploadOpen.value = true; }}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "2.5rem", height: "2.5rem", padding: 0, cursor: "pointer", flexShrink: 0 }}
                              >
                                <LuUpload class="w-4 h-4" />
                              </button>
                            </div>
                            <p class="form-hint">Paste an image URL or choose/upload from Media Library.</p>
                          </div>
                        </div>
                      </div>

                      <div class="field-group">
                        <label class="field-label" for="slug">Profile Handle / Username *</label>
                        <div style="position:relative;display:flex;align-items:center;">
                          <span style="position:absolute;left:0.75rem;color:var(--text-secondary);font-weight:500;font-size:0.875rem;pointer-events:none;z-index:2;">@</span>
                          <input
                            id="slug"
                            class="text-input"
                            style="padding-left:2.2rem;"
                            value={slug.value}
                            onInput$={(e) => {
                              slug.value = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                            }}
                            placeholder="username"
                          />
                        </div>
                        <p class="form-hint">Your unique public profile handle (e.g. username.businesskit.io or businesskit.io/username).</p>
                      </div>

                      <div class="field-group">
                        <label class="field-label" for="title">Display Name *</label>
                        <input id="title" class="text-input" value={title.value} onInput$={(e) => { title.value = (e.target as HTMLInputElement).value; }} placeholder="Your name" />
                      </div>

                      {/* Home Page (Default View) selector with 4-table dropdown */}
                      <div class="field-group" style="position:relative;">
                        <label class="field-label" for="home_page">Home Page (Default View)</label>
                        <div style="position:relative;display:flex;align-items:center;">
                          <input
                            id="home_page"
                            class="text-input"
                            style="cursor:pointer;padding-right:2.5rem;"
                            value={selectedItemDisplay.value}
                            placeholder="Default (All Links)"
                            readOnly
                            onClick$={async () => {
                              isDropdownOpen.value = !isDropdownOpen.value;
                              if (isDropdownOpen.value) {
                                await loadDropdownData();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick$={async () => {
                              isDropdownOpen.value = !isDropdownOpen.value;
                              if (isDropdownOpen.value) {
                                await loadDropdownData();
                              }
                            }}
                            style="position:absolute;right:0.75rem;background:none;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;"
                          >
                            <LuChevronDown class="w-4 h-4" />
                          </button>
                        </div>
                        <p class="form-hint">Select the category, custom page, digital product, or shop item that loads as the default home view.</p>

                        {/* Searchable Dropdown Popover */}
                        {isDropdownOpen.value && (
                          <div
                            style="position:absolute;top:100%;left:0;right:0;z-index:50;margin-top:0.35rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 30px rgba(0,0,0,0.35);max-height:22rem;overflow-y:auto;padding:0.5rem;display:flex;flex-direction:column;gap:0.65rem;"
                          >
                            {/* Search Header */}
                            <div style="position:sticky;top:0;background:var(--surface-2);padding-bottom:0.35rem;border-bottom:1px solid var(--border);display:flex;gap:0.35rem;align-items:center;z-index:2;">
                              <LuSearch class="w-4 h-4" style="color:var(--text-secondary);margin-left:0.5rem;flex-shrink:0;" />
                              <input
                                class="text-input"
                                style="border:none;background:transparent;padding:0.4rem;font-size:0.875rem;outline:none;flex:1;"
                                placeholder="Search across 4 tables..."
                                value={homePageSearch.value}
                                onInput$={(e) => { homePageSearch.value = (e.target as HTMLInputElement).value; }}
                                autoFocus
                              />
                              {homePage.value && (
                                <button
                                  type="button"
                                  onClick$={() => {
                                    homePage.value = "";
                                    isDropdownOpen.value = false;
                                  }}
                                  style="padding:0.25rem 0.5rem;border:none;background:var(--surface-3);color:var(--text-secondary);border-radius:0.25rem;font-size:0.75rem;cursor:pointer;"
                                >
                                  Reset
                                </button>
                              )}
                            </div>

                            {/* Section 1: Categories & Links (/c/[slug]) */}
                            <div>
                              <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);padding:0.25rem 0.5rem;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:0.35rem;">
                                <LuLink class="w-3.5 h-3.5" /> Links & Categories (/c/[slug])
                              </div>
                              {filteredHomeOptions.value.categories.length > 0 ? (
                                filteredHomeOptions.value.categories.map((cat) => {
                                  const val = homePage.value.trim().toLowerCase();
                                  const isSelected = val === cat.slug.toLowerCase() || val === cat.path.toLowerCase() || (cat.slug === "all" && !val);
                                  return (
                                    <div
                                      key={cat.slug}
                                      onClick$={() => {
                                        homePage.value = cat.slug;
                                        isDropdownOpen.value = false;
                                      }}
                                      style={`display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.6rem;border-radius:0.375rem;cursor:pointer;background:${isSelected ? "rgba(99,102,241,0.22)" : "transparent"};border:${isSelected ? "1px solid #818cf8" : "1px solid transparent"};color:var(--text-primary);font-size:0.875rem;`}
                                      onMouseEnter$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
                                      onMouseLeave$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                    >
                                      <div style="display:flex;align-items:center;gap:0.5rem;">
                                        <span style={`font-weight:${isSelected ? "600" : "500"};`}>{cat.name}</span>
                                        <span style="font-size:0.75rem;color:var(--text-secondary);">{cat.path}</span>
                                        {isSelected && <LuCheck class="w-4 h-4" style="color:#818cf8;" />}
                                      </div>
                                      <span style={`font-size:0.7rem;padding:0.15rem 0.45rem;border-radius:0.25rem;background:${isSelected ? "#4f46e5" : "var(--surface-3)"};color:${isSelected ? "#ffffff" : "var(--text-secondary)"};font-weight:${isSelected ? "700" : "500"};`}>
                                        Links
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div style="font-size:0.75rem;color:var(--text-secondary);padding:0.3rem 0.5rem;font-style:italic;">No matching links or categories</div>
                              )}
                            </div>

                            {/* Section 2: Custom Pages (/[slug]) */}
                            <div>
                              <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);padding:0.25rem 0.5rem;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:0.35rem;">
                                <LuFileText class="w-3.5 h-3.5" /> Custom Pages (/[slug])
                              </div>
                              {filteredHomeOptions.value.pages.length > 0 ? (
                                filteredHomeOptions.value.pages.map((pg) => {
                                  const val = homePage.value.trim().toLowerCase();
                                  const isSelected = val === pg.slug.toLowerCase() || val === pg.path.toLowerCase();
                                  return (
                                    <div
                                      key={pg.slug}
                                      onClick$={() => {
                                        homePage.value = pg.slug;
                                        isDropdownOpen.value = false;
                                      }}
                                      style={`display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.6rem;border-radius:0.375rem;cursor:pointer;background:${isSelected ? "rgba(59,130,246,0.22)" : "transparent"};border:${isSelected ? "1px solid #60a5fa" : "1px solid transparent"};color:var(--text-primary);font-size:0.875rem;`}
                                      onMouseEnter$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
                                      onMouseLeave$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                    >
                                      <div style="display:flex;align-items:center;gap:0.5rem;">
                                        <span style={`font-weight:${isSelected ? "600" : "500"};`}>{pg.name}</span>
                                        <span style="font-size:0.75rem;color:var(--text-secondary);">{pg.path}</span>
                                        {isSelected && <LuCheck class="w-4 h-4" style="color:#60a5fa;" />}
                                      </div>
                                      <span style={`font-size:0.7rem;padding:0.15rem 0.45rem;border-radius:0.25rem;background:${isSelected ? "#2563eb" : "rgba(59,130,246,0.15)"};color:${isSelected ? "#ffffff" : "#60a5fa"};font-weight:${isSelected ? "700" : "500"};`}>
                                        Page
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div style="font-size:0.75rem;color:var(--text-secondary);padding:0.3rem 0.5rem;font-style:italic;">No custom pages found</div>
                              )}
                            </div>

                            {/* Section 3: Digital Products (/d/[slug]) */}
                            <div>
                              <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);padding:0.25rem 0.5rem;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:0.35rem;">
                                <LuFolder class="w-3.5 h-3.5" /> Digital Products (/d/[slug])
                              </div>
                              {filteredHomeOptions.value.products.length > 0 ? (
                                filteredHomeOptions.value.products.map((prod) => {
                                  const val = homePage.value.trim().toLowerCase();
                                  const isSelected = val === prod.slug.toLowerCase() || val === prod.path.toLowerCase();
                                  return (
                                    <div
                                      key={prod.slug}
                                      onClick$={() => {
                                        homePage.value = prod.slug;
                                        isDropdownOpen.value = false;
                                      }}
                                      style={`display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.6rem;border-radius:0.375rem;cursor:pointer;background:${isSelected ? "rgba(168,85,247,0.22)" : "transparent"};border:${isSelected ? "1px solid #c084fc" : "1px solid transparent"};color:var(--text-primary);font-size:0.875rem;`}
                                      onMouseEnter$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
                                      onMouseLeave$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                    >
                                      <div style="display:flex;align-items:center;gap:0.5rem;">
                                        <span style={`font-weight:${isSelected ? "600" : "500"};`}>{prod.name}</span>
                                        <span style="font-size:0.75rem;color:var(--text-secondary);">{prod.path}</span>
                                        {isSelected && <LuCheck class="w-4 h-4" style="color:#c084fc;" />}
                                      </div>
                                      <span style={`font-size:0.7rem;padding:0.15rem 0.45rem;border-radius:0.25rem;background:${isSelected ? "#9333ea" : "rgba(168,85,247,0.15)"};color:${isSelected ? "#ffffff" : "#c084fc"};font-weight:${isSelected ? "700" : "500"};`}>
                                        Digital
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div style="font-size:0.75rem;color:var(--text-secondary);padding:0.3rem 0.5rem;font-style:italic;">No digital products found</div>
                              )}
                            </div>

                            {/* Section 4: Shop Items (/p/[slug]) */}
                            <div>
                              <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);padding:0.25rem 0.5rem;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:0.35rem;">
                                <LuShoppingBag class="w-3.5 h-3.5" /> Shop Items (/p/[slug])
                              </div>
                              {filteredHomeOptions.value.shopItems.map((item) => {
                                const val = homePage.value.trim().toLowerCase();
                                const isSelected = val === item.slug.toLowerCase() || val === item.path.toLowerCase();
                                return (
                                  <div
                                    key={item.slug}
                                    onClick$={() => {
                                      homePage.value = item.slug;
                                      isDropdownOpen.value = false;
                                    }}
                                    style={`display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.6rem;border-radius:0.375rem;cursor:pointer;background:${isSelected ? "rgba(34,197,94,0.22)" : "transparent"};border:${isSelected ? "1px solid #4ade80" : "1px solid transparent"};color:var(--text-primary);font-size:0.875rem;`}
                                    onMouseEnter$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
                                    onMouseLeave$={(e: any) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                  >
                                    <div style="display:flex;align-items:center;gap:0.5rem;">
                                      <span style={`font-weight:${isSelected ? "600" : "500"};`}>{item.name}</span>
                                      <span style="font-size:0.75rem;color:var(--text-secondary);">{item.path}</span>
                                      {isSelected && <LuCheck class="w-4 h-4" style="color:#4ade80;" />}
                                    </div>
                                    <span style={`font-size:0.7rem;padding:0.15rem 0.45rem;border-radius:0.25rem;background:${isSelected ? "#16a34a" : "rgba(34,197,94,0.15)"};color:${isSelected ? "#ffffff" : "#4ade80"};font-weight:${isSelected ? "700" : "500"};`}>
                                      Shop Item
                                    </span>
                                  </div>
                                );
                              })}
                              {filteredHomeOptions.value.shopItems.length === 0 && (
                                <div style="font-size:0.75rem;color:var(--text-secondary);padding:0.3rem 0.5rem;font-style:italic;">No shop items found</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div class="field-group">
                        <label class="field-label" for="bio">Bio</label>
                        <textarea id="bio" class="text-area" rows={3} value={bioField.value} onInput$={(e) => { bioField.value = (e.target as HTMLTextAreaElement).value; }} placeholder="A short description that appears under your name." />
                        <p class="form-hint">Up to 150 characters.</p>
                      </div>

                      <div class="field-group">
                        <label class="field-label" for="about">About</label>
                        <textarea id="about" class="text-area" rows={5} value={about.value} onInput$={(e) => { about.value = (e.target as HTMLTextAreaElement).value; }} placeholder="Tell visitors more about yourself..." />
                        <p class="form-hint">This longer description lives on your public about section.</p>
                      </div>

                      <div class="form-footer">
                        <button type="submit" class="button-primary" disabled={isRunning.value.basics}>
                          <LuSave class="w-4 h-4" /> Save profile
                        </button>
                      </div>
                    </form>
                  </div>
                ) : activeTab.value === "social" ? (
                  <div class="tab-panel">
                    {socialMessage.value && <div class={`action-message ${socialMessage.value.type}`}>{socialMessage.value.text}</div>}
                    <form preventdefault:submit class="form-fields" onSubmit$={async () => {
                      isRunning.value.social = true;
                      try {
                        const arr = Object.entries(socialLinks.value)
                          .filter(([, v]) => v.trim())
                          .map(([platform, url]) => ({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), url: url.trim() }));
                        await updateProfile({ social_links: JSON.stringify(arr) });
                        await settingsCtx.refresh();
                        socialMessage.value = { type: "success", text: "Social links saved" };
                        setTimeout(() => { socialMessage.value = null; }, 3500);
                      } catch (e: any) {
                        socialMessage.value = { type: "error", text: e.message };
                      } finally {
                        isRunning.value.social = false;
                      }
                    }}>
                      <div class="social-grid two">
                        {SOCIAL_LINK_DEFINITIONS.map((def) => {
                          const Icon = SOCIAL_ICON_MAP[def.key];
                          const defKey = def.key;
                          return (
                            <div key={defKey} class="field-group">
                              <label class="field-label" for={defKey}><Icon class="icon-compact" /> {def.label}</label>
                              <input id={defKey} class="text-input" type={def.type === "text" ? "text" : def.type} value={socialLinks.value[defKey] ?? ""} placeholder={def.placeholder} onInput$={(e) => { socialLinks.value = { ...socialLinks.value, [defKey]: (e.target as HTMLInputElement).value }; }} />
                            </div>
                          );
                        })}
                      </div>
                      <div class="form-footer">
                        <button type="submit" class="button-primary" disabled={isRunning.value.social}>
                          <LuSave class="w-4 h-4" /> Save social links
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div class="tab-panel">
                    {themeMessage.value && <div class={`action-message ${themeMessage.value.type}`}>{themeMessage.value.text}</div>}
                    <form preventdefault:submit class="form-fields" onSubmit$={async () => {
                      isRunning.value.theme = true;
                      try {
                        // Backend update for theme not yet exposed in UpdateProfileData, but local state works
                        themeMessage.value = { type: "success", text: "Theme preview updated" };
                        setTimeout(() => { themeMessage.value = null; }, 3500);
                      } finally {
                        isRunning.value.theme = false;
                      }
                    }}>
                      <div class="field-inline two">
                        <div class="field-group">
                          <label class="field-label">Background Color</label>
                          <input class="text-input" value={themeForm.backgroundColor} onInput$={(e) => { themeForm.backgroundColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Card Color</label>
                          <input class="text-input" value={themeForm.cardColor} onInput$={(e) => { themeForm.cardColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                      </div>
                      <div class="field-inline two">
                        <div class="field-group">
                          <label class="field-label">Border Color</label>
                          <input class="text-input" value={themeForm.borderColor} onInput$={(e) => { themeForm.borderColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Text Color</label>
                          <input class="text-input" value={themeForm.textColor} onInput$={(e) => { themeForm.textColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                      </div>
                      <div class="field-inline two">
                        <div class="field-group">
                          <label class="field-label">Inactive Text</label>
                          <input class="text-input" value={themeForm.inactiveTextColor} onInput$={(e) => { themeForm.inactiveTextColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Button Color</label>
                          <input class="text-input" value={themeForm.buttonColor} onInput$={(e) => { themeForm.buttonColor = (e.target as HTMLInputElement).value; }} />
                        </div>
                      </div>
                      <div class="field-group">
                        <label class="field-label">Background Pattern</label>
                        <select class="select-input" value={themeForm.backgroundPattern} onChange$={(e) => { themeForm.backgroundPattern = (e.target as HTMLSelectElement).value; }}>
                          {PROFILE_THEME_PATTERNS.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div class="field-inline two">
                        <div class="field-group">
                          <label class="field-label">Heading Font</label>
                          <select class="select-input" value={themeForm.headingFont} onChange$={(e) => { themeForm.headingFont = (e.target as HTMLSelectElement).value; }}>
                            {PROFILE_THEME_FONTS.map((font) => (
                              <option key={font} value={font}>{font}</option>
                            ))}
                          </select>
                        </div>
                        <div class="field-group">
                          <label class="field-label">Body Font</label>
                          <select class="select-input" value={themeForm.bodyFont} onChange$={(e) => { themeForm.bodyFont = (e.target as HTMLSelectElement).value; }}>
                            {PROFILE_THEME_FONTS.map((font) => (
                              <option key={font} value={font}>{font}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div class="field-group">
                        <label class="field-label">Background Image URL</label>
                        <input class="text-input" value={themeForm.backgroundImageUrl} placeholder="https://cdn.example.com/background.avif" onInput$={(e) => { themeForm.backgroundImageUrl = (e.target as HTMLInputElement).value; }} />
                        <p class="form-hint">Only HTTPS .avif images up to 200KB are supported.</p>
                      </div>
                      
                      <div class="form-footer">
                        <button type="button" class="button-outlined" onClick$={() => { Object.assign(themeForm, PROFILE_THEME_DEFAULT); }}>
                          <LuRotateCcw class="w-4 h-4" /> Reset to default
                        </button>
                        <button type="submit" class="button-primary" disabled={isRunning.value.theme}>
                          <LuSave class="w-4 h-4" /> Save theme
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>

            <div style={`position:sticky; top:2.5rem; ${activeTab.value === "theme" ? Object.entries(themePreview.value.container).map(([k,v])=>`${k.replace(/([A-Z])/g,'-$1').toLowerCase()}:${v}`).join(';') : ''}`}>
              <div class="preview-card">
                <div class="preview-header">
                  <div class="preview-avatar">
                    {avatarPreview.value ? <img src={avatarPreview.value} alt="Profile"  width="32" height="32" /> : <LuUser class="w-8 h-8" />}
                  </div>
                  <h2 class="preview-username">@{slug.value || "your-username"}</h2>
                </div>
                {bioField.value && <p class="preview-bio" style="text-align: center;">{bioField.value}</p>}
                
                <div class="social-chips">
                  {socialPreview.value.map(item => (
                    <span key={item.key} class="social-chip">
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

      {/* Media Picker Modal for selecting existing avatar from library */}
      <MediaPickerModal
        open={avatarPickerOpen}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          const selectedUrl = media.url || media.local_url || "";
          if (selectedUrl) {
            avatarUrl.value = selectedUrl;
            avatarPreview.value = selectedUrl;
          }
        })}
      />

      {/* Media Upload Modal for uploading new avatar */}
      <MediaModal
        open={avatarUploadOpen}
        onUploaded$={$((media: MediaItem) => {
          const uploadedUrl = media.url || media.local_url || "";
          if (uploadedUrl) {
            avatarUrl.value = uploadedUrl;
            avatarPreview.value = uploadedUrl;
          }
        })}
      />
    </>
  );
});

export const head: DocumentHead = { title: "Profile Settings | BusinessKit" };
