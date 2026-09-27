// src/components/media/MediaPreviewModal.tsx
//
// Modal component for full media preview (Image, PDF, Video) with inline bottom editor
// for Name & SEO Alt Text metadata with instant persistence via media_update.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuX,
  LuCopy,
  LuCheck,
  LuExternalLink,
  LuImage,
  LuFile,
  LuZap,
  LuLoader,
  LuSave,
  LuTrash2,
} from "@qwikest/icons/lucide";
import type { MediaItem } from "./MediaPickerModal";

export interface MediaPreviewModalProps {
  item: Signal<MediaItem | null>;
  zIndex?: number;
  onUpdated$?: PropFunction<(updated: MediaItem) => void>;
  onDeleted$?: PropFunction<(deletedId: string) => void>;
  onClose$?: PropFunction<() => void>;
}

export const MediaPreviewModal = component$<MediaPreviewModalProps>(({
  item,
  zIndex = 9999,
  onUpdated$,
  onDeleted$,
  onClose$,
}) => {
  const isCopied = useSignal(false);
  const isSaving = useSignal(false);
  const isDeleting = useSignal(false);
  const saveSuccess = useSignal(false);
  const saveError = useSignal<string | null>(null);

  // Editable Form Signals
  const editName = useSignal("");
  const editAltText = useSignal("");

  const syncFormFromItem = $((currentItem: MediaItem | null) => {
    if (currentItem) {
      editName.value = currentItem.name || currentItem.filename || "";
      editAltText.value = currentItem.alt_text || "";
      saveSuccess.value = false;
      saveError.value = null;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const current = track(() => item.value);
    syncFormFromItem(current);
  });

  const handleClose = $(() => {
    item.value = null;
    if (onClose$) {
      onClose$();
    }
  });

  const handleCopyUrl = $(async () => {
    if (!item.value) return;
    try {
      await navigator.clipboard.writeText(item.value.url);
      isCopied.value = true;
      setTimeout(() => {
        isCopied.value = false;
      }, 2000);
    } catch {
      // fallback
    }
  });

  const handleSaveMeta = $(async () => {
    if (!item.value) return;
    isSaving.value = true;
    saveError.value = null;
    saveSuccess.value = false;

    try {
      const updated = await invoke<MediaItem>("media_update", {
        mediaId: item.value.id,
        data: {
          name: editName.value.trim() || item.value.filename,
          alt_text: editAltText.value.trim() || null,
        },
      });

      item.value = { ...item.value, ...updated };
      saveSuccess.value = true;
      isSaving.value = false;

      if (onUpdated$) {
        await onUpdated$(item.value);
      }

      setTimeout(() => {
        saveSuccess.value = false;
      }, 2500);
    } catch (err) {
      saveError.value = String(err);
      isSaving.value = false;
    }
  });

  const handleDelete = $(async () => {
    if (!item.value) return;
    if (!confirm(`Are you sure you want to delete "${item.value.filename}"?`)) return;

    isDeleting.value = true;
    try {
      const targetId = item.value.id;
      await invoke("media_delete", { mediaId: targetId });
      isDeleting.value = false;
      item.value = null;
      if (onDeleted$) {
        await onDeleted$(targetId);
      }
    } catch (err) {
      alert(`Delete failed: ${err}`);
      isDeleting.value = false;
    }
  });

  if (!item.value) return null;

  const current = item.value;
  const isImage = current.file_type === "image" || current.url.match(/\.(jpeg|jpg|gif|png|svg|webp|avif)/i);
  const isPdfOrDoc = current.file_type === "document" || current.url.toLowerCase().endsWith(".pdf");

  return (
    <div
      onClick$={handleClose}
      window:onKeyDown$={(e) => {
        if (e.key === "Escape") handleClose();
      }}
      style={{
        position: "fixed",
        inset: "0",
        zIndex: `${zIndex}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(10, 10, 15, 0.82)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        onClick$={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: isPdfOrDoc ? "68rem" : "56rem",
          maxHeight: "92vh",
          background: "var(--surface-2, #18181b)",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: "0.75rem",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.875rem 1.25rem",
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
            background: "var(--surface-3, #27272a)",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "0.375rem",
                background: "var(--surface-2, #18181b)",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent, #6366f1)",
                flexShrink: 0,
              }}
            >
              {isImage ? (
                <LuImage style="width:1.125rem;height:1.125rem;" />
              ) : (
                <LuFile style="width:1.125rem;height:1.125rem;" />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "var(--text-primary, #ffffff)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={current.name || current.filename}
              >
                {current.name || current.filename}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary, #a1a1aa)", marginTop: "2px" }}>
                <span>{(current.size_bytes / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{current.storage_provider}</span>
                {current.url.includes(".avif") && (
                  <>
                    <span>•</span>
                    <span style={{ color: "var(--accent, #6366f1)", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                      <LuZap style="width:0.75rem;height:0.75rem;" /> AVIF
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            <button
              type="button"
              onClick$={handleCopyUrl}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                height: "2rem",
                padding: "0 0.75rem",
                background: "var(--surface-2, #18181b)",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--text-primary, #ffffff)",
                cursor: "pointer",
              }}
            >
              {isCopied.value ? (
                <>
                  <LuCheck style="width:0.875rem;height:0.875rem;color:var(--success, #22c55e);" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <LuCopy style="width:0.875rem;height:0.875rem;" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                height: "2rem",
                padding: "0 0.75rem",
                background: "var(--surface-2, #18181b)",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--text-primary, #ffffff)",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <LuExternalLink style="width:0.875rem;height:0.875rem;" />
              <span>Open</span>
            </a>

            <button
              type="button"
              onClick$={handleDelete}
              disabled={isDeleting.value}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "2rem",
                height: "2rem",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "0.375rem",
                color: "var(--error, #ef4444)",
                cursor: "pointer",
              }}
              title="Delete Media"
            >
              {isDeleting.value ? (
                <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
              ) : (
                <LuTrash2 style="width:0.875rem;height:0.875rem;" />
              )}
            </button>

            <button
              type="button"
              onClick$={handleClose}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "2rem",
                height: "2rem",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary, #a1a1aa)",
                cursor: "pointer",
                borderRadius: "0.375rem",
              }}
              title="Close (Esc)"
              aria-label="Close"
            >
              <LuX style="width:1.25rem;height:1.25rem;" />
            </button>
          </div>
        </div>

        {/* Modal Body / Visual Preview Canvas */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-1, #09090b)",
            padding: isPdfOrDoc ? "0" : "1.25rem",
            overflow: "hidden",
            minHeight: "220px",
            maxHeight: "55vh",
          }}
        >
          {isImage ? (
            <img
              src={current.local_url || current.url}
              alt={current.alt_text || current.filename}
              width={800}
              height={600}
              onError$={(e) => {
                (e.target as HTMLImageElement).src = current.url;
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "52vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: "0.375rem",
                boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
              }}
            />
          ) : isPdfOrDoc ? (
            <iframe
              src={current.url}
              title={current.filename}
              style={{
                width: "100%",
                height: "52vh",
                border: "none",
                background: "#ffffff",
              }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary, #a1a1aa)", padding: "2rem" }}>
              <LuFile style="width:3.5rem;height:3.5rem;" />
              <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{current.filename}</div>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8125rem",
                  color: "var(--accent, #6366f1)",
                  textDecoration: "underline",
                }}
              >
                <LuExternalLink style="width:0.875rem;height:0.875rem;" /> Download / View File
              </a>
            </div>
          )}
        </div>

        {/* Bottom Section: Name & Alt Text / SEO Meta Editor */}
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "var(--surface-2, #18181b)",
            borderTop: "1px solid var(--border, rgba(255,255,255,0.1))",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {saveError.value && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "#ef4444",
                fontSize: "0.75rem",
              }}
            >
              {saveError.value}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: "0.75rem",
              alignItems: "flex-end",
            }}
          >
            {/* Name / Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary, #a1a1aa)" }}>
                Display Name
              </label>
              <input
                type="text"
                value={editName.value}
                onInput$={(e) => {
                  editName.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="Asset display name..."
                style={{
                  height: "2.25rem",
                  padding: "0 0.75rem",
                  background: "var(--field-fill, var(--surface-3, #27272a))",
                  border: "1px solid var(--field-border, var(--border, rgba(255,255,255,0.1)))",
                  borderRadius: "0.375rem",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "0.8125rem",
                  outline: "none",
                  width: "100%",
                }}
              />
            </div>

            {/* Alt Text (SEO) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary, #a1a1aa)" }}>
                Alt Text (SEO & Accessibility)
              </label>
              <input
                type="text"
                value={editAltText.value}
                onInput$={(e) => {
                  editAltText.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="Describe for screen readers & SEO..."
                style={{
                  height: "2.25rem",
                  padding: "0 0.75rem",
                  background: "var(--field-fill, var(--surface-3, #27272a))",
                  border: "1px solid var(--field-border, var(--border, rgba(255,255,255,0.1)))",
                  borderRadius: "0.375rem",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "0.8125rem",
                  outline: "none",
                  width: "100%",
                }}
              />
            </div>

            {/* Save Button */}
            <button
              type="button"
              onClick$={handleSaveMeta}
              disabled={isSaving.value}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                height: "2.25rem",
                padding: "0 1rem",
                background: saveSuccess.value ? "var(--success, #22c55e)" : "var(--button-primary-bg, var(--accent, #6366f1))",
                color: saveSuccess.value ? "#ffffff" : "var(--button-primary-text, #ffffff)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
            >
              {isSaving.value ? (
                <>
                  <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess.value ? (
                <>
                  <LuCheck style="width:0.875rem;height:0.875rem;" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <LuSave style="width:0.875rem;height:0.875rem;" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>

          {/* Footer Metadata Info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.7rem",
              color: "var(--text-secondary, #71717a)",
              marginTop: "0.125rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>File: {current.filename}</span>
              {current.mime_type && <span>• {current.mime_type}</span>}
            </div>
            <div>
              {current.created_at ? (
                <span>Uploaded {new Date(current.created_at * 1000).toLocaleDateString()}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
