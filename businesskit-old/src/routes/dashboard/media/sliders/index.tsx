// src/routes/dashboard/media/sliders/index.tsx
//
// Sliders & Banners route — Manage, create, edit, and delete image gallery carousels.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useStyles$,
  $,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  LuPlus,
  LuSliders,
  LuImage,
  LuPencil,
  LuTrash2,
  LuLoader,
  LuSearch,
} from "@qwikest/icons/lucide";
import { SliderModal } from "~/components/media/SliderModal";
import { type Slider } from "~/components/media/SliderPickerModal";
import { invoke } from "@tauri-apps/api/core";

const SLIDERS_TOOLBAR_STYLES = `
  .sliders-wrap {
    container-type: inline-size;
    width: 100%;
  }
  .sliders-toolbar {
    margin-bottom: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .sliders-toolbar-search {
    position: relative;
    width: 320px;
    max-width: 100%;
  }
  .sliders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    width: 100%;
  }
  .slider-card {
    padding: 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    overflow: hidden;
  }
  .slider-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    min-width: 0;
  }
  .slider-card-title-box {
    min-width: 0;
    flex: 1;
  }
  .slider-card-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slider-card-id {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slider-card-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    background: var(--surface-3);
    color: var(--text-secondary);
    font-size: 0.7rem;
    font-weight: 600;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .slider-card-thumbs {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.35rem;
    min-height: 3.5rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .slider-icon-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex-shrink: 0;
    transition: color 0.15s, opacity 0.15s;
  }
  .slider-icon-btn:hover {
    color: var(--text-primary);
  }
  .slider-icon-btn-delete {
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex-shrink: 0;
    transition: color 0.15s, opacity 0.15s;
  }
  .slider-icon-btn-delete:hover {
    color: var(--error);
  }
  .sliders-pagination {
    padding: 0.75rem 0.875rem;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  @container (max-width: 640px) {
    .sliders-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .sliders-toolbar-search {
      width: 100% !important;
    }
    .sliders-toolbar-button {
      width: 100% !important;
      justify-content: center;
    }
    .sliders-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem !important;
    }
    .slider-card {
      padding: 0.875rem !important;
    }
    .sliders-pagination {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
      gap: 0.75rem;
    }
    .sliders-pagination button {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 640px) {
    .sliders-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .sliders-toolbar-search {
      width: 100% !important;
    }
    .sliders-toolbar-button {
      width: 100% !important;
      justify-content: center;
    }
    .sliders-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem !important;
    }
    .slider-card {
      padding: 0.875rem !important;
    }
    .sliders-pagination {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
      gap: 0.75rem;
    }
    .sliders-pagination button {
      width: 100%;
      justify-content: center;
    }
  }
`;

const slidersSessionCache: { current: Slider[] | null } = { current: null };
const PAGE_SIZE = 30;

