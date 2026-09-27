// src/components/shop/stays/RoomLayoutGrid.tsx
//
// WHAT:  Grid of Room Cards for Hotel / Stay / Villa overview.
//        Color-coded status badges: Available (Emerald), Occupied (Amber), Reserved (Blue), Maintenance (Gray).

import { component$, useSignal, PropFunction } from "@builder.io/qwik";
import {
  LuBedDouble,
  LuUsers,
  LuLogIn,
  LuLogOut,
  LuReceipt,
  LuPencil,
  LuSettings,
  LuCalendar,
  LuTrendingUp,
  LuTrash2,
  LuAlertTriangle,
} from "@qwikest/icons/lucide";
import type { StayRoom, StayReservation } from "~/lib/types";
export type { StayRoom, StayReservation };

interface RoomLayoutGridProps {
  rooms: StayRoom[];
  onStatusChange$?: PropFunction<(roomId: string, newStatus: string) => void>;
  onCheckIn$?: PropFunction<(room: StayRoom) => void>;
  onCheckOut$?: PropFunction<(room: StayRoom) => void>;
  onViewFolio$?: PropFunction<(room: StayRoom) => void>;
  onEditProduct$?: PropFunction<(room: StayRoom) => void>;
  onSettings$?: PropFunction<(room: StayRoom) => void>;
  onRateCalendar$?: PropFunction<(room: StayRoom) => void>;
  onAnalytics$?: PropFunction<(room: StayRoom) => void>;
  onDelete$?: PropFunction<(room: StayRoom) => void>;
}

