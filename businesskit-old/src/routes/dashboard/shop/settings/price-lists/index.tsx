// src/routes/dashboard/shop/settings/price-lists/index.tsx
//
// Price List Management — Phase 3
//
// USER FLOW:
//   1. See all price lists (name, discount%, item count, assigned customers)
//   2. Create a new price list (name, description, global discount%)
//   3. Click a list → slideout to set per-item price overrides
//   4. On Customer page: assign/remove a price list via CustomerLookupSlideOver
//
// At billing: NewBillModal picks customer → backend resolves item prices
// via shop_resolve_item_price (item override OR global discount).
//
// IPC: shop_list_price_lists, shop_create_price_list, shop_update_price_list,
//      shop_assign_customer_price_list

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";

interface PriceList {
  id:               string;
  name:             string;
  description:      string | null;
  discount_pct:     number;
  price_list_items: string;  // JSON map { item_id: price }
  is_active:        boolean;
  created_at:       number;
}

interface ShopItem { id: string; name: string; sku: string | null; price: number; }

const fmtPct = (n: number) => n === 0 ? "No discount" : `${n}% off`;
const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp = {
  width: "100%", height: "2.25rem", padding: "0 0.75rem",
  background: "var(--field-fill)", border: "1px solid var(--border)",
  borderRadius: "0.375rem", color: "var(--text-primary)",
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const,
};

const lbl = {
  display: "block", fontSize: "0.8125rem",
  fontWeight: "500" as const, color: "var(--text-secondary)", marginBottom: "0.375rem",
};

