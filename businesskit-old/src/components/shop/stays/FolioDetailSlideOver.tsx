// src/components/shop/stays/FolioDetailSlideOver.tsx
//
// SlideOver component to view & add running charges to an active Guest Folio.
// Follows exact color palette & height standards of AddProductModal.tsx and SlideOver.tsx:
// - Panel: var(--surface-2)
// - Inputs: var(--field-fill) with var(--border)
// - Header height: 3.5rem, padding: 0 1.25rem
// - Footer padding: 0.875rem 1.25rem

import { component$, useSignal, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";

export interface FolioLine {
  id: string;
  date: number;
  description: string;
  amount: number;
  category: string;
}

export interface StayFolio {
  id: string;
  profile_id: string;
  reservation_id: string;
  room_name?: string | null;
  guest_name?: string | null;
  customer_id?: string | null;
  status: string;
  total_charges: number;
  total_paid: number;
  folio_lines: FolioLine[];
  settlement_doc_id?: string | null;
  opened_at: number;
  settled_at?: number | null;
  created_at: number;
}

interface FolioDetailSlideOverProps {
  open: Signal<boolean>;
  folio?: StayFolio | null;
  onFolioUpdated$?: PropFunction<() => void>;
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

export const FolioDetailSlideOver = component$<FolioDetailSlideOverProps>(
  ({ open, folio, onFolioUpdated$ }) => {
    const newDescription = useSignal("");
    const newAmount = useSignal("");
    const newCategory = useSignal("room_service");
    const adding = useSignal(false);
    const errorMsg = useSignal("");

    const handleAddCharge = $(async () => {
      if (!folio?.id) return;
      if (!newDescription.value.trim() || !newAmount.value || parseFloat(newAmount.value) <= 0) {
        errorMsg.value = "Enter a valid charge description and positive amount";
        return;
      }

      adding.value = true;
      errorMsg.value = "";

      try {
        await invoke("shop_add_folio_charge", {
          data: {
            folio_id: folio.id,
            description: newDescription.value.trim(),
            amount: parseFloat(newAmount.value),
            category: newCategory.value,
          },
        });

        newDescription.value = "";
        newAmount.value = "";
        onFolioUpdated$?.();
      } catch (e: any) {
        console.error("[FolioDetailSlideOver] add charge failed:", e);
        errorMsg.value = typeof e === "string" ? e : e.message || "Failed to add charge";
      } finally {
        adding.value = false;
      }
    });

    if (!folio) return null;

    return (
      <SlideOver
        open={open}
        title={`${folio.room_name || "Running Tab"} Folio`}
        subtitle={`Guest: ${folio.guest_name || "In-House Guest"}`}
        icon="book"
        width="480px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {errorMsg.value && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--error)",
                padding: "0.75rem 1rem",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {errorMsg.value}
            </div>
          )}

          {/* Add Charge Panel */}
          <div
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              padding: "1rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
              Add Incidental Charge
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <input
                type="text"
                placeholder="Charge description (e.g. Dinner Room Service)"
                value={newDescription.value}
                onInput$={(e: any) => (newDescription.value = e.target.value)}
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
              <input
                type="number"
                placeholder="Amount (₹)"
                value={newAmount.value}
                onInput$={(e: any) => (newAmount.value = e.target.value)}
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <select
                value={newCategory.value}
                onChange$={(e: any) => (newCategory.value = e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              >
                <option value="room_service">Room Service (Food)</option>
                <option value="laundry">Laundry</option>
                <option value="minibar">Minibar</option>
                <option value="tax">Tax / Service Charge</option>
                <option value="other">Other Incidentals</option>
              </select>

              <button
                type="button"
                onClick$={handleAddCharge}
                disabled={adding.value}
                style={{
                  height: "2.25rem",
                  padding: "0 1rem",
                  borderRadius: "0.375rem",
                  background: "var(--button-primary-bg)",
                  color: "var(--button-primary-text)",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: adding.value ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  whiteSpace: "nowrap",
                }}
              >
                <LuPlus style="width:0.875rem;height:0.875rem;" />
                Add Charge
              </button>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
              Folio Statement ({folio.folio_lines.length} items)
            </div>

            <div
              style={{
                background: "var(--surface-3)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              {folio.folio_lines.map((line, i) => (
                <div
                  key={line.id || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    borderBottom: i < folio.folio_lines.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {line.description}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                      {new Date(line.date * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    ₹{line.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total Balance Summary */}
          <div
            style={{
              padding: "0.875rem 1rem",
              background: "var(--surface-3)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Total Folio Balance:
            </span>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--brand-primary)" }}>
              ₹{folio.total_charges.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          q:slot="footer"
          style={{
            padding: "0.875rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick$={() => (open.value = false)}
            style={{
              height: "2.25rem",
              padding: "0 1.25rem",
              borderRadius: "0.375rem",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </SlideOver>
    );
  }
);
