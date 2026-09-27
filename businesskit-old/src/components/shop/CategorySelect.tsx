// src/components/shop/CategorySelect.tsx
//
// WHAT: Dropdown that lists shop_categories + a "Create new category" button
//       that opens a SlideOver to create a new category with optional parent_id.
//
// USAGE:
//   <CategorySelect
//     value={form.shop_category_id}
//     onChange$={(id) => { form.shop_category_id = id; }}
//     categories={categories}          ← Signal<ShopCategory[]>
//     onCreated$={(newCat) => { categories.value = [...categories.value, newCat]; }}
//     showNewSignal={categoryShowNew}
//   />

import {
  component$,
  useSignal,
  useComputed$,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuLoader } from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import type { ShopCategory } from "~/components/shop/AddProductModal";

export interface CategorySelectProps {
  value: string;
  onChange$: PropFunction<(id: string) => void>;
  categories: Signal<ShopCategory[]>;
  onCreated$?: PropFunction<(cat: ShopCategory) => void>;
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

export const CategorySelect = component$<CategorySelectProps>(({
  value, onChange$, categories, onCreated$, showNewSignal,
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

  const createCategory = $(async () => {
    const name = newName.value.trim();
    if (!name) { error.value = "Name is required"; return; }
    saving.value = true;
    error.value = "";
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const cat = await invoke<ShopCategory>("shop_create_category", {
        data: {
          name,
          slug,
          parent_id: newParent.value || null,
        },
      });
      categories.value = [...categories.value, cat].sort((a, b) => a.name.localeCompare(b.name));
      await onChange$(cat.id);
      if (onCreated$) await onCreated$(cat);
      showNew.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const formattedCategories = useComputed$(() => {
    const list = categories.value;
    const roots = list.filter((c) => !c.parent_id);
    const result: { id: string; name: string }[] = [];

    for (const parent of roots) {
      result.push({ id: parent.id, name: parent.name });
      const children = list.filter((c) => c.parent_id === parent.id);
      for (const child of children) {
        result.push({ id: child.id, name: `↳ ${child.name}` });
      }
    }

    const addedIds = new Set(result.map((r) => r.id));
    for (const orphan of list) {
      if (!addedIds.has(orphan.id)) {
        result.push({ id: orphan.id, name: orphan.name });
      }
    }

    return result;
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
        <option value="" disabled>Select category…</option>
        {formattedCategories.value.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      {/* ── SlideOver for Category Creation ────────────────────────────────────────── */}
      <SlideOver
        open={showNew}
        title="New Category"
        subtitle="Create category to organize products."
        width="400px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          <div>
            <label style={labelStyle}>Category Name *</label>
            <input
              type="text"
              placeholder="e.g. Apparel, Electronics, Medicines"
              value={newName.value}
              onInput$={(e) => { newName.value = (e.target as HTMLInputElement).value; }}
              autoFocus
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Parent Category (Optional)</label>
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
              {categories.value.filter(c => !c.parent_id).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Sticky save footer */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0.5rem -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              disabled={saving.value}
              onClick$={createCategory}
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
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Create Category"}
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
