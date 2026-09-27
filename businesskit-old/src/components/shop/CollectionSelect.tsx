// src/components/shop/CollectionSelect.tsx
//
// WHAT: Dropdown that lists shop collections + a "Create new collection" button
//       that opens a SlideOver to create a new collection with a parent_id.
//
// USAGE:
//   <CollectionSelect
//     value={form.collection_id}
//     onChange$={(id) => { form.collection_id = id; }}
//     collections={collections}          ← Signal<ShopCollection[]>
//     onCreated$={(newCol) => { collections.value = [...collections.value, newCol]; }}
//   />

import {
  component$,
  useSignal,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuLoader } from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";

export interface ShopCollection {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  description?: string;
  sort_order: number;
  is_default?: number;
  is_active: number;
  item_ids: string;
}

export interface CollectionSelectProps {
  value: string;
  onChange$: PropFunction<(id: string) => void>;
  collections: Signal<ShopCollection[]>;
  onCreated$?: PropFunction<(col: ShopCollection) => void>;
  showNewSignal?: Signal<boolean>;
}

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const CollectionSelect = component$<CollectionSelectProps>(({
  value, onChange$, collections, onCreated$, showNewSignal,
}) => {
  const internalShowNew = useSignal(false);
  const showNew = showNewSignal || internalShowNew;
  const newName = useSignal("");
  const newParent = useSignal("");
  const newDesc = useSignal("");
  const saving = useSignal(false);
  const error = useSignal("");

  // Reset new-form when toggled off
  useTask$(({ track }) => {
    const open = track(() => showNew.value);
    if (!open) {
      newName.value = "";
      newParent.value = "";
      newDesc.value = "";
      error.value = "";
    }
  });

  const createCollection = $(async () => {
    const name = newName.value.trim();
    if (!name) { error.value = "Name is required"; return; }
    saving.value = true;
    error.value = "";
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const col = await invoke<ShopCollection>("shop_create_collection", {
        data: {
          name,
          slug,
          parent_id: newParent.value || null,
          description: newDesc.value.trim() || null
        },
      });
      collections.value = [...collections.value, col].sort((a, b) => a.name.localeCompare(b.name));
      await onChange$(col.id);
      if (onCreated$) await onCreated$(col);
      showNew.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {/* Main select */}
      <select
        value={value}
        onChange$={(e) => onChange$((e.target as HTMLSelectElement).value)}
        style={{
          ...inputStyle,
          cursor: "pointer",
          appearance: "none",
          backgroundImage: SELECT_ARROW,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
          paddingRight: "2.25rem",
        }}
        onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
        onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        <option value="">None</option>
        {collections.value.map(col => (
          <option key={col.id} value={col.id}>{col.name}</option>
        ))}
      </select>

      {/* ── SlideOver for Creation ────────────────────────────────────────── */}
      <SlideOver
        open={showNew}
        title="New Collection"
        subtitle="Create collection to group items."
        width="400px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          <div>
            <label style={labelStyle}>Collection Name *</label>
            <input
              type="text"
              placeholder="e.g. Summer Sale, New Arrivals"
              value={newName.value}
              onInput$={(e) => { newName.value = (e.target as HTMLInputElement).value; }}
              autoFocus
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Parent Collection (Optional)</label>
            <select
              value={newParent.value}
              onChange$={(e) => { newParent.value = (e.target as HTMLSelectElement).value; }}
              style={{
                ...inputStyle,
                cursor: "pointer",
                appearance: "none",
                backgroundImage: SELECT_ARROW,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.75rem center",
                paddingRight: "2.25rem",
              }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <option value="">— None (top level) —</option>
              {collections.value.filter(c => !c.parent_id).map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Description (Optional)</label>
            <textarea
              placeholder="Optional description..."
              value={newDesc.value}
              onInput$={(e) => { newDesc.value = (e.target as HTMLTextAreaElement).value; }}
              rows={3}
              style={{
                ...inputStyle,
                height: "auto",
                padding: "0.625rem 0.75rem",
                resize: "vertical",
              }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Sticky save footer */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0.5rem -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              disabled={saving.value}
              onClick$={createCollection}
              style={{
                flex: 1,
                height: "2.375rem",
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.9rem",
                fontWeight: "600",
                cursor: saving.value ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Create Collection"}
            </button>
            <button
              type="button"
              onClick$={() => { showNew.value = false; }}
              style={{
                height: "2.375rem",
                padding: "0 1.25rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
});