export default component$(() => {
  useStyles$(SLIDERS_TOOLBAR_STYLES);
  const sliders = useSignal<Slider[]>([]);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);
  const search = useSignal("");
  const displayLimit = useSignal(PAGE_SIZE);

  const sliderModalOpen = useSignal(false);
  const editingSlider = useSignal<Slider | null>(null);

  const loadSliders = $(async () => {
    if (slidersSessionCache.current !== null) {
      sliders.value = slidersSessionCache.current;
      loading.value = false;
    } else {
      loading.value = true;
    }
    error.value = null;
    try {
      const list = await invoke<Slider[]>("sliders_list");
      sliders.value = list;
      slidersSessionCache.current = list;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => search.value);
    displayLimit.value = PAGE_SIZE;
    loadSliders();
  });

  const handleDelete = $(async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete slider "${title}"?`)) return;
    try {
      await invoke("sliders_delete", { sliderId: id });
      sliders.value = sliders.value.filter((s) => s.id !== id);
      slidersSessionCache.current = sliders.value;
    } catch (e) {
      alert(`Error deleting slider: ${e}`);
    }
  });

  const filteredSliders = sliders.value.filter((s) =>
    s.title.toLowerCase().includes(search.value.toLowerCase()) ||
    s.id.toLowerCase().includes(search.value.toLowerCase())
  );

  return (
    <div class="sliders-wrap">
      {/* Responsive Toolbar Line: Search Input + Create Slider Button */}
      <div class="sliders-toolbar">
        <div class="sliders-toolbar-search">
          <input
            type="text"
            placeholder="Search sliders by title..."
            value={search.value}
            onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
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
          class="sliders-toolbar-button"
          onClick$={() => { editingSlider.value = null; sliderModalOpen.value = true; }}
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
          <LuPlus style="width:0.875rem;height:0.875rem;" /> Create Slider
        </button>
      </div>

      {error.value && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem", marginBottom: "1rem" }}>
          {error.value}
        </div>
      )}

      {loading.value ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
          <LuLoader class="animate-spin" style={{ width: "1.25rem", height: "1.25rem" }} />
          <span>Loading gallery sliders...</span>
        </div>
      ) : filteredSliders.length === 0 ? (
        /* Empty State */
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          <LuSliders style="width:2.5rem;height:2.5rem;color:var(--text-secondary);margin:0 auto 0.75rem;" />
          <h3 style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            No Sliders or Hero Banners Created
          </h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
            Organize your product images into interactive sliders for storefronts and landing pages.
          </p>
          <button
            type="button"
            onClick$={() => { editingSlider.value = null; sliderModalOpen.value = true; }}
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
            + Create First Slider
          </button>
        </div>
      ) : (
        /* Grid of Sliders */
        <>
          <div class="sliders-grid">
            {filteredSliders.slice(0, displayLimit.value).map((slider) => (
              <div
                key={slider.id}
                class="slider-card"
              >
                <div class="slider-card-header">
                  <div class="slider-card-title-box">
                    <h3 class="slider-card-title">
                      {slider.title}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                      <div class="slider-card-id" style={{ margin: 0 }}>
                        ID: <code style={{ fontFamily: "monospace" }}>{slider.id}</code>
                      </div>
                      <span class="slider-card-badge">
                        {slider.items.length} {slider.items.length === 1 ? "slide" : "slides"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexShrink: 0 }}>
                    <button
                      type="button"
                      class="slider-icon-btn"
                      onClick$={() => { editingSlider.value = slider; sliderModalOpen.value = true; }}
                      title="Edit Slider"
                    >
                      <LuPencil style={{ width: "1rem", height: "1rem" }} />
                    </button>

                    <button
                      type="button"
                      class="slider-icon-btn-delete"
                      onClick$={() => handleDelete(slider.id, slider.title)}
                      title="Delete Slider"
                    >
                      <LuTrash2 style={{ width: "1rem", height: "1rem" }} />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Strip */}
                <div class="slider-card-thumbs">
                  {slider.items.length === 0 ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic", display: "flex", alignItems: "center" }}>
                      No images added yet
                    </div>
                  ) : (
                    slider.items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          width: "3.5rem",
                          height: "3.5rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          overflow: "hidden",
                          background: "var(--surface-3)",
                          flexShrink: 0,
                        }}
                      >
                        {item.media_url ? (
                          <img src={item.media_url} alt="Slide preview" width="56" height="56" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                            <LuImage style={{ width: "1rem", height: "1rem" }} />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination footer */}
          {filteredSliders.length > PAGE_SIZE && (
            <div class="sliders-pagination">
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Showing {Math.min(displayLimit.value, filteredSliders.length)} of {filteredSliders.length} sliders · newest first
              </span>
              {displayLimit.value < filteredSliders.length && (
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

      {/* Slider Create / Edit Modal */}
      <SliderModal
        open={sliderModalOpen}
        editingSlider={editingSlider.value}
        onSaved$={$(async () => {
          slidersSessionCache.current = null;
          await loadSliders();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Sliders & Banners — BusinessKit",
};
