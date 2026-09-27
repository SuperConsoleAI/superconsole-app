// src/components/shop/restaurant/AddTableSlideOver.tsx
//
// WHAT: SlideOver to create / edit a dining table or room.
//       Matches exact design language of AddProductModal.tsx:
//         - SlideOver wrapper, SectionTitle dividers, var(--field-fill) inputs
//         - var(--button-primary-bg) / var(--button-primary-text) save button
//         - Sticky save footer

import {
  component$,
  useSignal,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuSave, LuLoader } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";

export interface ShopTable {
  id: string;
  profile_id: string;
  location_type: string;
  name: string;
  number?: string;
  floor?: string;
  capacity: number;
  base_rate: number;
  amenities: string;
  status: string;
  is_active: number;
  sort_order: number;
}

export interface AddTableSlideOverProps {
  open: Signal<boolean>;
  editingTable?: Signal<ShopTable | null>;
  onSaved$: PropFunction<(table: ShopTable) => void>;
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



export const AddTableSlideOver = component$<AddTableSlideOverProps>(
  ({ open, editingTable, onSaved$ }) => {
    const name     = useSignal("");
    const number   = useSignal("");
    const floor    = useSignal("Main Floor");
    const capacity = useSignal(4);
    const baseRate = useSignal(0);
    const saving   = useSignal(false);
    const error    = useSignal<string | null>(null);

    useTask$(({ track }) => {
      const tbl = track(() => editingTable?.value);
      if (tbl) {
        name.value     = tbl.name || "";
        number.value   = tbl.number || "";
        floor.value    = tbl.floor || "Main Floor";
        capacity.value = tbl.capacity || 4;
        baseRate.value = tbl.base_rate || 0;
      } else {
        name.value     = "";
        number.value   = "";
        floor.value    = "Main Floor";
        capacity.value = 4;
        baseRate.value = 0;
      }
    });

    const handleSave = $(async () => {
      if (!name.value.trim()) {
        error.value = "Table name is required";
        return;
      }
      saving.value = true;
      error.value  = null;

      try {
        const res = await invoke<ShopTable>("shop_create_restaurant_table", {
          data: {
            name: name.value.trim(),
            number: number.value.trim() || undefined,
            floor: floor.value.trim() || undefined,
            capacity: Number(capacity.value) || 4,
            base_rate: Number(baseRate.value) || 0,
            amenities: [],
          },
        });
        await onSaved$(res);
        open.value = false;
      } catch (e: any) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver
        open={open}
        title={editingTable?.value ? "Edit Table" : "Add Dining Table"}
        subtitle="Manage seating capacity and floor plan"
        width="480px"
        icon="square"
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

          {/* Section 1: Basic Information */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Table Name / Label *</label>
                <input
                  type="text"
                  placeholder="e.g. Table 4, VIP Booth 1"
                  value={name.value}
                  onInput$={(e) => (name.value = (e.target as HTMLInputElement).value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Table No.</label>
                  <input
                    type="text"
                    placeholder="e.g. T-04"
                    value={number.value}
                    onInput$={(e) => (number.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Floor / Zone</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Dining, Terrace"
                    value={floor.value}
                    onInput$={(e) => (floor.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Seating & Minimum Spend */}
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>Seating Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={capacity.value}
                  onInput$={(e) => (capacity.value = Number((e.target as HTMLInputElement).value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Minimum Charge (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={baseRate.value}
                  onInput$={(e) => (baseRate.value = Number((e.target as HTMLInputElement).value))}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div q:slot="footer" style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.5rem", background: "var(--surface-1)" }}>
          <button
            type="button"
            onClick$={handleSave}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
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
                Saving Table…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                {editingTable?.value ? "Save Changes" : "Add Dining Table"}
              </>
            )}
          </button>
        </div>
      </SlideOver>
    );
  }
);
