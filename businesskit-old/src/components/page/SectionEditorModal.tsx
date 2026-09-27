import { component$, useSignal, useTask$, useVisibleTask$, $ } from "@builder.io/qwik";
import type { PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import { SlideOver } from "~/components/SlideOver";
import { LuX, LuFolder, LuUpload } from "@qwikest/icons/lucide";
import { ComponentSchemas, ComponentDefaultData } from "~/components/page/SectionSchemas";
import { TipTapEditor } from "~/components/TipTapEditor";
import { CATEGORY_GROUPS } from "~/components/PageTypesModal";
import { getProfile } from "~/lib/ipc";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

const { spacing, borderRadius, typography } = designSystem;

const ALL_CATEGORIES = Object.values(CATEGORY_GROUPS).flat().filter(
  (c, i, self) => c.slug !== "all" && c.slug !== "about" && self.findIndex((t) => t.slug === c.slug) === i
);

interface SectionEditorModalProps {
  sectionKey: string;
  isOpen: boolean;
  onClose$: PropFunction<() => void>;
  onUpdate$?: PropFunction<(data: any) => void>;
  sectionData?: any;
  children?: any;
}

export const SectionEditorModal = component$<SectionEditorModalProps>((props) => {
  const localOpen = useSignal(false);
  const formData = useSignal<any>({});
  const lastKey = useSignal('');

  // ① Open/close + initial data load
  useTask$(({ track }) => {
    const propOpen = track(() => props.isOpen);
    const key      = track(() => props.sectionKey);

    localOpen.value = propOpen;

    if (propOpen) {
      lastKey.value = key;
      const defaultData = ComponentDefaultData[key] || ComponentDefaultData[key.toLowerCase()] || {};
      let rawData = props.sectionData;
      if (Array.isArray(rawData)) rawData = { images: rawData };
      const initial = (rawData && typeof rawData === 'object' && Object.keys(rawData).length > 0)
        ? { ...defaultData, ...rawData }
        : defaultData;
      formData.value = JSON.parse(JSON.stringify(initial));
    }
  });

  // Handler when any form field changes inside DynamicFormRenderer
  const handleFormChange$ = $((newData: any) => {
    formData.value = newData;
    if (props.onUpdate$) {
      props.onUpdate$(JSON.parse(JSON.stringify(newData)));
    }
  });

  // Close handler: flush data snapshot and close
  const handleClose$ = $(() => {
    const snapshot = JSON.parse(JSON.stringify(formData.value));
    localOpen.value = false;
    
    if (props.onUpdate$) {
      props.onUpdate$(snapshot);
    }
    
    if (props.onClose$) {
      props.onClose$();
    }
  });

  const schema = ComponentSchemas[props.sectionKey] || ComponentSchemas[props.sectionKey.toLowerCase()];

  return (
    <SlideOver
      open={localOpen}
      title={`Edit ${props.sectionKey.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}`}
      width="700px"
      onClose$={handleClose$}
    >
      {/* Scrollable body — form fields */}
      {schema ? (
        <DynamicFormRenderer
          schema={schema}
          data={formData.value}
          onUpdate$={handleFormChange$}
        />
      ) : (
        <p style={{ color: "var(--text-secondary)", fontSize: typography.sizes.sm }}>
          Specific form fields for <strong>{props.sectionKey}</strong> will be implemented here. For text and images, you can edit them directly on the canvas!
        </p>
      )}

      {/* Pinned footer — outside scroll area via SlideOver footer slot */}
      <div
        q:slot="footer"
        style={{
          padding: "0.875rem 1.5rem",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "flex-end",
          background: "var(--surface-2)",
        }}
      >
        <button
          type="button"
          onClick$={handleClose$}
          style={{
            height: "2.25rem",
            padding: "0 1.75rem",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </SlideOver>
  );
});

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill, var(--surface-2))",
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

const isImageFieldName = (name?: string, type?: string) => {
  if (type === 'array' || type === 'select' || type === 'richtext' || type === 'html' || type === 'textarea' || type === 'category_toggles') {
    return false;
  }
  if (type === 'image' || type === 'media') return true;
  const n = (name || '').toLowerCase();
  if (n === 'images' || n === 'photos' || n === 'items' || n === 'slides' || n === 'list') return false;
  return (
    n.includes('image') ||
    n.includes('photo') ||
    n.includes('avatar') ||
    n.includes('logo') ||
    n.includes('banner') ||
    n.includes('cover') ||
    n.includes('thumb')
  );
};

export const DynamicFormRenderer = component$<{ schema: any[]; data: any; onUpdate$?: PropFunction<(data: any) => void> }>((props) => {
  // Load profile.enabled_categories so category_toggles only shows enabled ones (same as /c/about)
  const enabledCats = useSignal<string[]>(["links"]);

  // Media Picker & Upload signals
  const mediaPickerOpen = useSignal(false);
  const mediaUploadOpen = useSignal(false);
  const activeUpdateCallback = useSignal<((url: string) => void) | null>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const profile = await getProfile();
      if (profile?.enabled_categories) {
        const parsed = JSON.parse(profile.enabled_categories) as string[];
        enabledCats.value = [...new Set(["links", ...parsed])];
      }
    } catch { /* keep default */ }
  });

  const renderImageControl = (
    key: string,
    label: string,
    value: string,
    onUpdate$: PropFunction<(val: string) => void>
  ) => {
    return (
      <div key={key} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={value}
            onInput$={(e) => {
              onUpdate$((e.target as HTMLInputElement).value);
            }}
            placeholder="https://"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            title="Browse Media Library"
            onClick$={() => {
              activeUpdateCallback.value = (url: string) => {
                onUpdate$(url);
              };
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
            <LuFolder style={{ width: "1rem", height: "1rem" }} />
          </button>
          <button
            type="button"
            title="Upload New Media"
            onClick$={() => {
              activeUpdateCallback.value = (url: string) => {
                onUpdate$(url);
              };
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
            <LuUpload style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {value && (
          <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <img
              src={value}
              alt="Preview"
              width={36}
              height={36}
              onError$={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.25rem", objectFit: "cover", border: "1px solid var(--border)", background: "var(--surface-2)" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>
              {value}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {props.schema.map((field, fieldIdx) => {
        if (field.type === 'category_toggles') {
          const visObj = props.data?.[field.name] || {};
          // Filter to only profile.enabled_categories (matching /c/about: enabledCats.value.includes(cat.slug))
          const displayCategories = ALL_CATEGORIES.filter((c) => enabledCats.value.includes(c.slug));
          return (
            <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
              <label style={labelStyle}>{field.label}</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
                {displayCategories.map((category) => {
                  const categorySlug = category.slug;
                  const isVisible = visObj[categorySlug]?.visible === true;
                  const Icon = category.icon;

                  return (
                    <div
                      key={categorySlug}
                      style={`display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: 0.5rem; border: 1px solid ${isVisible ? 'var(--accent, #047EEC)' : 'var(--border)'}; background: var(--surface-2); transition: border-color 0.2s, box-shadow 0.2s; ${isVisible ? 'box-shadow: 0 1px 3px rgba(0,0,0,0.1);' : ''}`}
                    >
                      <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500; font-size: 0.875rem; color: var(--text-primary);">
                          {Icon && <Icon width={18} height={18} style="color: var(--accent, #047EEC); flex-shrink: 0;" />}
                          <span>{category.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick$={() => {
                            const newVis = { ...visObj };
                            newVis[categorySlug] = {
                              ...newVis[categorySlug],
                              visible: !isVisible,
                              title: newVis[categorySlug]?.title || category.name,
                              description: newVis[categorySlug]?.description || category.description,
                            };
                            const newData = { ...props.data, [field.name]: newVis };
                            if (props.onUpdate$) props.onUpdate$(newData);
                          }}
                          style={`position: relative; width: 2.75rem; height: 1.5rem; border-radius: 0.5rem; border: none; padding: 0; cursor: pointer; background: ${isVisible ? "var(--accent, #047EEC)" : "var(--border)"}; transition: background-color 0.2s;`}
                        >
                          <span
                            style={`position: absolute; top: 50%; left: 0.15rem; width: 1.2rem; height: 1.2rem; border-radius: 0.5rem; background: var(--surface-2); box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: transform 0.2s; transform: ${isVisible ? 'translate(1.25rem, -50%)' : 'translate(0, -50%)'};`}
                          ></span>
                        </button>
                      </div>

                      {category.description && (
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0; line-height: 1.4;">
                          {category.description}
                        </p>
                      )}

                      {isVisible && (
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; width: 100%;">
                          <label style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary);">Section Title</label>
                          <input
                            type="text"
                            value={visObj[categorySlug]?.title ?? category.name}
                            onInput$={(e) => {
                              const newVis = { ...visObj };
                              newVis[categorySlug] = {
                                ...newVis[categorySlug],
                                title: (e.target as HTMLInputElement).value,
                              };
                              const newData = { ...props.data, [field.name]: newVis };
                              if (props.onUpdate$) props.onUpdate$(newData);
                            }}
                            placeholder={category.name}
                            style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem;"
                          />
                          <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0;">Leave as-is to show default, or clear to hide heading</p>

                          <label style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); margin-top: 0.25rem;">Section Description</label>
                          <textarea
                            rows={2}
                            value={visObj[categorySlug]?.description ?? category.description}
                            onInput$={(e) => {
                              const newVis = { ...visObj };
                              newVis[categorySlug] = {
                                ...newVis[categorySlug],
                                description: (e.target as HTMLTextAreaElement).value,
                              };
                              const newData = { ...props.data, [field.name]: newVis };
                              if (props.onUpdate$) props.onUpdate$(newData);
                            }}
                            placeholder={category.description ?? "Add section description"}
                            style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem; resize: vertical; font-family: inherit;"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (field.type === 'richtext' || field.type === 'html') {
          return (
            <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column" }}>
              <label style={labelStyle}>{field.label}</label>
              <TipTapEditor
                value={props.data?.[field.name] || ''}
                onChange$={$((html: string) => {
                  const newData = { ...props.data, [field.name]: html };
                  if (props.onUpdate$) {
                    props.onUpdate$(newData);
                  }
                })}
              />
            </div>
          );
        }

        if (field.type === 'textarea') {
          return (
            <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column" }}>
              <label style={labelStyle}>{field.label}</label>
              <textarea
                value={props.data?.[field.name] || ''}
                onInput$={(e) => {
                  const newData = { ...props.data, [field.name]: (e.target as HTMLTextAreaElement).value };
                  if (props.onUpdate$) props.onUpdate$(newData);
                }}
                style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
              />
            </div>
          );
        }

        if (field.type === 'array') {
           const items = props.data?.[field.name] || [];
           return (
             <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column", gap: spacing.md, border: "1px solid var(--border)", padding: spacing.md, borderRadius: borderRadius.md }}>
                <label style={{ fontSize: typography.sizes.sm, fontWeight: 600, color: "var(--text-primary)" }}>{field.label}</label>
                
                {items.map((item: any, idx: number) => (
                   <div key={`item-${idx}`} style={{ display: "flex", flexDirection: "column", gap: spacing.sm, padding: spacing.md, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: borderRadius.sm }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: typography.sizes.xs, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Item {idx + 1}</span>
                        <button 
                          type="button" 
                          onClick$={() => {
                            const newItems = [...items];
                            newItems.splice(idx, 1);
                            const newData = { ...props.data, [field.name]: newItems };
                            if (props.onUpdate$) props.onUpdate$(newData);
                          }}
                          style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
                        >
                          <LuX width={16} height={16} />
                        </button>
                      </div>
                      
                      {field.fields?.map((subField: any, subIdx: number) => {
                        if (isImageFieldName(subField.name, subField.type)) {
                          return renderImageControl(
                            `subfield-${subIdx}`,
                            subField.label,
                            item[subField.name] || '',
                            $((val: string) => {
                              const newItems = [...items];
                              newItems[idx] = { ...item, [subField.name]: val };
                              const newData = { ...props.data, [field.name]: newItems };
                              if (props.onUpdate$) props.onUpdate$(newData);
                            })
                          );
                        }
                        if (subField.type === 'richtext' || subField.type === 'html') {
                          return (
                            <div key={`subfield-${subIdx}`} style={{ display: "flex", flexDirection: "column" }}>
                              <label style={labelStyle}>{subField.label}</label>
                              <TipTapEditor
                                value={item[subField.name] || ''}
                                onChange$={$((html: string) => {
                                  const newItems = [...items];
                                  newItems[idx] = { ...item, [subField.name]: html };
                                  const newData = { ...props.data, [field.name]: newItems };
                                  if (props.onUpdate$) props.onUpdate$(newData);
                                })}
                              />
                            </div>
                          );
                        }
                        if (subField.type === 'textarea') {
                          return (
                            <div key={`subfield-${subIdx}`} style={{ display: "flex", flexDirection: "column" }}>
                              <label style={labelStyle}>{subField.label}</label>
                              <textarea
                                value={item[subField.name] || ''}
                                onInput$={(e) => {
                                  const newItems = [...items];
                                  newItems[idx] = { ...item, [subField.name]: (e.target as HTMLTextAreaElement).value };
                                  const newData = { ...props.data, [field.name]: newItems };
                                  if (props.onUpdate$) props.onUpdate$(newData);
                                }}
                                style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                              />
                            </div>
                          );
                        }
                        if (subField.type === 'select') {
                          return (
                            <div key={`subfield-${subIdx}`} style={{ display: "flex", flexDirection: "column" }}>
                              <label style={labelStyle}>{subField.label}</label>
                              <select
                                value={item[subField.name] || ''}
                                onChange$={(e) => {
                                  const newItems = [...items];
                                  newItems[idx] = { ...item, [subField.name]: (e.target as HTMLSelectElement).value };
                                  const newData = { ...props.data, [field.name]: newItems };
                                  if (props.onUpdate$) props.onUpdate$(newData);
                                }}
                                style={inputStyle}
                              >
                                <option value="">{`-- Select ${subField.label} --`}</option>
                                {(subField.options || []).map((opt: string) => (
                                  <option key={opt} value={opt}>{String(opt)}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        return (
                          <div key={`subfield-${subIdx}`} style={{ display: "flex", flexDirection: "column" }}>
                            <label style={labelStyle}>{subField.label}</label>
                            <input 
                              type="text" 
                              value={item[subField.name] || ''} 
                              onInput$={(e) => {
                                const newItems = [...items];
                                newItems[idx] = { ...item, [subField.name]: (e.target as HTMLInputElement).value };
                                const newData = { ...props.data, [field.name]: newItems };
                                if (props.onUpdate$) props.onUpdate$(newData);
                              }}
                              style={inputStyle}
                            />
                          </div>
                        );
                      })}
                   </div>
                ))}

                <button 
                  type="button" 
                  onClick$={() => {
                    const newItems = [...items, {}];
                    const newData = { ...props.data, [field.name]: newItems };
                    if (props.onUpdate$) props.onUpdate$(newData);
                  }}
                  style={{ alignSelf: "flex-start", padding: "6px 12px", background: "var(--surface-3)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: borderRadius.sm, cursor: "pointer", fontSize: typography.sizes.xs, fontWeight: 600 }}
                >
                  + Add Item
                </button>
             </div>
           );
        }

        if (isImageFieldName(field.name, field.type)) {
          return renderImageControl(
            `field-${fieldIdx}`,
            field.label,
            props.data?.[field.name] || '',
            $((val: string) => {
              const newData = { ...props.data, [field.name]: val };
              if (props.onUpdate$) props.onUpdate$(newData);
            })
          );
        }

        if (field.type === 'select') {
          return (
            <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column" }}>
              <label style={labelStyle}>{field.label}</label>
              <select
                value={props.data?.[field.name] || ''}
                onChange$={(e) => {
                  const newData = { ...props.data, [field.name]: (e.target as HTMLSelectElement).value };
                  if (props.onUpdate$) props.onUpdate$(newData);
                }}
                style={inputStyle}
              >
                <option value="">{`-- Select ${field.label} --`}</option>
                {(field.options || []).map((opt: string) => (
                  <option key={opt} value={opt}>{String(opt)}</option>
                ))}
              </select>
            </div>
          );
        }

        // Default: text input
        return (
          <div key={`field-${fieldIdx}`} style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>{field.label}</label>
            <input 
              type="text" 
              value={props.data?.[field.name] || ''} 
              onInput$={(e) => {
                const newData = { ...props.data, [field.name]: (e.target as HTMLInputElement).value };
                if (props.onUpdate$) props.onUpdate$(newData);
              }}
              style={inputStyle}
            />
          </div>
        );
      })}

      {/* Media Picker Modal for Browsing existing Media Items */}
      <MediaPickerModal
        open={mediaPickerOpen}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          const selectedUrl = media.url || media.local_url || "";
          if (activeUpdateCallback.value && selectedUrl) {
            activeUpdateCallback.value(selectedUrl);
          }
        })}
      />

      {/* Media Upload Modal for Uploading new files */}
      <MediaModal
        open={mediaUploadOpen}
        onUploaded$={$((media: MediaItem) => {
          const uploadedUrl = media.url || media.local_url || "";
          if (activeUpdateCallback.value && uploadedUrl) {
            activeUpdateCallback.value(uploadedUrl);
          }
        })}
      />
    </div>
  );
});
