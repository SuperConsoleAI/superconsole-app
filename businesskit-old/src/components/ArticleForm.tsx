import { component$, useSignal, $, type QRL, type Signal } from "@builder.io/qwik";
import { LuTrash2, LuSparkles, LuFolder, LuUpload, LuLoader } from "@qwikest/icons/lucide";
import { TipTapEditor } from "~/components/TipTapEditor";
import { SlideOver } from "~/components/SlideOver";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Pill toggle — knob uses var(--surface-2) so it's visible on both themes */
const PillToggle = component$<{ on: Signal<boolean>; label: string }>(({ on, label }) => (
  <label style="display:flex;align-items:center;gap:0.625rem;cursor:pointer;user-select:none;">
    <button
      type="button"
      style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${on.value ? "var(--accent)" : "var(--border)"};background:${on.value ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s ease;`}
      onClick$={() => { on.value = !on.value; }}
    >
      <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${on.value ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:all 0.2s ease;`} />
    </button>
    <span style="font-size:0.875rem;color:var(--text-secondary);">{label}</span>
  </label>
));

export interface ArticleCollection {
  id: string | number;
  title: string;
  slug?: string;
  icon?: string;
}

export interface DocCollection {
  id: number;
  title: string;
  slug?: string;
  icon?: string;
}

export interface ArticleFormProps {
  title: Signal<string>;
  slug: Signal<string>;
  excerpt: Signal<string>;
  content: Signal<string>;
  heroImageUrl: Signal<string>;
  mediaId?: Signal<string>;
  ctaButtonText: Signal<string>;
  ctaButtonUrl: Signal<string>;
  published: Signal<boolean>;
  /** Maps to "hidden" column — secret post toggle */
  secret: Signal<boolean>;
  /** Maps to "hide_author" column */
  hideAuthor: Signal<boolean>;
  /** Whether image_ads JSON is enabled */
  imageAdsEnabled: Signal<boolean>;
  imageAdsImageUrl: Signal<string>;
  imageAdsText: Signal<string>;
  imageAdsUrl: Signal<string>;
  collectionId: Signal<string>;
  collections: Signal<ArticleCollection[]>;
  additionalDetails: Signal<Array<{ key: string; value: string }>>;

  /** For docs route only — uses doc_collections (integer IDs) */
  docCollectionId?: Signal<number>;
  docCollections?: Array<{ id: number; title: string; icon?: string; slug?: string }>;

  entityLabel?: string;
  isEditing: boolean;
  isSaving: boolean;
  isOpen: Signal<boolean>;

  /** Show collection selector (default: true) */
  showCollections?: boolean;
  /**
   * Show doc_collections selector (docs route only).
   * Also suppresses CTA + additionalDetails sections.
   */
  showDocCollection?: boolean;

  /** AI summary signal — bound to ai_summary column */
  aiSummary?: Signal<string>;
  /** Content ID — required for auto-generate */
  contentId?: string | number | null;
  /** Content table — e.g. "newsletter", "posts", "guides", "notes", "doc_articles" */
  contentTable?: string;

  errorMessage?: string;
  onSave$: QRL<() => void | Promise<void>>;
  onCancel$: QRL<() => void>;
  onCreateCollection$: QRL<(data: { title: string; icon: string; description: string }) => Promise<ArticleCollection | null>>;
  onCreateDocCollection$?: QRL<(data: { title: string; icon: string; description: string }) => Promise<{ id: number; title: string } | null>>;
}

