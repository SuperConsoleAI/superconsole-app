// src/components/PageModal.tsx
//
// WHAT:  Create / Edit page SlideOver form for the Pages management.
//        Field structure: Title, Slug, Excerpt/SEO, Navigation switches (Nav, Menu, Footer), Published status.
//
// HOW:   Receives `editingPage` signal (null = create mode, PageRecord = edit mode).
//        On save: calls invoke('create_page') or invoke('update_page').
//
// FLOW:  open.value = true -> SlideOver slides in
//        User fills form -> clicks Save -> invoke() -> onSaved$() fires -> parent refreshes list
//        User cancels / close -> open.value = false -> SlideOver slides out

import {
  component$,
  useSignal,
  useStore,
  useTask$,
  type Signal,
  type PropFunction,
  $,
} from "@builder.io/qwik";
import { LuSave, LuLoader, LuEye, LuLayout } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import type { PageRecord } from "~/lib/types";
import { useNavigate } from "@builder.io/qwik-city";

export interface PageModalProps {
  open: Signal<boolean>;
  editingPage: Signal<PageRecord | null>;
  profileId: Signal<string | null>;
  onSaved$: PropFunction<(page: PageRecord) => void>;
}

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  nav_active: boolean;
  menu_active: boolean;
  footer_active: boolean;
  published: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  nav_active: true,
  menu_active: true,
  footer_active: true,
  published: false,
};

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: "0.75rem",
        fontWeight: "600",
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "0.875rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

