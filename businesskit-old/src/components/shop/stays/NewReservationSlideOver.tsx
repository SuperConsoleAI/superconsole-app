// src/components/shop/stays/NewReservationSlideOver.tsx
//
// SlideOver component to create a new Room Reservation.
// Follows exact color palette & height standards of AddProductModal.tsx and SlideOver.tsx:
// - Panel: var(--surface-2)
// - Inputs: var(--field-fill) with var(--border)
// - Header height: 3.5rem, padding: 0 1.25rem
// - Footer padding: 0.875rem 1.25rem

import { component$, useSignal, useTask$, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import type { StayRoom, StayReservation } from "./RoomLayoutGrid";
import type { CustomerBasic } from "../CustomerLookupSlideOver";
import type { StayPricingCalculation } from "~/lib/types";

interface NewReservationSlideOverProps {
  open: Signal<boolean>;
  rooms: StayRoom[];
  customers: CustomerBasic[];
  prefillRoomId?: string;
  itemTypeLabel?: string;
  defaultBookingType?: "nightly" | "hourly";
  filterLocationType?: "room" | "table";
  onSaved$?: PropFunction<(res: StayReservation) => void>;
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

export const NewReservationSlideOver = component$<NewReservationSlideOverProps>(
  ({ open, rooms, customers, prefillRoomId, itemTypeLabel = "Room / Table", defaultBookingType, filterLocationType, onSaved$ }) => {
    const isTableMode = itemTypeLabel.toLowerCase().includes("table") || filterLocationType === "table";
    const filteredRooms = rooms.filter((r) => {
      if (filterLocationType) return r.location_type === filterLocationType;
      if (isTableMode) return r.location_type === "table" || !r.location_type;
      return r.location_type === "room" || !r.location_type;
    });

    const selectedRoomId = useSignal(prefillRoomId || (filteredRooms[0]?.id ? String(filteredRooms[0].id) : ""));
    const selectedCustomerId = useSignal("");
    const guestName = useSignal("");
    const bookingType = useSignal<"nightly" | "hourly">(defaultBookingType || (isTableMode ? "hourly" : "nightly"));
    const checkInDate = useSignal(new Date().toISOString().split("T")[0]);
    const checkOutDate = useSignal(
      new Date(Date.now() + 86400000).toISOString().split("T")[0]
    );
    const bookingDate = useSignal(new Date().toISOString().split("T")[0]);
    const startTime = useSignal("12:00");
    const endTime = useSignal("14:00");
    const partySize = useSignal("2");
    const notes = useSignal("");
    const errorMsg = useSignal("");
    const saving = useSignal(false);
    const pricingCalc = useSignal<StayPricingCalculation | null>(null);

    if (prefillRoomId && selectedRoomId.value !== prefillRoomId) {
      selectedRoomId.value = prefillRoomId;
    }

    // Live calculation of nightly stay pricing
    useTask$(async ({ track }) => {
      track(() => selectedRoomId.value);
      track(() => checkInDate.value);
      track(() => checkOutDate.value);
      track(() => bookingType.value);

      if (bookingType.value !== "nightly" || !selectedRoomId.value || !checkInDate.value || !checkOutDate.value) {
        pricingCalc.value = null;
        return;
      }

      const startTs = Math.floor(new Date(checkInDate.value + "T14:00:00").getTime() / 1000);
      const endTs = Math.floor(new Date(checkOutDate.value + "T11:00:00").getTime() / 1000);

      if (endTs > startTs) {
        try {
          const res = await invoke<StayPricingCalculation>("shop_calculate_stay_pricing", {
            locationId: selectedRoomId.value,
            slotStart: startTs,
            slotEnd: endTs,
          });
          pricingCalc.value = res;
        } catch {
          pricingCalc.value = null;
        }
      }
    });

    if (prefillRoomId && selectedRoomId.value !== prefillRoomId) {
      selectedRoomId.value = prefillRoomId;
    }

    const handleSave = $(async () => {
      if (!selectedRoomId.value) {
        errorMsg.value = `Please select a ${itemTypeLabel.toLowerCase()}`;
        return;
      }

      let startTs = 0;
      let endTs = 0;

      if (bookingType.value === "nightly") {
        if (!checkInDate.value || !checkOutDate.value) {
          errorMsg.value = "Please select check-in and check-out dates";
          return;
        }
        startTs = Math.floor(new Date(checkInDate.value + "T14:00:00").getTime() / 1000);
        endTs = Math.floor(new Date(checkOutDate.value + "T11:00:00").getTime() / 1000);
        if (endTs <= startTs) {
          errorMsg.value = "Check-out date must be after Check-in date";
          return;
        }
      } else {
        if (!bookingDate.value || !startTime.value || !endTime.value) {
          errorMsg.value = "Please select date, start time, and end time";
          return;
        }
        startTs = Math.floor(new Date(`${bookingDate.value}T${startTime.value}:00`).getTime() / 1000);
        endTs = Math.floor(new Date(`${bookingDate.value}T${endTime.value}:00`).getTime() / 1000);
        if (endTs <= startTs) {
          errorMsg.value = "End time must be after Start time";
          return;
        }
      }

      saving.value = true;
      errorMsg.value = "";

      try {
        const custName =
          guestName.value.trim() ||
          customers.find((c) => c.id === selectedCustomerId.value)?.name ||
          "Guest";

        const created = await invoke<StayReservation>("shop_create_stay_reservation", {
          data: {
            location_id: selectedRoomId.value,
            customer_id: selectedCustomerId.value || null,
            customer_name: custName,
            slot_start: startTs,
            slot_end: endTs,
            party_size: parseInt(partySize.value) || 1,
            notes: notes.value.trim() || null,
          },
        });

        // Reset
        guestName.value = "";
        selectedCustomerId.value = "";
        notes.value = "";
        open.value = false;
        onSaved$?.(created);
      } catch (e: any) {
        console.error("[NewReservationSlideOver] save failed:", e);
        errorMsg.value = typeof e === "string" ? e : e.message || "Failed to create reservation";
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver
        open={open}
        title={`Book ${itemTypeLabel} / Reservation`}
        subtitle={`Reserve a ${itemTypeLabel.toLowerCase()} for upcoming booking`}
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

          {/* Booking Mode Selector (Overnight vs Hourly) */}
          <div>
            <label style={labelStyle}>Reservation Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <button
                type="button"
                onClick$={() => (bookingType.value = "nightly")}
                style={{
                  height: "2.25rem",
                  borderRadius: "0.375rem",
                  border: bookingType.value === "nightly" ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: bookingType.value === "nightly" ? "var(--surface-3)" : "var(--field-fill)",
                  color: bookingType.value === "nightly" ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: bookingType.value === "nightly" ? 600 : 400,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                🌙 Overnight / Multi-Day
              </button>
              <button
                type="button"
                onClick$={() => (bookingType.value = "hourly")}
                style={{
                  height: "2.25rem",
                  borderRadius: "0.375rem",
                  border: bookingType.value === "hourly" ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: bookingType.value === "hourly" ? "var(--surface-3)" : "var(--field-fill)",
                  color: bookingType.value === "hourly" ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: bookingType.value === "hourly" ? 600 : 400,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                ⏱️ Hourly / Time Slot
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Select {itemTypeLabel} <span style="color:var(--error);">*</span>
            </label>
            <select
              value={selectedRoomId.value}
              onChange$={(e: any) => (selectedRoomId.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <option value="">{`Select a ${itemTypeLabel.toLowerCase()}...`}</option>
              {filteredRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.name} (${r.floor || "Main Floor"}) — Cap: ${r.capacity}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Guest Name</label>
            <input
              type="text"
              placeholder="Primary guest full name"
              value={guestName.value}
              onInput$={(e: any) => (guestName.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {bookingType.value === "nightly" ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>
                    Check-in Date <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkInDate.value}
                    onInput$={(e: any) => (checkInDate.value = e.target.value)}
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    Check-out Date <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkOutDate.value}
                    onInput$={(e: any) => (checkOutDate.value = e.target.value)}
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>
              </div>

              {/* Live Pricing Breakdown Card */}
              {pricingCalc.value && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.875rem",
                    background: "var(--surface-1, rgba(255,255,255,0.03))",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      Estimated Total ({pricingCalc.value.nights} night{pricingCalc.value.nights > 1 ? "s" : ""})
                    </span>
                    <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--brand-primary, #6366f1)" }}>
                      ₹{pricingCalc.value.total_room_charge.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {pricingCalc.value.nightly_rates.map((nr) => (
                      <span
                        key={nr.date}
                        style={{
                          fontSize: "0.6875rem",
                          padding: "0.2rem 0.4rem",
                          borderRadius: "0.25rem",
                          background: nr.is_override ? "rgba(245, 158, 11, 0.15)" : "var(--surface-3)",
                          border: nr.is_override ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border)",
                          color: nr.is_override ? "#f59e0b" : "var(--text-secondary)",
                        }}
                      >
                        {nr.date.slice(5)}: ₹{nr.rate.toFixed(0)} {nr.is_override ? "⚡" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>
                  Booking Date <span style="color:var(--error);">*</span>
                </label>
                <input
                  type="date"
                  value={bookingDate.value}
                  onInput$={(e: any) => (bookingDate.value = e.target.value)}
                  style={inputStyle}
                  onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>
                    Start Time <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="time"
                    value={startTime.value}
                    onInput$={(e: any) => (startTime.value = e.target.value)}
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    End Time <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="time"
                    value={endTime.value}
                    onInput$={(e: any) => (endTime.value = e.target.value)}
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Party Size (Guests)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={partySize.value}
              onInput$={(e: any) => (partySize.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Special Requests / Notes</label>
            <textarea
              rows={3}
              placeholder="Late check-in, extra bed, airport transfer..."
              value={notes.value}
              onInput$={(e: any) => (notes.value = e.target.value)}
              style={{ ...inputStyle, resize: "vertical", minHeight: "4rem" }}
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
            onClick$={handleSave}
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
            {saving.value ? "Confirming..." : "Confirm Booking"}
          </button>
        </div>
      </SlideOver>
    );
  }
);
