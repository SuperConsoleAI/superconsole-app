/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { $, component$, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead, useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: [
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "new" },
      { id: "default" },
    ],
  };
};
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "~/lib/app-context";
import { designSystem } from "~/lib/design-system";
import { PageComponents } from "~/components/page/PageComponents";

const { spacing, borderRadius, typography } = designSystem;

export default component$(() => {
  useStylesScoped$(`
    .pages-container {
      padding: ${spacing.lg};
    }
    @media (max-width: 640px) {
      .pages-container {
        padding-left: 1rem;
        padding-right: 1rem;
        padding-bottom: 1rem;
      }
    }
    
    .switch-track {
      width: 32px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 2px;
      cursor: pointer;
      transition: background-color 0.2s;
      border: none;
    }
    .switch-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: white;
      transition: transform 0.2s;
    }
    
    .header-actions-row {
      display: flex;
      gap: 1rem;
      align-items: center;
    }
    .header-divider {
      width: 1px;
      height: 12px;
      background: var(--border);
    }
    
    @media (max-width: 1024px) {
      .header-actions-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }
      .header-divider {
        display: none;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: ${spacing.xs};
      margin-bottom: ${spacing.md};
    }
    .form-group label {
      font-size: ${typography.sizes.sm};
      font-weight: ${typography.weights.medium};
      color: var(--text-primary);
    }
    .form-group input, .form-group textarea {
      padding: 0.75rem 1rem;
      border: 1px solid var(--border);
      border-radius: ${borderRadius.md};
      background: var(--surface-1);
      color: var(--text-primary);
      font-family: ${typography.fontFamily};
      font-size: ${typography.sizes.sm};
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--button-primary-bg);
    }

    .btn-save {
      padding: 0.5rem 1rem;
      border-radius: ${borderRadius.md};
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text-primary);
      cursor: pointer;
      font-size: ${typography.sizes.sm};
      font-weight: ${typography.weights.medium};
    }
    .btn-save:hover { border-color: var(--text-secondary); }
    .btn-publish {
      padding: 0.5rem 1rem;
      border-radius: ${borderRadius.md};
      background: var(--button-primary-bg);
      border: none;
      color: var(--button-primary-text);
      cursor: pointer;
      font-size: ${typography.sizes.sm};
      font-weight: ${typography.weights.medium};
    }
    .btn-publish:hover { opacity: 0.9; }
  `);

  const appState = useAppContext();
  const loc = useLocation();
  const loading = useSignal(true);
  const pageId = useSignal("");
  const titleValue = useSignal("");
  const slugValue = useSignal("");
  const excerptValue = useSignal("");
  const pagePublished = useSignal(false);
  const navActive = useSignal(false);
  const menuActive = useSignal(false);
  const footerActive = useSignal(false);

  const saveStatus = useSignal<"idle" | "saving" | "saved">("idle");
  const errorMsg = useSignal("");

  // Notify Topbar of initial state and updates
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const status = track(() => saveStatus.value);
    const pub = track(() => pagePublished.value);
    const title = track(() => titleValue.value);
    
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent('page-status', { 
        detail: { 
          saveStatus: status, 
          pagePublished: !!pub,
          pageTitle: title || "Untitled Page"
        } 
      }));
    }
  });

  const visualPageContent = useSignal<SectionBlock[]>([]);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => loc.url.searchParams.get("id"));
    track(() => loc.params.id);

    // Primary: sessionStorage (set by navigation caller before nav()) — reliable across all build modes
    // Fallback: window.location.search, then loc.url.searchParams, then loc.params.id
    let pid = "";
    if (typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem("__bk_edit_page_id");
      if (stored) {
        pid = stored;
        window.sessionStorage.removeItem("__bk_edit_page_id");
      } else {
        pid = new URLSearchParams(window.location.search).get("id")
          || loc.url.searchParams.get("id")
          || (loc.params.id && !(["edit", "default", "new"].includes(loc.params.id)) ? loc.params.id : "")
          || "";
      }
    }
    pid = pid.trim();

    loading.value = true;
    try {
      let page: any = null;

      if (pid && pid !== "new") {
        page = await invoke("get_page_by_id", { id: pid }).catch(() => null);
        if (!page) {
          page = await invoke("get_page_by_slug", { slug: pid }).catch(() => null);
        }
      }
      // No fallback: if no valid pid, editor stays empty

      if (page) {
        pageId.value = page.id || pid;
        titleValue.value = page.title || "";
        slugValue.value = page.slug || "";
        excerptValue.value = page.excerpt || "";
        pagePublished.value = !!page.published;
        navActive.value = !!page.nav_active;
        menuActive.value = !!page.menu_active;
        footerActive.value = !!page.footer_active;

        if (page.sections) {
          try {
            visualPageContent.value = typeof page.sections === "string"
              ? JSON.parse(page.sections)
              : (Array.isArray(page.sections) ? page.sections : []);
          } catch (e) {
            console.error("[PageEditor] failed to parse sections:", e);
            visualPageContent.value = [];
          }
        } else {
          visualPageContent.value = [];
        }
      } else {
        pageId.value = pid === "new" ? "" : pid;
        titleValue.value = "";
        slugValue.value = "";
        excerptValue.value = "";
        visualPageContent.value = [];
      }
    } catch (err: any) {
      console.error("Failed to load page details:", err);
    } finally {
      loading.value = false;
    }
  });

  const onSave = $(async (intent: "draft" | "publish") => {
    if (!appState.activeProfileId.value) return;
    saveStatus.value = "saving";
    errorMsg.value = "";

    try {
      const data: any = {
        title: titleValue.value.trim() || "Untitled Page",
        slug: slugValue.value.trim().toLowerCase() || "page",
        excerpt: excerptValue.value.trim() || null,
        sections: JSON.stringify(visualPageContent.value),
        nav_active: navActive.value,
        menu_active: menuActive.value,
        footer_active: footerActive.value,
      };

      if (intent === "publish") {
        data.published = true;
      }

      if (pageId.value) {
        await invoke("update_page", { id: pageId.value, data });
      } else {
        data.profile_id = appState.activeProfileId.value;
        data.user_id = appState.userId?.value || "user_1";
        const newPage: any = await invoke("create_page", { data });
        if (newPage?.id) pageId.value = newPage.id;
      }

      if (intent === "publish") pagePublished.value = true;
      saveStatus.value = "saved";
      setTimeout(() => { saveStatus.value = "idle"; }, 2000);
    } catch (e: any) {
      console.error(e);
      errorMsg.value = e.toString();
      saveStatus.value = "idle";
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const handler = (e: any) => {
      onSave(e.detail as "draft" | "publish");
    };
    document.addEventListener('do-page-save', handler);
    return () => document.removeEventListener('do-page-save', handler);
  });

  const customComponents = useSignal<Record<string, CustomComponentData>>({});
  const availableCustomComponents = useSignal<{ id: string; name: string; thumbnailUrl: string | null; collection: string | null }[]>([]);

  return (
    <>
        {loading.value ? (
          <div style={{ padding: spacing.lg, textAlign: "center", color: "var(--text-secondary)" }}>
            Loading page editor...
          </div>
        ) : (
          <>
            {errorMsg.value && (
              <div style={{ marginBottom: spacing.lg }}>
                <p style={{ color: "var(--error)", fontSize: typography.sizes.sm, margin: 0 }}>
                  {errorMsg.value}
                </p>
              </div>
            )}



            <PageComponents 
              visualPageContent={visualPageContent}
              customComponents={customComponents}
              availableCustomComponents={availableCustomComponents}
            />
          </>
        )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Edit Page - BusinessKit",
};