export const PageModal = component$<PageModalProps>(({ open, editingPage, profileId, onSaved$ }) => {
  const form = useStore<FormState>({ ...EMPTY_FORM });
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const isEditMode = useSignal(false);
  const nav = useNavigate();

  // Sync form when editingPage changes or panel opens/closes
  useTask$(({ track }) => {
    const page = track(() => editingPage.value);
    const isOpen = track(() => open.value);

    if (!isOpen) {
      Object.assign(form, EMPTY_FORM);
      error.value = null;
      saving.value = false;
      isEditMode.value = false;
      return;
    }

    if (page) {
      isEditMode.value = true;
      form.title = page.title ?? "";
      form.slug = page.slug ?? "";
      form.excerpt = page.excerpt ?? "";
      form.nav_active = page.nav_active ?? true;
      form.menu_active = page.menu_active ?? true;
      form.footer_active = page.footer_active ?? true;
      form.published = page.published ?? false;
    } else {
      isEditMode.value = false;
      Object.assign(form, EMPTY_FORM);
    }
    error.value = null;
  });

  const handleSave$ = $(async () => {
    if (!form.title.trim() || !form.slug.trim()) {
      error.value = "Page Title and URL Slug are required.";
      return;
    }
    if (!profileId.value) {
      error.value = "No active profile — please switch profiles and try again.";
      return;
    }

    saving.value = true;
    error.value = null;

    try {
      let saved: PageRecord;

      if (isEditMode.value && editingPage.value) {
        saved = await invoke("update_page", {
          id: editingPage.value.id,
          data: {
            title: form.title.trim(),
            slug: form.slug.trim().toLowerCase(),
            excerpt: form.excerpt.trim() || null,
            nav_active: form.nav_active,
            menu_active: form.menu_active,
            footer_active: form.footer_active,
            published: form.published,
          },
        });
      } else {
        saved = await invoke("create_page", {
          data: {
            profile_id: profileId.value,
            user_id: profileId.value,
            title: form.title.trim(),
            slug: form.slug.trim().toLowerCase(),
            excerpt: form.excerpt.trim() || null,
            nav_active: form.nav_active,
            menu_active: form.menu_active,
            footer_active: form.footer_active,
            published: form.published,
          },
        });
      }

      await onSaved$(saved);
      open.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const autoGenerateSlug = $((titleText: string) => {
    if (!isEditMode.value && titleText) {
      form.slug = titleText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }
  });

  return (
    <SlideOver
      open={open}
      title={isEditMode.value ? "Edit Page Settings" : "Create New Page"}
      subtitle={isEditMode.value ? "Update page title, URL, description, and visibility settings." : "Fill in page details to create a new page."}
      width="520px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {error.value && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
              lineHeight: "1.5",
            }}
          >
            {error.value}
          </div>
        )}

        {/* Basic Details */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>
                Page Title <span style="color:var(--error);">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onInput$={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  form.title = val;
                  autoGenerateSlug(val);
                }}
                placeholder="e.g. About Us"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                URL Slug <span style="color:var(--error);">*</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onInput$={(e) => {
                  form.slug = (e.target as HTMLInputElement).value;
                }}
                placeholder="about-us"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Excerpt / Description</label>
              <textarea
                value={form.excerpt}
                onInput$={(e) => {
                  form.excerpt = (e.target as HTMLTextAreaElement).value;
                }}
                placeholder="Brief summary or description for SEO..."
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "4.5rem",
                  fontFamily: "inherit",
                  lineHeight: "1.5",
                }}
              />
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div>
          <SectionTitle>Navigation & Placement</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Nav active */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Header Navigation</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Show page link in main header nav</div>
              </div>
              <button
                type="button"
                onClick$={() => { form.nav_active = !form.nav_active; }}
                style={{
                  width: "2.75rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: form.nav_active ? "var(--accent)" : "var(--border)",
                  position: "relative",
                  transition: "background 200ms ease",
                  flexShrink: "0",
                }}
                role="switch"
                aria-checked={form.nav_active}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "0.1875rem",
                    left: form.nav_active ? "1.3125rem" : "0.1875rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    background: form.nav_active ? "var(--button-primary-text)" : "white",
                    borderRadius: "9999px",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>

            {/* Menu active */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Dropdown Menu</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Include in site dropdown menu</div>
              </div>
              <button
                type="button"
                onClick$={() => { form.menu_active = !form.menu_active; }}
                style={{
                  width: "2.75rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: form.menu_active ? "var(--accent)" : "var(--border)",
                  position: "relative",
                  transition: "background 200ms ease",
                  flexShrink: "0",
                }}
                role="switch"
                aria-checked={form.menu_active}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "0.1875rem",
                    left: form.menu_active ? "1.3125rem" : "0.1875rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    background: form.menu_active ? "var(--button-primary-text)" : "white",
                    borderRadius: "9999px",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>

            {/* Footer active */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Footer Links</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Display page link in site footer</div>
              </div>
              <button
                type="button"
                onClick$={() => { form.footer_active = !form.footer_active; }}
                style={{
                  width: "2.75rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: form.footer_active ? "var(--accent)" : "var(--border)",
                  position: "relative",
                  transition: "background 200ms ease",
                  flexShrink: "0",
                }}
                role="switch"
                aria-checked={form.footer_active}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "0.1875rem",
                    left: form.footer_active ? "1.3125rem" : "0.1875rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    background: form.footer_active ? "var(--button-primary-text)" : "white",
                    borderRadius: "9999px",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div>
          <SectionTitle>Status</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <LuEye style="width:1rem;height:1rem;color:var(--text-secondary);" />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                  Published
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Make this page publicly accessible
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick$={() => { form.published = !form.published; }}
              style={{
                width: "2.75rem",
                height: "1.5rem",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: form.published ? "var(--accent)" : "var(--border)",
                position: "relative",
                transition: "background 200ms ease",
                flexShrink: "0",
              }}
              role="switch"
              aria-checked={form.published}
            >
              <span
                style={{
                  position: "absolute",
                  top: "0.1875rem",
                  left: form.published ? "1.3125rem" : "0.1875rem",
                  width: "1.125rem",
                  height: "1.125rem",
                  background: form.published ? "var(--button-primary-text)" : "white",
                  borderRadius: "9999px",
                  transition: "left 200ms ease",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>
        </div>

        {/* Builder Option in Edit Mode */}
        {isEditMode.value && editingPage.value && (
          <div>
            <SectionTitle>Content Builder</SectionTitle>
            <button
              type="button"
              onClick$={() => {
                open.value = false;
                nav(`/dashboard/pages/edit/?id=${editingPage.value!.id}`);
              }}
              style={{
                width: "100%",
                padding: "0.625rem 1rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <LuLayout style={{ width: "1rem", height: "1rem" }} />
              Open Visual Page Builder
            </button>
          </div>
        )}

        {/* Save button */}
        <div
          style={{
            position: "sticky",
            bottom: "-1.5rem",
            margin: "0 -1.5rem -1.5rem",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick$={handleSave$}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite" }} />
                Saving…
              </>
            ) : (
              <>
                <LuSave style={{ width: "1rem", height: "1rem" }} />
                {isEditMode.value ? "Save Changes" : "Create Page"}
              </>
            )}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});

export default PageModal;
