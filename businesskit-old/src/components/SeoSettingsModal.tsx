// src/components/SeoSettingsModal.tsx
//
// WHAT:  SEO settings overlay modal — configure og_title, og_description,
//        og_image, robots directive for the active profile/category page.
//        Matches web SeoSettingsModal.tsx design pixel-for-pixel.
//
// HOW:   Reads initial values from SettingsRow (already fetched by page).
//        Saves via onSave$() callback — page decides which service to call.
//        "Block Indexing" toggle auto-syncs robots directive.
//
// FLOW:
//   open.value = true → modal renders
//   User edits → Submit → onSave$(SeoFormData) → page calls updatePageSettings()
//   close → open.value = false

import { component$, useSignal, useTask$, $, type Signal, type QRL } from "@builder.io/qwik";
import { LuX, LuSave, LuLoader } from "@qwikest/icons/lucide";
import type { SettingsRow } from "~/lib/types";
export type SeoFormData = Omit<import("~/lib/types").UpsertSettingsData, "profile_id">;

interface SeoSettingsModalProps {
  open: Signal<boolean>;
  profileTitle: string;
  initialValues: Signal<import("~/lib/types").LinkPageRow | SettingsRow | null>;
  saving: Signal<boolean>;
  onSave$: QRL<(data: any) => Promise<void>>;
}

