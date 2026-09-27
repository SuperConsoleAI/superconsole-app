// src/routes/dashboard/shop/stays/index.tsx
//
// Hotel / Stay / Villa Overview Page — Path: /dashboard/shop/stays
//
// Modal Behaviors:
// - "+ Add Room" button opens AddProductModal with defaultItemType="stay" & defaultCategoryId="cat_30"
// - Room Edit / Settings icon opens AddRoomSlideOver for location & amenity settings

import { component$, useSignal, useStylesScoped$, $, useContext, useVisibleTask$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuPlus,
  LuCalendarDays,
} from "@qwikest/icons/lucide";
import { RoomLayoutGrid } from "~/components/shop/stays/RoomLayoutGrid";
import { AddRoomSlideOver } from "~/components/shop/stays/AddRoomSlideOver";
import { AddProductModal } from "~/components/shop/AddProductModal";
import { NewReservationSlideOver } from "~/components/shop/stays/NewReservationSlideOver";
import { CheckInSlideOver } from "~/components/shop/stays/CheckInSlideOver";
import { CheckOutSlideOver } from "~/components/shop/stays/CheckOutSlideOver";
import { FolioDetailSlideOver } from "~/components/shop/stays/FolioDetailSlideOver";
import { StayRoomAnalyticsSlideOver } from "~/components/shop/stays/StayRoomAnalyticsSlideOver";
import { RateCalendarModal } from "~/components/shop/stays/RateCalendarModal";
import type { StayRoom, StayReservation } from "~/components/shop/stays/RoomLayoutGrid";
import type { StayFolio } from "~/components/shop/stays/FolioDetailSlideOver";
import type { ShopCategory, ShopUnit } from "~/components/shop/AddProductModal";
import type { ShopCollection } from "~/components/shop/CollectionSelect";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";

