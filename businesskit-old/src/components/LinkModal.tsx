/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/LinkModal.tsx
//
// WHAT:  Create / Edit link SlideOver form for the Profile Links page.
//        Field structure sourced from: businesskit-web/src/lib/links-service.ts → Link interface.
//        This is a fresh Tauri-native implementation — NOT copied from the 36KB web LinkModal.
//
// HOW:   Receives `editingLink` signal (null = create mode, LinkRow = edit mode).
//        On save: calls invoke('create_link') or invoke('update_link') directly.
//        Sections: Basic → Media → Commerce → Metadata → Visibility.
//        All field saves gate on required title + url before submitting.
//
// FLOW:
//   open.value = true → SlideOver slides in
//   User fills form → clicks Save → invoke() → onSaved$() fires → parent refreshes list
//   User cancels / × → open.value = false → SlideOver slides out
//
// RULES: No routeLoader$, no server$, no fetch() — invoke() IPC only.
//        Icons are never passed as props (Qwik serialization error) — rendered inline only.

import {
  component$,
  useSignal,
  useStore,
  useTask$,
  type Signal,
  type QRL,
  type PropFunction,
  $,
  useComputed$,
} from "@builder.io/qwik";
import {
  LuEye,
  LuEyeOff,
  LuSave,
  LuLoader,
  LuFolder,
  LuUpload,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { createLink, updateLink } from "~/lib/ipc";
import type { LinkRow } from "~/lib/types";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

// ── Category list ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "links", label: "Links" },
  { value: "books", label: "Books" },
  { value: "courses", label: "Courses" },
  { value: "downloads", label: "Downloads" },
  { value: "events", label: "Events" },
  { value: "faqs", label: "FAQs" },
  { value: "feed", label: "Feed" },
  { value: "gallery", label: "Gallery" },
  { value: "groups", label: "Groups" },
  { value: "movies", label: "Movies" },
  { value: "music", label: "Music" },
  { value: "news", label: "News" },
  { value: "newsletter", label: "Newsletter" },
  { value: "portfolio", label: "Portfolio" },
  { value: "projects", label: "Projects" },
  { value: "shop", label: "Shop" },
  { value: "store", label: "Store" },
  { value: "tools", label: "Tools" },
  { value: "testimonials", label: "Testimonials" },
  { value: "listing", label: "Listing" },
  { value: "menu", label: "Menu" },
];
const COMMERCE_CATEGORY_SLUGS = new Set(["shop", "store", "gears", "wears", "events", "downloads", "courses"]);
const LOGO_CATEGORY_SLUGS = new Set(["startups", "featured", "links", "tools"]);
const HIDE_IMAGE_URL_SLUGS = new Set(["links", "tools"]);
const HIDE_LOGO_FIELD_SLUGS = new Set(["feed"]);
const FEED_CATEGORY_SLUG = "feed";
const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "snapchat", label: "Snapchat" },
  { value: "threads", label: "Threads" },
  { value: "reddit", label: "Reddit" },
  { value: "spotify", label: "Spotify" },
];

export interface LinkModalProps {
  open: Signal<boolean>;
  editingLink: Signal<LinkRow | null>;
  profileId: Signal<string | null>;
  activeCategory?: string;
  onSaved$: PropFunction<(link: LinkRow) => void>;
}

interface FormState {
  title: string;
  url: string;
  description: string;
  category_id: string;
  image_url: string;
  logo_url: string;
  video_url: string;
  keywords: string;
  platform_name: string;
  button_text: string;
  location: string;
  date: string;
  sale_price: string;
  price: string;
  is_active: boolean;
  hidden_from_profile: boolean;
  post_url: string[];
}

const EMPTY_FORM: FormState = {
  title: "",
  url: "",
  description: "",
  category_id: "links",
  image_url: "",
  logo_url: "",
  video_url: "",
  keywords: "",
  platform_name: "",
  button_text: "",
  location: "",
  date: "",
  sale_price: "",
  price: "",
  is_active: true,
  hidden_from_profile: false,
  post_url: ["", "", "", ""],
};

// ── Shared styles ────────────────────────────────────────────────────────────

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

// ── Main component ───────────────────────────────────────────────────────────

