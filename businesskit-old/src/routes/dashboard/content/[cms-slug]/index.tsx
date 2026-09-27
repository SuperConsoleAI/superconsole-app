import { component$, useSignal, $, useContext, useComputed$, useStylesScoped$ } from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";
import { LuSearch, LuRefreshCw, LuPlus } from "@qwikest/icons/lucide";

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: [
      { "cms-slug": "blog" },
      { "cms-slug": "n" },
      { "cms-slug": "notes" },
      { "cms-slug": "docs" },
      { "cms-slug": "directory" },
      { "cms-slug": "articles" },
      { "cms-slug": "guides" },
      { "cms-slug": "skills" },
      { "cms-slug": "prompt" },
      { "cms-slug": "compare" },
      { "cms-slug": "alternative" },
      { "cms-slug": "posts" },
      { "cms-slug": "tools" },
      { "cms-slug": "links" },
      { "cms-slug": "listing" },
      { "cms-slug": "booking" },
      { "cms-slug": "services" },
      { "cms-slug": "courses" },
      { "cms-slug": "sponsorship" },
      { "cms-slug": "downloads" },
      { "cms-slug": "events" },
      { "cms-slug": "meetings" },
      { "cms-slug": "webinars" },
      { "cms-slug": "community" },
      { "cms-slug": "page" },
      { "cms-slug": "videos" },
      { "cms-slug": "podcast" },
      { "cms-slug": "membership" },
      { "cms-slug": "subscription" },
      { "cms-slug": "ai-tools" },
      { "cms-slug": "store" },
      { "cms-slug": "forms" },
      { "cms-slug": "jobs" },
      { "cms-slug": "subscribers" },
    ],
  };
};
import { designSystem } from "~/lib/design-system";
import { ProductTable, type ProductItem } from "~/components/ProductTable";
import { publishContent, unpublishContent, deleteContent, createContent, updateContent, createCollection, listContent } from "~/lib/ipc";
import { ArticleForm } from "~/components/ArticleForm";
import { ArticleModal } from "~/components/ArticleModal";
import { useAppContext } from "~/lib/app-context";
import { ContentContext } from "../layout";
import type { ContentRow, CmsRow } from "~/lib/types";

const { spacing } = designSystem;

type ContentFilter = "all" | "today" | "published" | "draft" | "secret";

const STYLES = `
  .cms-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .cms-toggle {
    display: flex;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 36px;
    box-sizing: border-box;
    align-items: center;
    flex-shrink: 0;
  }
  .cms-tab {
    padding: 0 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    text-decoration: none;
  }
  .cms-tab.active {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    font-weight: 600;
  }
  .cms-tab.inactive {
    background: transparent;
    color: var(--text-secondary);
  }
  .cms-tab.inactive:hover {
    color: var(--text-primary);
  }
  .cms-badge {
    border-radius: 0.9rem;
    padding: 0 0.35rem;
    font-size: 0.65rem;
    font-weight: 700;
    min-width: 1rem;
    text-align: center;
    line-height: 1.4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cms-search-add {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }
  .cms-search-wrap {
    position: relative;
    flex: 1;
    max-width: 22rem;
    min-width: 8rem;
  }
  @keyframes cms-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .cms-refresh-btn {
    height: 2.25rem;
    width: 2.25rem;
    padding: 0;
    border-radius: 0.375rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .cms-refresh-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }
  .cms-refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .cms-refresh-spinning {
    animation: cms-spin 0.8s linear infinite;
  }
  .cms-add-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
    border-radius: 0.375rem;
    padding: 0 1rem;
    height: 2.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition: opacity 0.15s;
  }
  .cms-add-btn:hover {
    opacity: 0.9;
  }
  .cms-btn-suffix {
    display: inline;
  }
  .cms-filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  @media (max-width: 768px) {
    .cms-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.625rem;
    }
    .cms-filter-group {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .cms-toggle {
      flex: 1;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .cms-tab {
      flex: 1;
      padding: 0 0.5rem;
      font-size: 0.75rem;
      gap: 0.25rem;
    }
    .cms-search-add {
      width: 100%;
      justify-content: stretch;
    }
    .cms-search-wrap {
      max-width: 100%;
    }
    .cms-btn-suffix {
      display: none;
    }
    .cms-add-btn {
      padding: 0 0.75rem;
    }
  }
`;

