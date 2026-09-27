/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/PageTypesModal.tsx
//
// WHAT:  Full-screen overlay modal — enable / disable content categories for a profile.
//        Matches web PageTypesModal.tsx design exactly. "links" is always required.
//
// HOW:   Receives enabled[] (slug list) from ProfileRow.enabled_categories (JSON).
//        Local toggle state — saved via invoke('update_profile') on Save.
//        Grouped by Core / Content / Commerce / Creative / Community.
//
// RULES: No routeLoader$, no server$. Saves via updateProfile() IPC.

import { component$, useSignal, useTask$, $, type Signal, type QRL } from "@builder.io/qwik";
import {
  LuX, LuSave, LuLoader, LuLink, LuWrench, LuRocket, LuBookOpen,
  LuArchive, LuNewspaper, LuRss, LuStore, LuShoppingBag, LuSettings2,
  LuShirt, LuBriefcase, LuFilm, LuMusic, LuImage, LuCalendar,
  LuHelpCircle, LuUsers, LuUser, LuStar, LuFileText, LuList,
  LuListTree, LuLink2, LuLayout, LuLayoutGrid, LuFolder, LuMessageSquare,
  LuGraduationCap, LuMail, LuMap, LuFileSignature, LuTerminal,
  LuMessageCircle, LuCoffee, LuCalendarCheck, LuAward, LuVideo, LuMic
} from "@qwikest/icons/lucide";
import { LuSocial } from "./LuSocial";

// ── Category catalogue ────────────────────────────────────────────────────────
const REQUIRED = "links";

export const CATEGORY_GROUPS: Record<string, { slug: string; name: string; description: string; icon: any }[]> = {
  Core: [
    { slug: "all", name: "All", description: "All categories and links overview", icon: LuLayoutGrid },
    { slug: "links", name: "Links", description: "General links and bookmarks", icon: LuLink },
    { slug: "tools", name: "Tools", description: "Development tools and utilities", icon: LuWrench },
    { slug: "startups", name: "Startups", description: "Startup resources and tools", icon: LuRocket },
    { slug: "features", name: "Features", description: "Your Business Features", icon: LuStar },
    { slug: "forms", name: "Forms", description: "Fill the form", icon: LuFileText },
    { slug: "compare", name: "Compare", description: "Compare options", icon: LuList },
    { slug: "alternative", name: "Alternative", description: "List alternatives", icon: LuListTree },
    { slug: "shorturl", name: "ShortURL", description: "Shortened links and redirects", icon: LuLink2 },
    { slug: "page", name: "Pages", description: "Custom pages", icon: LuLayout },
    { slug: "featured", name: "Featured", description: "Press Release", icon: LuStar },
    { slug: "projects", name: "Projects", description: "Showcase your projects and work", icon: LuFolder },
    { slug: "testimonials", name: "Testimonials", description: "Customer testimonials and reviews", icon: LuMessageSquare },
  ],
  Content: [
    { slug: "books", name: "Books", description: "Books and reading materials", icon: LuBookOpen },
    { slug: "courses", name: "Courses", description: "Online courses and learning", icon: LuGraduationCap },
    { slug: "downloads", name: "Downloads", description: "Downloadable resources", icon: LuArchive },
    { slug: "news", name: "News", description: "News and articles", icon: LuNewspaper },
    { slug: "newsletter", name: "Newsletter", description: "Newsletter subscriptions", icon: LuMail },
    { slug: "feed", name: "Feed (Social)", description: "Social feeds and updates", icon: LuSocial },
    { slug: "docs", name: "Docs", description: "Documentation and Support", icon: LuFileText },
    { slug: "blog", name: "Blog", description: "Read the latest blog", icon: LuFileText },
    { slug: "guides", name: "Guides", description: "Share guides to your subscribers", icon: LuMap },
    { slug: "notes", name: "Notes", description: "Share Notes with audience.", icon: LuFileSignature },
    { slug: "prompt", name: "Prompt", description: "Share AI Prompts", icon: LuTerminal },
    { slug: "ai-tools", name: "AI Tools", description: "AI tools and software", icon: LuWrench },
    { slug: "subscription", name: "Subscription", description: "Subscription products and plans", icon: LuBriefcase },
    { slug: "posts", name: "Posts", description: "Short posts and updates", icon: LuMessageCircle },
  ],
  Commerce: [
    { slug: "store", name: "Store", description: "Online stores and shops", icon: LuStore },
    { slug: "shop", name: "Shop", description: "Shopping and retail", icon: LuShoppingBag },
    { slug: "gears", name: "Gears", description: "Hardware and equipment", icon: LuSettings2 },
    { slug: "wears", name: "Wears", description: "Fashion and clothing", icon: LuShirt },
    { slug: "sponsorship", name: "Sponsorship", description: "Sponsorship opportunities", icon: LuBriefcase },
    { slug: "merch", name: "Merch", description: "Merchandise and products", icon: LuShoppingBag },
    { slug: "services", name: "Services", description: "Offer Custom or On Demand Services", icon: LuBriefcase },
    { slug: "listing", name: "Listing", description: "List your items or services", icon: LuList },
    { slug: "menu", name: "Menu", description: "Food and restaurant menus", icon: LuCoffee },
    { slug: "booking", name: "Booking", description: "Bookings and reservations", icon: LuCalendarCheck },
  ],
  Creative: [
    { slug: "portfolio", name: "Portfolio", description: "Portfolio and work samples", icon: LuBriefcase },
    { slug: "movies", name: "Movies", description: "Movies and entertainment", icon: LuFilm },
    { slug: "music", name: "Music", description: "Music and audio content", icon: LuMusic },
    { slug: "gallery", name: "Gallery", description: "Images and galleries", icon: LuImage },
    { slug: "skills", name: "Skills", description: "Highlight your Skills", icon: LuAward },
    { slug: "videos", name: "Videos", description: "Video content", icon: LuVideo },
    { slug: "podcast", name: "Podcast", description: "Podcast episodes and shows", icon: LuMic },
  ],
  Community: [
    { slug: "events", name: "Events", description: "Events and conferences", icon: LuCalendar },
    { slug: "faqs", name: "FAQs", description: "Frequently asked questions", icon: LuHelpCircle },
    { slug: "groups", name: "Groups", description: "Communities and groups", icon: LuUsers },
    { slug: "about", name: "About", description: "About page section", icon: LuUser },
    { slug: "meeting", name: "1:1 Call", description: "One-on-one sessions", icon: LuUsers },
    { slug: "jobs", name: "Jobs", description: "Jobs Listing for hiring", icon: LuBriefcase },
    { slug: "community", name: "Community", description: "Join our community", icon: LuUsers },
    { slug: "webinar", name: "Webinar", description: "Webinars", icon: LuVideo },
  ],
};

