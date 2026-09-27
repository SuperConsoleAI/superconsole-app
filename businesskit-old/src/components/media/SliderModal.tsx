// src/components/media/SliderModal.tsx
//
// WHAT: Slider Creator / Editor Modal.
//       Supports destination provider selection (Cloudflare R2 vs Webflow Assets),
//       format conversion (.AVIF default / .WebP / Original), batch multi-file upload,
//       media library selection, and slide reordering.

import {
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  LuSave,
  LuImage,
  LuTrash2,
  LuLoader,
  LuArrowUp,
  LuArrowDown,
  LuUpload,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { invoke } from "@tauri-apps/api/core";
import { type Slider } from "./SliderPickerModal";

import { svg as cloudflareSvg } from "thesvg/cloudflare";
import { svg as webflowSvg } from "thesvg/webflow";

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');

export interface SliderModalProps {
  open: Signal<boolean>;
  editingSlider?: Slider | null;
  onSaved$: PropFunction<(slider: Slider) => void>;
}

interface SlideItemState {
  id: string;
  media_id?: string;
  media_url?: string;
  caption?: string;
  link?: string;
}

export const SliderModal = component$<SliderModalProps>(({ open, editingSlider, onSaved$ }) => {
  const title = useSignal("");
  const slides = useStore<{ items: SlideItemState[] }>({ items: [] });
  const saving = useSignal(false);
  const uploading = useSignal(false);
  const uploadMsg = useSignal("");
  const error = useSignal<string | null>(null);
  const isEdit = useSignal(false);

  // Storage provider signal: 'r2' (default) | 'webflow'
  const storageProvider = useSignal<"r2" | "webflow">("r2");
  const r2Connected = useSignal(false);
  const webflowConnected = useSignal(false);

  // Format selection signal: 'avif' (default) | 'webp' | 'original'
  const convertFormat = useSignal<"avif" | "webp" | "original">("avif");

  const mediaPickerOpen = useSignal(false);

  const checkStatus = $(async () => {
    try {
      const r2Cfg = await invoke<{ is_configured: boolean }>("media_get_r2_config");
      r2Connected.value = r2Cfg.is_configured;
    } catch {
      /* storage not configured */
    }
    try {
      const wfCfg = await invoke<{ is_configured: boolean }>("media_get_webflow_config");
      webflowConnected.value = wfCfg.is_configured;
      if (!r2Connected.value && wfCfg.is_configured) {
        storageProvider.value = "webflow";
      }
    } catch {
      /* storage not configured */
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => open.value);
    if (isOpen) {
      error.value = null;
      uploading.value = false;
      saving.value = false;
      checkStatus();

      if (editingSlider) {
        isEdit.value = true;
        title.value = editingSlider.title;
        slides.items = editingSlider.items.map((it) => ({
          id: it.id || String(Math.random()),
          media_id: it.media_id,
          media_url: it.media_url,
          caption: it.caption || "",
          link: it.link || "",
        }));
      } else {
        isEdit.value = false;
        title.value = "";
        slides.items = [];
      }
    }
  });

  // Upload Multiple Files Action
  const handlePickMultipleFiles = $(async (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    if (storageProvider.value === "r2" && !r2Connected.value) {
      error.value = "Cloudflare R2 is not connected. Please configure R2 in Settings → Connections first.";
      return;
    }
    if (storageProvider.value === "webflow" && !webflowConnected.value) {
      error.value = "Webflow is not connected. Please configure Webflow token & Site ID in Settings → Connections first.";
      return;
    }

    uploading.value = true;
    error.value = null;

    try {
      const fileList = Array.from(files);
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        uploadMsg.value = `Uploading file ${i + 1} of ${fileList.length} (${file.name}) to ${storageProvider.value.toUpperCase()}...`;

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string) || "");
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });

        const created = await invoke<MediaItem>("media_create", {
          data: {
            filename: file.name,
            url: dataUrl,
            file_type: "image",
            mime_type: file.type,
            size_bytes: file.size,
            target_format: convertFormat.value,
            storage_provider: storageProvider.value,
          },
        });

        slides.items.push({
          id: String(Math.random()),
          media_id: created.id,
          media_url: created.url,
          caption: "",
          link: "",
        });
      }
    } catch (err) {
      error.value = String(err);
    } finally {
      uploading.value = false;
      uploadMsg.value = "";
    }
  });

  const moveSlide = $((index: number, direction: -1 | 1) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= slides.items.length) return;
    const temp = slides.items[index];
    slides.items[index] = slides.items[newIdx];
    slides.items[newIdx] = temp;
  });

  const removeSlide = $((index: number) => {
    slides.items.splice(index, 1);
  });

  const handleSave$ = $(async () => {
    if (!title.value.trim()) {
      error.value = "Slider title is required.";
      return;
    }
    if (slides.items.length === 0) {
      error.value = "Please add at least one image slide.";
      return;
    }

    saving.value = true;
    error.value = null;

    try {
      const itemsPayload = slides.items.map((s) => ({
        media_id: s.media_id || null,
        media_url: s.media_url || null,
        caption: s.caption?.trim() || null,
        link: s.link?.trim() || null,
      }));

      let savedSlider: Slider;
      if (isEdit.value && editingSlider?.id) {
        savedSlider = await invoke<Slider>("sliders_update", {
          sliderId: editingSlider.id,
          data: {
            title: title.value.trim(),
            items: itemsPayload,
          },
        });
      } else {
        savedSlider = await invoke<Slider>("sliders_create", {
          data: {
            title: title.value.trim(),
            items: itemsPayload,
          },
        });
      }

      await onSaved$(savedSlider);
      open.value = false;
    } catch (err) {
      error.value = String(err);
    } finally {
      saving.value = false;
    }
  });

  return (
    <>
      <SlideOver open={open} title={isEdit.value ? "Edit Slider Gallery" : "Create Slider Gallery"} subtitle="Upload multiple images for product carousels." width="560px">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* Slider Title */}
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Slider Title / Name <span style={{ color: "var(--error)" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Product Main Gallery / Hero Banner"
              value={title.value}
              onInput$={(e) => { title.value = (e.target as HTMLInputElement).value; }}
              style={{
                width: "100%",
                height: "2.375rem",
                padding: "0 0.75rem",
                background: "var(--field-fill)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
          </div>

          {/* Storage Destination Provider Selector (Cloudflare R2 vs Webflow Assets) */}
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Destination Storage Provider
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
              <button
                type="button"
                onClick$={() => { storageProvider.value = "r2"; }}
                style={{
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: storageProvider.value === "r2" ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: storageProvider.value === "r2" ? "var(--surface-3)" : "var(--surface-2)",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="slider_storage"
                  checked={storageProvider.value === "r2"}
                  onChange$={() => { storageProvider.value = "r2"; }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <div style={{ width: "1.25rem", height: "1.25rem", flexShrink: 0 }} dangerouslySetInnerHTML={wrapIcon(cloudflareSvg)} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: "600" }}>Cloudflare R2</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {r2Connected.value ? "Connected" : "Not connected"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick$={() => { storageProvider.value = "webflow"; }}
                style={{
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: storageProvider.value === "webflow" ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: storageProvider.value === "webflow" ? "var(--surface-3)" : "var(--surface-2)",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="slider_storage"
                  checked={storageProvider.value === "webflow"}
                  onChange$={() => { storageProvider.value = "webflow"; }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <div style={{ width: "1.25rem", height: "1.25rem", flexShrink: 0 }} dangerouslySetInnerHTML={wrapIcon(webflowSvg)} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: "600" }}>Webflow Assets</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {webflowConnected.value ? "Connected" : "Not connected"}
                  </div>
                </div>
              </button>
            </div>

            {/* Missing Provider Warning */}
            {((storageProvider.value === "r2" && !r2Connected.value) ||
              (storageProvider.value === "webflow" && !webflowConnected.value)) && (
                <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--error)" }}>
                    {storageProvider.value === "r2" ? "Cloudflare R2 is not connected." : "Webflow API token & site ID are not connected."}
                  </span>
                  <Link
                    href={storageProvider.value === "webflow" ? "/dashboard/settings/connections/" : "/dashboard/settings/credentials/"}
                    style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", textDecoration: "underline" }}
                  >
                    Connect in Settings →
                  </Link>
                </div>
              )}
          </div>

          {/* Format Conversion Options (.AVIF default vs .WebP vs Original / No Compression) */}
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Upload Image Optimization Format
            </label>
            <div style={{ display: "flex", gap: "1rem", background: "var(--field-fill)", padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="slider_format"
                  checked={convertFormat.value === "avif"}
                  onChange$={() => { convertFormat.value = "avif"; }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <span style={{ fontWeight: convertFormat.value === "avif" ? "600" : "400" }}>.AVIF</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>(Default, ~90%)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="slider_format"
                  checked={convertFormat.value === "webp"}
                  onChange$={() => { convertFormat.value = "webp"; }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <span style={{ fontWeight: convertFormat.value === "webp" ? "600" : "400" }}>.WebP</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>(~70%)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="slider_format"
                  checked={convertFormat.value === "original"}
                  onChange$={() => { convertFormat.value = "original"; }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <span style={{ fontWeight: convertFormat.value === "original" ? "600" : "400" }}>Original</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>(No Compression)</span>
              </label>
            </div>
          </div>

          {/* Action Buttons: Batch Upload vs Library Pick */}
          <div style={{ padding: "1rem", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "0.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.5rem" }}>
              Add Images to Slider
            </div>

            {uploading.value && (
              <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--surface-3)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <LuLoader class="animate-spin" style={{ width: "1rem", height: "1rem" }} />
                <span>{uploadMsg.value}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <label style={{ padding: "0.55rem 1rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", cursor: uploading.value ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", flex: "1 1 180px" }}>
                <LuUpload style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>Upload Multiple Files</span>
                <input type="file" multiple accept="image/*" onChange$={handlePickMultipleFiles} disabled={uploading.value} style={{ display: "none" }} />
              </label>

              <button
                type="button"
                onClick$={() => { mediaPickerOpen.value = true; }}
                style={{ padding: "0.55rem 1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", flex: "1 1 180px" }}
              >
                <LuImage style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>Pick from Media Library</span>
              </button>
            </div>
          </div>

          {/* Slides List */}
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
              Slide Order & Items ({slides.items.length})
            </div>

            {slides.items.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                No slides added yet. Upload images or select from media library above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {slides.items.map((slide, idx) => (
                  <div key={slide.id || idx} style={{ display: "flex", gap: "0.75rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", alignItems: "center" }}>
                    <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "0.375rem", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0 }}>
                      {slide.media_url ? (
                        <img src={slide.media_url} alt="Slide preview" width="56" height="56" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                          <LuImage style={{ width: "1rem", height: "1rem" }} />
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      <input
                        type="text"
                        placeholder="Caption (optional)"
                        value={slide.caption || ""}
                        onInput$={(e) => { slides.items[idx].caption = (e.target as HTMLInputElement).value; }}
                        style={{ width: "100%", height: "1.75rem", padding: "0 0.5rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
                      />
                      <input
                        type="text"
                        placeholder="Destination Link URL (optional)"
                        value={slide.link || ""}
                        onInput$={(e) => { slides.items[idx].link = (e.target as HTMLInputElement).value; }}
                        style={{ width: "100%", height: "1.75rem", padding: "0 0.5rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <button
                        type="button"
                        onClick$={() => moveSlide(idx, -1)}
                        disabled={idx === 0}
                        style={{ padding: "2px 4px", background: "var(--surface-3)", border: "none", borderRadius: "2px", color: "var(--text-primary)", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.4 : 1 }}
                      >
                        <LuArrowUp style={{ width: "0.75rem", height: "0.75rem" }} />
                      </button>
                      <button
                        type="button"
                        onClick$={() => moveSlide(idx, 1)}
                        disabled={idx === slides.items.length - 1}
                        style={{ padding: "2px 4px", background: "var(--surface-3)", border: "none", borderRadius: "2px", color: "var(--text-primary)", cursor: idx === slides.items.length - 1 ? "not-allowed" : "pointer", opacity: idx === slides.items.length - 1 ? 0.4 : 1 }}
                      >
                        <LuArrowDown style={{ width: "0.75rem", height: "0.75rem" }} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick$={() => removeSlide(idx)}
                      style={{ padding: "0.375rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.25rem", color: "var(--error)", cursor: "pointer" }}
                    >
                      <LuTrash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              marginTop: "0.5rem",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader class="animate-spin" style={{ width: "1rem", height: "1rem" }} />
                <span>Saving Slider...</span>
              </>
            ) : (
              <>
                <LuSave style={{ width: "1rem", height: "1rem" }} />
                <span>{isEdit.value ? "Save Slider Changes" : "Create Slider"}</span>
              </>
            )}
          </button>
        </div>
      </SlideOver>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          slides.items.push({
            id: String(Math.random()),
            media_id: media.id,
            media_url: media.url,
            caption: "",
            link: "",
          });
          mediaPickerOpen.value = false;
        })}
      />
    </>
  );
});