/** Sparkle button — calls /api/ai-summarize, fills the textarea on success */
const AiSummaryButton = component$<{
  contentId: string | number;
  contentTable: string;
  aiSummary: Signal<string>;
}>(({ contentId, contentTable, aiSummary }) => {
  const loading = useSignal(false);
  const error = useSignal("");

  const generate = $(async () => {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch("/api/ai-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contentId, table: contentTable }),
      });
      const data = await res.json() as any;
      if (!res.ok) { error.value = data.error || "Failed"; return; }
      aiSummary.value = data.summary || "";
    } catch (e: any) {
      error.value = e.message || "Request failed";
    } finally {
      loading.value = false;
    }
  });

  return (
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem;">
      <button
        type="button"
        onClick$={generate}
        disabled={loading.value}
        title="Auto-generate AI summary using your API key"
        style={`display:inline-flex;align-items:center;gap:0.375rem;padding:0.375rem 0.75rem;background:var(--accent);border:none;border-radius:0.375rem;color:var(--button-primary-text,#fff);font-size:0.8125rem;font-weight:500;cursor:pointer;transition:opacity 0.15s;${loading.value ? "opacity:0.6;cursor:not-allowed;" : ""}`}
      >
        <LuSparkles style="width:14px;height:14px;" />
        {loading.value ? "Generating…" : "Auto-generate"}
      </button>
      {error.value && (
        <p style="margin:0;font-size:0.75rem;color:var(--error,#ef4444);">{error.value}</p>
      )}
    </div>
  );
});