const STYLES = `
  .stays-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .stays-actions-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .stays-btn {
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    box-sizing: border-box;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .stays-btn-secondary {
    background: var(--surface-2);
    border: none;
    color: var(--text-primary);
  }
  .stays-btn-secondary:hover {
    background: var(--surface-3);
  }
  .stays-btn-primary {
    background: var(--button-primary-bg);
    border: none;
    color: var(--button-primary-text);
  }
  .stays-btn-primary:hover {
    opacity: 0.92;
  }
  .stays-kpi-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .stays-kpi-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .stays-kpi-val {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .stays-kpi-sub {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const ctx = useContext(StaysContext);

  // Modals state
  const showAddProductModal = useSignal(false);
  const showAddRoomModal = useSignal(false);
  const showNewResModal = useSignal(false);
  const showCheckInModal = useSignal(false);
  const showCheckOutModal = useSignal(false);
  const showFolioModal = useSignal(false);

  // Catalog signals for AddProductModal
  const categories = useSignal<ShopCategory[]>([]);
  const collections = useSignal<ShopCollection[]>([]);
  const units = useSignal<ShopUnit[]>([]);
  const editingProduct = useSignal<any | null>(null);

  // Active selections
  const selectedRoom = useSignal<StayRoom | null>(null);
  const selectedRes = useSignal<StayReservation | null>(null);
  const selectedFolio = useSignal<StayFolio | null>(null);
  const roomToEdit = useSignal<StayRoom | null>(null);
  const rateCalendarRoom = useSignal<StayRoom | null>(null);
  const showRateCalendarModal = useSignal(false);
  const analyticsRoom = useSignal<StayRoom | null>(null);

  // Load product catalog metadata for AddProductModal
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [cats, cols, u] = await Promise.all([
        invoke<ShopCategory[]>("shop_list_categories").catch(() => []),
        invoke<ShopCollection[]>("shop_list_collections").catch(() => []),
        invoke<ShopUnit[]>("shop_list_units").catch(() => []),
      ]);
      categories.value = cats;
      collections.value = cols;
      units.value = u;
    } catch (e) {
      console.error("[stays] failed to load product metadata:", e);
    }
  });

  // Status handler for Room Layout Grid
  const handleStatusChange = $(async (roomId: string, newStatus: string) => {
    try {
      await invoke("shop_update_room_status", { roomId, status: newStatus });
      ctx.rooms = ctx.rooms.map((r) => (r.id === roomId ? { ...r, status: newStatus } : r));
    } catch (err) {
      console.error("[stays] failed to update status:", err);
    }
  });

  // Calculate live occupancy stats
  const totalRooms = ctx.rooms.length;
  const occupiedCount = ctx.rooms.filter((r) => r.status === "occupied").length;
  const reservedCount = ctx.rooms.filter((r) => r.status === "reserved").length;
  const availableCount = ctx.rooms.filter((r) => r.status === "available").length;
  const occupancyPct = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

  return (
    <div>
      {/* Overview Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div class="stays-kpi-card">
          <span class="stays-kpi-label">Occupancy Rate</span>
          <span class="stays-kpi-val" style={{ color: "#10B981" }}>
            {occupancyPct}%
          </span>
          <span class="stays-kpi-sub">
            {occupiedCount} of {totalRooms} rooms occupied
          </span>
        </div>

        <div class="stays-kpi-card">
          <span class="stays-kpi-label">Available Rooms</span>
          <span class="stays-kpi-val">{availableCount}</span>
          <span class="stays-kpi-sub">Ready for check-in / walk-in</span>
        </div>

        <div class="stays-kpi-card">
          <span class="stays-kpi-label">Reserved & Confirmed</span>
          <span class="stays-kpi-val" style={{ color: "#3B82F6" }}>
            {reservedCount}
          </span>
          <span class="stays-kpi-sub">Upcoming guest arrivals</span>
        </div>

        <div class="stays-kpi-card">
          <span class="stays-kpi-label">Active Folios</span>
          <span class="stays-kpi-val" style={{ color: "var(--brand-primary)" }}>
            {ctx.folios.filter((f) => f.status === "open").length}
          </span>
          <span class="stays-kpi-sub">Running guest room tabs</span>
        </div>
      </div>

      {/* Main Room Grid Layout Section */}
      <div
        style={{
          background: "var(--surface-1)",
          borderRadius: "0.75rem",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <div class="stays-header-row">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Room Layout & Availability Grid
            </h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Manage active room stays, check in arriving guests, and record folio charges.
            </p>
          </div>

          {/* Action Buttons */}
          <div class="stays-actions-row">
            <button
              type="button"
              class="stays-btn stays-btn-secondary"
              onClick$={() => (showNewResModal.value = true)}
            >
              <LuCalendarDays style="width:0.875rem;height:0.875rem;" />
              Book Room
            </button>
            <button
              type="button"
              class="stays-btn stays-btn-primary"
              onClick$={() => {
                editingProduct.value = null;
                showAddProductModal.value = true;
              }}
            >
              <LuPlus style="width:0.875rem;height:0.875rem;" />
              Add Room
            </button>
          </div>
        </div>

        {ctx.loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
            Loading rooms...
          </div>
        ) : (
          <RoomLayoutGrid
            rooms={ctx.rooms}
            onStatusChange$={handleStatusChange}
            onCheckIn$={$((room) => {
              selectedRoom.value = room;
              const existingRes = ctx.reservations.find(
                (r) => r.location_id === String(room.id) && (r.status === "confirmed" || r.status === "reserved" || r.status === "hold")
              );
              selectedRes.value = existingRes || {
                id: `temp-${Date.now()}`,
                profile_id: "",
                item_id: "stay",
                item_type: "stay",
                location_id: String(room.id),
                room_name: room.name,
                status: "confirmed",
                slot_start: Math.floor(Date.now() / 1000),
                slot_end: Math.floor(Date.now() / 1000) + 86400,
                party_size: room.capacity,
                customer_name: "",
                created_at: Math.floor(Date.now() / 1000),
              };
              showCheckInModal.value = true;
            })}
            onCheckOut$={$((room) => {
              selectedRoom.value = room;
              const folio = ctx.folios.find(
                (f) => f.status === "open" && (f.room_name === room.name || f.reservation_id)
              );
              selectedFolio.value = folio || null;
              showCheckOutModal.value = true;
            })}
            onViewFolio$={$((room) => {
              selectedRoom.value = room;
              const folio = ctx.folios.find(
                (f) => f.status === "open" && (f.room_name === room.name || f.reservation_id)
              );
              selectedFolio.value = folio || null;
              showFolioModal.value = true;
            })}
            onEditProduct$={$(async (room) => {
              try {
                const item = await invoke("shop_get_item", { itemId: String(room.id) }).catch(() => null);
                if (item) {
                  editingProduct.value = item;
                } else {
                  editingProduct.value = {
                    id: String(room.id),
                    name: room.name,
                    price: room.base_rate,
                    item_type: "stay",
                    category_id: "cat_30",
                  };
                }
                showAddProductModal.value = true;
              } catch {
                editingProduct.value = null;
                showAddProductModal.value = true;
              }
            })}
            onSettings$={$((room) => {
              roomToEdit.value = room;
              showAddRoomModal.value = true;
            })}
            onRateCalendar$={$((room) => {
              rateCalendarRoom.value = room;
              showRateCalendarModal.value = true;
            })}
            onAnalytics$={$((room) => {
              analyticsRoom.value = room;
            })}
            onDelete$={$(async (room) => {
              try {
                // Instant optimistic UI removal (no popup modal)
                ctx.rooms = ctx.rooms.filter((r) => r.id !== room.id);
                await invoke("shop_delete_stay_room", { roomId: String(room.id) });
              } catch (e) {
                console.error("[stays] archive room failed:", e);
                await ctx.loadData();
              }
            })}
          />
        )}
      </div>

      {/* SlideOver Modals */}
      <RateCalendarModal
        open={showRateCalendarModal}
        room={rateCalendarRoom.value}
        onSaved$={$(async () => {
          await ctx.loadData();
        })}
      />

      <AddProductModal
        open={showAddProductModal}
        editingItem={editingProduct}
        categories={categories}
        collections={collections}
        units={units}
        defaultItemType="stay"
        defaultCategoryId="cat_30"
        onSaved$={$(async () => {
          showAddProductModal.value = false;
          await ctx.loadData();
        })}
      />

      <AddRoomSlideOver
        open={showAddRoomModal}
        roomToEdit={roomToEdit.value}
        onSaved$={$(async () => {
          roomToEdit.value = null;
          await ctx.loadData();
        })}
      />

      <NewReservationSlideOver
        open={showNewResModal}
        rooms={ctx.rooms}
        customers={ctx.customers}
        itemTypeLabel="Room"
        filterLocationType="room"
        defaultBookingType="nightly"
        onSaved$={$(async () => {
          await ctx.loadData();
        })}
      />

      <CheckInSlideOver
        open={showCheckInModal}
        reservation={selectedRes.value}
        onCheckedIn$={$(async () => {
          await ctx.loadData();
        })}
      />

      <CheckOutSlideOver
        open={showCheckOutModal}
        folio={selectedFolio.value}
        onCheckedOut$={$(async () => {
          await ctx.loadData();
        })}
      />

      <FolioDetailSlideOver
        open={showFolioModal}
        folio={selectedFolio.value}
        onFolioUpdated$={$(async () => {
          await ctx.loadData();
        })}
      />

      {analyticsRoom.value && (
        <StayRoomAnalyticsSlideOver
          room={analyticsRoom.value}
          onClose$={$(() => {
            analyticsRoom.value = null;
          })}
        />
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Hotel & Stays | BusinessKit",
  meta: [
    {
      name: "description",
      content: "Room layout grid, front desk check-in/check-out, and running folios.",
    },
  ],
};
