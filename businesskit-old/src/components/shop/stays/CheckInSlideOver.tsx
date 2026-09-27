// src/components/shop/stays/CheckInSlideOver.tsx
//
// SlideOver component for Front Desk Check-in & Guest ID capture.
// Follows exact color palette & height standards of AddProductModal.tsx and SlideOver.tsx:
// - Panel: var(--surface-2)
// - Inputs: var(--field-fill) with var(--border)
// - Header height: 3.5rem, padding: 0 1.25rem
// - Footer padding: 0.875rem 1.25rem

import { component$, useSignal, useTask$, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import type { StayReservation } from "./RoomLayoutGrid";

interface CheckInSlideOverProps {
  open: Signal<boolean>;
  reservation?: StayReservation | null;
  onCheckedIn$?: PropFunction<() => void>;
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

export const CheckInSlideOver = component$<CheckInSlideOverProps>(
  ({ open, reservation, onCheckedIn$ }) => {
    const guestName = useSignal(reservation?.customer_name || "");
    const idType = useSignal("aadhaar");
    const idNumber = useSignal("");
    const nationality = useSignal("Indian");
    const saving = useSignal(false);
    const errorMsg = useSignal("");

    // Keep guest name updated when reservation changes or slideover opens
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const name = track(() => reservation?.customer_name);
      track(() => reservation?.id);
      if (isOpen) {
        guestName.value = name || "";
      }
    });

    const handleCheckIn = $(async () => {
      if (!reservation?.id) {
        errorMsg.value = "No reservation selected";
        return;
      }
      if (!guestName.value.trim()) {
        errorMsg.value = "Please enter primary guest name";
        return;
      }

      saving.value = true;
      errorMsg.value = "";

      try {
        await invoke("shop_check_in_guest", {
          reservationId: reservation.id,
          primaryGuestName: guestName.value.trim(),
          idType: idType.value,
          idNumber: idNumber.value.trim() || null,
          nationality: nationality.value.trim() || "Indian",
        });

        open.value = false;
        onCheckedIn$?.();
      } catch (e: any) {
        console.error("[CheckInSlideOver] check-in failed:", e);
        errorMsg.value = typeof e === "string" ? e : e.message || "Failed to complete check-in";
      } finally {
        saving.value = false;
      }
    });

    if (!reservation) return null;

    return (
      <SlideOver
        open={open}
        title="Guest Check-In"
        subtitle="Record guest ID proof & open running tab"
        icon="users"
        width="480px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              background: "var(--surface-3)",
              padding: "0.875rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {reservation.room_name || "Room Assigned"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              Reservation ID: {reservation.id} · {reservation.party_size} Guest(s)
            </div>
          </div>

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

          <div>
            <label style={labelStyle}>
              Primary Guest Full Name <span style="color:var(--error);">*</span>
            </label>
            <input
              type="text"
              placeholder="Full name as on ID"
              value={guestName.value}
              onInput$={(e: any) => (guestName.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>ID Proof Type</label>
            <select
              value={idType.value}
              onChange$={(e: any) => (idType.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <option value="aadhaar">Aadhaar Card</option>
              <option value="passport">Passport</option>
              <option value="driving_license">Driving License</option>
              <option value="voter_id">Voter ID</option>
              <option value="pan">PAN Card</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>ID Document Number</label>
            <input
              type="text"
              placeholder="e.g. XXXX-XXXX-1234 or Passport No."
              value={idNumber.value}
              onInput$={(e: any) => (idNumber.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Nationality</label>
            <input
              type="text"
              placeholder="e.g. Indian, American, British"
              value={nationality.value}
              onInput$={(e: any) => (nationality.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
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
            onClick$={handleCheckIn}
            disabled={saving.value}
            style={{
              height: "2.25rem",
              padding: "0 1.25rem",
              borderRadius: "0.375rem",
              background: "var(--button-primary-bg)",
              border: "none",
              color: "var(--button-primary-text)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: saving.value ? "wait" : "pointer",
              opacity: saving.value ? 0.7 : 1,
            }}
          >
            {saving.value ? "Checking In..." : "Complete Check-In"}
          </button>
        </div>
      </SlideOver>
    );
  }
);