function isCreatedToday(createdAt?: string | number) {
  if (!createdAt) return false;
  let d: Date;
  if (typeof createdAt === "number") {
    d = new Date(createdAt > 1e11 ? createdAt : createdAt * 1000);
  } else {
    d = new Date(createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) {
      d = new Date(createdAt);
    }
  }
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default component$(() => {
  useStylesScoped$(STYLES);

  const loc = useLocation();
  const slug = loc.params["cms-slug"];
  
  const app = useAppContext();
  const state = useContext(ContentContext);
  
  const cmsHub = useComputed$<CmsRow | null>(() => {
    return state.hubs.find(h => h.slug === slug) || null;
  });

  const filter = useSignal<ContentFilter>("all");
  const search = useSignal("");
  const isRefreshing = useSignal(false);

  const todayCount = useComputed$(() => {
    if (!cmsHub.value) return 0;
    return state.contentItems.filter(
      (r) => r.cms_id === cmsHub.value!.id && isCreatedToday(r.created_at)
    ).length;
  });

  const contentItems = useComputed$<ProductItem[]>(() => {
    if (!cmsHub.value) return [];
    let items = state.contentItems.filter((r) => r.cms_id === cmsHub.value!.id);
    switch (filter.value) {
      case "today":
        items = items.filter((r) => isCreatedToday(r.created_at));
        break;
      case "published":
        items = items.filter((r) => r.published === 1);
        break;
      case "draft":
        items = items.filter((r) => r.published === 0);
        break;
      case "secret":
        items = items.filter((r) => r.hidden === 1);
        break;
      case "all":
      default:
        break;
    }
    return items.map((r: ContentRow) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      published: r.published === 1,
    }));
  });

  const handleRefresh = $(async () => {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      const freshContent = await listContent();
      if (freshContent) {
        state.contentItems = freshContent;
      }
    } catch (e) {
      console.error("[Content] refresh failed:", e);
    } finally {
      setTimeout(() => {
        isRefreshing.value = false;
      }, 300);
    }
  });
  
  // Track currently edited/created content
  const editingContentId = useSignal<string | null>(null);
  const isCreating = useSignal(false);

  // Track article preview popup modal
  const viewingArticle = useSignal<ContentRow | null>(null);
  const isViewModalOpen = useSignal(false);
  
  // Form signals
  const formTitle = useSignal("");
  const formSlug = useSignal("");
  const formExcerpt = useSignal("");
  const formContent = useSignal("");
  const formHeroImageUrl = useSignal("");
  const formCtaButtonText = useSignal("");
  const formCtaButtonUrl = useSignal("");
  const formPublished = useSignal(false);
  const formSecret = useSignal(false);
  const formHideAuthor = useSignal(false);
  const formImageAdsEnabled = useSignal(false);
  const formImageAdsImageUrl = useSignal("");
  const formImageAdsText = useSignal("");
  const formImageAdsUrl = useSignal("");
  const formCollectionId = useSignal("");
  const formMediaId = useSignal("");
  const formAdditionalDetails = useSignal<any[]>([]);
  const isFormOpen = useSignal(false);
  const isSaving = useSignal(false);

  const handleView = $((id: string) => {
    const item = state.contentItems.find((c) => c.id === id);
    if (item) {
      viewingArticle.value = item;
      isViewModalOpen.value = true;
    }
  });

  const handleEdit = $(async (id: string) => {
    editingContentId.value = id;
    
    // Find the item in our local state to hydrate the form
    const item = state.contentItems.find(c => c.id === id);
    if (item) {
      formTitle.value = item.title || "";
      formSlug.value = item.slug || "";
      formContent.value = item.content || "";
      formExcerpt.value = item.excerpt || "";
      formHeroImageUrl.value = item.hero_image_url || "";
      formMediaId.value = item.media_id || "";
      formCtaButtonUrl.value = item.cta_button_url || "";
      formCtaButtonText.value = item.cta_button_text || "";
      formPublished.value = item.published === 1;
      formSecret.value = item.hidden === 1;
      formCollectionId.value = item.collection_id || "";
      formHideAuthor.value = item.hide_author === 1;
      
      try {
        if (item.additional_details) {
          formAdditionalDetails.value = JSON.parse(item.additional_details);
        } else {
          formAdditionalDetails.value = [];
        }
      } catch {
        formAdditionalDetails.value = [];
      }
      
      if (item.image_ads) {
        try {
          const ads = JSON.parse(item.image_ads);
          formImageAdsEnabled.value = true;
          formImageAdsImageUrl.value = ads.imageUrl || "";
          formImageAdsText.value = ads.text || "";
          formImageAdsUrl.value = ads.url || "";
        } catch {
          formImageAdsEnabled.value = false;
        }
      } else {
        formImageAdsEnabled.value = false;
        formImageAdsImageUrl.value = "";
        formImageAdsText.value = "";
        formImageAdsUrl.value = "";
      }
      isFormOpen.value = true;
    }
  });

  const handleDelete = $(async (id: string) => {
    const ok = confirm("Delete this item? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteContent(id);
      await state.refresh();
    } catch {
      alert("Failed to delete content");
    }
  });

  const handleToggleStatus = $(async (id: string, published: boolean) => {
    try {
      if (published) {
        await publishContent(id);
      } else {
        await unpublishContent(id);
      }
      await state.refresh();
    } catch {
      alert("Failed to update status");
    }
  });

  if (state.error) {
    return (
      <div style="padding: 2rem; color: var(--error);">
        Failed to load content context: {state.error}
      </div>
    );
  }

  if (state.loading && state.hubs.length === 0) {
    return (
      <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1;">
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
    );
  }


  if (!cmsHub.value) {
    return (
      <div style="padding: 2rem;">
        CMS Hub not found for {slug}
      </div>
    );
  }

  return (
    <div style={`display:flex;flex-direction:column;gap:${spacing.lg};flex:1;background:var(--surface-1);`}>
      {/* ── Toolbar: [Filter Toggle & Refresh] + [Search & New Action Group] ─── */}
      <div class="cms-toolbar">
        {/* Filter Toggle & Refresh Button */}
        <div class="cms-filter-group">
          <div class="cms-toggle">
            <button
              type="button"
              class={`cms-tab ${filter.value === "all" ? "active" : "inactive"}`}
              onClick$={() => { filter.value = "all"; }}
            >
              All
            </button>

            <button
              type="button"
              class={`cms-tab ${filter.value === "today" ? "active" : "inactive"}`}
              onClick$={() => { filter.value = "today"; }}
            >
              Today
              <span
                class="cms-badge"
                style={{
                  background: todayCount.value > 0 ? "var(--button-primary-bg, var(--accent))" : "rgba(128,128,128,0.2)",
                  color: todayCount.value > 0 ? "var(--button-primary-text)" : "var(--text-secondary)",
                }}
              >
                {todayCount.value}
              </span>
            </button>

            <button
              type="button"
              class={`cms-tab ${filter.value === "published" ? "active" : "inactive"}`}
              onClick$={() => { filter.value = "published"; }}
            >
              Published
            </button>

            <button
              type="button"
              class={`cms-tab ${filter.value === "draft" ? "active" : "inactive"}`}
              onClick$={() => { filter.value = "draft"; }}
            >
              Draft
            </button>

            <button
              type="button"
              class={`cms-tab ${filter.value === "secret" ? "active" : "inactive"}`}
              onClick$={() => { filter.value = "secret"; }}
            >
              Secret
            </button>
          </div>

          <button
            type="button"
            onClick$={handleRefresh}
            disabled={isRefreshing.value}
            class="cms-refresh-btn"
            title={`Refresh ${cmsHub.value.title.toLowerCase()}`}
            aria-label="Refresh content"
          >
            <LuRefreshCw
              style="width: 0.9375rem; height: 0.9375rem;"
              class={isRefreshing.value ? "cms-refresh-spinning" : ""}
            />
          </button>
        </div>

        {/* Search Bar + New Content Button in same div */}
        <div class="cms-search-add">
          <div class="cms-search-wrap">
            <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none", display: "flex" }}>
              <LuSearch style="width: 0.875rem; height: 0.875rem;" />
            </span>
            <input
              type="search"
              placeholder={`Search ${cmsHub.value.title.toLowerCase()}...`}
              value={search.value}
              onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
              style={{
                width: "100%",
                height: "2.25rem",
                paddingLeft: "2rem",
                paddingRight: "0.75rem",
                background: "var(--field-fill)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                outline: "none",
                boxSizing: "border-box" as const,
              }}
            />
          </div>

          <button
            type="button"
            class="cms-add-btn"
            onClick$={$(() => {
               formTitle.value = "";
               formSlug.value = "";
               formExcerpt.value = "";
               formContent.value = "";
               isCreating.value = true;
               isFormOpen.value = true;
            })}
          >
            <LuPlus style="width: 1rem; height: 1rem;" />
            <span>New <span class="cms-btn-suffix">{cmsHub.value.title}</span></span>
          </button>
        </div>
      </div>

      <ProductTable
        products={contentItems}
        profileSlug={cmsHub.value.profile_id}
        pathPrefix={`/${slug}/`}
        showPrice={false}
        showSales={false}
        showAnalytics={false}
        hideToolbar={true}
        externalSearchQuery={search}
        onView$={handleView}
        onRowClick$={$((item: ProductItem) => handleView(item.id))}
        onEdit$={handleEdit}
        onDelete$={handleDelete}
        onToggleStatus$={handleToggleStatus}
      />

      <ArticleForm
          title={formTitle}
          slug={formSlug}
          excerpt={formExcerpt}
          content={formContent}
          heroImageUrl={formHeroImageUrl}
          mediaId={formMediaId}
          ctaButtonText={formCtaButtonText}
          ctaButtonUrl={formCtaButtonUrl}
          published={formPublished}
          secret={formSecret}
          hideAuthor={formHideAuthor}
          imageAdsEnabled={formImageAdsEnabled}
          imageAdsImageUrl={formImageAdsImageUrl}
          imageAdsText={formImageAdsText}
          imageAdsUrl={formImageAdsUrl}
          collectionId={formCollectionId}
          collections={{ value: state.collections } as any}
          additionalDetails={formAdditionalDetails}
          isEditing={!!editingContentId.value}
          isSaving={isSaving.value}
          isOpen={isFormOpen}
          entityLabel={cmsHub.value.title}
          contentId={editingContentId.value}
          onSave$={$(async () => {
             if (!cmsHub.value) return;
             isSaving.value = true;
             const adsPayload = formImageAdsEnabled.value 
               ? JSON.stringify({ imageUrl: formImageAdsImageUrl.value, text: formImageAdsText.value, url: formImageAdsUrl.value })
               : undefined;
               
             const baseData = {
               title: formTitle.value,
               slug: formSlug.value || formTitle.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
               content: formContent.value,
               excerpt: formExcerpt.value,
               hero_image_url: formHeroImageUrl.value,
               media_id: formMediaId.value || undefined,
               cta_button_url: formCtaButtonUrl.value,
               cta_button_text: formCtaButtonText.value,
               additional_details: JSON.stringify(formAdditionalDetails.value),
               published: formPublished.value ? 1 : 0,
               hidden: formSecret.value ? 1 : 0,
               collection_id: formCollectionId.value || undefined,
               hide_author: formHideAuthor.value ? 1 : 0,
               image_ads: adsPayload
             };

             try {
               const activeProfile = app.profiles.value.find(p => p.id === app.activeProfileId.value);
               const userId = activeProfile?.user_id || "system";
               
               if (editingContentId.value) {
                 await updateContent(editingContentId.value, baseData);
               } else {
                 await createContent({ cms_id: cmsHub.value.id, user_id: userId, category_id: cmsHub.value.category_id || undefined, ...baseData });
               }
               await state.refresh();
               isCreating.value = false;
               isFormOpen.value = false;
               editingContentId.value = null;
             } catch (e) {
               alert("Failed to save content");
               console.error(e);
             } finally {
               isSaving.value = false;
             }
          })}
          onCancel$={$(() => {
             isFormOpen.value = false;
             setTimeout(() => {
               editingContentId.value = null;
               isCreating.value = false;
             }, 300);
          })}
          onCreateCollection$={$(async (colData) => {
             try {
               const res = await createCollection(colData);
               return res;
             } catch (e) {
               console.error("Failed to create collection:", e);
               alert("Failed to create collection");
               return null;
             }
          })}
        />

      <ArticleModal
        open={isViewModalOpen}
        article={viewingArticle}
        cmsTitle={cmsHub.value.title}
        cmsSlug={slug}
        profileSlug={cmsHub.value.profile_id}
        onEdit$={handleEdit}
        onSaveContent$={$(async (id: string, updatedContent: string, updatedTitle?: string) => {
          const updatePayload: { content: string; title?: string } = { content: updatedContent };
          if (updatedTitle) {
            updatePayload.title = updatedTitle;
          }
          await updateContent(id, updatePayload);
          if (viewingArticle.value && viewingArticle.value.id === id) {
            viewingArticle.value = {
              ...viewingArticle.value,
              content: updatedContent,
              ...(updatedTitle ? { title: updatedTitle } : {}),
            };
          }
          await state.refresh();
        })}
        onClose$={$(() => {
          isViewModalOpen.value = false;
          viewingArticle.value = null;
        })}
      />
    </div>
  );
});
