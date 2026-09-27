// src/components/shop/restaurant/TableOrderSlideOver.tsx
//
// WHAT: SlideOver panel showing all active KOT orders, item breakdown, running bill amount,
//       detailed dish names on active & cancelled KOT tickets (collapsed by default),
//       instant 0ms optimistic quantity adjustments, persistent database synchronization,
//       and animated action states.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useTask$,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuFlame,
  LuPlus,
  LuMinus,
  LuTrash2,
  LuReceipt,
  LuCheckCircle2,
  LuUtensils,
  LuAlertTriangle,
  LuXCircle,
  LuChevronDown,
  LuChevronUp,
  LuLoader,
  LuCheck,
  LuBan,
  LuUsers,
  LuArmchair,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import type { ShopTable } from "./TableLayoutGrid";
import type { ShopKOT } from "./KOTQueueCard";
import type { ShopStaffMember } from "~/components/shop/AddStaffSlideOver";
import { getStaffName } from "./SendKOTSlideOver";

export interface TableOrderSlideOverProps {
  open: Signal<boolean>;
  table: ShopTable | null;
  allKots: ShopKOT[];
  onOpenSendKOT$: PropFunction<(tableId: string, waiterName?: string) => void>;
  onOpenPOSBill$: PropFunction<(table: ShopTable, lines: Array<{ itemId: string; name: string; qty: number; price: number }>) => void>;
  onClearTable$: PropFunction<(tableId: string) => void>;
  onKOTsChanged$?: PropFunction<() => void>;
}

export interface EditableLine {
  id: string;
  kotId: string;
  kotDocNumber: string;
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  notes?: string;
}

export const resolveLinePrice = (
  unitPrice: number,
  itemId: string,
  itemName: string,
  priceMap: Record<string, number>
): number => {
  if (unitPrice > 0) return unitPrice;
  if (priceMap[itemId]) return priceMap[itemId];
  if (itemName && priceMap[itemName.toLowerCase()]) return priceMap[itemName.toLowerCase()];
  return 0;
};

export const isKotForTable = (k: ShopKOT, table: ShopTable | null): boolean => {
  if (!table) return false;
  const tId = table.id?.toLowerCase().trim();
  const tName = table.name?.toLowerCase().trim();
  const kLocId = k.location_id?.toLowerCase().trim();
  const kLocName = k.location_name?.toLowerCase().trim();

  return Boolean(
    (tId && kLocId === tId) ||
    (tName && kLocId === tName) ||
    (tId && kLocName === tId) ||
    (tName && kLocName === tName) ||
    (tName && k.notes && k.notes.toLowerCase().includes(tName))
  );
};

const STYLES = `
  .stepper-box {
    display: inline-flex;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    height: 1.85rem;
    box-sizing: border-box;
    overflow: hidden;
  }
  .stepper-btn {
    width: 1.75rem;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease, color 0.15s ease, background 0.15s ease;
    user-select: none;
    box-sizing: border-box;
  }
  .stepper-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  .stepper-btn:active {
    transform: scale(0.82);
    background: var(--surface-3);
  }
  .stepper-qty {
    padding: 0 0.5rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-primary);
    min-width: 1.5rem;
    text-align: center;
    display: inline-block;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .stepper-qty.pop {
    animation: qtyPop 0.28s ease;
  }
  .action-trash-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.35rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    transition: transform 0.1s ease, color 0.15s ease, background 0.15s ease;
  }
  .action-trash-btn:hover {
    color: var(--error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }
  .action-trash-btn:active {
    transform: scale(0.85);
  }
  .order-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.875rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    gap: 0.75rem;
    transition: all 0.2s ease;
  }
  .order-item-row:hover {
    border-color: var(--border-hover, var(--border));
    background: var(--surface-2);
  }
  .dish-pill {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    background: var(--surface-1);
    border: 1px solid var(--border);
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .cancelled-dish-pill {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    padding: 0.25rem 0.55rem;
    border-radius: 0.3rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .animate-spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes qtyPop {
    0% { transform: scale(1.35); color: var(--brand-primary, #6366f1); }
    50% { transform: scale(1.15); }
    100% { transform: scale(1); color: var(--text-primary); }
  }
`;

