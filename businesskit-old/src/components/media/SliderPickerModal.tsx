// src/components/media/SliderPickerModal.tsx
//
// WHAT: Slider & Banner Gallery Picker Modal.
//       Displays all user sliders with thumbnail previews and "+ Create New Slider" action.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSliders,
  LuPlus,
  LuImage,
  LuCheck,
  LuLoader,
  LuSearch,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";

export interface SliderItem {
  id: string;
  slider_id: string;
  media_id?: string;
  media_url?: string;
  position: number;
  caption?: string;
  link?: string;
}

export interface Slider {
  id: string;
  profile_id: string;
  title: string;
  items: SliderItem[];
  created_at: number;
}

export interface SliderPickerModalProps {
  open: Signal<boolean>;
  selectedSliderId?: string;
  onSelected$: PropFunction<(slider: Slider) => void>;
  onCreateRequested$: PropFunction<() => void>;
}

export const SliderPickerModal = component$<SliderPickerModalProps>(
  ({ open, selectedSliderId, onSelected$, onCreateRequested$ }) => {
    const sliders = useSignal<Slider[]>([]);
    const loading = useSignal(false);
    const error = useSignal<string | null>(null);
    const search = useSignal("");

    const loadSliders = $(async () => {
      loading.value = true;
      error.value = null;
      try {
        const list = await invoke<Slider[]>("sliders_list");
        sliders.value = list;
      } catch (e) {
        error.value = String(e);
      } finally {
        loading.value = false;
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (isOpen) {
        loadSliders();
      }
    });

    const filteredSliders = sliders.value.filter((s) =>
      s.title.toLowerCase().includes(search.value.toLowerCase()) ||
      s.id.toLowerCase().includes(search.value.toLowerCase())
    );

    return (
      <SlideOver open={open} title="Select Gallery Slider" subtitle="Choose an existing image gallery slider or create a new one." width="540px">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* Action Header */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="text"
                placeholder="Search sliders..."
                value={search.value}
                onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
                style={{
                  width: "100%",
                  height: "2.375rem",
                  padding: "0 0.75rem 0 2.25rem",
                  background: "var(--field-fill)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  outline: "none",
                }}
              />
              <LuSearch style="position:absolute;left:0.75rem;top:0.6875rem;width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
            </div>

            <button
              type="button"
              onClick$={onCreateRequested$}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "2.375rem",
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
              <LuPlus style={{ width: "0.875rem", height: "0.875rem" }} />
              <span>Create New Slider</span>
            </button>
          </div>

          {loading.value ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <LuLoader class="animate-spin" style={{ width: "1.25rem", height: "1.25rem" }} />
              <span>Loading sliders...</span>
            </div>
          ) : filteredSliders.length === 0 ? (
            <div style={{ padding: "3rem 1.5rem", textAlign: "center", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "0.5rem" }}>
              <LuSliders style={{ width: "2rem", height: "2rem", color: "var(--text-secondary)", margin: "0 auto 0.5rem" }} />
              <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                No Sliders Found
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Create your first gallery slider with multiple images for this product.
              </div>
              <button
                type="button"
                onClick$={onCreateRequested$}
                style={{ padding: "0.5rem 1rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", cursor: "pointer" }}
              >
                + Create First Slider
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredSliders.map((slider) => {
                const isSelected = selectedSliderId === slider.id;
                return (
                  <div
                    key={slider.id}
                    onClick$={() => { onSelected$(slider); open.value = false; }}
                    style={{
                      padding: "0.875rem",
                      borderRadius: "0.5rem",
                      background: isSelected ? "var(--surface-3)" : "var(--surface-2)",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      transition: "border-color 150ms ease, background 150ms ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                          {slider.title}
                        </span>
                        <span style={{ padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "var(--surface-1)", color: "var(--text-secondary)", fontSize: "0.7rem", fontWeight: "600" }}>
                          {slider.items.length} {slider.items.length === 1 ? "image" : "images"}
                        </span>
                      </div>
                      {isSelected && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)" }}>
                          <LuCheck style={{ width: "1rem", height: "1rem" }} /> Selected
                        </span>
                      )}
                    </div>

                    {/* Image Thumbnails Strip */}
                    <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                      {slider.items.length === 0 ? (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
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
                              <img src={item.media_url} alt="Item preview" width="48" height="48" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                );
              })}
            </div>
          )}
        </div>
      </SlideOver>
    );
  }
);
