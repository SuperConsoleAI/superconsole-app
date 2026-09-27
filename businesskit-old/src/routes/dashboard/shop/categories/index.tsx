// src/routes/dashboard/shop/categories/index.tsx
//
// Shop › Categories page
// Lists shop_categories in a tree (parent → children).
// Add / Edit opens an inline SlideOver panel.
//
// IPC: shop_list_categories, shop_create_category, shop_update_category

import {
  component$, useSignal, useVisibleTask$, $,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuPencil, LuTrash2, LuFolderOpen, LuLoader } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";

interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  sort_order: number;
  is_default?: number;
  is_active: number;
}

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

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

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export default component$(() => {
  const cats      = useSignal<ShopCategory[]>([]);
  const loading   = useSignal(true);
  const panelOpen = useSignal(false);
  const editing   = useSignal<ShopCategory | null>(null);
  const saving    = useSignal(false);
  const error     = useSignal<string | null>(null);

  // form
  const fName       = useSignal("");
  const fSlug       = useSignal("");
  const fParent     = useSignal("");
  const fDesc       = useSignal("");
  const fIsDefault  = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      cats.value = await invoke<ShopCategory[]>("shop_list_categories", {});
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const openAdd = $(() => {
    editing.value = null;
    fName.value = ""; fSlug.value = ""; fParent.value = ""; fDesc.value = "";
    fIsDefault.value = false;
    error.value = null;
    panelOpen.value = true;
  });

  const openEdit = $((cat: ShopCategory) => {
    editing.value = cat;
    fName.value   = cat.name;
    fSlug.value   = cat.slug;
    fParent.value = cat.parent_id ?? "";
    fDesc.value   = "";
    fIsDefault.value = (cat.is_default ?? 0) === 1;
    error.value   = null;
    panelOpen.value = true;
  });

  const handleSave = $(async () => {
    if (!fName.value.trim()) { error.value = "Name is required"; return; }
    saving.value = true; error.value = null;
    try {
      const data = {
        name:       fName.value.trim(),
        slug:       fSlug.value.trim() || fName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        parent_id:  fParent.value || null,
        is_default: fIsDefault.value ? 1 : 0,
      };
      if (editing.value) {
        const updated = await invoke<ShopCategory>("shop_update_category", {
          categoryId: editing.value.id, data,
        });
        if (fIsDefault.value) {
          cats.value = cats.value.map(c => c.id === updated.id ? updated : { ...c, is_default: 0 });
        } else {
          cats.value = cats.value.map(c => c.id === updated.id ? updated : c);
        }
      } else {
        const created = await invoke<ShopCategory>("shop_create_category", { data });
        if (fIsDefault.value) {
          cats.value = [...cats.value.map(c => ({ ...c, is_default: 0 })), created];
        } else {
          cats.value = [...cats.value, created];
        }
      }
      panelOpen.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleDelete = $(async (id: string) => {
    if (!window.confirm("Delete this category? Products in it will keep their category ID.")) return;
    try {
      await invoke("shop_delete_category", { categoryId: id });
      cats.value = cats.value.filter(c => c.id !== id);
    } catch (e) {
      alert(String(e));
    }
  });

  // Build display tree: roots + children indented
  const roots    = () => cats.value.filter(c => !c.parent_id);
  const children = (pid: string) => cats.value.filter(c => c.parent_id === pid);

  return (
    <>
      <SlideOver
        open={panelOpen}
        title={editing.value ? "Edit Category" : "New Category"}
        subtitle="Organise your products into categories."
        width="420px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              placeholder="e.g. Medicines"
              value={fName.value}
              onInput$={(e) => {
                fName.value = (e.target as HTMLInputElement).value;
                fSlug.value = fName.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              }}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Slug</label>
            <input
              type="text"
              placeholder="auto-generated"
              value={fSlug.value}
              onInput$={(e) => { fSlug.value = (e.target as HTMLInputElement).value; }}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8125rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Parent Category</label>
            <select
              value={fParent.value}
              onChange$={(e) => { fParent.value = (e.target as HTMLSelectElement).value; }}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none", backgroundImage: SELECT_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", paddingRight: "2.25rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <option value="">— None (root) —</option>
              {cats.value
                .filter(c => !editing.value || c.id !== editing.value.id)
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
            <input
              type="checkbox"
              id="cat-default-toggle"
              checked={fIsDefault.value}
              onChange$={(e) => { fIsDefault.value = (e.target as HTMLInputElement).checked; }}
              style={{ width: "1.125rem", height: "1.125rem", cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <label for="cat-default-toggle" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontWeight: "600", display: "block" }}>Default Category</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Used as the default category when creating new products or AI auto-filing.</span>
            </label>
          </div>

          {/* Sticky footer */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0.5rem -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              disabled={saving.value}
              onClick$={handleSave}
              style={{
                flex: 1, height: "2.375rem",
                background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
                border: "none", borderRadius: "0.375rem",
                fontSize: "0.9rem", fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              }}
            >
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Save Category"}
            </button>
            <button
              type="button"
              onClick$={() => { panelOpen.value = false; }}
              style={{ height: "2.375rem", padding: "0 1.25rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-secondary)", fontSize: "0.9rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)" }}>Categories</h1>
        <button
          type="button"
          onClick$={openAdd}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1rem", height: "2.25rem", fontSize: "0.875rem", fontWeight: "500", cursor: "pointer" }}
        >
          <LuPlus style="width:1rem;height:1rem;" /> New Category
        </button>
      </div>

      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: "3rem", background: "var(--surface-2)", borderRadius: "0.375rem", animation: "pulse 2s infinite", animationDelay: `${(i - 1) * 150}ms` }} />)}
        </div>
      ) : cats.value.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", textAlign: "center", gap: "1rem" }}>
          <div style={{ width: "3rem", height: "3rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
            <LuFolderOpen style="width:1.5rem;height:1.5rem;" />
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>No categories yet</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Categories help you organise products. Start with General.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {roots().map(root => (
            <div key={root.id}>
              {/* Root row */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", gap: "0.75rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <LuFolderOpen style="width:1rem;height:1rem;color:var(--accent);flex-shrink:0;" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)" }}>{root.name}</div>
                      {root.is_default === 1 && (
                        <span style={{ fontSize: "0.6875rem", fontWeight: "600", padding: "0.125rem 0.4rem", borderRadius: "0.25rem", background: "var(--accent-soft, rgba(59,130,246,0.12))", color: "var(--accent, #3b82f6)" }}>
                          Default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{root.slug}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <button type="button" onClick$={$(() => openEdit(root))} style={{ padding: "0.3rem 0.45rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--text-secondary)" }}><LuPencil style="width:0.875rem;height:0.875rem;" /></button>
                  <button type="button" onClick$={$(() => handleDelete(root.id))} style={{ padding: "0.3rem 0.45rem", background: "transparent", border: "1px solid transparent", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--error)" }}><LuTrash2 style="width:0.875rem;height:0.875rem;" /></button>
                </div>
              </div>
              {/* Children */}
              {children(root.id).map(child => (
                <div
                  key={child.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem 0.625rem 2.5rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 0.375rem 0.375rem", gap: "0.75rem" }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ fontWeight: "500", fontSize: "0.875rem", color: "var(--text-primary)" }}>{child.name}</div>
                      {child.is_default === 1 && (
                        <span style={{ fontSize: "0.6875rem", fontWeight: "600", padding: "0.125rem 0.4rem", borderRadius: "0.25rem", background: "var(--accent-soft, rgba(59,130,246,0.12))", color: "var(--accent, #3b82f6)" }}>
                          Default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{child.slug}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button type="button" onClick$={$(() => openEdit(child))} style={{ padding: "0.3rem 0.45rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--text-secondary)" }}><LuPencil style="width:0.875rem;height:0.875rem;" /></button>
                    <button type="button" onClick$={$(() => handleDelete(child.id))} style={{ padding: "0.3rem 0.45rem", background: "transparent", border: "1px solid transparent", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--error)" }}><LuTrash2 style="width:0.875rem;height:0.875rem;" /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Categories — Shop" };
