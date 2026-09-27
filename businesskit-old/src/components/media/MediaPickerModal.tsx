// src/components/media/MediaPickerModal.tsx
//
// WHAT: Pure Media Selector / Picker Modal for shop components & page builders.
//       Displays media grid with search & file type filters (Image / Video / Document).

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  LuImage,
  LuFile,
  LuSearch,
  LuLoader,
  LuPlus,
  LuUpload,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { MediaModal } from "~/components/media/MediaModal";

export interface MediaItem {
  id: string;
  filename: string;
  name?: string;
  url: string;
  local_url?: string;
  file_type: string;
  mime_type?: string;
  size_bytes: number;
  alt_text?: string;
  storage_provider: string;
  created_at: number;
  updated_at?: number;
}

export interface MediaPickerModalProps {
  open: Signal<boolean>;
  filterType?: string; // 'image' | 'video' | 'document' | 'all'
  zIndex?: number;
  onSelected$: PropFunction<(media: MediaItem) => void>;
}

/**
 * Auto-converts image files to ultra-compact .avif format (90-95% compression ratio)
 * while preserving high resolution before saving/uploading.
 */
export async function convertToAvif(
  file: File,
  quality = 0.85
): Promise<{ url: string; filename: string; mimeType: string; fileType: string; size: number }> {
  // If file is already .avif or not an image, preserve file 100% untouched
  if (file.name.endsWith(".avif") || file.type === "image/avif" || !file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = (reader.result as string) || "";
        const fileType = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("image/") || file.name.endsWith(".avif")
          ? "image"
          : "document";
        resolve({
          url,
          filename: file.name,
          mimeType: file.name.endsWith(".avif") ? "image/avif" : file.type,
          fileType,
          size: file.size,
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        let avifDataUrl = canvas.toDataURL("image/avif", quality);
        let mimeType = "image/avif";
        if (!avifDataUrl.startsWith("data:image/avif")) {
          avifDataUrl = canvas.toDataURL("image/webp", quality);
          mimeType = "image/webp";
        }
        const ext = mimeType === "image/avif" ? ".avif" : ".webp";
        const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        const newFileName = `${baseName}${ext}`;
        const base64Str = avifDataUrl.split(",")[1] || "";
        const sizeBytes = Math.round((base64Str.length * 3) / 4);

        resolve({
          url: avifDataUrl,
          filename: newFileName,
          mimeType,
          fileType: "image",
          size: sizeBytes,
        });
        return;
      }

      resolve({
        url: blobUrl,
        filename: file.name,
        mimeType: file.type,
        fileType: "image",
        size: file.size,
      });
    };
    img.onerror = () => {
      resolve({
        url: blobUrl,
        filename: file.name,
        mimeType: file.type,
        fileType: "image",
        size: file.size,
      });
    };
    img.src = blobUrl;
  });
}

export const MediaPickerModal = component$<MediaPickerModalProps>(({ open, filterType = "all", zIndex, onSelected$ }) => {
  const mediaList = useSignal<MediaItem[]>([]);
  const currentFilter = useSignal(filterType);
  const searchQuery = useSignal("");
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const showUploadModal = useSignal(false);

  const loadMedia = $(async () => {
    loading.value = true;
    error.value = null;
    try {
      const items = await invoke<MediaItem[]>("media_list", {
        fileType: currentFilter.value === "all" ? null : currentFilter.value,
        search: searchQuery.value.trim() || null,
      });
      mediaList.value = items;
    } catch (e) {
      console.error("[MediaPicker] load failed:", e);
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  });

  const handleUploadedFromPicker = $(async (newMedia: MediaItem) => {
    await loadMedia();
    open.value = false;
    await onSelected$(newMedia);
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => open.value);
    track(() => currentFilter.value);
    track(() => searchQuery.value);
    if (isOpen) {
      loadMedia();
    }
  });

  return (
    <>
      <SlideOver open={open} title="Select Media" subtitle="Choose a file from your media library." width="560px" zIndex={zIndex}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* Filter Pills, Search & Upload Action */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: "140px" }}>
              <input
                type="text"
                placeholder="Search media..."
                value={searchQuery.value}
                onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
                style={{
                  width: "100%",
                  height: "2.25rem",
                  padding: "0 0.75rem 0 2.25rem",
                  background: "var(--field-fill)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  outline: "none",
                }}
              />
              <LuSearch style="position:absolute;left:0.75rem;top:0.625rem;width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
            </div>

            <div style={{ display: "flex", gap: "0.25rem", background: "var(--field-fill)", padding: "2px", borderRadius: "0.375rem" }}>
              {["all", "image", "video", "document"].map(ft => (
                <button
                  key={ft}
                  type="button"
                  onClick$={() => { currentFilter.value = ft; }}
                  style={{
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.72rem",
                    fontWeight: "500",
                    borderRadius: "0.25rem",
                    textTransform: "capitalize",
                    background: currentFilter.value === ft ? "var(--surface-2)" : "transparent",
                    color: currentFilter.value === ft ? "var(--text-primary)" : "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {ft}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick$={() => { showUploadModal.value = true; }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                height: "2.25rem",
                padding: "0 0.75rem",
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <LuUpload style="width:0.875rem;height:0.875rem;" />
              <span>Upload</span>
            </button>
          </div>

          {/* Media Grid */}
          {loading.value ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              <LuLoader style="width:1.25rem;height:1.25rem;animation:spin 1s linear infinite;margin:0 auto 0.5rem;" /> Loading media...
            </div>
          ) : mediaList.value.length === 0 ? (
            <div style={{ padding: "2.5rem 1rem", textAlign: "center", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "0.5rem" }}>
              <LuImage style="width:2rem;height:2rem;color:var(--text-secondary);margin:0 auto 0.5rem;" />
              <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)", marginBottom: "0.25rem" }}>No media files found</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Upload files to your media library first or upload directly now.
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick$={() => { showUploadModal.value = true; }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", cursor: "pointer" }}
                >
                  <LuUpload style="width:0.875rem;height:0.875rem;" /> Upload Media
                </button>
                <Link
                  href="/dashboard/media"
                  onClick$={() => { open.value = false; }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.45rem 0.875rem", background: "var(--surface-3)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", textDecoration: "none" }}
                >
                  <LuPlus style="width:0.875rem;height:0.875rem;" /> Go to Media Library
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "0.75rem", maxHeight: "380px", overflowY: "auto", paddingRight: "0.25rem" }}>
              {mediaList.value.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick$={async () => {
                    open.value = false;
                    await onSelected$(item);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "left",
                    position: "relative",
                    transition: "transform 0.1s, border-color 0.1s",
                  }}
                >
                  <div style={{ height: "100px", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {item.file_type === "image" || item.url.match(/\.(jpeg|jpg|gif|png|svg|webp|avif)/i) ? (
                      <img
                        src={item.local_url || item.url}
                        alt={item.filename}
                        width="100"
                        height="100"
                        onError$={(e) => { (e.target as HTMLImageElement).src = item.url; }}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", color: "var(--text-secondary)" }}>
                        <LuFile style="width:1.5rem;height:1.5rem;" />
                        <span style={{ fontSize: "0.7rem" }}>{item.file_type}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.filename}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.1rem", display: "flex", justifyContent: "space-between" }}>
                      <span>{item.storage_provider.toUpperCase()}</span>
                      <span>{(item.size_bytes / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SlideOver>

      {/* Direct Upload Modal from Picker */}
      <MediaModal
        open={showUploadModal}
        zIndex={zIndex ? zIndex + 20 : 650}
        onUploaded$={handleUploadedFromPicker}
      />
    </>
  );
});
