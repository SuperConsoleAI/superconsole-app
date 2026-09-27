// src/components/shop/ReceiveStockSlideOver.tsx
//
// WHAT: Slide-over panel for receiving goods from a vendor.
//       Uses VendorLookupSlideOver to pick a vendor.
//       Uses ShopProductPickerModal for cat_6 items (with 12 items limit & search).
//       Supports Batch No, Expiry Date, Free Scheme Qty, Batch MRP, Pack Size, Conversion Factor,
//       Vendor Invoice Date, Cash Discount, Inward Freight, Transporter/LR#/Vehicle#,
//       Vendor Invoice/Bill #, Transaction ID, Payment Method, Amount Paid & Invoice Screenshot.
//
// IPC: shop_list_items, shop_list_warehouses, shop_receive_stock

import {
  component$,
  useSignal,
  useStylesScoped$,
  useTask$,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuPlus,
  LuTrash2,
  LuLoader,
  LuFileText,
  LuImage,
  LuUpload,
  LuTruck,
  LuChevronDown,
  LuChevronUp,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { VendorLookupSlideOver, type VendorBasic } from "~/components/shop/VendorLookupSlideOver";
import { ShopProductPickerModal } from "~/components/shop/ShopProductPickerModal";
import { MediaPickerModal } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";
import { ShopStaffSelector } from "~/components/shop/ShopStaffSelector";
import type { ShopStaffMember } from "~/components/shop/AddStaffSlideOver";

interface Warehouse { id: string; name: string; is_default: number; }

export interface PricingSnapshot {
  rate: number;
  discount: number;
  discount2: number;
  tax: number;
  tax_code: string;
}

export interface ReceiveStockSlideOverProps {
  open: Signal<boolean>;
  onSaved$: PropFunction<() => void>;
  editingDocument?: Signal<any | null>;
}

export interface ReceiveLine {
  item_id: string;
  item_name: string;
  qty: number;
  free_qty: number;
  cost: number;
  rate: number;
  discount: number;
  discount2: number;
  tax: number;
  tax_code: string;
  selling_price?: number;
  mrp?: number;
  pack_size?: string;
  conversion_factor?: number;
  scheme_on?: number;
  scheme_free?: number;
  batch_no: string;
  expiry_date: string;
  shelf_location: string;
  line_meta?: string | null;
}

export function calcLineNetCost(rate: number, discount: number, discount2: number, tax: number): number {
  if (!rate || rate <= 0) return 0;
  const d1 = (rate * (discount || 0)) / 100;
  const afterD1 = Math.max(0, rate - d1);
  const d2 = (afterD1 * (discount2 || 0)) / 100;
  const taxable = Math.max(0, afterD1 - d2);
  const taxAmt = (taxable * (tax || 0)) / 100;
  const netCost = taxable + taxAmt;
  return Math.round(netCost * 100) / 100;
}

const createDefaultLine = (): ReceiveLine => ({
  item_id: "",
  item_name: "",
  qty: 1,
  free_qty: 0,
  cost: 0,
  rate: 0,
  discount: 0,
  discount2: 0,
  tax: 0,
  tax_code: "",
  selling_price: 0,
  mrp: 0,
  pack_size: "",
  conversion_factor: 1,
  scheme_on: 0,
  scheme_free: 0,
  batch_no: "",
  expiry_date: "",
  shelf_location: "",
});

const inputStyle = {
  width: "100%",
  height: "2.25rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const ReceiveStockSlideOver = component$<ReceiveStockSlideOverProps>(({ open, onSaved$, editingDocument }) => {
  useStylesScoped$(`
    .badge-mod-full {
      display: inline;
    }
    .badge-mod-short {
      display: none;
    }
    .creator-label {
      display: inline;
    }

    @media (max-width: 640px) {
      .creator-label {
        display: none !important;
      }
      .badge-mod-full {
        display: none !important;
      }
      .badge-mod-short {
        display: inline !important;
      }
    }
  `);

  const warehouses = useSignal<Warehouse[]>([]);
  const taxRates = useSignal<{ id: string; name: string; rate_pct: number }[]>([]);
  const staffList = useSignal<ShopStaffMember[]>([]);
  const staffId = useSignal("");
  const lines = useSignal<ReceiveLine[]>([createDefaultLine()]);
  const pickedVendor = useSignal<VendorBasic | null>(null);
  const showVendorPicker = useSignal(false);
  const showItemPicker = useSignal(false);
  const activePickerLineIndex = useSignal<number | null>(null);
  const showMediaPicker = useSignal(false);
  const showMediaModal = useSignal(false);
  const showLogistics = useSignal(false);

  const warehouseId = useSignal("");
  const refNumber = useSignal("");
  const vendorBillDate = useSignal("");
  const cashDiscountPct = useSignal("");
  const inwardExpense = useSignal("");
  const transporterName = useSignal("");
  const lrNumber = useSignal("");
  const vehicleNumber = useSignal("");
  const transactionId = useSignal("");
  const paymentMethod = useSignal("cash");
  const amountPaid = useSignal("");
  const userCustomizedPaid = useSignal(false);
  const mediaId = useSignal("");
  const notes = useSignal("");
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const loaded = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track, cleanup }) => {
    const isOpen = track(() => open.value);
    if (!isOpen) return;
    try {
      const [whs, rates, staff] = await Promise.all([
        invoke<Warehouse[]>("shop_list_warehouses", {}).catch(() => []),
        invoke<{ id: string; name: string; rate_pct: number }[]>("fin_list_tax_rates").catch(() => []),
        invoke<ShopStaffMember[]>("shop_list_staff", {}).catch(() => []),
      ]);
      if (whs.length) {
        warehouses.value = whs;
        if (!warehouseId.value) {
          warehouseId.value = whs.find(w => w.is_default)?.id ?? whs[0]?.id ?? "";
        }
      }
      taxRates.value = rates;
      if (rates.length > 0 && lines.value.length > 0) {
        lines.value = lines.value.map(l => {
          if (l.tax > 0) {
            const m = rates.find(r => r.id === l.tax_code || Math.abs(r.rate_pct - l.tax) < 0.01);
            if (m && (l.tax_code !== m.id || l.tax !== m.rate_pct)) {
              return { ...l, tax_code: m.id, tax: m.rate_pct };
            }
          }
          return l;
        });
      }
      staffList.value = staff.filter(s => s.is_active !== 0);

      if (!editingDocument?.value) {
        const savedStaffId = typeof localStorage !== "undefined" ? localStorage.getItem("bk-active-staff-id") : null;
        if (savedStaffId) {
          staffId.value = savedStaffId;
        }
      }

      const handleStaffChange = (e: any) => {
        if (!editingDocument?.value) {
          staffId.value = e.detail || "";
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("bk-staff-changed", handleStaffChange);
        cleanup(() => {
          window.removeEventListener("bk-staff-changed", handleStaffChange);
        });
      }

      loaded.value = true;
    } catch (e) {
      console.error("[ReceiveStock] load failed:", e);
    }
  });

  // Rehydrate state when editing an existing invoice/document
  useTask$(({ track }) => {
    const isOpen = track(() => open.value);
    const doc = editingDocument ? track(() => editingDocument.value) : null;

    if (!isOpen) return;

    if (doc) {
      const summary = doc.summary || doc;
      if (doc.warehouse_id || summary.warehouse_id) {
        warehouseId.value = doc.warehouse_id || summary.warehouse_id;
      }
      const staffVal = doc.staff_id || summary.staff_id;
      if (staffVal) {
        staffId.value = staffVal;
      } else {
        const savedStaffId = typeof localStorage !== "undefined" ? localStorage.getItem("bk-active-staff-id") : null;
        staffId.value = savedStaffId || "";
      }
      const vId = doc.vendor_id || summary.vendor_id;
      const vName = doc.vendor_name || summary.vendor_name;
      if (vId || vName) {
        pickedVendor.value = {
          id: vId || "",
          name: vName || "",
          payment_terms: doc.payment_terms || summary.payment_terms || "immediate",
        };
      }
      refNumber.value = doc.ref_number || summary.ref_number || "";
      const dateVal = doc.doc_date || summary.doc_date || doc.vendor_bill_date || summary.vendor_bill_date;
      if (dateVal) {
        if (typeof dateVal === "number") {
          const d = new Date(dateVal * 1000);
          vendorBillDate.value = d.toISOString().split("T")[0];
        } else {
          vendorBillDate.value = String(dateVal);
        }
      }
      const cd = doc.cash_discount_pct !== undefined ? doc.cash_discount_pct : summary.cash_discount_pct;
      if (cd !== undefined && cd !== null) cashDiscountPct.value = String(cd);
      const ie = doc.inward_expense !== undefined ? doc.inward_expense : summary.inward_expense;
      if (ie !== undefined && ie !== null) inwardExpense.value = String(ie);
      transporterName.value = doc.transporter_name || summary.transporter_name || "";
      lrNumber.value = doc.lr_number || summary.lr_number || "";
      vehicleNumber.value = doc.vehicle_number || summary.vehicle_number || "";
      transactionId.value = doc.transaction_id || summary.transaction_id || "";
      paymentMethod.value = doc.payment_mode || doc.payment_method || summary.payment_method || summary.payment_mode || "cash";
      const amtPaid = doc.amount_paid !== undefined ? doc.amount_paid : summary.amount_paid;
      if (amtPaid !== undefined && amtPaid !== null) {
        amountPaid.value = String(amtPaid);
        userCustomizedPaid.value = true;
      }
      mediaId.value = doc.media_id || summary.media_id || "";
      notes.value = doc.notes || summary.notes || "";

      if (Array.isArray(doc.lines) && doc.lines.length > 0) {
        lines.value = doc.lines.map((l: any) => {
          let snapshot: PricingSnapshot | null = null;
          if (l.pricing_snapshot) {
            try {
              snapshot = typeof l.pricing_snapshot === "string" ? JSON.parse(l.pricing_snapshot) : l.pricing_snapshot;
            } catch (e) {
              console.warn("Failed to parse pricing_snapshot:", e);
            }
          }

          const rate = snapshot?.rate ?? (l.unit_cost || l.cost || l.unit_price || 0);
          const discount = snapshot?.discount ?? (l.discount_pct || 0);
          const discount2 = snapshot?.discount2 ?? 0;
          let tax = snapshot?.tax ?? (l.tax_rate_pct || 0);
          let tax_code = snapshot?.tax_code ?? (l.tax_rate_id || "");
          if (taxRates.value.length > 0) {
            const matched = taxRates.value.find(r => (tax_code && r.id === tax_code) || (tax > 0 && Math.abs(r.rate_pct - tax) < 0.01));
            if (matched) {
              tax_code = matched.id;
              tax = matched.rate_pct;
            }
          }
          const cost = l.unit_cost || l.cost || (snapshot ? calcLineNetCost(rate, discount, discount2, tax) : rate);

          let expiryStr = "";
          if (l.expiry_date) {
            try {
              const expD = new Date(typeof l.expiry_date === "number" ? l.expiry_date * 1000 : l.expiry_date);
              expiryStr = expD.toISOString().split("T")[0];
            } catch {
              // ignore invalid date
            }
          }

          return {
            item_id: l.item_id || "",
            item_name: l.item_name || l.description || "",
            qty: l.qty || 1,
            free_qty: l.free_qty || 0,
            rate,
            discount,
            discount2,
            tax,
            tax_code,
            cost,
            selling_price: l.selling_price || l.unit_price || 0,
            mrp: l.mrp || 0,
            pack_size: l.pack_size || "",
            conversion_factor: l.conversion_factor || 1,
            scheme_on: l.scheme_on || 0,
            scheme_free: l.scheme_free || 0,
            batch_no: l.batch_no || "",
            expiry_date: expiryStr,
            shelf_location: l.shelf_location || "",
            line_meta: l.line_meta || null,
          };
        });
      }
    }
  });

  const reset = $(() => {
    if (editingDocument) {
      editingDocument.value = null;
    }
    lines.value = [createDefaultLine()];
    pickedVendor.value = null;
    const savedStaffId = typeof localStorage !== "undefined" ? localStorage.getItem("bk-active-staff-id") : null;
    staffId.value = savedStaffId || "";
    refNumber.value = "";
    vendorBillDate.value = "";
    cashDiscountPct.value = "";
    inwardExpense.value = "";
    transporterName.value = "";
    lrNumber.value = "";
    vehicleNumber.value = "";
    transactionId.value = "";
    paymentMethod.value = "cash";
    amountPaid.value = "";
    userCustomizedPaid.value = false;
    mediaId.value = "";
    notes.value = "";
    showLogistics.value = false;
    error.value = null;
  });

  const addLine = $(() => {
    lines.value = [
      ...lines.value,
      createDefaultLine(),
    ];
  });

  const removeLine = $((idx: number) => {
    lines.value = lines.value.filter((_, i) => i !== idx);
  });

  const handleSave = $(async () => {
    const validLines = lines.value.filter(l => l.item_id && l.qty > 0);
    if (!validLines.length) {
      error.value = "Add at least one item with a quantity.";
      return;
    }
    saving.value = true;
    error.value = null;
    try {
      const docId = editingDocument?.value?.id || editingDocument?.value?.summary?.id;
      const isEdit = Boolean(docId);
      const dataPayload = {
        warehouse_id: warehouseId.value || null,
        staff_id: staffId.value || undefined,
        vendor_id: pickedVendor.value?.id ?? null,
        vendor_name: pickedVendor.value?.name ?? null,
        lines: validLines.map(l => {
          const snapshot: PricingSnapshot = {
            rate: Number(l.rate || 0),
            discount: Number(l.discount || 0),
            discount2: Number(l.discount2 || 0),
            tax: Number(l.tax || 0),
            tax_code: l.tax_code || "",
          };
          return {
            item_id: l.item_id,
            item_name: l.item_name,
            qty: l.qty,
            free_qty: l.free_qty > 0 ? l.free_qty : undefined,
            cost: l.cost > 0 ? l.cost : undefined,
            selling_price: (l.selling_price || 0) > 0 ? l.selling_price : undefined,
            mrp: (l.mrp || 0) > 0 ? l.mrp : undefined,
            pack_size: l.pack_size?.trim() || undefined,
            conversion_factor: (l.conversion_factor || 0) > 0 ? l.conversion_factor : undefined,
            scheme_on: (l.scheme_on || 0) > 0 ? l.scheme_on : undefined,
            scheme_free: (l.scheme_free || 0) > 0 ? l.scheme_free : undefined,
            batch_no: l.batch_no.trim() || undefined,
            expiry_date: l.expiry_date && l.expiry_date.trim() ? Math.floor(Date.parse(l.expiry_date + "T00:00:00Z") / 1000) : undefined,
            shelf_location: l.shelf_location?.trim() || undefined,
            pricing_snapshot: JSON.stringify(snapshot),
          };
        }),
        ref_number: refNumber.value.trim() || null,
        vendor_bill_date: vendorBillDate.value && vendorBillDate.value.trim() ? Math.floor(Date.parse(vendorBillDate.value + "T00:00:00Z") / 1000) : undefined,
        cash_discount_pct: cashDiscountPct.value ? parseFloat(cashDiscountPct.value) : undefined,
        inward_expense: inwardExpense.value ? parseFloat(inwardExpense.value) : undefined,
        transporter_name: transporterName.value.trim() || null,
        lr_number: lrNumber.value.trim() || null,
        vehicle_number: vehicleNumber.value.trim() || null,
        transaction_id: transactionId.value.trim() || null,
        payment_method: paymentMethod.value || null,
        amount_paid: amountPaid.value ? parseFloat(amountPaid.value) : undefined,
        media_id: mediaId.value.trim() || null,
        notes: notes.value.trim() || null,
      };

      if (isEdit && docId) {
        await invoke("shop_update_receive_stock", {
          docId,
          data: dataPayload,
        });
      } else {
        await invoke("shop_receive_stock", {
          data: dataPayload,
        });
      }
      open.value = false;
      reset();
      await onSaved$();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  // Reactive auto-population of amountPaid to match Grand Total by default
  useTask$(({ track }) => {
    const l = track(() => lines.value);
    const cd = track(() => cashDiscountPct.value);
    const exp = track(() => inwardExpense.value);
    const pm = track(() => paymentMethod.value);
    const customized = track(() => userCustomizedPaid.value);

    const sub = l.reduce((acc: number, row: ReceiveLine) => acc + ((row.qty || 0) * (row.cost || 0)), 0);
    const cdAmt = (sub * (parseFloat(cd) || 0)) / 100;
    const freight = parseFloat(exp) || 0;
    const gt = Math.max(0, sub - cdAmt + freight);

    if (!customized) {
      if (pm === "credit") {
        amountPaid.value = "0";
      } else {
        amountPaid.value = gt > 0 ? gt.toFixed(2) : "";
      }
    }
  });

  const isEditingReceipt = Boolean(editingDocument?.value?.id || editingDocument?.value?.summary?.id);

  return (
    <>
      <SlideOver
        open={open}
        title={isEditingReceipt ? `Edit Purchase Receipt (${editingDocument?.value?.doc_number || editingDocument?.value?.summary?.doc_number || "Receipt"})` : "Receive Stock / Purchase Entry"}
        width="700px"
      >
        {/* ── Top Bar Staff Selector (before close cross icon) ── */}
        <div q:slot="header-actions">
          <ShopStaffSelector selectedStaffId={staffId} staffList={staffList} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* Header info */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Destination Warehouse</label>
              <select
                value={warehouseId.value}
                onChange$={(e) => { warehouseId.value = (e.target as HTMLSelectElement).value; }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {warehouses.value.map(w => (
                  <option key={w.id} value={w.id}>{`${w.name}${w.is_default ? " (Default)" : ""}`}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                Vendor / Supplier
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>(optional)</span>
              </label>
              <button
                type="button"
                onClick$={() => { showVendorPicker.value = true; }}
                style={{
                  ...inputStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  textAlign: "left",
                  color: pickedVendor.value ? "var(--text-primary)" : "var(--text-secondary)",
                  borderColor: pickedVendor.value ? "var(--accent)" : "var(--border)",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pickedVendor.value ? pickedVendor.value.name : "Select or create vendor…"}
                </span>
                {pickedVendor.value ? (
                  <span
                    onClick$={(e) => { e.stopPropagation(); pickedVendor.value = null; }}
                    style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0 0.25rem", cursor: "pointer" }}
                    title="Clear vendor"
                  >
                    ✕
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: "600" }}>+ Pick</span>
                )}
              </button>
            </div>

            <ShopStaffSelector selectedStaffId={staffId} staffList={staffList} variant="form-field" label="Staff Member" />
          </div>

          {/* Invoice / Reference & Payment Details */}
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <LuFileText style="width:0.875rem;height:0.875rem;color:var(--accent);" /> Vendor Invoice & Payment Details
            </div>

            {/* Row 1: Bill # & Bill Date */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Vendor Bill / Invoice #
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2024-001"
                  value={refNumber.value}
                  onInput$={(e) => { refNumber.value = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Vendor Bill Date
                </label>
                <input
                  type="date"
                  value={vendorBillDate.value}
                  onInput$={(e) => { vendorBillDate.value = (e.target as HTMLInputElement).value; }}
                  style={{ ...inputStyle, cursor: "pointer" }}
                />
              </div>
            </div>

            {/* Row 2: Payment Method, Txn ID, Amount Paid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Payment Method
                </label>
                <select
                  value={paymentMethod.value}
                  onChange$={(e) => { paymentMethod.value = (e.target as HTMLSelectElement).value; }}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / GPay / PhonePe</option>
                  <option value="bank_transfer">Bank Transfer / NEFT / IMPS</option>
                  <option value="card">Card (Debit / Credit Card)</option>
                  <option value="cheque">Cheque</option>
                  <option value="credit">Supplier Credit / On Account</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Payment Txn / Ref ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI/9182309182"
                  value={transactionId.value}
                  onInput$={(e) => { transactionId.value = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>
                    Amount Paid
                  </label>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick$={() => {
                        const sub = lines.value.reduce((acc: number, row: ReceiveLine) => acc + ((row.qty || 0) * (row.cost || 0)), 0);
                        const cdAmt = (sub * (parseFloat(cashDiscountPct.value) || 0)) / 100;
                        const freight = parseFloat(inwardExpense.value) || 0;
                        const gt = Math.max(0, sub - cdAmt + freight);
                        amountPaid.value = gt.toFixed(2);
                        userCustomizedPaid.value = true;
                      }}
                      style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.6875rem", fontWeight: "600", cursor: "pointer", padding: "0 0.15rem" }}
                      title="Set full invoice amount as paid"
                    >
                      Full
                    </button>
                    <span style={{ color: "var(--border)", fontSize: "0.6875rem" }}>|</span>
                    <button
                      type="button"
                      onClick$={() => {
                        amountPaid.value = "0";
                        paymentMethod.value = "credit";
                        userCustomizedPaid.value = true;
                      }}
                      style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.6875rem", fontWeight: "500", cursor: "pointer", padding: "0 0.15rem" }}
                      title="Set unpaid (Supplier Credit)"
                    >
                      Credit
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amountPaid.value}
                  onInput$={(e) => {
                    amountPaid.value = (e.target as HTMLInputElement).value;
                    userCustomizedPaid.value = true;
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Row 3: Cash Discount %, Inward Expenses, Screenshot */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Cash Discount % (CD)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 2%"
                  value={cashDiscountPct.value}
                  onInput$={(e) => { cashDiscountPct.value = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Freight / Inward Exp
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={inwardExpense.value}
                  onInput$={(e) => { inwardExpense.value = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.25rem" }}>
                  Invoice Screenshot
                </label>
                {mediaId.value ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.375rem", height: "2.25rem", padding: "0 0.625rem", background: "rgba(59,130,246,0.08)", border: "1px solid var(--accent)", borderRadius: "0.375rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", overflow: "hidden" }}>
                      <LuFileText style="width:0.875rem;height:0.875rem;color:var(--accent);flex-shrink:0;" />
                      <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mediaId.value}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick$={() => { mediaId.value = ""; }}
                      style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem", padding: "0 0.25rem", lineHeight: 1 }}
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button
                      type="button"
                      onClick$={() => { showMediaPicker.value = true; }}
                      style={{ flex: 1, height: "2.25rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.75rem", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                    >
                      <LuImage style="width:0.875rem;height:0.875rem;" /> Browse
                    </button>
                    <button
                      type="button"
                      onClick$={() => { showMediaModal.value = true; }}
                      style={{ flex: 1, height: "2.25rem", padding: "0 0.4rem", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "0.375rem", color: "#3b82f6", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                    >
                      <LuUpload style="width:0.875rem;height:0.875rem;" /> Upload
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Transport & Logistics Toggle / Details */}
            <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
              <button
                type="button"
                onClick$={() => { showLogistics.value = !showLogistics.value; }}
                style={{
                  background: "transparent",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "0.25rem 0",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <LuTruck style="width:0.8125rem;height:0.8125rem;color:var(--accent);" />
                  Logistics & Transport Details (Transporter, LR #, Vehicle #)
                </span>
                {showLogistics.value ? <LuChevronUp style="width:0.8125rem;height:0.8125rem;" /> : <LuChevronDown style="width:0.8125rem;height:0.8125rem;" />}
              </button>

              {showLogistics.value && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem", marginTop: "0.5rem" }}>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>
                      Transporter / Courier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. VRL Logistics"
                      value={transporterName.value}
                      onInput$={(e) => { transporterName.value = (e.target as HTMLInputElement).value; }}
                      style={{ ...inputStyle, height: "2rem", fontSize: "0.8125rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>
                      LR / Bilty #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. LR-98124"
                      value={lrNumber.value}
                      onInput$={(e) => { lrNumber.value = (e.target as HTMLInputElement).value; }}
                      style={{ ...inputStyle, height: "2rem", fontSize: "0.8125rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>
                      Vehicle #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MH-12-AB-1234"
                      value={vehicleNumber.value}
                      onInput$={(e) => { vehicleNumber.value = (e.target as HTMLInputElement).value; }}
                      style={{ ...inputStyle, height: "2rem", fontSize: "0.8125rem" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Items Received (Category: cat_6)</label>
              <button
                type="button"
                onClick$={addLine}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", fontWeight: "500" }}
              >
                <LuPlus style="width:0.875rem;height:0.875rem;" /> Add row
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {lines.value.map((line, idx) => {
                const totalUnits = (line.qty || 0) + (line.free_qty || 0);
                const lineTotal = (line.qty || 0) * (line.cost || 0);
                const landingCost = totalUnits > 0 ? lineTotal / totalUnits : (line.cost || 0);
                const sellingPrice = line.selling_price || 0;
                const wholesaleMargin = sellingPrice > 0 ? (((sellingPrice - landingCost) / sellingPrice) * 100).toFixed(1) : null;
                const retailMargin = (line.mrp || 0) > 0 && sellingPrice > 0 ? ((((line.mrp || 0) - sellingPrice) / (line.mrp || 0)) * 100).toFixed(1) : null;

                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {/* Header Row: Item Picker + Delete Button (Cleanly integrated without empty dummy container) */}
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Item (cat_6)</span>
                        <button
                          type="button"
                          onClick$={() => {
                            activePickerLineIndex.value = idx;
                            showItemPicker.value = true;
                          }}
                          style={{
                            ...inputStyle,
                            height: "2.125rem",
                            fontSize: "0.8125rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            textAlign: "left",
                            borderColor: line.item_id ? "var(--accent)" : "var(--border)",
                            background: line.item_id ? "var(--surface-3)" : "var(--field-fill)",
                            color: line.item_id ? "var(--text-primary)" : "var(--text-secondary)",
                            padding: "0 0.5rem",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {line.item_name || "— Pick Item —"}
                          </span>
                          <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: "600", flexShrink: 0, marginLeft: "0.25rem" }}>
                            {line.item_id ? "Change" : "🔍 Pick"}
                          </span>
                        </button>
                      </div>

                      {lines.value.length > 1 && (
                        <div style={{ display: "flex", alignItems: "flex-end", height: "100%", paddingTop: "1rem" }}>
                          <button
                            type="button"
                            onClick$={$(() => removeLine(idx))}
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "var(--error)", borderRadius: "0.375rem", height: "2.125rem", width: "2.125rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title="Remove row"
                          >
                            <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Audit Modification Badges (Delta tracking) */}
                    {line.line_meta && (() => {
                      let originalQty: number | undefined = undefined;
                      let isAdded = false;
                      let increasedQty: number | undefined = undefined;
                      let reducedQty: number | undefined = undefined;
                      let originalCost: number | undefined = undefined;
                      let originalBatch: string | undefined = undefined;
                      let newBatch: string | undefined = undefined;

                      try {
                        const m = typeof line.line_meta === "string" ? JSON.parse(line.line_meta) : line.line_meta;
                        if (m.original_qty !== undefined) originalQty = Number(m.original_qty);
                        if (m.is_added) isAdded = true;
                        if (m.increased_qty !== undefined) increasedQty = Number(m.increased_qty);
                        if (m.reduced_qty !== undefined) reducedQty = Number(m.reduced_qty);
                        if (m.original_cost !== undefined && Math.abs(Number(m.original_cost) - line.cost) > 0.005) {
                          originalCost = Number(m.original_cost);
                        }
                        if (m.original_batch_no) originalBatch = String(m.original_batch_no);
                        if (m.new_batch_no) newBatch = String(m.new_batch_no);
                      } catch { /* noop */ }

                      const isNewlyAdded = isAdded || (originalQty === 0 && line.qty > 0);
                      const isReduced = !isNewlyAdded && originalQty !== undefined && line.qty < originalQty;
                      const isIncreased = !isNewlyAdded && ((increasedQty !== undefined && increasedQty > 0) || (originalQty !== undefined && line.qty > originalQty));

                      if (!isNewlyAdded && !isReduced && !isIncreased && originalCost === undefined && !originalBatch) {
                        return null;
                      }

                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                          {isNewlyAdded && (
                            <span style={{ fontSize: "0.625rem", color: "#10b981", fontWeight: "700", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.35rem" }}>
                              +ADDED
                            </span>
                          )}
                          {isReduced && (
                            <span style={{ fontSize: "0.625rem", color: "#d97706", fontWeight: "600", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                              ORIG QTY: {originalQty} (−{reducedQty ?? (originalQty! - line.qty)})
                            </span>
                          )}
                          {isIncreased && (
                            <span style={{ fontSize: "0.625rem", color: "#3b82f6", fontWeight: "600", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                              ORIG QTY: {originalQty} (+{increasedQty ?? (line.qty - originalQty!)})
                            </span>
                          )}
                          {originalCost !== undefined && (
                            <span style={{ fontSize: "0.625rem", color: "#8b5cf6", fontWeight: "600", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                              RATE: ₹{originalCost.toFixed(2)} → ₹{line.cost.toFixed(2)}
                            </span>
                          )}
                          {originalBatch && (
                            <span style={{ fontSize: "0.625rem", color: "#ec4899", fontWeight: "600", background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                              BATCH: {originalBatch} → {newBatch || line.batch_no}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Real-time Purchase Cost Breakdown Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(85px, 1fr))", gap: "0.4rem", alignItems: "flex-end" }}>
                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Billed Qty</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={String(line.qty)}
                          onInput$={(e) => {
                            const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => {
                              if (i !== idx) return l;
                              const autoFree = ((l.scheme_on || 0) > 0 && (l.scheme_free || 0) > 0)
                                ? Math.floor(v / (l.scheme_on || 1)) * (l.scheme_free || 0)
                                : l.free_qty;
                              return { ...l, qty: v, free_qty: autoFree };
                            });
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Free Qty</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={String(line.free_qty)}
                          placeholder="0"
                          onInput$={(e) => {
                            const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => i === idx ? { ...l, free_qty: v } : l);
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Rate (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.rate ? String(line.rate) : ""}
                          onInput$={(e) => {
                            const r = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => {
                              if (i !== idx) return l;
                              const newCost = calcLineNetCost(r, l.discount, l.discount2, l.tax);
                              return { ...l, rate: r, cost: newCost };
                            });
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Disc 1 %</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0"
                          value={line.discount ? String(line.discount) : ""}
                          onInput$={(e) => {
                            const d1 = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => {
                              if (i !== idx) return l;
                              const newCost = calcLineNetCost(l.rate, d1, l.discount2, l.tax);
                              return { ...l, discount: d1, cost: newCost };
                            });
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Disc 2 %</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0"
                          value={line.discount2 ? String(line.discount2) : ""}
                          onInput$={(e) => {
                            const d2 = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => {
                              if (i !== idx) return l;
                              const newCost = calcLineNetCost(l.rate, l.discount, d2, l.tax);
                              return { ...l, discount2: d2, cost: newCost };
                            });
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Tax %</span>
                        {(() => {
                          const matched = taxRates.value.find(r => (line.tax_code && r.id === line.tax_code) || (line.tax > 0 && Math.abs(r.rate_pct - line.tax) < 0.01));
                          const currentVal = matched ? matched.id : (line.tax_code || (line.tax > 0 ? `tax_${line.tax}` : ""));
                          return (
                            <select
                              value={currentVal}
                              onChange$={(e) => {
                                const code = (e.target as HTMLSelectElement).value;
                                const m = taxRates.value.find(r => r.id === code);
                                const taxPct = m ? m.rate_pct : (code.startsWith("tax_") ? parseFloat(code.replace("tax_", "")) || 0 : (line.tax || 0));
                                lines.value = lines.value.map((l, i) => {
                                  if (i !== idx) return l;
                                  const newCost = calcLineNetCost(l.rate, l.discount, l.discount2, taxPct);
                                  return { ...l, tax_code: code, tax: taxPct, cost: newCost };
                                });
                              }}
                              style={{ ...inputStyle, height: "2.125rem", fontSize: "0.75rem", padding: "0 0.25rem", cursor: "pointer" }}
                            >
                              <option value="" selected={!currentVal}>None (0%)</option>
                              {!taxRates.value.some(r => r.id === "exempt" || r.id === "nil" || r.rate_pct === 0) && (
                                <option value="exempt" selected={currentVal === "exempt"}>Exempt (0%)</option>
                              )}
                              {taxRates.value.map(r => (
                                <option key={r.id} value={r.id} selected={r.id === currentVal}>
                                  {`${r.name} (${r.rate_pct}%)`}
                                </option>
                              ))}
                              {currentVal && !taxRates.value.some(r => r.id === currentVal) && (
                                <option value={currentVal} selected={true}>
                                  {`GST ${line.tax}% (${line.tax}%)`}
                                </option>
                              )}
                            </select>
                          );
                        })()}
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: "600", display: "block", marginBottom: "0.2rem" }}>Net Cost / PTS</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.cost ? String(line.cost) : ""}
                          placeholder="0.00"
                          onInput$={(e) => {
                            const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => {
                              if (i !== idx) return l;
                              const r = (l.rate === 0 || !l.rate) ? v : l.rate;
                              return { ...l, cost: v, rate: r };
                            });
                          }}
                          style={{
                            ...inputStyle,
                            height: "2.125rem",
                            fontSize: "0.8125rem",
                            fontWeight: "600",
                            color: "var(--accent)",
                            background: "rgba(59,130,246,0.06)",
                            borderColor: "var(--accent)",
                            padding: "0 0.35rem",
                          }}
                          title={line.rate > 0 ? `Calculated: Rate ₹${line.rate} - ${line.discount}% - ${line.discount2}% + ${line.tax}% Tax = ₹${line.cost.toFixed(2)}` : "Net unit cost"}
                        />
                      </div>
                    </div>

                    {/* Selling Price, MRP, Row Total */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.4rem", alignItems: "flex-end" }}>
                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Selling (PTR)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.selling_price ? String(line.selling_price) : ""}
                          onInput$={(e) => {
                            const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => i === idx ? { ...l, selling_price: v } : l);
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Batch MRP</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.mrp ? String(line.mrp) : ""}
                          onInput$={(e) => {
                            const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                            lines.value = lines.value.map((l, i) => i === idx ? { ...l, mrp: v } : l);
                          }}
                          style={{ ...inputStyle, height: "2.125rem", fontSize: "0.8125rem", padding: "0 0.35rem" }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: "500", display: "block", marginBottom: "0.2rem" }}>Row Total</span>
                        <div
                          style={{
                            ...inputStyle,
                            height: "2.125rem",
                            fontSize: "0.8125rem",
                            fontWeight: "600",
                            color: lineTotal > 0 ? "#3b82f6" : "var(--text-secondary)",
                            background: "var(--surface-3)",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 0.35rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={`Row Billed Amount: ${line.qty} × ₹${line.cost.toFixed(2)} = ₹${lineTotal.toFixed(2)}`}
                        >
                          ₹{lineTotal.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Batch No, Expiry Date, Deal Slab (Scheme), Pack Size, Units/Pack, Shelf Location & Landed Cost */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", background: "var(--surface-3)", padding: "0.5rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            Batch No <span style={{ fontSize: "0.65rem", fontWeight: "400" }}>(optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. B104"
                            value={line.batch_no || ""}
                            onInput$={(e) => {
                              const v = (e.target as HTMLInputElement).value;
                              lines.value = lines.value.map((l, i) => i === idx ? { ...l, batch_no: v } : l);
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem", fontFamily: "monospace" }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            Expiry Date <span style={{ fontSize: "0.65rem", fontWeight: "400" }}>(optional)</span>
                          </label>
                          <input
                            type={line.expiry_date ? "date" : "text"}
                            placeholder="Pick expiry date…"
                            value={line.expiry_date || ""}
                            onFocus$={(e) => { (e.target as HTMLInputElement).type = "date"; }}
                            onBlur$={(e) => { if (!(e.target as HTMLInputElement).value) { (e.target as HTMLInputElement).type = "text"; } }}
                            onInput$={(e) => {
                              const v = (e.target as HTMLInputElement).value;
                              lines.value = lines.value.map((l, i) => i === idx ? { ...l, expiry_date: v } : l);
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem", cursor: "pointer" }}
                          />
                        </div>
                      </div>

                      {/* Row 2B: Deal Slab Scheme Ratio (On + Free), Pack Size & Units/Pack */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 0.8fr", gap: "0.5rem" }}>
                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            Scheme On (Buy)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="e.g. 10"
                            value={line.scheme_on ? String(line.scheme_on) : ""}
                            onInput$={(e) => {
                              const onVal = parseFloat((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((l, i) => {
                                if (i !== idx) return l;
                                const freeVal = l.scheme_free || 0;
                                const autoFree = (onVal > 0 && freeVal > 0) ? Math.floor(l.qty / onVal) * freeVal : l.free_qty;
                                return { ...l, scheme_on: onVal, free_qty: autoFree };
                              });
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem" }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            + Scheme Free
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="e.g. 1"
                            value={line.scheme_free ? String(line.scheme_free) : ""}
                            onInput$={(e) => {
                              const freeVal = parseFloat((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((l, i) => {
                                if (i !== idx) return l;
                                const onVal = l.scheme_on || 0;
                                const autoFree = (onVal > 0 && freeVal > 0) ? Math.floor(l.qty / onVal) * freeVal : l.free_qty;
                                return { ...l, scheme_free: freeVal, free_qty: autoFree };
                              });
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem" }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            Pack Size <span style={{ fontSize: "0.65rem", fontWeight: "400" }}>(e.g. 10 TAB)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 10 TAB / 100ml"
                            value={line.pack_size || ""}
                            onInput$={(e) => {
                              const v = (e.target as HTMLInputElement).value;
                              lines.value = lines.value.map((l, i) => i === idx ? { ...l, pack_size: v } : l);
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem" }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "0.7rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.2rem", display: "block" }}>
                            Units/Pack
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="1"
                            value={line.conversion_factor ? String(line.conversion_factor) : "1"}
                            onInput$={(e) => {
                              const v = parseFloat((e.target as HTMLInputElement).value) || 1;
                              lines.value = lines.value.map((l, i) => i === idx ? { ...l, conversion_factor: v } : l);
                            }}
                            style={{ ...inputStyle, height: "1.875rem", fontSize: "0.75rem" }}
                          />
                        </div>
                      </div>

                      {/* Row 2B: Shelf Location, Line Total, Landed Cost & Mark % Live Badges */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 180px" }}>
                          <input
                            type="text"
                            placeholder="Shelf / Rack Location (e.g. Rack 4, Shelf B)"
                            value={line.shelf_location || ""}
                            onInput$={(e) => {
                              const v = (e.target as HTMLInputElement).value;
                              lines.value = lines.value.map((l, i) => i === idx ? { ...l, shelf_location: v } : l);
                            }}
                            style={{ ...inputStyle, height: "1.75rem", fontSize: "0.75rem" }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
                          {line.rate > 0 && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "0.25rem",
                                background: "rgba(59,130,246,0.08)",
                                border: "1px solid rgba(59,130,246,0.2)",
                                color: "#3b82f6",
                                fontSize: "0.7rem",
                                fontWeight: "500",
                                whiteSpace: "nowrap",
                              }}
                              title="Purchase cost breakdown"
                            >
                              Rate ₹{line.rate}
                              {line.discount > 0 ? ` - ${line.discount}%` : ""}
                              {line.discount2 > 0 ? ` - ${line.discount2}%` : ""}
                              {line.tax > 0 ? ` + ${line.tax}% Tax` : ""}
                              {` = ₹${line.cost.toFixed(2)}`}
                            </div>
                          )}

                          {line.cost > 0 && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "0.25rem",
                                background: "rgba(59,130,246,0.1)",
                                border: "1px solid rgba(59,130,246,0.25)",
                                color: "#3b82f6",
                                fontSize: "0.7rem",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Line Total: ₹{lineTotal.toFixed(2)}
                            </div>
                          )}

                          {line.cost > 0 && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "0.25rem",
                                background: line.free_qty > 0 ? "rgba(34,197,94,0.12)" : "var(--surface-2)",
                                border: `1px solid ${line.free_qty > 0 ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                                color: line.free_qty > 0 ? "#16a34a" : "var(--text-secondary)",
                                fontSize: "0.7rem",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {line.free_qty > 0
                                ? `Landed: ₹${landingCost.toFixed(2)}/unit (+${line.free_qty} Free)`
                                : `Unit: ₹${(line.cost || 0).toFixed(2)}`}
                            </div>
                          )}

                          {wholesaleMargin !== null && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "0.25rem",
                                background: parseFloat(wholesaleMargin) >= 0 ? "rgba(168,85,247,0.12)" : "rgba(239,68,68,0.1)",
                                border: `1px solid ${parseFloat(wholesaleMargin) >= 0 ? "rgba(168,85,247,0.3)" : "rgba(239,68,68,0.3)"}`,
                                color: parseFloat(wholesaleMargin) >= 0 ? "#a855f7" : "var(--error)",
                                fontSize: "0.7rem",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                              title={`Selling Price (PTR): ₹${sellingPrice.toFixed(2)} | Landed Cost: ₹${landingCost.toFixed(2)}`}
                            >
                              Mark: {parseFloat(wholesaleMargin) >= 0 ? `+${wholesaleMargin}%` : `${wholesaleMargin}%`}
                            </div>
                          )}

                          {retailMargin !== null && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.2rem 0.4rem",
                                borderRadius: "0.25rem",
                                background: "var(--surface-2)",
                                border: "1px solid var(--border)",
                                color: "var(--text-secondary)",
                                fontSize: "0.6875rem",
                                fontWeight: "500",
                                whiteSpace: "nowrap",
                              }}
                              title={`Retail Margin on MRP: ₹${(line.mrp || 0).toFixed(2)} vs PTR: ₹${sellingPrice.toFixed(2)}`}
                            >
                              Retail Mark: {retailMargin}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Invoice Summary Card */}
            {(() => {
              const subtotal = lines.value.reduce((acc: number, row: ReceiveLine) => acc + ((row.qty || 0) * (row.cost || 0)), 0);
              const cdAmt = (subtotal * (parseFloat(cashDiscountPct.value) || 0)) / 100;
              const freightAmt = parseFloat(inwardExpense.value) || 0;
              const grandTotal = Math.max(0, subtotal - cdAmt + freightAmt);
              const totalBilled = lines.value.reduce((acc: number, row: ReceiveLine) => acc + (row.qty || 0), 0);
              const totalFree = lines.value.reduce((acc: number, row: ReceiveLine) => acc + (row.free_qty || 0), 0);

              return subtotal > 0 ? (
                <div style={{ marginTop: "0.75rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>Items: <strong style={{ color: "var(--text-primary)" }}>{lines.value.filter(l => l.item_id).length}</strong> ({totalBilled} Billed + {totalFree} Free = <strong style={{ color: "var(--text-primary)" }}>{totalBilled + totalFree} Total Units</strong>)</span>
                    <span>Gross Subtotal: <strong style={{ color: "var(--text-primary)" }}>₹{subtotal.toFixed(2)}</strong></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border)", paddingTop: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {cdAmt > 0 && <span>CD ({cashDiscountPct.value}%): <strong style={{ color: "var(--accent)" }}>-₹{cdAmt.toFixed(2)}</strong></span>}
                      {freightAmt > 0 && <span>Freight: <strong style={{ color: "var(--text-primary)" }}>+₹{freightAmt.toFixed(2)}</strong></span>}
                    </div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: "700", color: "var(--text-primary)" }}>
                      Net Payable: <span style={{ color: "#22c55e" }}>₹{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes.value}
              onInput$={(e) => { notes.value = (e.target as HTMLTextAreaElement).value; }}
              placeholder="PO number, receiving notes, invoice instructions…"
              style={{ ...inputStyle, height: "3.5rem", paddingTop: "0.5rem", resize: "vertical" as const }}
            />
          </div>

          {/* ── Audit Info: 3-column layout inside slideover body ──── */}
          {isEditingReceipt && editingDocument?.value && (() => {
            const rawDoc = editingDocument.value;
            const doc = rawDoc.summary || rawDoc;
            const isModifiedDoc = doc.status !== "draft" && doc.status !== "cancelled" && !!(doc.is_modified || doc.modified_at || (doc.updated_at && doc.created_at && doc.updated_at > doc.created_at + 10));
            const fmtAuditDate = (ts?: number | null) => {
              if (!ts) return "—";
              const d = new Date(ts * 1000);
              const dt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const tm = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              return `${dt} ${tm}`;
            };
            const creator = doc.staff_name || doc.creator_name || doc.user_id || "—";
            const updater = doc.updater_name || doc.updated_by || creator;
            const modifier = (doc.modified_by ? (doc.updater_name || doc.modified_by) : doc.updater_name) || "—";
            return (
              <div
                style={{
                  marginTop: "0.25rem",
                  display: "grid",
                  gridTemplateColumns: isModifiedDoc ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
                  gap: "0.75rem",
                  padding: "0.75rem 0.875rem",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                }}
              >
                {/* Col 1: Created by */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Created by
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={creator}>
                    {creator}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                    {fmtAuditDate(doc.created_at)}
                  </span>
                </div>

                {/* Col 2: Updated by */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Updated by
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={updater}>
                    {updater}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                    {fmtAuditDate(doc.updated_at || doc.created_at)}
                  </span>
                </div>

                {/* Col 3: Modified by (only when lines modified) */}
                {isModifiedDoc && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Modified by
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={modifier}>
                      {modifier}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                      {fmtAuditDate(doc.modified_at || doc.updated_at)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Footer */}
          <div
            style={{
              position: "sticky",
              bottom: "-1.5rem",
              margin: "0 -1.5rem -1.5rem",
              padding: "1rem 1.5rem",
              background: "var(--surface-2)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.45rem",
            }}
          >
            <button
              type="button"
              disabled={saving.value}
              onClick$={handleSave}
              style={{ width: "100%", height: "2.5rem", background: saving.value ? "var(--muted)" : "var(--button-primary-bg)", color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {saving.value ? (
                <><LuLoader style="width:1rem;height:1rem;" /> Saving…</>
              ) : isEditingReceipt ? (
                "Update Receipt"
              ) : (
                "Save Receipt"
              )}
            </button>
          </div>
        </div>
      </SlideOver>

      {/* Rendered after SlideOver to stack ON TOP (above) of the panel */}
      <ShopProductPickerModal
        open={showItemPicker}
        title="Select Item to Receive"
        subtitle="Choose product for stock receiving (Category: cat_6)."
        systemCategoryId="cat_6"
        selectedParentId={activePickerLineIndex.value !== null ? lines.value[activePickerLineIndex.value]?.item_id : undefined}
        onSelect$={$((item) => {
          if (activePickerLineIndex.value !== null) {
            const idx = activePickerLineIndex.value;
            const itemRate = item?.cost_price || item?.price || 0;
            const matchedTax = taxRates.value.find(r => r.id === item?.tax_rate_id);
            const taxPct = matchedTax ? matchedTax.rate_pct : 0;
            const taxCode = matchedTax ? matchedTax.id : (item?.tax_rate_id || "");
            const initialCost = calcLineNetCost(itemRate, 0, 0, taxPct);

            lines.value = lines.value.map((l, i) =>
              i === idx
                ? {
                    ...l,
                    item_id: item?.id ?? "",
                    item_name: item?.name ?? "",
                    rate: itemRate,
                    discount: 0,
                    discount2: 0,
                    tax: taxPct,
                    tax_code: taxCode,
                    cost: initialCost > 0 ? initialCost : (item?.cost_price ?? l.cost ?? 0),
                    selling_price: item?.price ?? l.selling_price ?? 0,
                    mrp: item?.default_mrp ?? l.mrp ?? 0,
                    pack_size: item?.pack_size ?? l.pack_size ?? "",
                    conversion_factor: item?.conversion_factor ?? l.conversion_factor ?? 1,
                  }
                : l
            );
          }
        })}
      />

      <VendorLookupSlideOver
        open={showVendorPicker}
        onPicked$={$((vendor: VendorBasic) => {
          pickedVendor.value = vendor;
        })}
      />

      <MediaPickerModal
        open={showMediaPicker}
        filterType="all"
        onSelected$={$((media) => {
          mediaId.value = media.id;
          showMediaPicker.value = false;
        })}
      />

      <MediaModal
        open={showMediaModal}
        onUploaded$={$((media) => {
          mediaId.value = media.id;
          showMediaModal.value = false;
        })}
      />
    </>
  );
});