const ALL_CATS = Object.values(CATEGORY_GROUPS).flat();

interface PageTypesModalProps {
  open: Signal<boolean>;
  enabled: Signal<string[]>;
  saving: Signal<boolean>;
  onSave$: QRL<(enabled: string[]) => Promise<void>>;
}

export const PageTypesModal = component$<PageTypesModalProps>(
  ({ open, enabled, saving, onSave$ }) => {
    const local = useSignal<string[]>([]);

    // Sync local selection when modal opens
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const enabledList = track(() => enabled.value);
      if (!isOpen) return;
      local.value = [...new Set([REQUIRED, ...enabledList])];
    });

    const toggle$ = $((slug: string) => {
      if (slug === REQUIRED) return;
      const cur = local.value;
      local.value = cur.includes(slug)
        ? cur.filter((s) => s !== slug)
        : [REQUIRED, ...cur.filter((s) => s !== REQUIRED), slug];
    });

    const handleSave$ = $(async () => {
      const unique = [...new Set(local.value)];
      await onSave$(unique);
    });

    const searchQuery = useSignal("");

    const handleClose$ = $(() => { open.value = false; });

    if (!open.value) return <></>;

    const totalAll = ALL_CATS.length;
    const enabledCount = local.value.length;

    return (
      /* Overlay */
      <div
        onClick$={handleClose$}
        style={{
          position: "fixed", inset: "0", zIndex: "500",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1.5rem",
          background: "rgba(11,11,18,0.5)",
          backdropFilter: "blur(6px)",
        }}
      >
        {/* Container — stop propagation */}
        <div
          onClick$={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: "62rem", maxHeight: "90vh",
            overflowY: "auto",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            borderRadius: "1rem",
            boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
            display: "flex", flexDirection: "column",
            padding: "1.5rem", gap: "1.5rem",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem", fontWeight: "600" }}>
                Page Types &amp; Apps
              </h2>
              <p style={{ margin: "0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Enable or disable content categories for your workspace ({enabledCount}/{totalAll} enabled)
              </p>
            </div>
            <button
              onClick$={handleClose$}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "2rem", height: "2rem", border: "none",
                background: "transparent", color: "var(--text-secondary)",
                cursor: "pointer", borderRadius: "0.375rem", flexShrink: "0",
              }}
              aria-label="Close"
            >
              <LuX style="width:1rem;height:1rem;" />
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none", display: "flex" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery.value}
              onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
              style={{
                width: "100%", padding: "0.625rem 1rem 0.625rem 2.5rem",
                background: "var(--field-fill)", border: "1px solid var(--border)",
                borderRadius: "0.5rem", color: "var(--text-primary)",
                fontSize: "0.875rem", outline: "none", boxSizing: "border-box"
              }}
            />
          </div>

          {/* Groups */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {Object.entries(CATEGORY_GROUPS).map(([groupName, originalItems]) => {
              const items = originalItems.filter(c =>
                c.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                c.slug.toLowerCase().includes(searchQuery.value.toLowerCase())
              );

              if (items.length === 0) return null;

              const enabledInGroup = items.filter((c) => local.value.includes(c.slug)).length;
              return (
                <section key={groupName}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {groupName}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {enabledInGroup}/{items.length} enabled
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "0.75rem" }}>
                    {items.map((cat) => {
                      const isEnabled = local.value.includes(cat.slug);
                      const isRequired = cat.slug === REQUIRED;
                      return (
                        <div
                          key={cat.slug}
                          style={{
                            display: "flex", flexDirection: "column", gap: "0.5rem",
                            padding: "0.875rem",
                            borderRadius: "0.75rem",
                            border: isEnabled ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: "var(--surface-2)",
                            boxShadow: isEnabled ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                            transition: "border-color 150ms ease, box-shadow 150ms ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "500", fontSize: "0.875rem" }}>
                              <cat.icon style="width:1.1rem;height:1.1rem;color:var(--accent);flex-shrink:0;" stroke-width="1.5" />
                              <span style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)" }}>
                                {cat.name}
                              </span>
                              {isRequired && (
                                <span style={{
                                  fontSize: "0.625rem", fontWeight: "600", padding: "0.1rem 0.4rem",
                                  borderRadius: "9999px", border: "1px solid var(--border)",
                                  color: "var(--text-secondary)", textTransform: "uppercase",
                                }}>
                                  Required
                                </span>
                              )}
                            </div>
                            {/* Toggle switch */}
                            <button
                              type="button"
                              onClick$={() => toggle$(cat.slug)}
                              disabled={isRequired || saving.value}
                              style={{
                                position: "relative", width: "2.75rem", height: "1.5rem",
                                borderRadius: "9999px", border: "none",
                                background: isEnabled ? "var(--accent)" : "var(--muted)",
                                cursor: isRequired ? "not-allowed" : "pointer",
                                opacity: isRequired ? "0.6" : "1",
                                transition: "background 200ms ease", flexShrink: "0",
                                display: "inline-flex", alignItems: "center", justifyContent: "flex-start", padding: "0",
                              }}
                              role="switch"
                              aria-checked={isEnabled}
                            >
                              <span style={{
                                position: "absolute", top: "50%", left: "0.15rem",
                                width: "1.2rem", height: "1.2rem",
                                borderRadius: "9999px",
                                background: "var(--surface-2)",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                                transform: isEnabled ? "translate(1.2rem,-50%)" : "translate(0,-50%)",
                                transition: "transform 200ms ease",
                              }} />
                            </button>
                          </div>
                          {cat.description && (
                            <p style={{ margin: "0", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                              {cat.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Footer */}
          <footer style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: "1rem", borderTop: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {enabledCount} of {totalAll} page types enabled
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick$={handleClose$}
                disabled={saving.value}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "0 1.25rem", height: "2.375rem",
                  borderRadius: "0.375rem", border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-secondary)",
                  fontWeight: "500", fontSize: "0.875rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick$={handleSave$}
                disabled={saving.value}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  gap: "0.5rem", padding: "0 1.25rem", height: "2.375rem",
                  borderRadius: "0.375rem", border: "none",
                  background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
                  fontWeight: "600", fontSize: "0.875rem", cursor: saving.value ? "not-allowed" : "pointer",
                  opacity: saving.value ? "0.7" : "1",
                }}
              >
                {saving.value
                  ? <><LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" /> Saving…</>
                  : <><LuSave style="width:0.875rem;height:0.875rem;" /> Save Page Settings</>
                }
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  }
);
