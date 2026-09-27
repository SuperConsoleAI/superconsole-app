/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { $, component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import { type DocumentHead, useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import AppSidebar from "~/components/app/AppSidebar";
import AppTopbar from "~/components/app/AppTopbar";
import { useAppContext } from "~/lib/app-context";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius, shadows, typography } = designSystem;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-_]{1,60}$/i;

export default component$(() => {
  useStylesScoped$(`
    .page-new-layout {
      display: flex;
      min-height: 100vh;
      background: var(--surface-1);
    }
    .page-new-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .page-new-content {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 4rem 2rem;
      overflow-y: auto;
    }
    .page-new-card {
      width: 100%;
      max-width: 500px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: ${borderRadius.lg};
      padding: ${spacing.xl};
      box-shadow: ${shadows.sm};
      display: flex;
      flex-direction: column;
      gap: ${spacing.lg};
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: ${spacing.xs};
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
      transition: border-color 0.2s ease;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--button-primary-bg);
    }
    .submit-btn {
      padding: 0.75rem 1.5rem;
      background: var(--button-primary-bg);
      color: var(--button-primary-text);
      border: none;
      border-radius: ${borderRadius.md};
      font-weight: ${typography.weights.medium};
      font-size: ${typography.sizes.sm};
      cursor: pointer;
      transition: opacity 0.2s ease;
    }
    .submit-btn:hover {
      opacity: 0.9;
    }
    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `);

  const appState = useAppContext();
  const nav = useNavigate();
  
  const title = useSignal("");
  const slug = useSignal("");
  const excerpt = useSignal("");
  const submitting = useSignal(false);
  const errorMsg = useSignal("");
  const fieldErrors = useSignal<{title?: string; slug?: string}>({});

  const onSubmit = $(async () => {
    if (!appState.activeProfileId) return;

    errorMsg.value = "";
    fieldErrors.value = {};
    
    const t = title.value.trim();
    const s = slug.value.trim().toLowerCase();
    
    if (!t) {
      fieldErrors.value = { ...fieldErrors.value, title: "Title is required" };
      return;
    }
    if (!s || !SLUG_PATTERN.test(s)) {
      fieldErrors.value = { ...fieldErrors.value, slug: "Use letters, numbers, dash or underscore (2-61 chars)" };
      return;
    }

    submitting.value = true;
    try {
      const activeProfile = appState.profiles.value.find(p => p.id === appState.activeProfileId.value);
      const page: any = await invoke("create_page", {
        data: {
          profile_id: appState.activeProfileId.value,
          user_id: activeProfile?.user_id ?? "",
          title: t,
          slug: s,
          excerpt: excerpt.value.trim() || null,
          nav_active: true,
          menu_active: true,
          footer_active: true,
          published: false,
          sections: "[]"
        }
      });
      nav(`/dashboard/pages/edit/?id=${page.id}`);
    } catch (err: any) {
      console.error(err);
      if (err.includes("UNIQUE constraint failed: pages.slug")) {
        fieldErrors.value = { ...fieldErrors.value, slug: "Slug already exists" };
      } else {
        errorMsg.value = err.toString();
      }
    } finally {
      submitting.value = false;
    }
  });

  return (
    <div class="page-new-layout">
      <AppSidebar />
      <div class="page-new-main">
        <AppTopbar title="Create New Page" />
        <div class="page-new-content">
          <form class="page-new-card" preventdefault:submit onSubmit$={onSubmit}>
            <div>
              <h1 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, margin: `0 0 ${spacing.xs} 0`, color: "var(--text-primary)" }}>
                Create New Page
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: typography.sizes.sm, margin: 0 }}>
                Start a blank page. You can add content blocks in the next step.
              </p>
            </div>

            {errorMsg.value && (
              <div style={{ color: "var(--error)", fontSize: typography.sizes.sm }}>{errorMsg.value}</div>
            )}

            <div class="form-group">
              <label for="title">Page Title</label>
              <input type="text" id="title" bind:value={title} placeholder="e.g. My Awesome Guide" required />
              {fieldErrors.value.title && (
                <span style={{ color: "var(--error)", fontSize: typography.sizes.xs }}>{fieldErrors.value.title}</span>
              )}
            </div>

            <div class="form-group">
              <label for="slug">URL Slug</label>
              <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                <span style={{ color: "var(--text-secondary)", fontSize: typography.sizes.sm }}>domain.com/{appState.activeProfile?.slug ?? "profile"}/p/</span>
                <input type="text" id="slug" bind:value={slug} placeholder="awesome-guide" required style={{ flex: 1 }} />
              </div>
              {fieldErrors.value.slug && (
                <span style={{ color: "var(--error)", fontSize: typography.sizes.xs }}>{fieldErrors.value.slug}</span>
              )}
            </div>

            <div class="form-group">
              <label for="excerpt">Excerpt / SEO Description</label>
              <textarea id="excerpt" bind:value={excerpt} rows={3} placeholder="Brief description of this page..." />
            </div>

            <button type="submit" class="submit-btn" disabled={submitting.value}>
              {submitting.value ? "Creating..." : "Create & Edit"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Create New Page - BusinessKit",
};