export const SeoSettingsModal = component$<SeoSettingsModalProps>(
  ({ open, profileTitle, initialValues, saving, onSave$ }) => {

    const title       = useSignal("");
    const description = useSignal("");
    const ogImage     = useSignal("");
    const imageInput  = useSignal("");
    const robots      = useSignal("index, follow");
    const blockIdx    = useSignal(false);
    const errors      = useSignal<{ title?: string }>({});

    // Populate / reset on open
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const iv     = track(() => initialValues.value);
      if (!isOpen) return;

      const ivAny = iv as any;
      title.value       = ivAny?.seo_title ?? ivAny?.og_title ?? `${profileTitle} Links`;
      description.value = ivAny?.seo_description ?? ivAny?.og_description ?? "";
      ogImage.value     = ivAny?.seo_og_image ?? ivAny?.og_image ?? "";
      imageInput.value  = ivAny?.seo_og_image ?? ivAny?.og_image ?? "";
      const r           = (ivAny?.seo_robots ?? ivAny?.robots ?? "index, follow").trim() || "index, follow";
      robots.value      = r;
      blockIdx.value    = r.toLowerCase().includes("noindex");
      errors.value      = {};
    });

    const toggleBlock$ = $(() => {
      const next     = !blockIdx.value;
      blockIdx.value = next;
      if (next  && robots.value.toLowerCase() === "index, follow")   robots.value = "noindex, nofollow";
      if (!next && robots.value.toLowerCase() === "noindex, nofollow") robots.value = "index, follow";
    });

    const handleSubmit$ = $(async () => {
      if (!title.value.trim()) { errors.value = { title: "Title is required." }; return; }
      errors.value = {};
      await onSave$({
        og_title:        title.value.trim(),
        seo_title:       title.value.trim(),
        og_description:  description.value.trim(),
        seo_description: description.value.trim(),
        og_image:        ogImage.value.trim(),
        seo_og_image:    ogImage.value.trim(),
        robots:          robots.value.trim() || "index, follow",
        seo_robots:      robots.value.trim() || "index, follow",
        seo_block_indexing: blockIdx.value ? 1 : 0,
      });
    });

    const close$ = $(() => { open.value = false; });

    const inp = "width:100%;box-sizing:border-box;padding:0.5rem 0.75rem;border-radius:0.375rem;border:1px solid var(--border);background:var(--field-fill);color:var(--text-primary);font-size:0.875rem;outline:none;";
    const lbl = "font-size:0.8125rem;font-weight:500;color:var(--text-secondary);display:block;margin-bottom:0.375rem;";
    const hlp = "font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;";
    const btnBase = "display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;padding:0 1.25rem;height:2.375rem;border-radius:0.375rem;font-weight:500;font-size:0.875rem;cursor:pointer;";

    if (!open.value) return <></>;

    return (
      <div onClick$={close$} style="position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(11,11,18,0.5);backdrop-filter:blur(4px);">
        <div onClick$={(e) => e.stopPropagation()} style="width:100%;max-width:40rem;max-height:90vh;overflow-y:auto;background:var(--surface-2);color:var(--text-primary);border-radius:0.75rem;box-shadow:0 24px 60px rgba(0,0,0,0.28);display:flex;flex-direction:column;padding:1.5rem;gap:1.5rem;">

          {/* Header */}
          <div style="display:flex;align-items:flex-start;justify-content:space-between;">
            <div>
              <div style="font-size:1rem;font-weight:600;margin:0 0 0.25rem;">SEO Settings · {profileTitle}</div>
              <p style="margin:0;font-size:0.8125rem;color:var(--text-secondary);">Configure how this page appears in search engines and social previews.</p>
            </div>
            <button onClick$={close$} style="display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;border-radius:0.375rem;" aria-label="Close">
              <LuX style="width:1rem;height:1rem;" />
            </button>
          </div>

          <form preventdefault:submit onSubmit$={handleSubmit$} style="display:flex;flex-direction:column;gap:1.25rem;">

            {/* Block indexing toggle */}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.875rem 1rem;border-radius:0.375rem;border:1px solid var(--border);background:var(--surface-3);">
              <div>
                <div style="font-size:0.875rem;font-weight:500;">Block Search Engine Indexing</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.125rem;">When enabled, search engines are advised not to index this page.</div>
              </div>
              <button type="button" role="switch" aria-checked={blockIdx.value} onClick$={toggleBlock$}
                style={`position:relative;width:2.5rem;height:1.4rem;border-radius:9999px;background:${blockIdx.value ? "var(--accent)" : "var(--border)"};border:none;padding:0;display:inline-flex;align-items:center;cursor:pointer;flex-shrink:0;transition:background 200ms ease;`}>
                <span style={`position:absolute;top:0.15rem;left:0.15rem;width:1.1rem;height:1.1rem;border-radius:9999px;background:${blockIdx.value ? "var(--button-primary-text)" : "#fff"};box-shadow:0 1px 3px rgba(0,0,0,.2);transform:${blockIdx.value ? "translateX(1.1rem)" : "translateX(0)"};transition:transform 200ms ease;`} />
              </button>
            </div>

            {/* Page title */}
            <div>
              <label for="seo-title" style={lbl}>Page Title <span style="color:var(--error);">*</span></label>
              <input id="seo-title" type="text" value={title.value}
                onInput$={(e) => { title.value = (e.target as HTMLInputElement).value; }}
                placeholder={`${profileTitle} - Profile`}
                style={`${inp}${errors.value.title ? ";border-color:var(--error);" : ""}`} />
              {errors.value.title && <span style="color:var(--error);font-size:0.75rem;">{errors.value.title}</span>}
              <span style={hlp}>Use a concise, descriptive title for search engines.</span>
            </div>

            {/* Description */}
            <div>
              <label for="seo-desc" style={lbl}>Page Description</label>
              <textarea id="seo-desc" value={description.value}
                onInput$={(e) => { description.value = (e.target as HTMLTextAreaElement).value; }}
                placeholder="Introduce the links available on this page."
                style={`${inp}min-height:7.5rem;resize:vertical;font-family:inherit;line-height:1.5;`} />
              <span style={hlp}>150–160 characters work best for search snippets.</span>
            </div>

            {/* Robots */}
            <div>
              <label for="seo-robots" style={lbl}>Robots Directive</label>
              <input id="seo-robots" type="text" value={robots.value}
                onInput$={(e) => { robots.value = (e.target as HTMLInputElement).value; }}
                placeholder="index, follow" style={inp} />
              <span style={hlp}>Common: "index, follow" or "noindex, nofollow".</span>
            </div>

            {/* OG image */}
            <div>
              <label for="seo-og" style={lbl}>Open Graph Image URL</label>
              <input id="seo-og" type="url" value={imageInput.value}
                onInput$={(e) => { const v = (e.target as HTMLInputElement).value; imageInput.value = v; ogImage.value = v.trim(); }}
                placeholder="https://example.com/preview.jpg" style={inp} />
              {ogImage.value && (
                <div style="position:relative;margin-top:0.5rem;border:1px solid var(--border);border-radius:0.375rem;overflow:hidden;">
                  <img src={ogImage.value} alt="OG preview" width="1200" height="630" style="width:100%;height:10rem;object-fit:cover;display:block;"
                    onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <button type="button" onClick$={() => { ogImage.value = ""; imageInput.value = ""; }}
                    style="position:absolute;top:0.5rem;right:0.5rem;padding:0.25rem 0.5rem;font-size:0.75rem;border:1px solid var(--border);border-radius:0.25rem;background:var(--surface-2);color:var(--text-secondary);cursor:pointer;">
                    Remove
                  </button>
                </div>
              )}
              <span style={hlp}>Recommended: 1200×630px.</span>
            </div>

            {/* Footer */}
            <div style="display:flex;justify-content:flex-end;gap:0.5rem;padding-top:0.25rem;">
              <button type="button" onClick$={close$} disabled={saving.value}
                style={`${btnBase}border:1px solid var(--border);background:var(--surface-3);color:var(--text-primary);`}>
                Cancel
              </button>
              <button type="submit" disabled={saving.value}
                style={`${btnBase}border:none;background:var(--button-primary-bg);color:var(--button-primary-text);font-weight:600;opacity:${saving.value ? "0.7" : "1"};`}>
                {saving.value
                  ? <><LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" /> Saving…</>
                  : <><LuSave style="width:0.875rem;height:0.875rem;" /> Save Settings</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);
