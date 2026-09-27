// src/components/shop/stays/RateCalendarModal.tsx
//
// Interactive Room Rate Calendar & Booking Rules Modal.
// - Month-by-month grid showing base rate vs seasonal overrides.
// - Click date to apply / edit nightly price override.
// - Booking Rules tab for min/max nights, checkin/checkout hours, and house rules.

import { component$, useSignal, useTask$, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuCalendar,
  LuChevronLeft,
  LuChevronRight,
  LuDollarSign,
  LuShieldCheck,
  LuX,
  LuCheck,
  LuTrash2,
} from "@qwikest/icons/lucide";
import type { StayRoom, BookingRulesConfig } from "~/lib/types";

interface RateCalendarModalProps {
  open: Signal<boolean>;
  room: StayRoom | null;
  onSaved$?: PropFunction<(updatedRoom: StayRoom) => void>;
}

export const RateCalendarModal = component$<RateCalendarModalProps>(({ open, room, onSaved$ }) => {
  const activeTab = useSignal<"rates" | "rules">("rates");
  const currentMonth = useSignal(new Date().getMonth());
  const currentYear = useSignal(new Date().getFullYear());

  // Rates State
  const rateOverrides = useSignal<Record<string, number>>({});
  const selectedDate = useSignal<string | null>(null);
  const overrideInputRate = useSignal("");
  const savingRates = useSignal(false);
  const rateSuccessMsg = useSignal("");

  // Booking Rules State
  const minNights = useSignal<string>("");
  const maxNights = useSignal<string>("");
  const checkinTime = useSignal("14:00");
  const checkoutTime = useSignal("11:00");
  const houseRules = useSignal("");
  const savingRules = useSignal(false);
  const rulesSuccessMsg = useSignal("");

  useTask$(({ track }) => {
    track(() => room);
    if (room) {
      try {
        rateOverrides.value = typeof room.rate_overrides === "string"
          ? JSON.parse(room.rate_overrides || "{}")
          : room.rate_overrides || {};
      } catch {
        rateOverrides.value = {};
      }

      try {
        const rules: BookingRulesConfig = typeof room.booking_rules === "string"
          ? JSON.parse(room.booking_rules || "{}")
          : room.booking_rules || {};
        minNights.value = rules.min_nights ? String(rules.min_nights) : "";
        maxNights.value = rules.max_nights ? String(rules.max_nights) : "";
        checkinTime.value = rules.checkin_time || "14:00";
        checkoutTime.value = rules.checkout_time || "11:00";
        houseRules.value = rules.house_rules || "";
      } catch {
        minNights.value = "";
        maxNights.value = "";
        checkinTime.value = "14:00";
        checkoutTime.value = "11:00";
        houseRules.value = "";
      }
    }
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = $(() => {
    if (currentMonth.value === 0) {
      currentMonth.value = 11;
      currentYear.value -= 1;
    } else {
      currentMonth.value -= 1;
    }
  });

  const handleNextMonth = $(() => {
    if (currentMonth.value === 11) {
      currentMonth.value = 0;
      currentYear.value += 1;
    } else {
      currentMonth.value += 1;
    }
  });

  const handleApplyOverride = $(() => {
    if (!selectedDate.value) return;
    const rateNum = parseFloat(overrideInputRate.value);
    if (isNaN(rateNum) || rateNum <= 0) return;

    const copy = { ...rateOverrides.value };
    copy[selectedDate.value] = rateNum;
    rateOverrides.value = copy;
    overrideInputRate.value = "";
  });

  const handleClearOverride = $(() => {
    if (!selectedDate.value) return;
    const copy = { ...rateOverrides.value };
    delete copy[selectedDate.value];
    rateOverrides.value = copy;
    overrideInputRate.value = "";
  });

  const handleSaveRateCalendar = $(async () => {
    if (!room?.id) return;
    savingRates.value = true;
    rateSuccessMsg.value = "";
    try {
      const updated: any = await invoke("shop_update_stay_rate_calendar", {
        data: {
          location_id: room.id,
          rate_overrides: rateOverrides.value,
        },
      });
      rateSuccessMsg.value = "Seasonal rates saved successfully!";
      if (onSaved$) await onSaved$(updated);
      setTimeout(() => { rateSuccessMsg.value = ""; }, 3000);
    } catch (e) {
      console.error("[RateCalendar] Failed to save:", e);
    } finally {
      savingRates.value = false;
    }
  });

  const handleSaveBookingRules = $(async () => {
    if (!room?.id) return;
    savingRules.value = true;
    rulesSuccessMsg.value = "";
    try {
      const rulesObj: BookingRulesConfig = {
        min_nights: minNights.value ? parseInt(minNights.value) : null,
        max_nights: maxNights.value ? parseInt(maxNights.value) : null,
        checkin_time: checkinTime.value || null,
        checkout_time: checkoutTime.value || null,
        house_rules: houseRules.value || null,
      };
      const updated: any = await invoke("shop_update_stay_booking_rules", {
        data: {
          location_id: room.id,
          rules: rulesObj,
        },
      });
      rulesSuccessMsg.value = "Booking rules saved successfully!";
      if (onSaved$) await onSaved$(updated);
      setTimeout(() => { rulesSuccessMsg.value = ""; }, 3000);
    } catch (e) {
      console.error("[BookingRules] Failed to save:", e);
    } finally {
      savingRules.value = false;
    }
  });

  if (!open.value || !room) return null;

  // Calendar Day Generation
  const daysInMonth = new Date(currentYear.value, currentMonth.value + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear.value, currentMonth.value, 1).getDay();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick$={(e) => {
        if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
          open.value = false;
        }
      }}
      class="modal-overlay"
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          background: "var(--surface-2, #1e1e2e)",
          border: "1px solid var(--border, rgba(255,255,255,0.12))",
          borderRadius: "1rem",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
        onClick$={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <LuCalendar style="width:1.25rem;height:1.25rem;color:var(--brand-primary,#6366f1);" />
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                {room.name} — Rate & Booking Controls
              </h2>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.25rem 0 0 0" }}>
              Base Rate: ₹{room.base_rate.toFixed(0)}/night • {room.capacity} Guests
            </p>
          </div>
          <button
            onClick$={() => { open.value = false; }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "0.375rem",
            }}
          >
            <LuX style="width:1.25rem;height:1.25rem;" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-1, #13131f)",
            padding: "0 1.5rem",
          }}
        >
          <button
            onClick$={() => { activeTab.value = "rates"; }}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab.value === "rates" ? "2px solid var(--brand-primary, #6366f1)" : "2px solid transparent",
              color: activeTab.value === "rates" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <LuDollarSign style="width:1rem;height:1rem;" /> Seasonal Rate Calendar
          </button>
          <button
            onClick$={() => { activeTab.value = "rules"; }}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab.value === "rules" ? "2px solid var(--brand-primary, #6366f1)" : "2px solid transparent",
              color: activeTab.value === "rules" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <LuShieldCheck style="width:1rem;height:1rem;" /> Booking Rules & Policies
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          {activeTab.value === "rates" ? (
            <div>
              {/* Calendar Month Controls */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                  {monthNames[currentMonth.value]} {currentYear.value}
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button
                    onClick$={handlePrevMonth}
                    style={{
                      background: "var(--surface-3, rgba(255,255,255,0.06))",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      padding: "0.35rem 0.6rem",
                      cursor: "pointer",
                    }}
                  >
                    <LuChevronLeft style="width:1rem;height:1rem;" />
                  </button>
                  <button
                    onClick$={handleNextMonth}
                    style={{
                      background: "var(--surface-3, rgba(255,255,255,0.06))",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      padding: "0.35rem 0.6rem",
                      cursor: "pointer",
                    }}
                  >
                    <LuChevronRight style="width:1rem;height:1rem;" />
                  </button>
                </div>
              </div>

              {/* Day Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.35rem", marginBottom: "1.25rem" }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", paddingBottom: "0.35rem" }}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ height: "64px" }} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const overrideRate = rateOverrides.value[dateStr];
                  const isSelected = selectedDate.value === dateStr;

                  return (
                    <div
                      key={dateStr}
                      onClick$={() => {
                        selectedDate.value = dateStr;
                        overrideInputRate.value = overrideRate ? String(overrideRate) : String(room.base_rate);
                      }}
                      style={{
                        height: "64px",
                        padding: "0.35rem",
                        borderRadius: "0.5rem",
                        border: isSelected
                          ? "2px solid var(--brand-primary, #6366f1)"
                          : overrideRate
                          ? "1px solid #f59e0b"
                          : "1px solid var(--border)",
                        background: isSelected
                          ? "rgba(99, 102, 241, 0.15)"
                          : overrideRate
                          ? "rgba(245, 158, 11, 0.1)"
                          : "var(--surface-1, rgba(255,255,255,0.03))",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isSelected ? "var(--brand-primary, #6366f1)" : "var(--text-primary)" }}>
                        {dayNum}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          textAlign: "right",
                          color: overrideRate ? "#f59e0b" : "var(--text-secondary)",
                        }}
                      >
                        ₹{overrideRate ? overrideRate.toFixed(0) : room.base_rate.toFixed(0)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Selected Date Override Controls */}
              {selectedDate.value && (
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.625rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      Selected Date: {selectedDate.value}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Current: ₹{(rateOverrides.value[selectedDate.value] || room.base_rate).toFixed(0)}/night
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="number"
                      value={overrideInputRate.value}
                      onInput$={(e) => { overrideInputRate.value = (e.target as HTMLInputElement).value; }}
                      placeholder="New Rate (₹)"
                      style={{
                        width: "120px",
                        padding: "0.45rem 0.65rem",
                        background: "var(--field-fill)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        color: "var(--text-primary)",
                        fontSize: "0.875rem",
                      }}
                    />
                    <button
                      onClick$={handleApplyOverride}
                      style={{
                        padding: "0.45rem 0.85rem",
                        background: "var(--brand-primary, #6366f1)",
                        border: "none",
                        borderRadius: "0.375rem",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                      }}
                    >
                      Set Rate
                    </button>
                    {rateOverrides.value[selectedDate.value] && (
                      <button
                        onClick$={handleClearOverride}
                        style={{
                          padding: "0.45rem 0.65rem",
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "0.375rem",
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Save Button for Rates */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "0.75rem" }}>
                <span style={{ fontSize: "0.8125rem", color: "#10b981", fontWeight: 600 }}>
                  {rateSuccessMsg.value}
                </span>
                <button
                  onClick$={handleSaveRateCalendar}
                  disabled={savingRates.value}
                  style={{
                    padding: "0.6rem 1.25rem",
                    background: "var(--brand-primary, #6366f1)",
                    border: "none",
                    borderRadius: "0.5rem",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <LuCheck style="width:1rem;height:1rem;" /> {savingRates.value ? "Saving..." : "Save Rate Calendar"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Booking Rules Form */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Minimum Nights Required
                  </label>
                  <input
                    type="number"
                    value={minNights.value}
                    onInput$={(e) => { minNights.value = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. 2 (leave blank for none)"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Maximum Nights Allowed
                  </label>
                  <input
                    type="number"
                    value={maxNights.value}
                    onInput$={(e) => { maxNights.value = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. 30 (leave blank for none)"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Standard Check-in Time
                  </label>
                  <input
                    type="time"
                    value={checkinTime.value}
                    onInput$={(e) => { checkinTime.value = (e.target as HTMLInputElement).value; }}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Standard Check-out Time
                  </label>
                  <input
                    type="time"
                    value={checkoutTime.value}
                    onInput$={(e) => { checkoutTime.value = (e.target as HTMLInputElement).value; }}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  House Rules & Policies
                </label>
                <textarea
                  rows={4}
                  value={houseRules.value}
                  onInput$={(e) => { houseRules.value = (e.target as HTMLTextAreaElement).value; }}
                  placeholder="e.g. No smoking inside rooms. Quiet hours 10 PM - 7 AM. Pets allowed with prior notice."
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    background: "var(--field-fill)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Save Button for Rules */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "0.75rem" }}>
                <span style={{ fontSize: "0.8125rem", color: "#10b981", fontWeight: 600 }}>
                  {rulesSuccessMsg.value}
                </span>
                <button
                  onClick$={handleSaveBookingRules}
                  disabled={savingRules.value}
                  style={{
                    padding: "0.6rem 1.25rem",
                    background: "var(--brand-primary, #6366f1)",
                    border: "none",
                    borderRadius: "0.5rem",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <LuCheck style="width:1rem;height:1rem;" /> {savingRules.value ? "Saving..." : "Save Booking Rules"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
