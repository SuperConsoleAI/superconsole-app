// src/routes/dashboard/media/index.tsx
//
// Media Library dashboard route.
// Displays media grid with Cloudflare R2 uploads, auto-AVIF conversion, filters, and copy URL actions.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useStyles$,
  $,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuPlus,
  LuSearch,
  LuTrash2,
  LuCopy,
  LuCheck,
  LuFile,
  LuImage,
  LuLoader,
  LuZap,
} from "@qwikest/icons/lucide";
import { MediaModal } from "~/components/media/MediaModal";
import { MediaPreviewModal } from "~/components/media/MediaPreviewModal";
import type { MediaItem } from "~/components/media/MediaPickerModal";

const MEDIA_TOOLBAR_STYLES = `
  .media-wrap {
    container-type: inline-size;
    width: 100%;
  }
  .media-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .media-toolbar-left {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .media-toolbar-left::-webkit-scrollbar {
    display: none;
  }
  .media-toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 1rem;
    width: 100%;
  }
  .media-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
  }
  .media-card-thumb {
    height: 140px;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .media-card-body {
    padding: 0.75rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }
  .media-card-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .media-card-meta {
    font-size: 0.7rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
    display: flex;
    justify-content: space-between;
  }
  .media-card-actions {
    display: flex;
    gap: 0.375rem;
  }
  .media-copy-btn {
    flex: 1;
    min-width: 0;
    height: 1.875rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--text-primary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0 0.35rem;
    overflow: hidden;
    white-space: nowrap;
  }
  .media-copy-btn span.short-text {
    display: none;
  }
  .media-delete-btn {
    width: 1.875rem;
    height: 1.875rem;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 0.25rem;
    color: var(--error);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .media-pagination {
    padding: 0.75rem 0.875rem;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  @container (max-width: 600px) {
    .media-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .media-toolbar-left {
      width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .media-toolbar-left::-webkit-scrollbar {
      display: none;
    }
    .media-toolbar-right {
      width: 100%;
      display: flex;
      flex-direction: row;
      gap: 0.5rem;
    }
    .media-toolbar-search {
      flex: 1;
      width: auto !important;
    }
    .media-toolbar-search input {
      width: 100% !important;
    }
    .media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 0.5rem !important;
    }
    .media-card-thumb {
      height: 110px !important;
    }
    .media-card-body {
      padding: 0.5rem !important;
    }
    .media-card-name {
      font-size: 0.75rem !important;
    }
    .media-card-meta {
      font-size: 0.65rem !important;
    }
    .media-copy-btn span.full-text {
      display: none !important;
    }
    .media-copy-btn span.short-text {
      display: inline !important;
    }
    .media-pagination {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
      gap: 0.75rem;
    }
    .media-pagination button {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 600px) {
    .media-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .media-toolbar-left {
      width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .media-toolbar-left::-webkit-scrollbar {
      display: none;
    }
    .media-toolbar-right {
      width: 100%;
      display: flex;
      flex-direction: row;
      gap: 0.5rem;
    }
    .media-toolbar-search {
      flex: 1;
      width: auto !important;
    }
    .media-toolbar-search input {
      width: 100% !important;
    }
    .media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 0.5rem !important;
    }
    .media-card-thumb {
      height: 110px !important;
    }
    .media-card-body {
      padding: 0.5rem !important;
    }
    .media-card-name {
      font-size: 0.75rem !important;
    }
    .media-card-meta {
      font-size: 0.65rem !important;
    }
    .media-copy-btn span.full-text {
      display: none !important;
    }
    .media-copy-btn span.short-text {
      display: inline !important;
    }
    .media-pagination {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
      gap: 0.75rem;
    }
    .media-pagination button {
      width: 100%;
      justify-content: center;
    }
  }
`;

const mediaSessionCache = new Map<string, MediaItem[]>();
const PAGE_SIZE = 30;