export const ArticleForm = component$<ArticleFormProps>((props) => {
  const showNewCol = useSignal(false);
  const newColTitle = useSignal("");
  const newColIcon = useSignal("");
  const newColDesc = useSignal("");
  const creatingCol = useSignal(false);

  const showDocColForm = useSignal(false);
  const newDocColTitle = useSignal("");
  const newDocColIcon = useSignal("");
  const newDocColDesc = useSignal("");
  const creatingDocCol = useSignal(false);

  const mediaPickerOpen = useSignal(false);
  const mediaUploadOpen = useSignal(false);

  const entityLabel = props.entityLabel ?? "Article";
  const showCollections = props.showCollections !== false;
  const showDocCollection = props.showDocCollection === true;
  // CTA + additionalDetails shown for all routes EXCEPT docs
  const showExtraFields = !showDocCollection;

  const handleClose$ = $(() => {
    if (mediaPickerOpen.value || mediaUploadOpen.value) return;
    props.onCancel$();
  });

  return (
    <SlideOver
      open={props.isOpen}
      title={props.isEditing ? `Edit ${entityLabel}` : `New ${entityLabel}`}
      width="50%"
      onClose$={handleClose$}
    >
      <div style="display:flex;flex-direction:column;gap:1.25rem;">
          {props.errorMessage && (
            <div style="padding:0.75rem;background:var(--error-bg, rgba(239, 68, 68, 0.1));border:1px solid var(--error, #ef4444);border-radius:0.375rem;color:var(--error, #ef4444);font-size:0.875rem;">
              {props.errorMessage}
            </div>
          )}

          {/* Title — full width */}
          <div>
            <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">Title *</label>
            <input
              type="text"
              value={props.title.value}
              onInput$={(e) => {
                const v = (e.target as HTMLInputElement).value;
                props.title.value = v;
                if (!props.isEditing) props.slug.value = slugify(v);
              }}
              style="width:100%;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
              placeholder={`${entityLabel} title`}
            />
          </div>

          {/* Slug — full width */}
          <div>
            <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">Slug</label>
            <input
              type="text"
              value={props.slug.value}
              onInput$={(e) => { props.slug.value = (e.target as HTMLInputElement).value; }}
              style="width:100%;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
              placeholder="auto-generated-from-title"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">Excerpt</label>
            <textarea
              value={props.excerpt.value}
              onInput$={(e) => { props.excerpt.value = (e.target as HTMLTextAreaElement).value; }}
              style="width:100%;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;min-height:72px;resize:vertical;"
              placeholder="Brief summary"
            />
          </div>

          {/* Hero Image URL */}
          <div>
            <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">Hero Image URL</label>
            <div style="display:flex;gap:0.4rem;align-items:center;">
              <input
                type="url"
                value={props.heroImageUrl.value}
                onInput$={(e) => { props.heroImageUrl.value = (e.target as HTMLInputElement).value; }}
                style="flex:1;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
                placeholder="https://example.com/image.jpg"
              />
              <button
                type="button"
                title="Browse Media Library"
                onClick$={() => { mediaPickerOpen.value = true; }}
                style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;background:var(--surface-3);color:var(--text-primary);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;flex-shrink:0;"
              >
                <LuFolder style="width:1rem;height:1rem;" />
              </button>
              <button
                type="button"
                title="Upload New Media"
                onClick$={() => { mediaUploadOpen.value = true; }}
                style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;background:var(--button-primary-bg);color:var(--button-primary-text);border:none;border-radius:0.375rem;cursor:pointer;flex-shrink:0;"
              >
                <LuUpload style="width:1rem;height:1rem;" />
              </button>
            </div>
            {props.heroImageUrl.value && (
              <img
                src={props.heroImageUrl.value}
                alt="Hero preview"
                width="400"
                height="128"
                style="margin-top:0.5rem;width:100%;height:7rem;object-fit:cover;border-radius:0.375rem;border:1px solid var(--border);"
                onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>

          {/* Collection selector — non-docs */}
          {showCollections && !showDocCollection && (
            <div>
              <label style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;display:block;">Collection</label>
              <div style="display:flex;gap:0.75rem;">
                <select
                  value={props.collectionId.value}
                  onChange$={(e) => { props.collectionId.value = (e.target as HTMLSelectElement).value; }}
                  style="flex:1;height:2.625rem;padding:0 0.75rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
                >
                  <option value="">None</option>
                  {props.collections.value.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>{`${c.icon ? c.icon + ' ' : ''}${c.title}`}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick$={() => { showNewCol.value = !showNewCol.value; }}
                  style="height:2.625rem;padding:0 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:center;"
                >
                  {showNewCol.value ? "Cancel" : "+ Add Collection"}
                </button>
              </div>
              {showNewCol.value && (
                <div style="margin-top:0.625rem;padding:0.75rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;display:flex;flex-direction:column;gap:0.5rem;">
                  <input
                    type="text"
                    value={newColTitle.value}
                    onInput$={(e) => { newColTitle.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Collection title *"
                  />
                  <input
                    type="text"
                    value={newColIcon.value}
                    onInput$={(e) => { newColIcon.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Icon emoji (optional)"
                  />
                  <input
                    type="text"
                    value={newColDesc.value}
                    onInput$={(e) => { newColDesc.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Description (optional)"
                  />
                  <div style="display:flex;gap:0.5rem;">
                    <button
                      type="button"
                      onClick$={async () => {
                        const t = newColTitle.value.trim();
                        if (!t) return;
                        creatingCol.value = true;
                        try {
                          const created = await props.onCreateCollection$({
                            title: t, icon: newColIcon.value.trim(), description: newColDesc.value.trim(),
                          });
                          if (created) {
                            props.collections.value = [...props.collections.value, created];
                            props.collectionId.value = String(created.id);
                            newColTitle.value = ""; newColIcon.value = ""; newColDesc.value = "";
                            showNewCol.value = false;
                          }
                        } finally { creatingCol.value = false; }
                      }}
                      style="padding:0.375rem 0.75rem;background:var(--accent);border:none;border-radius:0.25rem;color:var(--button-primary-text,#fff);font-size:0.8rem;cursor:pointer;"
                    >
                      {creatingCol.value ? "..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick$={() => { showNewCol.value = false; newColTitle.value = ""; newColIcon.value = ""; newColDesc.value = ""; }}
                      style="padding:0.375rem 0.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-secondary);font-size:0.8rem;cursor:pointer;"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Doc Collection selector — docs route only */}
          {showDocCollection && props.docCollectionId && props.docCollections && (
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
                <label style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);">Doc Collection *</label>
                <button
                  type="button"
                  onClick$={() => { showDocColForm.value = !showDocColForm.value; }}
                  style="font-size:0.75rem;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;"
                >
                  {showDocColForm.value ? "Cancel" : "+ New Collection"}
                </button>
              </div>
              <select
                value={String(props.docCollectionId.value)}
                onChange$={(e) => {
                  if (props.docCollectionId) props.docCollectionId.value = Number((e.target as HTMLSelectElement).value);
                }}
                style="width:100%;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
              >
                <option value="0">None</option>
                {props.docCollections?.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>{`${c.icon ? c.icon + ' ' : ''}${c.title}`}</option>
                ))}
              </select>
              {showDocColForm.value && props.onCreateDocCollection$ && (
                <div style="margin-top:0.625rem;padding:0.75rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;display:flex;flex-direction:column;gap:0.5rem;">
                  <input
                    type="text"
                    value={newDocColTitle.value}
                    onInput$={(e) => { newDocColTitle.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Collection title *"
                  />
                  <input
                    type="text"
                    value={newDocColIcon.value}
                    onInput$={(e) => { newDocColIcon.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Icon emoji (optional)"
                  />
                  <input
                    type="text"
                    value={newDocColDesc.value}
                    onInput$={(e) => { newDocColDesc.value = (e.target as HTMLInputElement).value; }}
                    style="padding:0.375rem 0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-primary);font-size:0.8125rem;"
                    placeholder="Description (optional)"
                  />
                  <div style="display:flex;gap:0.5rem;">
                    <button
                      type="button"
                      onClick$={async () => {
                        const t = newDocColTitle.value.trim();
                        if (!t || !props.onCreateDocCollection$ || !props.docCollectionId) return;
                        creatingDocCol.value = true;
                        try {
                          const created = await props.onCreateDocCollection$({
                            title: t, icon: newDocColIcon.value.trim(), description: newDocColDesc.value.trim(),
                          });
                          if (created) {
                            props.docCollectionId.value = created.id;
                            newDocColTitle.value = ""; newDocColIcon.value = ""; newDocColDesc.value = "";
                            showDocColForm.value = false;
                          }
                        } finally { creatingDocCol.value = false; }
                      }}
                      style="padding:0.375rem 0.75rem;background:var(--accent);border:none;border-radius:0.25rem;color:var(--button-primary-text,#fff);font-size:0.8rem;cursor:pointer;"
                    >
                      {creatingDocCol.value ? "..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick$={() => { showDocColForm.value = false; newDocColTitle.value = ""; newDocColIcon.value = ""; newDocColDesc.value = ""; }}
                      style="padding:0.375rem 0.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.25rem;color:var(--text-secondary);font-size:0.8rem;cursor:pointer;"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div>
            <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">Content *</label>
            <TipTapEditor
              value={props.content}
              onChange$={(val: string) => { props.content.value = val; }}
              placeholder={`Write your ${entityLabel.toLowerCase()} content...`}
            />
          </div>

          {/* CTA Button — non-docs routes */}
          {showExtraFields && (
            <div>
              <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.4rem;">CTA Button</label>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:0.75rem;">
                <input
                  type="text"
                  value={props.ctaButtonText.value}
                  onInput$={(e) => { props.ctaButtonText.value = (e.target as HTMLInputElement).value; }}
                  style="width:100%;min-width:0;box-sizing:border-box;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;"
                  placeholder="Button text"
                />
                <input
                  type="url"
                  value={props.ctaButtonUrl.value}
                  onInput$={(e) => { props.ctaButtonUrl.value = (e.target as HTMLInputElement).value; }}
                  style="width:100%;min-width:0;box-sizing:border-box;padding:0.625rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;"
                  placeholder="https://example.com"
                />
              </div>
            </div>
          )}

          {/* Additional Details — non-docs routes */}
          {showExtraFields && (
            <div>
              <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-primary);margin-bottom:0.25rem;">Additional Details</label>
              <p style="margin:0 0 0.625rem;font-size:0.75rem;color:var(--text-secondary);">Key-value pairs shown on post page (e.g. Reading Time: 5 min)</p>
              <div style="display:flex;flex-direction:column;gap:0.5rem;">
                {props.additionalDetails.value.map((detail, index) => (
                  <div key={index} style="display:flex;gap:0.5rem;align-items:center;width:100%;box-sizing:border-box;">
                    <input
                      type="text"
                      value={detail.key}
                      onInput$={(e) => {
                        const nd = [...props.additionalDetails.value];
                        nd[index] = { ...nd[index], key: (e.target as HTMLInputElement).value };
                        props.additionalDetails.value = nd;
                      }}
                      style="flex:1;min-width:0;box-sizing:border-box;padding:0.5rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;"
                      placeholder="Key (e.g. Reading Time)"
                    />
                    <input
                      type="text"
                      value={detail.value}
                      onInput$={(e) => {
                        const nd = [...props.additionalDetails.value];
                        nd[index] = { ...nd[index], value: (e.target as HTMLInputElement).value };
                        props.additionalDetails.value = nd;
                      }}
                      style="flex:1;min-width:0;box-sizing:border-box;padding:0.5rem;background:var(--background);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;"
                      placeholder="Value (e.g. 5 min)"
                    />
                    <button
                      type="button"
                      onClick$={() => { props.additionalDetails.value = props.additionalDetails.value.filter((_, i) => i !== index); }}
                      style="padding:0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;color:var(--error,#ef4444);cursor:pointer;display:flex;align-items:center;flex-shrink:0;"
                    >
                      <LuTrash2 style="width:15px;height:15px;" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick$={() => { props.additionalDetails.value = [...props.additionalDetails.value, { key: "", value: "" }]; }}
                  style="padding:0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-secondary);font-size:0.8125rem;cursor:pointer;text-align:center;"
                >
                  + Add Detail
                </button>
              </div>
            </div>
          )}

          {/* ── AI Summary ───────────────────────────────────────────────── */}
          {props.aiSummary !== undefined && (
            <div style="padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:0.5rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                <div>
                  <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">
                    AI Summary
                  </p>
                  <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">
                    Shown in llms.txt, /api/feed, and .md files for agents
                  </p>
                </div>
                {props.contentId && props.contentTable && (
                  <AiSummaryButton
                    contentId={props.contentId}
                    contentTable={props.contentTable}
                    aiSummary={props.aiSummary!}
                  />
                )}
              </div>
              <textarea
                value={props.aiSummary!.value}
                onInput$={(e) => { props.aiSummary!.value = (e.target as HTMLTextAreaElement).value; }}
                style="width:100%;padding:0.625rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;min-height:80px;resize:vertical;"
                placeholder="Brief 2-3 sentence summary for AI agents. Click ✨ to auto-generate using your AI API key."
              />
            </div>
          )}

          {/* ── Toggle Boxes ─────────────────────────────────────────────── */}

          {/* Secret Post */}
          <div style="padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
            <div>
              <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Secret Post</p>
              <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Hidden from listings but accessible via direct link</p>
            </div>
            <PillToggle on={props.secret} label="" />
          </div>

          {/* Hide Author */}
          <div style="padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
            <div>
              <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Hide Author</p>
              <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Don't show author name or avatar on this post</p>
            </div>
            <PillToggle on={props.hideAuthor} label="" />
          </div>
      </div>

        {/* Actions — pinned in SlideOver footer */}
        <div
          q:slot="footer"
          style={{
            position: "relative",
            zIndex: "200",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <PillToggle on={props.published} label="Published" />

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick$={props.onCancel$}
              style={{ padding: "0", height: "2.25rem", width: "6rem", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "500" }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-animated"
              onClick$={props.onSave$}
              disabled={props.isSaving}
              style={{ padding: "0 1.25rem", height: "2.25rem", background: "var(--button-primary-bg)", border: "none", borderRadius: "0.375rem", color: "var(--button-primary-text)", fontSize: "0.875rem", fontWeight: "600", cursor: props.isSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: props.isSaving ? 0.7 : 1 }}
            >
              {props.isSaving ? (
                <>
                  <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" />
                  Saving...
                </>
              ) : (
                props.isEditing ? "Update" : "Create"
              )}
            </button>
          </div>
        </div>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          const selectedUrl = media.url || media.local_url || "";
          if (selectedUrl) {
            props.heroImageUrl.value = selectedUrl;
            if (props.mediaId) props.mediaId.value = media.id;
          }
        })}
      />

      {/* Media Upload Modal */}
      <MediaModal
        open={mediaUploadOpen}
        onUploaded$={$((media: MediaItem) => {
          const uploadedUrl = media.url || media.local_url || "";
          if (uploadedUrl) {
            props.heroImageUrl.value = uploadedUrl;
            if (props.mediaId) props.mediaId.value = media.id;
          }
        })}
      />
    </SlideOver>
  );
});