export const TableOrderSlideOver = component$<TableOrderSlideOverProps>(
  ({ open, table, allKots, onOpenSendKOT$, onOpenPOSBill$, onClearTable$, onKOTsChanged$ }) => {
    useStylesScoped$(STYLES);

    const menuPrices = useSignal<Record<string, number>>({});
    const loading = useSignal(true);
    const showClearConfirm = useSignal(false);
    const isClearingTable = useSignal(false);
    const showCancelled = useSignal(false); // Collapsed by default as requested
    const recentlyChangedId = useSignal<string | null>(null);
    const voidConfirmKotId = useSignal<string | null>(null);
    const isVoidingKotId = useSignal<string | null>(null);
    const saveState = useSignal<"idle" | "saving" | "saved">("idle");
    const voidedSingleItems = useSignal<Array<{ id: string; name: string; qty: number; kotDocNumber: string }>>([]);

    // Local KOTs and optimistic lines state
    const currentKots = useSignal<ShopKOT[]>([]);
    const localLines = useSignal<EditableLine[]>([]);

    const staffMembers = useSignal<ShopStaffMember[]>([]);
    const isAssigningStaff = useSignal(false);
    const assignedWaiter = useSignal<string>("");

    // Function to re-sync lines with guaranteed price resolution
    const syncLinesFromKots = $((kotsList: ShopKOT[], prices: Record<string, number>) => {
      if (!table) return;
      currentKots.value = kotsList;

      const tKots = kotsList.filter(
        (k) => k.status !== "cancelled" && isKotForTable(k, table)
      );

      const computed: EditableLine[] = [];
      for (const kot of tKots) {
        for (const line of kot.lines) {
          const unitPrice =
            (line.unit_price && line.unit_price > 0 ? line.unit_price : 0) ||
            prices[line.item_id] ||
            (line.item_name ? prices[line.item_name.toLowerCase()] : 0) ||
            0;

          const dishName = line.item_name || (line as any).name || (line as any).description || "Dish";

          computed.push({
            id: line.id,
            kotId: kot.id,
            kotDocNumber: kot.doc_number,
            itemId: line.item_id,
            name: dishName,
            qty: line.qty,
            unitPrice,
            total: unitPrice * line.qty,
            notes: line.notes,
          });
        }
      }
      localLines.value = computed;
    });

    // Load prices, staff members, and fresh KOTs whenever slideover opens
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) return;

      try {
        loading.value = true;
        const [items, freshKots, sRes] = await Promise.all([
          invoke<any[]>("shop_list_items", {}).catch(() => []),
          invoke<ShopKOT[]>("shop_list_kots", {}).catch(() => []),
          invoke<ShopStaffMember[]>("shop_list_staff", {}).catch(() => []),
        ]);
        staffMembers.value = sRes;

        const priceMap: Record<string, number> = {};
        for (const item of items) {
          if (item.id) priceMap[item.id] = Number(item.price) || 0;
          if (item.name) priceMap[item.name.toLowerCase()] = Number(item.price) || 0;
        }
        menuPrices.value = priceMap;

        assignedWaiter.value = "";
        const activeKotsList = freshKots && freshKots.length > 0 ? freshKots : allKots;
        await syncLinesFromKots(activeKotsList, priceMap);
      } catch (e) {
        console.error("[TableOrderSlideOver] load failed:", e);
      } finally {
        loading.value = false;
      }
    });

    // Sync when props allKots change
    useTask$(({ track }) => {
      track(() => allKots);
      track(() => table?.id);

      if (allKots && allKots.length >= 0) {
        currentKots.value = allKots;
        if (!table) return;

        const tKots = allKots.filter(
          (k) => k.status !== "cancelled" && isKotForTable(k, table)
        );

        const computed: EditableLine[] = [];
        for (const kot of tKots) {
          for (const line of kot.lines) {
            const unitPrice =
              (line.unit_price && line.unit_price > 0 ? line.unit_price : 0) ||
              menuPrices.value[line.item_id] ||
              (line.item_name ? menuPrices.value[line.item_name.toLowerCase()] : 0) ||
              0;

            const dishName = line.item_name || (line as any).name || (line as any).description || "Dish";

            computed.push({
              id: line.id,
              kotId: kot.id,
              kotDocNumber: kot.doc_number,
              itemId: line.item_id,
              name: dishName,
              qty: line.qty,
              unitPrice,
              total: unitPrice * line.qty,
              notes: line.notes,
            });
          }
        }
        localLines.value = computed;
      }
    });

    if (!table) return null;

    // Filter KOTs for this table
    const tableKots = (currentKots.value.length > 0 ? currentKots.value : allKots).filter(
      (k) => isKotForTable(k, table)
    );

    const activeKots = tableKots.filter((k) => k.status !== "cancelled");
    const cancelledKots = tableKots.filter((k) => k.status === "cancelled");

    const subtotal = localLines.value.reduce(
      (acc, l) => acc + resolveLinePrice(l.unitPrice, l.itemId, l.name, menuPrices.value) * l.qty,
      0
    );
    const totalItemCount = localLines.value.reduce((acc, l) => acc + l.qty, 0);

    const handleUpdateQty = $(async (line: EditableLine, delta: number) => {
      const targetLine = localLines.value.find((l) => l.id === line.id);
      if (!targetLine) return;

      const newQty = targetLine.qty + delta;
      const uPrice = resolveLinePrice(targetLine.unitPrice, targetLine.itemId, targetLine.name, menuPrices.value);

      // 1. Instant Optimistic UI Update (0ms lag!)
      if (newQty <= 0) {
        localLines.value = localLines.value.filter((l) => l.id !== line.id);
        voidedSingleItems.value = [
          ...voidedSingleItems.value,
          { id: line.id, name: line.name, qty: line.qty, kotDocNumber: line.kotDocNumber },
        ];
      } else {
        localLines.value = localLines.value.map((l) =>
          l.id === line.id
            ? { ...l, qty: newQty, unitPrice: uPrice, total: uPrice * newQty }
            : l
        );
      }

      // Also optimistically update currentKots.value so reopen/sync has it
      currentKots.value = currentKots.value.map((k) => {
        if (k.id !== line.kotId) return k;
        return {
          ...k,
          lines: k.lines
            .map((l) => (l.id === line.id ? { ...l, qty: newQty } : l))
            .filter((l) => l.qty > 0),
        };
      });

      // Trigger pop animation
      recentlyChangedId.value = line.id;
      setTimeout(() => {
        if (recentlyChangedId.value === line.id) {
          recentlyChangedId.value = null;
        }
      }, 350);

      // 2. Background database sync with fallback matching
      saveState.value = "saving";
      try {
        if (newQty <= 0) {
          await invoke("shop_delete_kot_line", {
            lineId: line.id,
            kotId: line.kotId || null,
            itemId: line.itemId || null,
          });
        } else {
          await invoke("shop_update_kot_line", {
            lineId: line.id,
            kotId: line.kotId || null,
            itemId: line.itemId || null,
            qty: newQty,
            notes: line.notes || null,
          });
        }
        saveState.value = "saved";
        setTimeout(() => {
          if (saveState.value === "saved") saveState.value = "idle";
        }, 1500);

        if (onKOTsChanged$) {
          await onKOTsChanged$();
        }
      } catch (e) {
        console.error("[TableOrderSlideOver] update qty failed:", e);
        saveState.value = "idle";
      }
    });

    const handleDeleteLine = $(async (lineId: string) => {
      // 1. Instant Optimistic UI Update (0ms lag!)
      const target = localLines.value.find((l) => l.id === lineId);
      localLines.value = localLines.value.filter((l) => l.id !== lineId);

      if (target) {
        voidedSingleItems.value = [
          ...voidedSingleItems.value,
          { id: target.id, name: target.name, qty: target.qty, kotDocNumber: target.kotDocNumber },
        ];
        currentKots.value = currentKots.value.map((k) => {
          if (k.id !== target.kotId) return k;
          return {
            ...k,
            lines: k.lines.filter((l) => l.id !== lineId),
          };
        });
      }

      // 2. Background database sync with fallback matching
      saveState.value = "saving";
      try {
        await invoke("shop_delete_kot_line", {
          lineId,
          kotId: target?.kotId || null,
          itemId: target?.itemId || null,
        });
        saveState.value = "saved";
        setTimeout(() => {
          if (saveState.value === "saved") saveState.value = "idle";
        }, 1500);

        if (onKOTsChanged$) {
          await onKOTsChanged$();
        }
      } catch (e) {
        console.error("[TableOrderSlideOver] delete line failed:", e);
        saveState.value = "idle";
      }
    });

    const handleCancelKot = $(async (kotId: string) => {
      isVoidingKotId.value = kotId;
      try {
        await invoke("shop_update_kot_status", { kotId, status: "cancelled" });
        // Optimistic removal of lines
        localLines.value = localLines.value.filter((l) => l.kotId !== kotId);
        currentKots.value = currentKots.value.map((k) =>
          k.id === kotId ? { ...k, status: "cancelled" } : k
        );
        voidConfirmKotId.value = null;
        if (onKOTsChanged$) {
          await onKOTsChanged$();
        }
      } catch (e) {
        console.error("[TableOrderSlideOver] cancel kot failed:", e);
      } finally {
        isVoidingKotId.value = null;
      }
    });

    const totalCancelledCount = cancelledKots.length + voidedSingleItems.value.length;

    return (
      <SlideOver
        open={open}
        title={table.name}
        subtitle={`${table.floor || "Main Dining"} • Capacity: ${table.capacity} Seats`}
        width="540px"
        icon="utensils"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Table KPI Summary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0.75rem",
              background: "var(--surface-3)",
              padding: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Table Status</div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: table.status === "occupied" ? "var(--warning, #f59e0b)" : "var(--success, #10b981)", textTransform: "capitalize", marginTop: "0.2rem" }}>
                {table.status}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Active KOTs</div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.2rem" }}>
                {activeKots.length} Tickets
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Running Total</div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.2rem" }}>
                ₹{subtotal.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Staff & Table Info Banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              background: "var(--surface-2)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div
                style={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "0.375rem",
                  background: "var(--surface-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <LuArmchair style={{ width: "1.25rem", height: "1.25rem" }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                  {table.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {table.floor || "Main Floor"} • Capacity: {table.capacity || 4} Guests
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", textAlign: "right" }}>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>
                  Assigned Staff / Waiter
                </div>
                <div style={{ marginTop: "0.2rem" }}>
                  <select
                    disabled={isAssigningStaff.value}
                    value={assignedWaiter.value || activeKots[0]?.waiter_name || ""}
                    onChange$={$(async (e: Event) => {
                      const newWaiter = (e.target as HTMLSelectElement).value;
                      if (!table) return;
                      assignedWaiter.value = newWaiter;
                      isAssigningStaff.value = true;
                      currentKots.value = currentKots.value.map((k) =>
                        isKotForTable(k, table) ? { ...k, waiter_name: newWaiter } : k
                      );
                      try {
                        await invoke("shop_update_table_waiter", {
                          tableId: table.id,
                          waiterName: newWaiter,
                        });
                        if (onKOTsChanged$) await onKOTsChanged$();
                      } catch (err) {
                        console.error("[TableOrderSlideOver] assign waiter failed:", err);
                      } finally {
                        isAssigningStaff.value = false;
                      }
                    })}
                    style={{
                      height: "2rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0 0.5rem",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      outline: "none",
                      cursor: isAssigningStaff.value ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    <option value="">-- Assign Staff / Waiter --</option>
                    {(assignedWaiter.value || activeKots[0]?.waiter_name) &&
                      !staffMembers.value.some((s) => getStaffName(s) === (assignedWaiter.value || activeKots[0]?.waiter_name)) && (
                        <option value={assignedWaiter.value || activeKots[0]?.waiter_name}>
                          {assignedWaiter.value || activeKots[0]?.waiter_name}
                        </option>
                      )}
                    {staffMembers.value.map((s) => {
                      const name = getStaffName(s);
                      const labelText = `${name} (${s.role || "Staff"})`;
                      return (
                        <option key={s.id} value={name}>
                          {labelText}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div
                style={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "0.375rem",
                  background: "var(--surface-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <LuUsers style={{ width: "1.125rem", height: "1.125rem" }} />
              </div>
            </div>
          </div>

          {/* Active Ordered Items with Instant Optimistic Stepper & Micro-Animations */}
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.75rem",
                paddingBottom: "0.4rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Ordered Items ({totalItemCount} Units)</span>

              {/* Save status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", textTransform: "none", fontSize: "0.75rem" }}>
                {saveState.value === "saving" && (
                  <span style={{ color: "var(--brand-primary)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                    <LuLoader class="animate-spin" style={{ width: "0.75rem", height: "0.75rem" }} />
                    Saving...
                  </span>
                )}
                {saveState.value === "saved" && (
                  <span style={{ color: "var(--success, #10b981)", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                    <LuCheck style={{ width: "0.75rem", height: "0.75rem" }} />
                    Auto-saved
                  </span>
                )}
                {saveState.value === "idle" && (
                  <span style={{ color: "var(--text-secondary)" }}>Amount & Actions</span>
                )}
              </div>
            </div>

            {localLines.value.length === 0 ? (
              <div
                style={{
                  padding: "2.5rem 1.5rem",
                  textAlign: "center",
                  background: "var(--surface-1)",
                  borderRadius: "0.5rem",
                  border: "1px dashed var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                }}
              >
                <LuUtensils style={{ width: "2rem", height: "2rem", margin: "0 auto 0.5rem auto", opacity: 0.5 }} />
                <div>No active orders yet for this table.</div>
                <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  Send a KOT ticket below to add food dishes.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {localLines.value.map((line) => {
                  const isPopping = recentlyChangedId.value === line.id;
                  const price = resolveLinePrice(line.unitPrice, line.itemId, line.name, menuPrices.value);
                  const lineTotal = price * line.qty;

                  return (
                    <div key={line.id} class="order-item-row">
                      {/* Left: Dish Name & Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {line.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                          <span>₹{price} each</span>
                          <span>•</span>
                          <span style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{line.kotDocNumber}</span>
                          {line.notes && <span style={{ fontStyle: "italic" }}>({line.notes})</span>}
                        </div>
                      </div>

                      {/* Right: Quantity Stepper + Total + Delete */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexShrink: 0 }}>
                        {/* Stepper */}
                        <div class="stepper-box">
                          <button
                            type="button"
                            class="stepper-btn"
                            onClick$={() => handleUpdateQty(line, -1)}
                            title="Reduce quantity or remove"
                          >
                            <LuMinus style={{ width: "0.75rem", height: "0.75rem" }} />
                          </button>
                          <span class={`stepper-qty ${isPopping ? "pop" : ""}`}>
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            class="stepper-btn"
                            onClick$={() => handleUpdateQty(line, 1)}
                            title="Increase quantity"
                          >
                            <LuPlus style={{ width: "0.75rem", height: "0.75rem" }} />
                          </button>
                        </div>

                        {/* Total Price */}
                        <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)", minWidth: "3.5rem", textAlign: "right" }}>
                          ₹{lineTotal.toLocaleString("en-IN")}
                        </div>

                        {/* Direct Void/Remove Button */}
                        <button
                          type="button"
                          class="action-trash-btn"
                          onClick$={() => handleDeleteLine(line.id)}
                          title="Void / Remove Item (Not Available)"
                        >
                          <LuTrash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active KOT Tickets History with Dish Names */}
          {activeKots.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "0.75rem",
                  paddingBottom: "0.4rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Active KOT Tickets ({activeKots.length})</span>
                <span style={{ fontSize: "0.6875rem", textTransform: "none", fontWeight: 400 }}>Dishes sent to kitchen</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {activeKots.map((k) => {
                  const isVoidingThisKot = isVoidingKotId.value === k.id;

                  return (
                    <div
                      key={k.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        padding: "0.625rem 0.75rem",
                        background: "var(--surface-3)",
                        borderRadius: "0.375rem",
                        fontSize: "0.8125rem",
                        border: "1px solid var(--border)",
                        opacity: isVoidingThisKot ? 0.6 : 1,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {/* Header Row of KOT Ticket */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <LuFlame style={{ width: "1rem", height: "1rem", color: "var(--warning, #f59e0b)" }} />
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{k.doc_number}</span>
                          {k.waiter_name && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              • Waiter: <strong style={{ color: "var(--text-primary)" }}>{k.waiter_name}</strong>
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "0.25rem",
                              textTransform: "capitalize",
                              background: k.status === "ready" ? "var(--success-soft)" : "var(--surface-2)",
                              color: k.status === "ready" ? "var(--success)" : "var(--text-secondary)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {k.status}
                          </span>

                          {/* Void / Cancel Ticket confirmation */}
                          {voidConfirmKotId.value === k.id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <button
                                type="button"
                                disabled={isVoidingThisKot}
                                onClick$={() => handleCancelKot(k.id)}
                                style={{
                                  fontSize: "0.6875rem",
                                  fontWeight: 600,
                                  padding: "0.2rem 0.55rem",
                                  borderRadius: "0.25rem",
                                  background: "var(--error, #ef4444)",
                                  color: "#fff",
                                  border: "none",
                                  cursor: isVoidingThisKot ? "not-allowed" : "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.3rem",
                                }}
                              >
                                {isVoidingThisKot ? (
                                  <>
                                    <LuLoader class="animate-spin" style={{ width: "0.75rem", height: "0.75rem" }} />
                                    Removing...
                                  </>
                                ) : (
                                  "Confirm Void"
                                )}
                              </button>
                              {!isVoidingThisKot && (
                                <button
                                  type="button"
                                  onClick$={() => (voidConfirmKotId.value = null)}
                                  style={{
                                    fontSize: "0.6875rem",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "0.25rem",
                                    background: "var(--surface-2)",
                                    color: "var(--text-secondary)",
                                    border: "1px solid var(--border)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick$={() => (voidConfirmKotId.value = k.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                fontSize: "0.75rem",
                                padding: "0.15rem 0.35rem",
                                borderRadius: "0.25rem",
                              }}
                              title="Void or Cancel this KOT ticket"
                            >
                              <LuXCircle style={{ width: "0.875rem", height: "0.875rem", color: "var(--error, #ef4444)" }} />
                              <span style={{ color: "var(--text-secondary)" }}>Void</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Dish Names and Quantities Breakdown */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                        {k.lines.map((dl, dIdx) => {
                          const dishName = dl.item_name || (dl as any).name || (dl as any).description || "Dish";
                          return (
                            <span key={dIdx} class="dish-pill">
                              <strong style={{ color: "var(--brand-primary)" }}>{dl.qty}x</strong>
                              <span>{dishName}</span>
                              {dl.notes && (
                                <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                                  ({dl.notes})
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cancelled / Voided Dishes & Tickets (Collapsed by Default) */}
          {totalCancelledCount > 0 && (
            <div style={{ marginTop: "0.25rem" }}>
              <button
                type="button"
                onClick$={() => (showCancelled.value = !showCancelled.value)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  borderTop: "1px dashed var(--border)",
                  padding: "0.625rem 0",
                  color: "var(--error, #ef4444)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <LuBan style={{ width: "0.875rem", height: "0.875rem" }} />
                  <span>Cancelled / Voided Orders ({totalCancelledCount})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--text-secondary)", fontSize: "0.6875rem" }}>
                  <span>{showCancelled.value ? "Hide" : "Show Details"}</span>
                  {showCancelled.value ? (
                    <LuChevronUp style={{ width: "0.875rem", height: "0.875rem" }} />
                  ) : (
                    <LuChevronDown style={{ width: "0.875rem", height: "0.875rem" }} />
                  )}
                </div>
              </button>

              {showCancelled.value && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {/* Individually removed dishes */}
                  {voidedSingleItems.value.map((vItem, idx) => (
                    <div
                      key={`single-${vItem.id}-${idx}`}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "rgba(239, 68, 68, 0.05)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: "0.375rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span class="cancelled-dish-pill">
                          <strong style={{ color: "var(--error, #ef4444)" }}>{vItem.qty}x</strong>
                          <span>{vItem.name}</span>
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                          from {vItem.kotDocNumber}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.4rem",
                          borderRadius: "0.25rem",
                          background: "rgba(239, 68, 68, 0.12)",
                          color: "var(--error, #ef4444)",
                        }}
                      >
                        Removed / Voided
                      </span>
                    </div>
                  ))}

                  {/* Voided KOT Tickets */}
                  {cancelledKots.map((ck) => (
                    <div
                      key={ck.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                        padding: "0.625rem 0.75rem",
                        background: "rgba(239, 68, 68, 0.04)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: "0.375rem",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>
                            {ck.doc_number}
                          </span>
                          {ck.waiter_name && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              • Waiter: {ck.waiter_name}
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            padding: "0.15rem 0.45rem",
                            borderRadius: "0.25rem",
                            background: "rgba(239, 68, 68, 0.12)",
                            color: "var(--error, #ef4444)",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                          }}
                        >
                          Ticket Voided
                        </span>
                      </div>

                      {/* Cancelled Dish Names List with full resolution */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                        {ck.lines.length > 0 ? (
                          ck.lines.map((dl, dIdx) => {
                            const dishName = dl.item_name || (dl as any).name || (dl as any).description || "Dish";
                            return (
                              <span key={dIdx} class="cancelled-dish-pill">
                                <strong style={{ color: "var(--error, #ef4444)" }}>{dl.qty}x</strong>
                                <span>{dishName}</span>
                                {dl.notes && (
                                  <span style={{ fontSize: "0.6875rem", fontStyle: "italic" }}>
                                    ({dl.notes})
                                  </span>
                                )}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            {ck.notes || "All ticket items voided"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          q:slot="footer"
          style={{
            borderTop: "1px solid var(--border)",
            padding: "1rem 1.5rem",
            background: "var(--surface-1)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Running Total Amount:
            </span>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
              ₹{subtotal.toLocaleString("en-IN")}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <button
              type="button"
              onClick$={() => {
                open.value = false;
                const activeWaiter = activeKots[0]?.waiter_name || "";
                onOpenSendKOT$(table.id, activeWaiter);
              }}
              style={{
                height: "2.625rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text-primary)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <LuPlus style={{ width: "0.875rem", height: "0.875rem" }} />
              + Add Items (KOT)
            </button>

            <button
              type="button"
              disabled={localLines.value.length === 0}
              onClick$={() => {
                open.value = false;
                onOpenPOSBill$(
                  table,
                  localLines.value.map((l) => ({
                    itemId: l.itemId,
                    name: l.name,
                    qty: l.qty,
                    price: resolveLinePrice(l.unitPrice, l.itemId, l.name, menuPrices.value),
                  }))
                );
              }}
              style={{
                height: "2.625rem",
                borderRadius: "0.375rem",
                border: "none",
                background: localLines.value.length > 0 ? "var(--button-primary-bg)" : "var(--surface-3)",
                color: localLines.value.length > 0 ? "var(--button-primary-text)" : "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: localLines.value.length > 0 ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <LuReceipt style={{ width: "0.875rem", height: "0.875rem" }} />
              Generate POS Bill
            </button>
          </div>

          {table.status === "occupied" && (
            <button
              type="button"
              onClick$={() => {
                showClearConfirm.value = true;
              }}
              style={{
                height: "2.125rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.3rem",
              }}
            >
              <LuCheckCircle2 style={{ width: "0.875rem", height: "0.875rem" }} />
              Clear & Vacate Table
            </button>
          )}

          {/* In-App Confirmation Modal */}
          {showClearConfirm.value && (
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
                      background: "var(--warning-soft, rgba(245,158,11,0.15))",
                      color: "var(--warning, #f59e0b)",
                      flexShrink: 0,
                    }}
                  >
                    <LuAlertTriangle style={{ width: "1.5rem", height: "1.5rem" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Clear {table.name}?
                    </h3>
                    <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Are you sure you want to vacate and reset this table? Make sure the bill has been generated and settled before clearing.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
                  <button
                    type="button"
                    disabled={isClearingTable.value}
                    onClick$={() => (showClearConfirm.value = false)}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--border)",
                      background: "var(--surface-1)",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      fontSize: "0.8125rem",
                      cursor: isClearingTable.value ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isClearingTable.value}
                    onClick$={async () => {
                      isClearingTable.value = true;
                      try {
                        await onClearTable$(table.id);
                        showClearConfirm.value = false;
                        open.value = false;
                      } finally {
                        isClearingTable.value = false;
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
                      cursor: isClearingTable.value ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {isClearingTable.value ? (
                      <>
                        <LuLoader class="animate-spin" style={{ width: "0.875rem", height: "0.875rem" }} />
                        Clearing...
                      </>
                    ) : (
                      "Yes, Clear Table"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    );
  }
);
