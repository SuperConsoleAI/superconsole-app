// src/components/shop/stays/CheckOutSlideOver.tsx
//
// SlideOver component for Guest Check-out & Folio Settlement.
// Follows exact color palette & height standards of AddProductModal.tsx and SlideOver.tsx:
// - Panel: var(--surface-2)
// - Inputs: var(--field-fill) with var(--border)
// - Header height: 3.5rem, padding: 0 1.25rem
// - Footer padding: 0.875rem 1.25rem

import { component$, useSignal, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import type { StayFolio } from "./FolioDetailSlideOver";

interface CheckOutSlideOverProps {
  open: Signal<boolean>;
  folio?: StayFolio | null;
  onCheckedOut$?: PropFunction<() => void>;
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
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const CheckOutSlideOver = component$<CheckOutSlideOverProps>(
  ({ open, folio, onCheckedOut$ }) => {
    const paymentMode = useSignal("cash");
    const notes = useSignal("");
    const settling = useSignal(false);
    const errorMsg = useSignal("");

    const handleCheckOut = $(async () => {
      if (!folio?.id) {
        errorMsg.value = "No open folio selected for settlement";
        return;
      }

      settling.value = true;
      errorMsg.value = "";

      try {
        await invoke("shop_settle_folio", {
          data: {
            folio_id: folio.id,
            payment_mode: paymentMode.value,
            notes: notes.value.trim() || null,
          },
        });

        open.value = false;
        onCheckedOut$?.();
      } catch (e: any) {
        console.error("[CheckOutSlideOver] checkout failed:", e);
        errorMsg.value = typeof e === "string" ? e : e.message || "Failed to complete check-out";
      } finally {
        settling.value = false;
      }
    });

    if (!folio) return null;

    return (
      <SlideOver
        open={open}
        title="Check-Out & Settle Bill"
        subtitle={`${folio.room_name || "Room"} · Guest: ${folio.guest_name || "In-House"}`}
        icon="utensils"
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

          {/* Bill Summary Card */}
          <div
            style={{
              background: "var(--surface-3)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              padding: "1rem 1.25rem",
            }}
          >
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Itemized Folio Charges
            </div>

            <div style={{ margin: "0.75rem 0" }}>
              {folio.folio_lines.map((l, idx) => (
                <div
                  key={l.id || idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <span>{l.description}</span>
                  <span style={{ fontWeight: 600 }}>₹{l.amount.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "0.625rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Grand Total Due:
              </span>
              <span style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--brand-primary)" }}>
                ₹{folio.total_charges.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Payment Collection Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>
                Payment Method <span style="color:var(--error);">*</span>
              </label>
              <select
                value={paymentMode.value}
                onChange$={(e: any) => (paymentMode.value = e.target.value)}
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR Code</option>
                <option value="card">Credit / Debit Card</option>
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="credit">On Account / Credit</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Settlement Notes</label>
              <textarea
                rows={2}
                placeholder="Receipt number, UTR, discount applied..."
                value={notes.value}
                onInput$={(e: any) => (notes.value = e.target.value)}
                style={{ ...inputStyle, resize: "vertical", minHeight: "3.5rem" }}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
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
            gap: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick$={() => (open.value = false)}
            style={{
              height: "2.25rem",
              padding: "0 1rem",
              borderRadius: "0.375rem",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick$={handleCheckOut}
            disabled={settling.value}
            style={{
              height: "2.25rem",
              padding: "0 1.25rem",
              borderRadius: "0.375rem",
              background: "#D97757",
              border: "none",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: settling.value ? "wait" : "pointer",
              opacity: settling.value ? 0.7 : 1,
            }}
          >
            {settling.value ? "Settling..." : "Complete Check-Out"}
          </button>
        </div>
      </SlideOver>
    );
  }
);
