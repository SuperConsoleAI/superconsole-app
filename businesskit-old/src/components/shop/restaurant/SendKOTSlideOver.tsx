// src/components/shop/restaurant/SendKOTSlideOver.tsx
//
// WHAT: SlideOver panel for creating and sending a Kitchen Order Ticket (KOT).
//       Matches exact design language of AddProductModal.tsx:
//         - SlideOver wrapper, SectionTitle dividers, var(--field-fill) inputs
//         - var(--button-primary-bg) / var(--button-primary-text) action button
//         - Sticky save footer
//         - Only displays Menu items (cat_29)
//         - Fully reactive quantity (+ / -) steppers using useSignal

import {
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuFlame,
  LuLoader,
  LuPlus,
  LuMinus,
  LuTrash2,
  LuUtensils,
  LuUsers,
  LuChevronDown,
  LuX,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import type { ShopStaffMember } from "~/components/shop/AddStaffSlideOver";

export interface KOTLine {
  id: string;
  item_id: string;
  item_name: string;
  qty: number;
  unit_price?: number;
  notes?: string;
}

export interface ShopKOT {
  id: string;
  profile_id: string;
  doc_number: string;
  location_id?: string;
  location_name?: string;
  waiter_name?: string;
  status: string;
  lines: KOTLine[];
  notes?: string;
  created_at: number;
}

export interface SendKOTSlideOverProps {
  open: Signal<boolean>;
  prefillTableId?: string;
  prefillWaiterName?: string;
  onSent$: PropFunction<(kot: ShopKOT) => void>;
}

interface TableOption {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id?: string;
}

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};



export const getStaffName = (s: ShopStaffMember) =>
  s.display_name || s.name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Staff Member";