export default component$(() => {
  useStyles$(MEDIA_TOOLBAR_STYLES);
  const mediaList = useSignal<MediaItem[]>([]);
  const loading = useSignal(true);
  const currentFilter = useSignal("all");
  const searchQuery = useSignal("");
  const displayLimit = useSignal(PAGE_SIZE);
  const uploadModalOpen = useSignal(false);
  const previewItem = useSignal<MediaItem | null>(null);
  const copiedId = useSignal<string | null>(null);
  const deletingId = useSignal<string | null>(null);

  const loadMedia = $(async () => {
    const cacheKey = `${currentFilter.value}:${searchQuery.value.trim()}`;
    if (mediaSessionCache.has(cacheKey)) {
      mediaList.value = mediaSessionCache.get(cacheKey)!;
      loading.value = false;
    } else {
      loading.value = true;
    }
    try {
      const items = await invoke<MediaItem[]>("media_list", {
        fileType: currentFilter.value === "all" ? null : currentFilter.value,
        search: searchQuery.value.trim() || null,
      });
      mediaList.value = items;
      mediaSessionCache.set(cacheKey, items);
    } catch (e) {
      console.error("[MediaRoute] load error:", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => currentFilter.value);
    track(() => searchQuery.value);
    displayLimit.value = PAGE_SIZE;
    loadMedia();
  });

  const handleCopyUrl = $((item: MediaItem) => {
    navigator.clipboard.writeText(item.url);
    copiedId.value = item.id;
    setTimeout(() => {
      copiedId.value = null;
    }, 2000);
  });

  const handleDelete = $(async (id: string) => {
    if (!confirm("Are you sure you want to delete this media item?")) return;
    deletingId.value = id;
    try {
      await invoke("media_delete", { mediaId: id });
      mediaList.value = mediaList.value.filter((m) => m.id !== id);
      mediaSessionCache.clear();
      const cacheKey = `${currentFilter.value}:${searchQuery.value.trim()}`;
      mediaSessionCache.set(cacheKey, mediaList.value);
    } catch (e) {
      alert("Failed to delete media item: " + String(e));
    } finally {
      deletingId.value = null;
    }
  });

  return (
    <>
      <MediaModal
        open={uploadModalOpen}
        onUploaded$={$((item: MediaItem) => {
          mediaList.value = [item, ...mediaList.value];
          mediaSessionCache.clear();
          const cacheKey = `${currentFilter.value}:${searchQuery.value.trim()}`;
          mediaSessionCache.set(cacheKey, mediaList.value);
        })}
      />

      <div class="media-wrap">
        {/* Responsive Toolbar Line: Left = Filter Toggle, Right = Search + Upload Button */}
        <div class="media-toolbar">
          {/* Left end: Filter Toggle */}
          <div class="media-toolbar-left">
            {[
              { id: "all", label: "All Files" },
              { id: "image", label: "Images" },
              { id: "video", label: "Videos" },
              { id: "document", label: "Documents" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick$={() => { currentFilter.value = f.id; }}
                style={{
                  padding: "0.375rem 0.875rem",
                  fontSize: "0.8125rem",
                  fontWeight: "500",
                  borderRadius: "0.375rem",
                  border: "none",
                  cursor: "pointer",
                  background: currentFilter.value === f.id ? "var(--surface-2)" : "transparent",
                  color: currentFilter.value === f.id ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: currentFilter.value === f.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Right end: Search Box + Upload Button in one flex container */}
          <div class="media-toolbar-right">
            <div class="media-toolbar-search" style={{ position: "relative", width: "240px" }}>
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery.value}
                onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
                style={{
                  width: "100%",
                  height: "2rem",
                  padding: "0 0.75rem 0 2.25rem",
                  background: "var(--field-fill)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  outline: "none",
                }}
              />
              <LuSearch style="position:absolute;left:0.75rem;top:0.5rem;width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
            </div>

            <button
              type="button"
              onClick$={() => { uploadModalOpen.value = true; }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "2rem",
                padding: "0 0.875rem",
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <LuPlus style="width:0.875rem;height:0.875rem;" /> Upload Media
            </button>
          </div>
        </div>

        {/* Media Grid Content */}
        {loading.value ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuLoader style="width:1.5rem;height:1.5rem;animation:spin 1s linear infinite;margin:0 auto 0.5rem;" />
            <div style={{ fontSize: "0.875rem" }}>Loading media items...</div>
          </div>
        ) : mediaList.value.length === 0 ? (
          <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
            <LuImage style="width:2.5rem;height:2.5rem;color:var(--text-secondary);margin:0 auto 0.75rem;" />
            <h3 style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              No media files found
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Upload your first image, video, or document to your Cloudflare R2 bucket.
            </p>
            <button
              type="button"
              onClick$={() => { uploadModalOpen.value = true; }}
              style={{
                padding: "0.5rem 1.25rem",
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Upload Media
            </button>
          </div>
        ) : (
          <>
            <div class="media-grid">
              {mediaList.value.slice(0, displayLimit.value).map((item) => (
                <div
                  key={item.id}
                  class="media-card"
                  onDblClick$={() => { previewItem.value = item; }}
                  title="Double-click to preview image/document"
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  {/* Thumbnail */}
                  <div class="media-card-thumb">
                    {item.file_type === "image" || item.url.match(/\.(jpeg|jpg|gif|png|svg|webp|avif)/i) ? (
                      <img
                        src={item.local_url || item.url}
                        alt={item.filename}
                        width="140"
                        height="140"
                        onError$={(e) => { (e.target as HTMLImageElement).src = item.url; }}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", color: "var(--text-secondary)" }}>
                        <LuFile style="width:2rem;height:2rem;" />
                        <span style={{ fontSize: "0.75rem" }}>{item.file_type}</span>
                      </div>
                    )}

                    {/* AVIF Badge */}
                    {item.url.includes(".avif") && (
                      <span style={{ position: "absolute", top: "0.375rem", right: "0.375rem", background: "rgba(99,102,241,0.9)", color: "#fff", fontSize: "0.625rem", fontWeight: "700", padding: "0.1rem 0.35rem", borderRadius: "0.25rem", display: "flex", alignItems: "center", gap: "0.15rem" }}>
                        <LuZap style="width:0.625rem;height:0.625rem;" /> AVIF
                      </span>
                    )}
                  </div>

                  {/* Content info */}
                  <div class="media-card-body">
                    <div>
                      <div class="media-card-name" title={item.name || item.filename}>
                        {item.name || item.filename}
                      </div>
                      <div class="media-card-meta">
                        <span>{(item.size_bytes / 1024).toFixed(0)} KB</span>
                        <span style={{ textTransform: "uppercase" }}>{item.storage_provider}</span>
                      </div>
                    </div>

                    {/* Actions (No divider line) */}
                    <div class="media-card-actions">
                      <button
                        type="button"
                        class="media-copy-btn"
                        onClick$={(e) => {
                          e.stopPropagation();
                          handleCopyUrl(item);
                        }}
                      >
                        {copiedId.value === item.id ? (
                          <>
                            <LuCheck style="width:0.75rem;height:0.75rem;color:var(--success);flex-shrink:0;" />
                            <span class="full-text">Copied</span>
                            <span class="short-text">Copied</span>
                          </>
                        ) : (
                          <>
                            <LuCopy style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
                            <span class="full-text">Copy Link</span>
                            <span class="short-text">Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        class="media-delete-btn"
                        disabled={deletingId.value === item.id}
                        onClick$={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        title="Delete Media"
                      >
                        <LuTrash2 style="width:0.75rem;height:0.75rem;" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Media Preview & Meta Edit Popup Modal */}
            <MediaPreviewModal
              item={previewItem}
              onUpdated$={$((updated: MediaItem) => {
                mediaList.value = mediaList.value.map((m) => (m.id === updated.id ? updated : m));
              })}
              onDeleted$={$((deletedId: string) => {
                mediaList.value = mediaList.value.filter((m) => m.id !== deletedId);
              })}
            />

            {/* Pagination footer */}
            {mediaList.value.length > PAGE_SIZE && (
              <div class="media-pagination">
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Showing {Math.min(displayLimit.value, mediaList.value.length)} of {mediaList.value.length} files · newest first
                </span>
                {displayLimit.value < mediaList.value.length && (
                  <button
                    type="button"
                    onClick$={() => { displayLimit.value += PAGE_SIZE; }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.35rem 0.875rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontWeight: "500",
                    }}
                  >
                    Load More (+{PAGE_SIZE})
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: "Media Library — BusinessKit",
};
