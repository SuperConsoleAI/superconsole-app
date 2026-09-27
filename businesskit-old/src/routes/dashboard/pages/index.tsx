/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { $, component$, useComputed$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuHighlighter, LuSettings } from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { designSystem } from "~/lib/design-system";
import { ProductTable, type ProductItem } from "~/components/ProductTable";
import { PageModal } from "~/components/page/PageModal";
import type { PageRecord } from "~/lib/types";

const { spacing, borderRadius, typography } = designSystem;

export default component$(() => {
  const nav = useNavigate();
  const appState = useAppContext();
  const pagesData = useSignal<PageRecord[]>([]);
  const loading = useSignal(true);

  const isModalOpen = useSignal(false);
  const editingPage = useSignal<PageRecord | null>(null);

  const fetchPages = $(async () => {
    loading.value = true;
    try {
      const res = await invoke("get_pages_by_profile");
      pagesData.value = res as PageRecord[];
    } catch (e) {
      console.error("Failed to fetch pages", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => appState.activeProfileId);
    if (appState.activeProfileId) {
      fetchPages();
    }
  });

  const pageRows = useComputed$<ProductItem[]>(() => {
    return pagesData.value.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      excerpt: page.excerpt,
      published: page.published,
      seo_og_image: page.seo_og_image,
    }));
  });

  const deletePage = $(async (id: string) => {
    const ok = typeof window === "undefined" ? true : window.confirm("Delete this page? This cannot be undone.");
    if (!ok) return;
    try {
      await invoke("delete_page", { id });
      pagesData.value = pagesData.value.filter((item) => item.id !== id);
    } catch (e) {
      console.error("Failed to delete page", e);
    }
  });

  const toggleStatus = $(async (id: string, isActive: boolean) => {
    try {
      await invoke("update_page", { id, data: { published: isActive } });
      pagesData.value = pagesData.value.map(p => p.id === id ? { ...p, published: isActive } : p);
    } catch (e) {
      console.error("Failed to update page status", e);
    }
  });

  const openEditModal = $((page: PageRecord) => {
    editingPage.value = page;
    isModalOpen.value = true;
  });

  return (
    <div>
      {loading.value ? (
        <div style={{ padding: spacing.lg, color: "var(--text-secondary)", textAlign: "center" }}>
          Loading pages...
        </div>
      ) : pageRows.value.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick$={() => {
                editingPage.value = null;
                isModalOpen.value = true;
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: spacing.xs,
                height: "2rem",
                padding: `0 ${spacing.md}`,
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                borderRadius: borderRadius.md,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: "pointer",
                border: "none",
              }}
            >
              New Page
            </button>
          </div>
          <div style={{ padding: spacing.lg, color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: borderRadius.lg, textAlign: "center" }}>
            No pages yet. Create your first page.
          </div>
        </div>
      ) : (
        <ProductTable
          products={pageRows}
          profileSlug={appState.activeProfile?.slug ?? ""}
          pathPrefix="/"
          searchPlaceholder="Search pages..."
          onEdit$={$((id: string) => {
            const match = pagesData.value.find((p) => p.id === id);
            if (match) openEditModal(match);
          })}
          onRowClick$={$((item: ProductItem) => {
            const match = pagesData.value.find((p) => p.id === item.id);
            if (match) openEditModal(match);
          })}
          onDelete$={deletePage}
          onToggleStatus$={toggleStatus}
          extraActions$={$((item: ProductItem) => (
            <>
              <button
                type="button"
                onClick$={() => {
                  window.sessionStorage.setItem("__bk_edit_page_id", item.id);
                  nav(`/dashboard/pages/default/edit/`);
                }}
                title="Open Visual Builder"
                style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);"
              >
                <LuHighlighter style="width: 1rem; height: 1rem;" />
              </button>
              <button
                type="button"
                onClick$={() => {
                  const match = pagesData.value.find((p) => p.id === item.id);
                  if (match) openEditModal(match);
                }}
                title="Page Settings"
                style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);"
              >
                <LuSettings style="width: 1rem; height: 1rem;" />
              </button>
            </>
          ))}
          showPrice={false}
          showSales={false}
          showStatus={true}
          showEdit={false}
          showDelete={true}
          showView={true}
        >
          <button
            q:slot="headerActions"
            type="button"
            onClick$={() => {
              editingPage.value = null;
              isModalOpen.value = true;
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: spacing.xs,
              height: "2rem",
              padding: `0 ${spacing.md}`,
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              borderRadius: borderRadius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: "pointer",
              border: "none",
              whiteSpace: "nowrap",
            }}
          >
            New Page
          </button>
        </ProductTable>
      )}

      <PageModal
        open={isModalOpen}
        editingPage={editingPage}
        profileId={appState.activeProfileId}
        onSaved$={$(() => {
          fetchPages();
        })}
      />
    </div>
  );
});