export const SendKOTSlideOver = component$<SendKOTSlideOverProps>(
  ({ open, prefillTableId, prefillWaiterName, onSent$ }) => {
    const tables = useSignal<TableOption[]>([]);
    const menuItems = useSignal<MenuItem[]>([]);
    const staffMembers = useSignal<ShopStaffMember[]>([]);
    const isStaffDropdownOpen = useSignal(false);
    const selTableId = useSignal(prefillTableId || "");
    const waiterName = useSignal(prefillWaiterName || "");
    const notes = useSignal("");
    const lines = useSignal<KOTLine[]>([]);
    const saving = useSignal(false);
    const error = useSignal<string | null>(null);

    // Selected item picker state
    const pickerItemId = useSignal("");
    const pickerQty = useSignal(1);

    // Sync prefillTableId and prefillWaiterName when opened or changed
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const prefillT = track(() => prefillTableId);
      const prefillW = track(() => prefillWaiterName);
      if (isOpen) {
        if (prefillT) {
          const matched = tables.value.find(
            (t) => t.id === prefillT || t.name === prefillT || t.name.toLowerCase() === prefillT.toLowerCase()
          );
          selTableId.value = matched ? matched.id : prefillT;
        } else {
          selTableId.value = "";
        }

        if (prefillW) {
          waiterName.value = prefillW;
        } else {
          waiterName.value = "";
        }
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) return;

      try {
        const [tRes, mRes, sRes] = await Promise.all([
          invoke<TableOption[]>("shop_list_restaurant_tables", {}).catch(() => []),
          invoke<any[]>("shop_list_items", {}).catch(() => []),
          invoke<ShopStaffMember[]>("shop_list_staff", {}).catch(() => []),
        ]);
        tables.value = tRes.map((t) => ({ id: t.id, name: t.name }));
        staffMembers.value = sRes;

        // Filter only Menu dishes (category_id === 'cat_29')
        const menuDishes = mRes.filter((i) => i.category_id === "cat_29");
        menuItems.value = (menuDishes.length > 0 ? menuDishes : mRes).map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price || 0,
          category_id: i.category_id,
        }));

        if (prefillTableId) {
          const matched = tRes.find(
            (t) => t.id === prefillTableId || t.name === prefillTableId || t.name.toLowerCase() === prefillTableId.toLowerCase()
          );
          selTableId.value = matched ? matched.id : prefillTableId;
        } else {
          selTableId.value = "";
        }

        if (prefillWaiterName && prefillWaiterName.trim()) {
          waiterName.value = prefillWaiterName.trim();
        } else {
          waiterName.value = "";
        }
      } catch (e) {
        console.error("[SendKOTSlideOver] load failed:", e);
      }
    });

    const addItemLine = $(() => {
      if (!pickerItemId.value) return;
      const found = menuItems.value.find((m) => m.id === pickerItemId.value);
      if (!found) return;

      const qtyToAdd = Number(pickerQty.value) || 1;
      const existingIdx = lines.value.findIndex((l) => l.item_id === found.id);

      if (existingIdx >= 0) {
        // Increment quantity reactively
        lines.value = lines.value.map((l, idx) =>
          idx === existingIdx ? { ...l, qty: l.qty + qtyToAdd } : l
        );
      } else {
        lines.value = [
          ...lines.value,
          {
            id: `line-${Date.now()}-${Math.random()}`,
            item_id: found.id,
            item_name: found.name,
            qty: qtyToAdd,
            unit_price: found.price || 0,
          },
        ];
      }

      pickerItemId.value = "";
      pickerQty.value    = 1;
    });

    const incrementQty = $((idx: number) => {
      lines.value = lines.value.map((l, i) =>
        i === idx ? { ...l, qty: l.qty + 1 } : l
      );
    });

    const decrementQty = $((idx: number) => {
      if (lines.value[idx]?.qty > 1) {
        lines.value = lines.value.map((l, i) =>
          i === idx ? { ...l, qty: l.qty - 1 } : l
        );
      } else {
        lines.value = lines.value.filter((_, i) => i !== idx);
      }
    });

    const removeLine = $((idx: number) => {
      lines.value = lines.value.filter((_, i) => i !== idx);
    });

    const handleSend = $(async () => {
      if (lines.value.length === 0) {
        error.value = "Please add at least one dish item to the KOT";
        return;
      }
      saving.value = true;
      error.value  = null;

      try {
        const res = await invoke<ShopKOT>("shop_send_kot", {
          data: {
            location_id: selTableId.value || undefined,
            waiter_name: waiterName.value.trim() || undefined,
            lines: lines.value.map((l) => ({
              id: l.id,
              item_id: l.item_id,
              item_name: l.item_name,
              qty: l.qty,
              unit_price: l.unit_price || 0,
              notes: l.notes,
            })),
            notes: notes.value.trim() || undefined,
          },
        });

        await onSent$(res);
        open.value = false;
        lines.value = [];
        waiterName.value = "";
        notes.value = "";
      } catch (e: any) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver
        open={open}
        title="Send KOT Ticket"
        subtitle="Kitchen Order Ticket for Dine-in or Takeaway"
        width="520px"
        icon="flame"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
            <div
              style={{
                background: "#fee2e2",
                color: "#dc2626",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
              }}
            >
              {error.value}
            </div>
          )}

          {/* Section 1: Dining Location / Table */}
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Select Table / Spot</label>
                <select
                  value={selTableId.value}
                  onChange$={(e) => (selTableId.value = (e.target as HTMLSelectElement).value)}
                  style={inputStyle}
                >
                  <option value="">-- Takeaway / Quick Order --</option>
                  {tables.value.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Waiter / Server (Staff)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search or select server..."
                    value={waiterName.value}
                    onFocus$={() => (isStaffDropdownOpen.value = true)}
                    onInput$={(e) => {
                      waiterName.value = (e.target as HTMLInputElement).value;
                      isStaffDropdownOpen.value = true;
                    }}
                    style={{ ...inputStyle, paddingRight: "2.25rem" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: "0.625rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {waiterName.value ? (
                      <button
                        type="button"
                        onClick$={() => {
                          waiterName.value = "";
                          isStaffDropdownOpen.value = false;
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.15rem",
                          color: "var(--text-secondary)",
                          display: "flex",
                        }}
                      >
                        <LuX style="width:0.875rem;height:0.875rem;" />
                      </button>
                    ) : (
                      <LuChevronDown
                        style="width:0.875rem;height:0.875rem;cursor:pointer;"
                        onClick$={() => (isStaffDropdownOpen.value = !isStaffDropdownOpen.value)}
                      />
                    )}
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isStaffDropdownOpen.value && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 90 }}
                      onClick$={() => (isStaffDropdownOpen.value = false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: "var(--surface-1)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        maxHeight: "180px",
                        overflowY: "auto",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                        padding: "0.25rem",
                      }}
                    >
                      {(() => {
                        const q = waiterName.value.toLowerCase().trim();
                        const matches = staffMembers.value.filter((s) => {
                          const sName = getStaffName(s).toLowerCase();
                          const sRole = (s.role || "").toLowerCase();
                          if (!q || sName === q) return true;
                          return sName.includes(q) || sRole.includes(q);
                        });
                        if (matches.length === 0) {
                          return (
                            <div style={{ padding: "0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)", textAlign: "center" }}>
                              {staffMembers.value.length === 0 ? "No staff added yet" : `No match for "${waiterName.value}"`}
                            </div>
                          );
                        }
                        return matches.map((staff) => {
                          const displayName = getStaffName(staff);
                          return (
                            <div
                              key={staff.id}
                              onClick$={() => {
                                waiterName.value = displayName;
                                isStaffDropdownOpen.value = false;
                              }}
                              style={{
                                padding: "0.5rem 0.75rem",
                                borderRadius: "0.375rem",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                background: waiterName.value === displayName ? "var(--surface-3)" : "transparent",
                                transition: "background 0.12s",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <LuUsers style="width:0.875rem;height:0.875rem;color:var(--brand-primary);" />
                                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
                                  {displayName}
                                </span>
                              </div>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.15rem 0.4rem",
                                borderRadius: "0.25rem",
                                background: "var(--surface-2)",
                                color: "var(--text-secondary)",
                                textTransform: "capitalize",
                              }}
                            >
                              {staff.role}
                            </span>
                          </div>
                        );
                      });
                    })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Order Line Items */}
          <div>
            
            {/* Quick Dish Picker */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <select
                value={pickerItemId.value}
                onChange$={(e) => (pickerItemId.value = (e.target as HTMLSelectElement).value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">Select menu dish...</option>
                {menuItems.value.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${m.name} (₹${m.price})`}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="1"
                max="99"
                value={pickerQty.value}
                onInput$={(e) => (pickerQty.value = Number((e.target as HTMLInputElement).value))}
                style={{ ...inputStyle, width: "70px" }}
              />

              <button
                type="button"
                onClick$={addItemLine}
                disabled={!pickerItemId.value}
                style={{
                  padding: "0 1rem",
                  background: pickerItemId.value ? "var(--button-primary-bg)" : "var(--muted)",
                  color: pickerItemId.value ? "var(--button-primary-text)" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: pickerItemId.value ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <LuPlus style="width:0.875rem;height:0.875rem;" />
                Add
              </button>
            </div>

            {/* Added Lines Table */}
            {lines.value.length === 0 ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  background: "var(--surface-1)",
                  borderRadius: "0.375rem",
                  border: "1px dashed var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                }}
              >
                <LuUtensils style="width:1.5rem;height:1.5rem;margin-bottom:0.5rem;opacity:0.5;" />
                <div>No dishes added yet. Pick a dish above and click Add.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {lines.value.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.625rem 0.75rem",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: "0.75rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                        {item.item_name}
                      </div>
                      <input
                        type="text"
                        placeholder="Kitchen note (e.g. Less spicy, no onion)"
                        value={item.notes || ""}
                        onInput$={(e) => {
                          const note = (e.target as HTMLInputElement).value;
                          lines.value = lines.value.map((l, i) =>
                            i === idx ? { ...l, notes: note } : l
                          );
                        }}
                        style={{
                          width: "100%",
                          fontSize: "0.75rem",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          outline: "none",
                          padding: "0.15rem 0",
                          marginTop: "0.15rem",
                        }}
                      />
                    </div>

                    {/* Quantity Stepper & Remove */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "var(--surface-2)", padding: "0.15rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                        <button
                          type="button"
                          onClick$={() => decrementQty(idx)}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "0.25rem",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <LuMinus style="width:0.75rem;height:0.75rem;" />
                        </button>
                        
                        <span style={{ minWidth: "22px", textAlign: "center", fontWeight: 700, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                          {item.qty}
                        </span>

                        <button
                          type="button"
                          onClick$={() => incrementQty(idx)}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "0.25rem",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <LuPlus style="width:0.75rem;height:0.75rem;" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick$={() => removeLine(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                          padding: "0.25rem",
                        }}
                      >
                        <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: General Ticket Notes */}
          <div>
            <textarea
              placeholder="Table allergy notice, takeaway instructions, special packaging..."
              value={notes.value}
              onInput$={(e) => (notes.value = (e.target as HTMLTextAreaElement).value)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div q:slot="footer" style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.5rem", background: "var(--surface-1)" }}>
          <button
            type="button"
            onClick$={handleSend}
            disabled={saving.value || lines.value.length === 0}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value || lines.value.length === 0 ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value || lines.value.length === 0 ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value || lines.value.length === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Sending KOT to Kitchen…
              </>
            ) : (
              <>
                <LuFlame style="width:1rem;height:1rem;" stroke-width="1" />
                Send KOT Ticket ({lines.value.reduce((s, l) => s + l.qty, 0)} Items)
              </>
            )}
          </button>
        </div>
      </SlideOver>
    );
  }
);