export const RoomLayoutGrid = component$<RoomLayoutGridProps>(
  ({ rooms, onStatusChange$, onCheckIn$, onCheckOut$, onViewFolio$, onEditProduct$, onSettings$, onRateCalendar$, onAnalytics$, onDelete$ }) => {
    const confirmDeleteRoom = useSignal<StayRoom | null>(null);

    const getStatusTheme = (status: string) => {
      switch (status) {
        case "available":
          return {
            badgeBg: "#10B9811A",
            badgeColor: "#10B981",
            label: "Available",
          };
        case "occupied":
          return {
            badgeBg: "#D977571A",
            badgeColor: "#D97757",
            label: "Occupied",
          };
        case "reserved":
          return {
            badgeBg: "#3B82F61A",
            badgeColor: "#3B82F6",
            label: "Reserved",
          };
        case "maintenance":
        case "blocked":
          return {
            badgeBg: "var(--surface-3)",
            badgeColor: "var(--text-secondary)",
            label: status === "maintenance" ? "Maintenance" : "Blocked",
          };
        default:
          return {
            badgeBg: "var(--surface-3)",
            badgeColor: "var(--text-primary)",
            label: status,
          };
      }
    };

    if (rooms.length === 0) {
      return (
        <div
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            background: "var(--surface-2)",
            borderRadius: "0.75rem",
            border: "1px dashed var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <LuBedDouble style="width:2.5rem;height:2.5rem;margin-bottom:0.75rem;opacity:0.5;" />
          <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>No Rooms Configured</h4>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            Add your hotel rooms, suites, or villas to start managing stays.
          </p>
        </div>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {rooms.map((room) => {
          const theme = getStatusTheme(room.status);
          let amenitiesList: string[] = [];
          try {
            amenitiesList = JSON.parse(room.amenities || "[]");
          } catch {
            amenitiesList = [];
          }

          return (
            <div
              key={room.id}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                transition: "all 0.15s ease",
              }}
            >
              {/* Header: Room Name/Number & Status Badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {room.name}
                  </div>
                  {room.floor && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                      {room.floor}
                    </div>
                  )}
                </div>

                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "1rem",
                    background: theme.badgeBg,
                    color: theme.badgeColor,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: theme.badgeColor,
                    }}
                  />
                  {theme.label}
                </span>
              </div>

              {/* Uploaded Room Image (if present & valid URL) */}
              {(() => {
                const url = room.image_url;
                const isValid = url && (
                  url.startsWith("http://") ||
                  url.startsWith("https://") ||
                  url.startsWith("file://") ||
                  url.startsWith("data:") ||
                  url.startsWith("/")
                );
                if (!isValid) return null;
                return (
                  <div
                    style={{
                      width: "100%",
                      height: "120px",
                      borderRadius: "0.5rem",
                      overflow: "hidden",
                      marginTop: "0.75rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <img
                      src={url}
                      alt={room.name}
                      width={300}
                      height={120}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                );
              })()}

              {/* Body: Capacity, Rate & Amenities */}
              <div style={{ margin: "0.875rem 0" }}>
                <div style={{ display: "flex", gap: "1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <LuUsers style="width:0.875rem;height:0.875rem;" />
                    Up to {room.capacity} Guests
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    ₹{room.base_rate.toLocaleString("en-IN")} / night
                  </span>
                </div>

                {amenitiesList.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.3rem",
                      marginTop: "0.75rem",
                    }}
                  >
                    {amenitiesList.slice(0, 3).map((am, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "0.7rem",
                          background: "var(--surface-3)",
                          color: "var(--text-secondary)",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "0.25rem",
                        }}
                      >
                        {am}
                      </span>
                    ))}
                    {amenitiesList.length > 3 && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                        +{amenitiesList.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Combined Footer: Primary Button + All 4 Action Icons inside the SAME div (No divider line) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  marginTop: "0.25rem",
                }}
              >
                {/* Left side: Check-in / View Folio / Check-out primary buttons */}
                <div style={{ flex: 1 }}>
                  {room.status === "available" || room.status === "reserved" ? (
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        height: "1.875rem",
                        borderRadius: "0.375rem",
                        background: "var(--button-primary-bg)",
                        color: "var(--button-primary-text)",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem",
                        transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                        userSelect: "none",
                      }}
                      onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
                      onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                      onClick$={() => onCheckIn$?.(room)}
                    >
                      <LuLogIn style="width:0.875rem;height:0.875rem;" />
                      Check-in
                    </button>
                  ) : room.status === "occupied" ? (
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          height: "1.875rem",
                          borderRadius: "0.375rem",
                          background: "var(--surface-3)",
                          color: "var(--text-primary)",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.25rem",
                          transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                          userSelect: "none",
                        }}
                        onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
                        onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                        onClick$={() => onViewFolio$?.(room)}
                      >
                        <LuReceipt style="width:0.75rem;height:0.75rem;" />
                        Folio
                      </button>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          height: "1.875rem",
                          borderRadius: "0.375rem",
                          background: "#D97757",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.25rem",
                          transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                          userSelect: "none",
                        }}
                        onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
                        onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                        onClick$={() => onCheckOut$?.(room)}
                      >
                        <LuLogOut style="width:0.75rem;height:0.75rem;" />
                        Out
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        height: "1.875rem",
                        borderRadius: "0.375rem",
                        background: "var(--surface-3)",
                        color: "var(--text-secondary)",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                        userSelect: "none",
                      }}
                      onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
                      onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                      onClick$={() => onStatusChange$?.(room.id, "available")}
                    >
                      Set Available
                    </button>
                  )}
                </div>

                {/* Right side: Action Icon Buttons (Analytics, Edit Product, Settings, Delete) */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                  <button
                    type="button"
                    title="Room Analytics"
                    onClick$={() => onAnalytics$?.(room)}
                    style={{
                      width: "1.875rem",
                      height: "1.875rem",
                      borderRadius: "0.375rem",
                      background: "var(--surface-3)",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                    }}
                    onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
                    onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onMouseOver$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-1)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    }}
                    onMouseOut$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <LuTrendingUp style="width:0.875rem;height:0.875rem;" />
                  </button>

                  <button
                    type="button"
                    title="Edit Product Catalog (Price, GST, Media)"
                    onClick$={() => onEditProduct$?.(room)}
                    style={{
                      width: "1.875rem",
                      height: "1.875rem",
                      borderRadius: "0.375rem",
                      background: "var(--surface-3)",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                    }}
                    onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
                    onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onMouseOver$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-1)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    }}
                    onMouseOut$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <LuPencil style="width:0.875rem;height:0.875rem;" />
                  </button>

                  <button
                    type="button"
                    title="Room Spatial Settings (Floor, Capacity, Amenities)"
                    onClick$={() => onSettings$?.(room)}
                    style={{
                      width: "1.875rem",
                      height: "1.875rem",
                      borderRadius: "0.375rem",
                      background: "var(--surface-3)",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                    }}
                    onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
                    onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onMouseOver$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-1)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    }}
                    onMouseOut$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <LuSettings style="width:0.875rem;height:0.875rem;" />
                  </button>

                  <button
                    type="button"
                    title="Rate Calendar & Booking Rules"
                    onClick$={() => onRateCalendar$?.(room)}
                    style={{
                      width: "1.875rem",
                      height: "1.875rem",
                      borderRadius: "0.375rem",
                      background: "var(--surface-3)",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                    }}
                    onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
                    onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onMouseOver$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(99, 102, 241, 0.15)";
                      (e.currentTarget as HTMLElement).style.color = "var(--brand-primary, #6366f1)";
                    }}
                    onMouseOut$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <LuCalendar style="width:0.875rem;height:0.875rem;" />
                  </button>

                  <button
                    type="button"
                    title="Delete Room"
                    onClick$={() => (confirmDeleteRoom.value = room)}
                    style={{
                      width: "1.875rem",
                      height: "1.875rem",
                      borderRadius: "0.375rem",
                      background: "var(--surface-3)",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                    }}
                    onMouseDown$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
                    onMouseUp$={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onMouseOver$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(239, 68, 68, 0.15)";
                      (e.currentTarget as HTMLElement).style.color = "#ef4444";
                    }}
                    onMouseOut$={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* In-App Custom Confirmation Alert Modal */}
        {confirmDeleteRoom.value && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1.5rem",
                maxWidth: "420px",
                width: "100%",
                boxShadow: "var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.5))",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem", marginBottom: "1rem" }}>
                <div
                  style={{
                    padding: "0.6rem",
                    borderRadius: "0.5rem",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#ef4444",
                    flexShrink: 0,
                  }}
                >
                  <LuAlertTriangle style={{ width: "1.5rem", height: "1.5rem" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Archive {confirmDeleteRoom.value.name}?
                  </h3>
                  <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Are you sure you want to archive this room? It will be removed from the active layout grid, but all historical reservations, billing folios, and analytics metrics will be preserved.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  onClick$={() => (confirmDeleteRoom.value = null)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick$={async () => {
                    const target = confirmDeleteRoom.value;
                    confirmDeleteRoom.value = null;
                    if (target && onDelete$) {
                      await onDelete$(target);
                    }
                  }}
                  style={{
                    padding: "0.5rem 1.125rem",
                    borderRadius: "0.375rem",
                    border: "none",
                    background: "var(--error, #ef4444)",
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  Yes, Archive Room
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