export default component$(() => {
  const lists    = useSignal<PriceList[]>([]);
  const allItems = useSignal<ShopItem[]>([]);
  const loading  = useSignal(true);
  const saving   = useSignal(false);
  const error    = useSignal<string | null>(null);

  // Create form
  const showCreate = useSignal(false);
  const fname      = useSignal("");
  const fdesc      = useSignal("");
  const fdisc      = useSignal("0");

  // Edit slideout
  const editId     = useSignal<string | null>(null);
  const editList   = useComputed$(() => lists.value.find(l => l.id === editId.value) ?? null);
  const editOverrides = useSignal<Record<string, string>>({});  // item_id → override price string

  const load = $(async () => {
    loading.value = true;
    try {
      const [pls, items] = await Promise.all([
        invoke<PriceList[]>("shop_list_price_lists", {}),
        invoke<ShopItem[]>("shop_list_items", {}).catch(() => [] as ShopItem[]),
      ]);
      lists.value    = pls;
      allItems.value = items;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => { await load(); });

  const handleCreate = $(async () => {
    if (!fname.value.trim()) { error.value = "Name is required"; return; }
    saving.value = true; error.value = null;
    try {
      await invoke("shop_create_price_list", {
        data: {
          name:         fname.value.trim(),
          description:  fdesc.value.trim() || null,
          discount_pct: parseFloat(fdisc.value) || 0,
        },
      });
      fname.value = ""; fdesc.value = ""; fdisc.value = "0";
      showCreate.value = false;
      await load();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const openEdit = $((id: string) => {
    const pl = lists.value.find(l => l.id === id);
    if (!pl) return;
    const parsed: Record<string, number> = (() => {
      try { return JSON.parse(pl.price_list_items); } catch { return {}; }
    })();
    const strMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) strMap[k] = String(v);
    editOverrides.value = strMap;
    editId.value = id;
  });

  const saveOverrides = $(async () => {
    if (!editId.value) return;
    saving.value = true;
    try {
      const numMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(editOverrides.value)) {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) numMap[k] = n;
      }
      await invoke("shop_update_price_list", {
        id: editId.value,
        data: { price_list_items: JSON.stringify(numMap) },
      });
      await load();
      editId.value = null;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const deactivate = $(async (id: string) => {
    if (!confirm("Archive this price list?")) return;
    try {
      await invoke("shop_update_price_list", { id, data: { is_active: false } });
      await load();
    } catch (e) { error.value = String(e); }
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>

      {/* Edit item overrides slideout */}
      {editId.value && editList.value && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", justifyContent: "flex-end" }}
          onClick$={(e) => { if ((e.target as HTMLElement) === e.currentTarget) editId.value = null; }}>
          <div style={{ width: "440px", background: "var(--surface-1)", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.25)", overflowY: "auto" }}>
            <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--text-primary)" }}>{editList.value.name}</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Set per-item price overrides · Global discount: {fmtPct(editList.value.discount_pct)}
                </div>
              </div>
              <button type="button" onClick$={() => { editId.value = null; }}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "1.25rem", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ flex: 1, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                Leave blank to use the global {editList.value.discount_pct > 0 ? `${editList.value.discount_pct}% discount` : "base price"}.
              </div>
              {allItems.value.map(item => {
                const overrideVal = editOverrides.value[item.id] ?? "";
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        Base: {fmtMoney(item.price)}
                        {item.sku && ` · ${item.sku}`}
                      </div>
                    </div>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <span style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--text-secondary)", pointerEvents: "none" }}>₹</span>
                      <input type="number" min="0" step="0.01"
                        value={overrideVal}
                        placeholder={String(item.price)}
                        onInput$={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          editOverrides.value = { ...editOverrides.value, [item.id]: v };
                        }}
                        style={{ ...inp, width: "100px", paddingLeft: "1.5rem" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
              <button type="button" disabled={saving.value} onClick$={saveOverrides}
                style={{ width: "100%", height: "2.5rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer" }}>
                {saving.value ? "Saving…" : "Save Price Overrides"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>Price Lists</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
            Named price tiers (Retail, Wholesale, Staff) assigned per customer.
          </p>
        </div>
        <button type="button" onClick$={() => { showCreate.value = !showCreate.value; }}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1rem", height: "2.25rem", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Price List
        </button>
      </div>

      {error.value && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error.value}
          <button type="button" onClick$={() => { error.value = null; }} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "var(--error)" }}>✕</button>
        </div>
      )}

      {/* Create form */}
      {showCreate.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "1rem" }}>Create Price List</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
            <div>
              <label style={lbl}>Name *</label>
              <input type="text" value={fname.value}
                onInput$={(e) => { fname.value = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Wholesale, Staff 20%, Happy Hours" style={inp} />
            </div>
            <div>
              <label style={lbl}>Global Discount %</label>
              <input type="number" min="0" max="100" step="0.5" value={fdisc.value}
                onInput$={(e) => { fdisc.value = (e.target as HTMLInputElement).value; }}
                placeholder="0" style={inp} />
            </div>
            <button type="button" disabled={saving.value} onClick$={handleCreate}
              style={{ height: "2.25rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1.25rem", fontSize: "0.875rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer", flexShrink: 0 }}>
              {saving.value ? "Creating…" : "Create"}
            </button>
          </div>
          <div style={{ marginTop: "0.625rem" }}>
            <label style={lbl}>Description (optional)</label>
            <input type="text" value={fdesc.value}
              onInput$={(e) => { fdesc.value = (e.target as HTMLInputElement).value; }}
              placeholder="e.g. Applied to all wholesale accounts" style={inp} />
          </div>
        </div>
      )}

      {/* Price list table */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading price lists…</div>
      ) : lists.value.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏷️</div>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>No price lists yet</div>
          <div style={{ fontSize: "0.8125rem", maxWidth: "24rem", margin: "0 auto" }}>
            Create a price list like "Wholesale (20% off)" then assign it to a customer.
            Their bills will auto-apply the discounted price.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {lists.value.map(pl => {
            const itemCount = (() => {
              try { return Object.keys(JSON.parse(pl.price_list_items)).length; } catch { return 0; }
            })();
            return (
              <div key={pl.id}
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.9375rem" }}>{pl.name}</div>
                  {pl.description && <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{pl.description}</div>}
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.375rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", background: pl.discount_pct > 0 ? "rgba(99,102,241,0.12)" : "var(--surface-3)", color: pl.discount_pct > 0 ? "#818cf8" : "var(--text-secondary)", border: `1px solid ${pl.discount_pct > 0 ? "rgba(99,102,241,0.3)" : "var(--border)"}`, borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontWeight: "600" }}>
                      {fmtPct(pl.discount_pct)}
                    </span>
                    {itemCount > 0 && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {itemCount} item override{itemCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{pl.id}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button type="button" onClick$={$(() => openEdit(pl.id))}
                    style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.35rem 0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer", fontWeight: "500" }}>
                    Item Prices
                  </button>
                  <button type="button" onClick$={$(() => deactivate(pl.id))}
                    style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.375rem", padding: "0.35rem 0.75rem", fontSize: "0.8125rem", color: "var(--error)", cursor: "pointer" }}>
                    Archive
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Usage tip */}
      <div style={{ marginTop: "2rem", padding: "1rem 1.25rem", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
        <strong style={{ color: "var(--text-primary)" }}>How it works:</strong> Create a price list here →
        Go to <strong>Customers</strong> → open a customer profile → assign the price list.
        Next time you bill that customer in POS, their discounted prices are applied automatically.
      </div>
    </div>
  );
});