export const LinkModal = component$<LinkModalProps>(({ open, editingLink, profileId, activeCategory, onSaved$ }) => {
  const form = useStore<FormState>({ ...EMPTY_FORM });
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const isEditMode = useSignal(false);

  const mediaPickerOpen = useSignal(false);
  const mediaUploadOpen = useSignal(false);
  const activeTargetCallback = useSignal<((url: string) => void) | null>(null);

  const isCommerceCategory = useComputed$(() => COMMERCE_CATEGORY_SLUGS.has(form.category_id));
  const showLogoField = useComputed$(() => {
    const cat = form.category_id || activeCategory || "";
    if (HIDE_LOGO_FIELD_SLUGS.has(cat)) return false;
    if (form.logo_url && form.logo_url.trim()) return true;
    return LOGO_CATEGORY_SLUGS.has(cat) || cat === "featured";
  });
  const hideImageUrl = useComputed$(() => {
    const cat = form.category_id || activeCategory || "";
    if (form.image_url && form.image_url.trim()) return false;
    return HIDE_IMAGE_URL_SLUGS.has(cat);
  });
  const isFeedCategory = useComputed$(() => form.category_id === FEED_CATEGORY_SLUG);

  const currentCategoryLabel = useComputed$(() => {
    if (form.category_id === "all" || !form.category_id) return "Link";
    const cat = CATEGORIES.find(c => c.value === form.category_id);
    return cat ? cat.label : "Link";
  });

  // Sync form when editingLink changes or panel opens/closes
  useTask$(({ track }) => {
    const link = track(() => editingLink.value);
    const isOpen = track(() => open.value);

    if (!isOpen) {
      Object.assign(form, EMPTY_FORM);
      error.value = null;
      saving.value = false;
      isEditMode.value = false;
      return;
    }

    if (link) {
      isEditMode.value = true;
      form.title = link.title ?? "";
      form.url = link.url ?? "";
      form.description = link.description ?? "";
      form.category_id = link.category_id || activeCategory || "links";
      form.image_url = link.image_url ?? "";
      form.logo_url = link.logo_url ?? "";
      form.video_url = "";
      form.keywords = link.keywords ?? "";
      form.platform_name = link.platform_name ?? "";
      form.button_text = link.button_text ?? "";
      form.location = link.location ?? "";
      form.date = link.date ?? "";
      form.sale_price = link.sale_price ?? "";
      form.price = link.price ?? "";
      form.is_active = link.is_active ?? true;
      form.hidden_from_profile = link.hidden_from_profile ?? false;
      form.post_url = link.post_url ? [...link.post_url, "", "", "", ""].slice(0, 4) : ["", "", "", ""];
    } else {
      isEditMode.value = false;
      Object.assign(form, EMPTY_FORM);
      form.category_id = activeCategory && activeCategory !== "all" ? activeCategory : "links";
    }
    error.value = null;
  });

  const handleSave$ = $(async () => {
    if (!form.title.trim() || !form.url.trim()) {
      error.value = "Title and URL are required.";
      return;
    }
    if (!profileId.value) {
      error.value = "No active profile — please switch profiles and try again.";
      return;
    }

    saving.value = true;
    error.value = null;

    try {
      let saved: LinkRow;

      if (isEditMode.value && editingLink.value) {
        saved = await updateLink(editingLink.value.id, {
          title: form.title.trim() || null,
          url: form.url.trim() || null,
          description: form.description.trim() || null,
          image_url: form.image_url.trim() || null,
          logo_url: form.logo_url.trim() || null,
          video_url: form.video_url.trim() || null,
          order_index: editingLink.value.order_index,
          is_active: form.is_active,
          keywords: form.keywords.trim() || null,
          platform_name: form.platform_name.trim() || null,
          slug: null,
          post_url: form.post_url.filter((u) => u.trim() !== "").length > 0 ? form.post_url.filter((u) => u.trim() !== "") : null,
          sale_price: form.sale_price.trim() || null,
          price: form.price.trim() || null,
          button_text: form.button_text.trim() || null,
          location: form.location.trim() || null,
          date: form.date.trim() || null,
        });
      } else {
        saved = await createLink({
          profile_id: profileId.value,
          category_id: form.category_id,
          title: form.title.trim(),
          url: form.url.trim(),
          description: form.description.trim() || null,
          image_url: form.image_url.trim() || null,
          logo_url: form.logo_url.trim() || null,
          keywords: form.keywords.trim() || null,
          platform_name: form.platform_name.trim() || null,
          slug: null,
          post_url: form.post_url.filter((u) => u.trim() !== "").length > 0 ? form.post_url.filter((u) => u.trim() !== "") : null,
          sale_price: form.sale_price.trim() || null,
          price: form.price.trim() || null,
          button_text: form.button_text.trim() || null,
          location: form.location.trim() || null,
          date: form.date.trim() || null,
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

  return (
    <SlideOver
      open={open}
      title={isEditMode.value ? `Edit ${currentCategoryLabel.value}` : `Add ${currentCategoryLabel.value}`}
      subtitle={isEditMode.value ? "Update the details below and save." : "Fill in the details below to add a new link."}
      width="520px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* ── Error banner ─────────────────────────────────────────────── */}
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

        {/* ═══ Section 1 — Basic ═══════════════════════════════════════ */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div>
              <label style={labelStyle}>
                Title <span style="color:var(--error);">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onInput$={(e) => { form.title = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. My Course"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                URL <span style="color:var(--error);">*</span>
              </label>
              <input
                type="url"
                value={form.url}
                onInput$={(e) => { form.url = (e.target as HTMLInputElement).value; }}
                placeholder="https://..."
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onInput$={(e) => { form.description = (e.target as HTMLTextAreaElement).value; }}
                placeholder="Short description shown on the profile…"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "5rem",
                  fontFamily: "inherit",
                  lineHeight: "1.5",
                }}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={form.category_id}
                onChange$={(e) => { form.category_id = (e.target as HTMLSelectElement).value; }}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0.75rem center",
                  paddingRight: "2.25rem",
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ═══ Section 2 — Media ══════════════════════════════════════ */}
        {(!hideImageUrl.value || showLogoField.value || isFeedCategory.value) && (
        <div>
          <SectionTitle>Media</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {!hideImageUrl.value && (
            <div>
              <label style={labelStyle}>Cover / Thumbnail URL</label>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="url"
                  value={form.image_url}
                  onInput$={(e) => { form.image_url = (e.target as HTMLInputElement).value; }}
                  placeholder="https://…"
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
                <button
                  type="button"
                  title="Browse Media Library"
                  onClick$={() => {
                    activeTargetCallback.value = (url: string) => { form.image_url = url; };
                    mediaPickerOpen.value = true;
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.25rem",
                    height: "2.25rem",
                    padding: "0",
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuFolder style="width:1rem;height:1rem;" />
                </button>
                <button
                  type="button"
                  title="Upload New Media"
                  onClick$={() => {
                    activeTargetCallback.value = (url: string) => { form.image_url = url; };
                    mediaUploadOpen.value = true;
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.25rem",
                    height: "2.25rem",
                    padding: "0",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuUpload style="width:1rem;height:1rem;" />
                </button>
              </div>
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Preview"
                  width="400"
                  height="128"
                  style={{
                    marginTop: "0.5rem",
                    width: "100%",
                    height: "8rem",
                    objectFit: "cover",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                  }}
                  onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            )}

            {showLogoField.value && (
            <div>
              <label style={labelStyle}>Logo / Icon URL</label>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="url"
                  value={form.logo_url}
                  onInput$={(e) => { form.logo_url = (e.target as HTMLInputElement).value; }}
                  placeholder="https://…"
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
                <button
                  type="button"
                  title="Browse Media Library"
                  onClick$={() => {
                    activeTargetCallback.value = (url: string) => { form.logo_url = url; };
                    mediaPickerOpen.value = true;
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.25rem",
                    height: "2.25rem",
                    padding: "0",
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuFolder style="width:1rem;height:1rem;" />
                </button>
                <button
                  type="button"
                  title="Upload New Media"
                  onClick$={() => {
                    activeTargetCallback.value = (url: string) => { form.logo_url = url; };
                    mediaUploadOpen.value = true;
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.25rem",
                    height: "2.25rem",
                    padding: "0",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuUpload style="width:1rem;height:1rem;" />
                </button>
              </div>
              {form.logo_url && (
                <div style={{ marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <img
                    src={form.logo_url}
                    alt="Logo preview"
                    width="32"
                    height="32"
                    style={{ width: "2rem", height: "2rem", objectFit: "contain", borderRadius: "0.25rem", border: "1px solid var(--border)", background: "var(--surface-2)" }}
                    onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>
                    {form.logo_url}
                  </span>
                </div>
              )}
            </div>
            )}

            <div>
              <label style={labelStyle}>Video URL</label>
              <input
                type="url"
                value={form.video_url}
                onInput$={(e) => { form.video_url = (e.target as HTMLInputElement).value; }}
                placeholder="https://youtube.com/…"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>
        </div>
        )}

        {/* ═══ Section 3 — Commerce ═══════════════════════════════════ */}
        {isCommerceCategory.value && (
        <div>
          <SectionTitle>Commerce</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: "1" }}>
                <label style={labelStyle}>Price</label>
                <input
                  type="text"
                  value={form.price}
                  onInput$={(e) => { form.price = (e.target as HTMLInputElement).value; }}
                  placeholder="e.g. $49"
                  style={inputStyle}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
              </div>
              <div style={{ flex: "1" }}>
                <label style={labelStyle}>Sale Price</label>
                <input
                  type="text"
                  value={form.sale_price}
                  onInput$={(e) => { form.sale_price = (e.target as HTMLInputElement).value; }}
                  placeholder="e.g. $29"
                  style={inputStyle}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Button Text</label>
              <input
                type="text"
                value={form.button_text}
                onInput$={(e) => { form.button_text = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Buy Now, Learn More…"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>
        </div>
        )}

        {/* ═══ Section 4 — Metadata ═══════════════════════════════════ */}
        <div>
          <SectionTitle>Metadata</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div>
              <label style={labelStyle}>Keywords</label>
              <input
                type="text"
                value={form.keywords}
                onInput$={(e) => { form.keywords = (e.target as HTMLInputElement).value; }}
                placeholder="comma-separated, e.g. course, beginner, react"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            {isFeedCategory.value && (
            <>
              <div>
                <label style={labelStyle}>
                  Social Platform *
                  {form.platform_name === "linkedin" && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                      (Paste embed iframe code)
                    </span>
                  )}
                </label>
                <select
                  value={form.platform_name}
                  onChange$={(e) => { form.platform_name = (e.target as HTMLSelectElement).value; }}
                  style={inputStyle}
                  required
                >
                  <option value="">Select a platform</option>
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <option key={platform.value} value={platform.value}>
                      {platform.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Choose the social media platform for your feed.</div>
              </div>
              
              <div>
                <label style={labelStyle}>
                  {form.platform_name === "linkedin" ? "Embed Code / URN (Max 4)" : "Post URLs (Max 4)"}
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[0, 1, 2, 3].map((index) => (
                    <input
                      key={`post-url-${index}`}
                      type={form.platform_name === "linkedin" ? "text" : "url"}
                      value={form.post_url[index] || ""}
                      onInput$={(e) => {
                        const newUrls = [...form.post_url];
                        newUrls[index] = (e.target as HTMLInputElement).value;
                        form.post_url = newUrls;
                      }}
                      placeholder={form.platform_name === "linkedin" ? `Embed code / URN ${index + 1}` : `Post URL ${index + 1}`}
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  {form.platform_name === "linkedin" 
                    ? "Paste LinkedIn embed iframe code or URN (e.g., urn:li:share:123456789)." 
                    : "Paste social media post URLs (we'll extract the IDs automatically)."}
                </div>
              </div>
            </>
            )}

            {form.category_id === "events" && (
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: "1" }}>
                <label style={labelStyle}>Location</label>
                <input
                  type="text"
                  value={form.location}
                  onInput$={(e) => { form.location = (e.target as HTMLInputElement).value; }}
                  placeholder="City, Country"
                  style={inputStyle}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
              </div>
              <div style={{ flex: "1" }}>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onInput$={(e) => { form.date = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
              </div>
            </div>
            )}
          </div>
        </div>

        {/* ═══ Section 5 — Visibility ══════════════════════════════════ */}
        <div>
          <SectionTitle>Visibility</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            {/* Active toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <LuEye style="width:1rem;height:1rem;color:var(--text-secondary);" stroke-width="1" />
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                    Active
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Show this link on your profile
                  </div>
                </div>
              </div>
              <button
                onClick$={() => { form.is_active = !form.is_active; }}
                style={{
                  width: "2.75rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: form.is_active ? "var(--accent)" : "var(--border)",
                  position: "relative",
                  transition: "background 200ms ease",
                  flexShrink: "0",
                }}
                role="switch"
                aria-checked={form.is_active}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "0.1875rem",
                    left: form.is_active ? "1.3125rem" : "0.1875rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    background: form.is_active ? "var(--button-primary-text)" : "white",
                    borderRadius: "9999px",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>

            {/* Hidden from profile toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <LuEyeOff style="width:1rem;height:1rem;color:var(--text-secondary);" stroke-width="1" />
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                    Hidden from profile
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Accessible via URL but not listed publicly
                  </div>
                </div>
              </div>
              <button
                onClick$={() => { form.hidden_from_profile = !form.hidden_from_profile; }}
                style={{
                  width: "2.75rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: form.hidden_from_profile ? "var(--accent)" : "var(--border)",
                  position: "relative",
                  transition: "background 200ms ease",
                  flexShrink: "0",
                }}
                role="switch"
                aria-checked={form.hidden_from_profile}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "0.1875rem",
                    left: form.hidden_from_profile ? "1.3125rem" : "0.1875rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    background: form.hidden_from_profile ? "var(--button-primary-text)" : "white",
                    borderRadius: "9999px",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* ── Save button ───────────────────────────────────────────────── */}
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
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Saving…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                {isEditMode.value ? "Save Changes" : `Add ${currentCategoryLabel.value}`}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Media Picker Modal for browsing library */}
      <MediaPickerModal
        open={mediaPickerOpen}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          const selectedUrl = media.url || media.local_url || "";
          if (activeTargetCallback.value && selectedUrl) {
            activeTargetCallback.value(selectedUrl);
          }
        })}
      />

      {/* Media Upload Modal for uploading file */}
      <MediaModal
        open={mediaUploadOpen}
        onUploaded$={$((media: MediaItem) => {
          const uploadedUrl = media.url || media.local_url || "";
          if (activeTargetCallback.value && uploadedUrl) {
            activeTargetCallback.value(uploadedUrl);
          }
        })}
      />
    </SlideOver>
  );
});
