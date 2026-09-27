// src/routes/dashboard/shop/settings/discounts/index.tsx
//
// Shop Discount Codes & Coupons Management.
// Backed by `shop_discount_codes` table in `shop-ops.rs`.
//
// IPC: shop_list_discount_codes, shop_create_discount_code,
//      shop_update_discount_code, shop_delete_discount_code

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuTag,
  LuPlus,
  LuSearch,
  LuCopy,
  LuCheck,
  LuTrash2,
  LuPencil,
  LuSparkles,
  LuPercent,
  LuTruck,
  LuGift,
  LuCheckCircle2,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";

export type DiscountType =
  | "amount_off_products"
  | "buy_x_get_y"
  | "amount_off_order"
  | "free_shipping"
  | "percent"
  | "flat"
  | "bogo";

export interface SimpleShopItem {
  id: string;
  name: string;
  price: number;
  sku?: string | null;
}

export const DISCOUNT_CATEGORIES = [
  {
    category: "Product discount",
    types: [
      {
        id: "amount_off_products" as DiscountType,
        title: "Amount off products",
        description: "Discount specific products or collections of products",
        icon: LuTag,
      },
      {
        id: "buy_x_get_y" as DiscountType,
        title: "Buy X get Y",
        description: "Discount specific products or collections of products",
        icon: LuGift,
      },
    ],
  },
  {
    category: "Order discount",
    types: [
      {
        id: "amount_off_order" as DiscountType,
        title: "Amount off order",
        description: "Discount the total order amount",
        icon: LuPercent,
      },
    ],
  },
  {
    category: "Shipping discount",
    types: [
      {
        id: "free_shipping" as DiscountType,
        title: "Free shipping",
        description: "Offer free shipping on an order",
        icon: LuTruck,
      },
    ],
  },
];

export interface ShopDiscountCode {
  id: string;
  profile_id: string;
  user_id: string;
  updated_by: string;
  code: string;
  discount_type: string; // 'amount_off_products' | 'buy_x_get_y' | 'amount_off_order' | 'free_shipping' | 'percent' | 'flat' | 'bogo'
  value: number;
  min_order_value: number;
  max_discount?: number | null;
  usage_limit?: number | null;
  usage_count: number;
  per_customer_limit: number;
  eligible_items: string;
  valid_from?: number | null;
  valid_until?: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
  creator_name?: string | null;
  updater_name?: string | null;
}

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
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

export function getDiscountStatus(c: ShopDiscountCode) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (c.is_active === 0) return { label: "Disabled", color: "#6b7280", bg: "rgba(107, 114, 128, 0.12)" };
  if (c.valid_until && c.valid_until < nowSec) return { label: "Expired", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" };
  if (c.valid_from && c.valid_from > nowSec) return { label: "Scheduled", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" };
  if (c.usage_limit && c.usage_count >= c.usage_limit) return { label: "Depleted", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" };
  return { label: "Active", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" };
}

export default component$(() => {
  const codes = useSignal<ShopDiscountCode[]>([]);
  const loading = useSignal(true);
  const search = useSignal("");
  const filterTab = useSignal<"all" | "active" | "expired" | "disabled">("all");
  const copiedCode = useSignal<string | null>(null);

  // SlideOver form state
  const isDrawerOpen = useSignal(false);
  const editingId = useSignal<string | null>(null);
  const editingCode = useSignal<ShopDiscountCode | null>(null);
  const formCode = useSignal("");
  const formType = useSignal<DiscountType>("amount_off_order");
  const formUnit = useSignal<"percent" | "flat">("percent");
  const formValue = useSignal<string>("10");
  const formBuyQty = useSignal<string>("2");
  const formGetQty = useSignal<string>("1");
  const formMinOrder = useSignal<string>("0");
  const formMaxDiscount = useSignal<string>("");
  const formUsageLimit = useSignal<string>("");
  const formPerCustomerLimit = useSignal<string>("1");
  const formValidFrom = useSignal<string>("");
  const formValidUntil = useSignal<string>("");
  const formIsActive = useSignal<boolean>(true);
  const selectedProductIds = useSignal<string[]>([]);
  const productScope = useSignal<"all" | "specific">("all");
  const productSearch = useSignal("");
  const availableProducts = useSignal<SimpleShopItem[]>([]);
  const isSaving = useSignal(false);
  const formError = useSignal<string | null>(null);

  const loadCodes = $(async () => {
    loading.value = true;
    try {
      codes.value = await invoke<ShopDiscountCode[]>("shop_list_discount_codes", {});
    } catch (err) {
      console.error("[Discounts] Failed to load discount codes:", err);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadCodes();
    try {
      availableProducts.value = await invoke<SimpleShopItem[]>("shop_list_items", {});
    } catch (err) {
      console.error("[Discounts] Failed to load products for discounts:", err);
    }
  });

  const filteredCodes = useComputed$(() => {
    const q = search.value.trim().toLowerCase();
    return codes.value.filter((c) => {
      const matchesSearch = !q || c.code.toLowerCase().includes(q) || c.discount_type.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      const st = getDiscountStatus(c);
      if (filterTab.value === "active") return st.label === "Active" || st.label === "Scheduled";
      if (filterTab.value === "expired") return st.label === "Expired" || st.label === "Depleted";
      if (filterTab.value === "disabled") return st.label === "Disabled";
      return true;
    });
  });

  const stats = useComputed$(() => {
    let totalActive = 0;
    let totalUses = 0;
    for (const c of codes.value) {
      if (getDiscountStatus(c).label === "Active") totalActive++;
      totalUses += c.usage_count;
    }
    return {
      total: codes.value.length,
      active: totalActive,
      uses: totalUses,
    };
  });

  const handleCopy = $(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      copiedCode.value = code;
      setTimeout(() => {
        if (copiedCode.value === code) copiedCode.value = null;
      }, 2000);
    } catch {
      // fallback
    }
  });

  const handleGenerateRandomCode = $(() => {
    const prefixes = ["PROMO", "SAVE", "WELCOME", "DEAL", "OFFER", "SUPER", "BONUS"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(10 + Math.random() * 90);
    formCode.value = `${prefix}${num}`;
  });

  const openCreate = $(() => {
    editingId.value = null;
    editingCode.value = null;
    formCode.value = "";
    formType.value = "amount_off_order";
    formUnit.value = "percent";
    formValue.value = "10";
    formBuyQty.value = "2";
    formGetQty.value = "1";
    formMinOrder.value = "0";
    formMaxDiscount.value = "";
    formUsageLimit.value = "";
    formPerCustomerLimit.value = "1";
    formValidFrom.value = "";
    formValidUntil.value = "";
    formIsActive.value = true;
    selectedProductIds.value = [];
    productScope.value = "all";
    productSearch.value = "";
    formError.value = null;
    isDrawerOpen.value = true;
  });

  const openEdit = $((c: ShopDiscountCode) => {
    editingId.value = c.id;
    editingCode.value = c;
    formCode.value = c.code;

    let mappedType: DiscountType = (c.discount_type as any) || "amount_off_order";
    if (c.discount_type === "percent") {
      mappedType = "amount_off_order";
      formUnit.value = "percent";
    } else if (c.discount_type === "flat") {
      mappedType = "amount_off_order";
      formUnit.value = "flat";
    } else if (c.discount_type === "bogo") {
      mappedType = "buy_x_get_y";
    }
    formType.value = mappedType;
    formValue.value = String(c.value);
    formMinOrder.value = String(c.min_order_value || 0);
    formMaxDiscount.value = c.max_discount ? String(c.max_discount) : "";
    formUsageLimit.value = c.usage_limit ? String(c.usage_limit) : "";
    formPerCustomerLimit.value = String(c.per_customer_limit || 1);
    formValidFrom.value = c.valid_from ? new Date(c.valid_from * 1000).toISOString().slice(0, 10) : "";
    formValidUntil.value = c.valid_until ? new Date(c.valid_until * 1000).toISOString().slice(0, 10) : "";
    formIsActive.value = c.is_active === 1;

    try {
      const parsed = JSON.parse(c.eligible_items || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        selectedProductIds.value = parsed;
        productScope.value = "specific";
      } else {
        selectedProductIds.value = [];
        productScope.value = "all";
      }
    } catch {
      selectedProductIds.value = [];
      productScope.value = "all";
    }

    productSearch.value = "";
    formError.value = null;
    isDrawerOpen.value = true;
  });

  const handleToggleActive = $(async (c: ShopDiscountCode) => {
    const nextActive = c.is_active === 1 ? 0 : 1;
    try {
      await invoke("shop_update_discount_code", {
        data: {
          id: c.id,
          is_active: nextActive,
        },
      });
      codes.value = codes.value.map((item) =>
        item.id === c.id ? { ...item, is_active: nextActive } : item
      );
    } catch (err) {
      console.error("Failed to toggle code active state:", err);
    }
  });

  const handleDelete = $(async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to delete discount code "${code}"?`)) return;
    try {
      await invoke("shop_delete_discount_code", { id });
      codes.value = codes.value.filter((c) => c.id !== id);
    } catch (err) {
      alert("Failed to delete coupon code: " + err);
    }
  });

  const handleSave = $(async () => {
    const code = formCode.value.trim().toUpperCase();
    if (!code) {
      formError.value = "Please provide a valid coupon code";
      return;
    }
    const val = parseFloat(formValue.value) || 0;
    const minOrder = parseFloat(formMinOrder.value) || 0;
    const maxDisc = formMaxDiscount.value.trim() ? parseFloat(formMaxDiscount.value) : null;
    const usageLim = formUsageLimit.value.trim() ? parseInt(formUsageLimit.value, 10) : null;
    const perCustLim = parseInt(formPerCustomerLimit.value, 10) || 1;

    const validFromTs = formValidFrom.value
      ? Math.floor(new Date(formValidFrom.value).getTime() / 1000)
      : null;
    const validUntilTs = formValidUntil.value
      ? Math.floor(new Date(formValidUntil.value + "T23:59:59").getTime() / 1000)
      : null;

    const eligibleItemsJson =
      (formType.value === "amount_off_products" || formType.value === "buy_x_get_y") && productScope.value === "specific"
        ? JSON.stringify(selectedProductIds.value)
        : "[]";

    isSaving.value = true;
    formError.value = null;

    try {
      if (editingId.value) {
        const updated = await invoke<ShopDiscountCode>("shop_update_discount_code", {
          data: {
            id: editingId.value,
            code,
            discount_type: formType.value,
            value: val,
            min_order_value: minOrder,
            max_discount: maxDisc,
            usage_limit: usageLim,
            per_customer_limit: perCustLim,
            eligible_items: eligibleItemsJson,
            valid_from: validFromTs,
            valid_until: validUntilTs,
            is_active: formIsActive.value ? 1 : 0,
          },
        });
        codes.value = codes.value.map((c) => (c.id === updated.id ? updated : c));
      } else {
        const created = await invoke<ShopDiscountCode>("shop_create_discount_code", {
          data: {
            code,
            discount_type: formType.value,
            value: val,
            min_order_value: minOrder,
            max_discount: maxDisc,
            usage_limit: usageLim,
            per_customer_limit: perCustLim,
            eligible_items: eligibleItemsJson,
            valid_from: validFromTs,
            valid_until: validUntilTs,
            is_active: formIsActive.value ? 1 : 0,
          },
        });
        codes.value = [created, ...codes.value];
      }
      isDrawerOpen.value = false;
    } catch (err: any) {
      formError.value = String(err?.message || err);
    } finally {
      isSaving.value = false;
    }
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* ── Top Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Shop Settings</span>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: "500" }}>Discounts</span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
            Discounts & Coupons
          </h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Create and manage promotional discount codes, coupon redemptions, and order minimum rules.
          </p>
        </div>

        <button
          type="button"
          onClick$={openCreate}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0 1.15rem",
            height: "2.375rem",
            fontSize: "0.875rem",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <LuPlus style={{ width: "1.1rem", height: "1.1rem" }} />
          Create Discount Code
        </button>
      </div>

      {/* ── Quick KPI Stat Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
            Total Coupons
          </div>
          <div style={{ fontSize: "1.625rem", fontWeight: "700", color: "var(--text-primary)", marginTop: "0.35rem" }}>
            {stats.value.total}
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
            Active & Running
          </div>
          <div style={{ fontSize: "1.625rem", fontWeight: "700", color: "#10b981", marginTop: "0.35rem" }}>
            {stats.value.active}
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
            Total Redemptions
          </div>
          <div style={{ fontSize: "1.625rem", fontWeight: "700", color: "var(--text-primary)", marginTop: "0.35rem" }}>
            {stats.value.uses}
          </div>
        </div>
      </div>

      {/* ── Controls Bar: Search & Filter Tabs ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: "20rem" }}>
          <LuSearch
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              width: "1rem",
              height: "1rem",
              color: "var(--text-secondary)",
            }}
          />
          <input
            type="search"
            placeholder="Search coupon codes or type…"
            value={search.value}
            onInput$={(e) => {
              search.value = (e.target as HTMLInputElement).value;
            }}
            style={{
              ...inputStyle,
              paddingLeft: "2.25rem",
            }}
          />
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface-2)",
            padding: "0.25rem",
            borderRadius: "0.375rem",
            border: "1px solid var(--border)",
          }}
        >
          {(
            [
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "expired", label: "Expired" },
              { id: "disabled", label: "Disabled" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick$={() => {
                filterTab.value = tab.id;
              }}
              style={{
                padding: "0.35rem 0.85rem",
                borderRadius: "0.25rem",
                border: "none",
                fontSize: "0.8125rem",
                fontWeight: filterTab.value === tab.id ? "600" : "500",
                color: filterTab.value === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                background: filterTab.value === tab.id ? "var(--surface-1)" : "transparent",
                boxShadow: filterTab.value === tab.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table / List Container ── */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
          Loading discount codes…
        </div>
      ) : filteredCodes.value.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            color: "var(--text-secondary)",
          }}
        >
          <LuTag style={{ width: "2.5rem", height: "2.5rem", margin: "0 auto 1rem", opacity: 0.4 }} />
          <div style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--text-primary)" }}>
            {search.value ? "No discount codes match your query" : "No discount codes created yet"}
          </div>
          <p style={{ fontSize: "0.875rem", margin: "0.5rem 0 1.25rem", color: "var(--text-secondary)" }}>
            Create promotional codes for store discounts, seasonal sales, or free shipping.
          </p>
          <button
            type="button"
            onClick$={openCreate}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <LuPlus style={{ width: "1rem", height: "1rem" }} />
            Create First Code
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                {["Coupon Code", "Discount Value", "Conditions", "Usage", "Validity", "Status", "Actions"].map(
                  (col) => (
                    <th
                      key={col}
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "left",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredCodes.value.map((c) => {
                const st = getDiscountStatus(c);
                const isCopied = copiedCode.value === c.code;

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 100ms",
                    }}
                  >
                    {/* Code */}
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: "700",
                            fontSize: "0.9375rem",
                            letterSpacing: "0.05em",
                            color: "var(--text-primary)",
                            background: "var(--surface-3)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.25rem",
                            padding: "0.15rem 0.45rem",
                          }}
                        >
                          {c.code}
                        </span>
                        <button
                          type="button"
                          title="Copy coupon code"
                          onClick$={() => handleCopy(c.code)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: isCopied ? "#10b981" : "var(--text-secondary)",
                            padding: "0.25rem",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {isCopied ? (
                            <LuCheck style={{ width: "0.85rem", height: "0.85rem" }} />
                          ) : (
                            <LuCopy style={{ width: "0.85rem", height: "0.85rem" }} />
                          )}
                        </button>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                        By: <span style={{ fontWeight: "500", color: "var(--text-primary)" }}>{c.creator_name || c.user_id || "owner"}</span>
                        {c.updated_at && c.created_at && c.updated_at > c.created_at && (c.updater_name || c.updated_by) && (c.updater_name || c.updated_by) !== (c.creator_name || c.user_id) && (
                          <span style={{ marginLeft: "0.35rem", opacity: 0.85 }}>· Upd: {c.updater_name || c.updated_by}</span>
                        )}
                      </div>
                    </td>

                    {/* Discount Value */}
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        {(c.discount_type === "amount_off_products" || c.discount_type === "product_percent") && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              background: "rgba(59, 130, 246, 0.12)",
                              color: "#3b82f6",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "1rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <LuTag style={{ width: "0.8rem", height: "0.8rem" }} />
                            {c.value}% OFF Products
                          </span>
                        )}
                        {(c.discount_type === "buy_x_get_y" || c.discount_type === "bogo") && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              background: "rgba(245, 158, 11, 0.12)",
                              color: "#f59e0b",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "1rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <LuGift style={{ width: "0.8rem", height: "0.8rem" }} />
                            Buy X Get Y
                          </span>
                        )}
                        {(c.discount_type === "amount_off_order" || c.discount_type === "percent") && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              background: "rgba(16, 185, 129, 0.12)",
                              color: "#10b981",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "1rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <LuPercent style={{ width: "0.8rem", height: "0.8rem" }} />
                            {c.value}% OFF Order
                          </span>
                        )}
                        {c.discount_type === "flat" && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              background: "rgba(16, 185, 129, 0.12)",
                              color: "#10b981",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "1rem",
                            }}
                          >
                            ₹{c.value} OFF Order
                          </span>
                        )}
                        {c.discount_type === "free_shipping" && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              background: "rgba(139, 92, 246, 0.12)",
                              color: "#8b5cf6",
                              padding: "0.2rem 0.55rem",
                              borderRadius: "1rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <LuTruck style={{ width: "0.8rem", height: "0.8rem" }} />
                            Free Shipping
                          </span>
                        )}
                        {c.max_discount && c.max_discount > 0 ? (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            (max ₹{c.max_discount})
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Conditions */}
                    <td style={{ padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      <div>{c.min_order_value > 0 ? `Orders ≥ ₹${c.min_order_value}` : "No min. order"}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        {c.per_customer_limit > 1 ? `${c.per_customer_limit} per customer` : "1 use per customer"}
                      </div>
                    </td>

                    {/* Usage */}
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: "500" }}>
                        {c.usage_count} {c.usage_limit ? `/ ${c.usage_limit}` : "used"}
                      </div>
                      {c.usage_limit ? (
                        <div
                          style={{
                            width: "5rem",
                            height: "0.25rem",
                            background: "var(--border)",
                            borderRadius: "1rem",
                            marginTop: "0.25rem",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              background: c.usage_count >= c.usage_limit ? "#ef4444" : "#10b981",
                              width: `${Math.min(100, (c.usage_count / c.usage_limit) * 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </td>

                    {/* Validity */}
                    <td style={{ padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {c.valid_until ? (
                        <div>
                          Expires {new Date(c.valid_until * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      ) : (
                        <div>No expiration</div>
                      )}
                      {c.valid_from && st.label === "Scheduled" ? (
                        <div style={{ fontSize: "0.72rem", color: "#3b82f6" }}>
                          Starts {new Date(c.valid_from * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                      ) : null}
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "1rem",
                          background: st.bg,
                          color: st.color,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {/* Toggle active switch */}
                        <button
                          type="button"
                          title={c.is_active === 1 ? "Deactivate coupon" : "Activate coupon"}
                          onClick$={() => handleToggleActive(c)}
                          style={{
                            background: c.is_active === 1 ? "#10b981" : "var(--border)",
                            border: "none",
                            width: "2rem",
                            height: "1.15rem",
                            borderRadius: "1rem",
                            cursor: "pointer",
                            position: "relative",
                            transition: "background 150ms",
                            padding: 0,
                          }}
                        >
                          <div
                            style={{
                              width: "0.85rem",
                              height: "0.85rem",
                              borderRadius: "50%",
                              background: "#fff",
                              position: "absolute",
                              top: "0.15rem",
                              left: c.is_active === 1 ? "1rem" : "0.15rem",
                              transition: "left 150ms",
                            }}
                          />
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick$={() => openEdit(c)}
                          title="Edit discount"
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-secondary)",
                            padding: "0.3rem",
                            display: "inline-flex",
                          }}
                        >
                          <LuPencil style={{ width: "0.95rem", height: "0.95rem" }} />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick$={() => handleDelete(c.id, c.code)}
                          title="Delete discount"
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#ef4444",
                            padding: "0.3rem",
                            display: "inline-flex",
                          }}
                        >
                          <LuTrash2 style={{ width: "0.95rem", height: "0.95rem" }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit SlideOver Drawer ── */}
      <SlideOver
        open={isDrawerOpen}
        title={editingId.value ? `Edit Coupon: ${formCode.value}` : "New Discount Code"}
        width="460px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0 2rem" }}>
          {formError.value && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.375rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#ef4444",
                fontSize: "0.8125rem",
              }}
            >
              {formError.value}
            </div>
          )}

          {editingCode.value && (
            <div
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: "0.375rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
              }}
            >
              <div>Created by <strong style={{ color: "var(--text-primary)" }}>{editingCode.value.creator_name || editingCode.value.user_id || "owner"}</strong> on {new Date(editingCode.value.created_at * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              {editingCode.value.updated_at && editingCode.value.created_at && editingCode.value.updated_at > editingCode.value.created_at ? (
                <div>Last updated by <strong style={{ color: "var(--text-primary)" }}>{editingCode.value.updater_name || editingCode.value.updated_by || "owner"}</strong> on {new Date(editingCode.value.updated_at * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              ) : null}
            </div>
          )}

          {/* Coupon Code Input & Generator */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
              <label style={labelStyle}>Coupon Code *</label>
              <button
                type="button"
                onClick$={handleGenerateRandomCode}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <LuSparkles style={{ width: "0.75rem", height: "0.75rem" }} />
                Generate Code
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. SUMMER25, FESTIVE500"
              value={formCode.value}
              onInput$={(e) => {
                formCode.value = (e.target as HTMLInputElement).value.toUpperCase();
              }}
              style={{
                ...inputStyle,
                textTransform: "uppercase",
                fontFamily: "monospace",
                fontWeight: "700",
                letterSpacing: "0.05em",
              }}
            />
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Customers will enter this exact code at checkout or billing.
            </div>
          </div>

          {/* Discount Type Selector */}
          <div>
            <label style={labelStyle}>Select Discount Type *</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {DISCOUNT_CATEGORIES.map((cat) => (
                <div key={cat.category} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    {cat.category}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: cat.types.length > 1 ? "1fr 1fr" : "1fr", gap: "0.5rem" }}>
                    {cat.types.map((t) => {
                      const typeId = t.id;
                      const isSelected =
                        formType.value === typeId ||
                        (typeId === "amount_off_order" && (formType.value === "percent" || formType.value === "flat")) ||
                        (typeId === "buy_x_get_y" && formType.value === "bogo");
                      const IconComponent = t.icon;
                      return (
                        <button
                          key={typeId}
                          type="button"
                          onClick$={() => {
                            formType.value = typeId;
                          }}
                          style={{
                            padding: "0.65rem 0.75rem",
                            borderRadius: "0.375rem",
                            border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                            background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--field-fill)",
                            textAlign: "left",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.55rem",
                            transition: "all 120ms ease",
                          }}
                        >
                          <IconComponent
                            style={{
                              width: "1.1rem",
                              height: "1.1rem",
                              marginTop: "0.1rem",
                              color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", lineHeight: 1.25 }}>
                              {t.title}
                            </div>
                            <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.2rem", lineHeight: 1.3 }}>
                              {t.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Value & Cap Row (For Amount Off Order / Products) */}
          {formType.value !== "free_shipping" && formType.value !== "buy_x_get_y" && formType.value !== "bogo" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>
                  {formType.value === "amount_off_products" ? "Product Discount (%) *" : "Discount Value (%) *"}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formValue.value}
                  onInput$={(e) => {
                    formValue.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Maximum Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Optional cap (e.g. 500)"
                  value={formMaxDiscount.value}
                  onInput$={(e) => {
                    formMaxDiscount.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Buy X Get Y Configuration */}
          {(formType.value === "buy_x_get_y" || formType.value === "bogo") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>Customer Buys (Qty) *</label>
                <input
                  type="number"
                  min="1"
                  value={formBuyQty.value}
                  onInput$={(e) => {
                    formBuyQty.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Customer Gets (Qty) *</label>
                <input
                  type="number"
                  min="1"
                  value={formGetQty.value}
                  onInput$={(e) => {
                    formGetQty.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Specific Products Selector (For Amount Off Products or Buy X Get Y) */}
          {(formType.value === "amount_off_products" || formType.value === "buy_x_get_y" || formType.value === "bogo") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={labelStyle}>Applies To</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick$={() => { productScope.value = "all"; }}
                  style={{
                    flex: 1,
                    padding: "0.45rem",
                    borderRadius: "0.375rem",
                    border: `1.5px solid ${productScope.value === "all" ? "var(--accent)" : "var(--border)"}`,
                    background: productScope.value === "all" ? "rgba(99, 102, 241, 0.08)" : "var(--field-fill)",
                    fontSize: "0.8125rem",
                    fontWeight: productScope.value === "all" ? "600" : "500",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  All Products
                </button>
                <button
                  type="button"
                  onClick$={() => { productScope.value = "specific"; }}
                  style={{
                    flex: 1,
                    padding: "0.45rem",
                    borderRadius: "0.375rem",
                    border: `1.5px solid ${productScope.value === "specific" ? "var(--accent)" : "var(--border)"}`,
                    background: productScope.value === "specific" ? "rgba(99, 102, 241, 0.08)" : "var(--field-fill)",
                    fontSize: "0.8125rem",
                    fontWeight: productScope.value === "specific" ? "600" : "500",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Specific Products ({selectedProductIds.value.length})
                </button>
              </div>

              {productScope.value === "specific" && (
                <div style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.5rem", marginTop: "0.25rem" }}>
                  <input
                    type="text"
                    placeholder="Search products to include…"
                    value={productSearch.value}
                    onInput$={(e) => { productSearch.value = (e.target as HTMLInputElement).value; }}
                    style={{ ...inputStyle, height: "2rem", fontSize: "0.8125rem", marginBottom: "0.5rem" }}
                  />
                  <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {availableProducts.value
                      .filter(p => !productSearch.value || p.name.toLowerCase().includes(productSearch.value.toLowerCase()))
                      .map(p => {
                        const isChecked = selectedProductIds.value.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", cursor: "pointer", padding: "0.25rem 0.35rem", borderRadius: "0.25rem" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange$={() => {
                                if (isChecked) {
                                  selectedProductIds.value = selectedProductIds.value.filter(id => id !== p.id);
                                } else {
                                  selectedProductIds.value = [...selectedProductIds.value, p.id];
                                }
                              }}
                            />
                            <span style={{ flex: 1, color: "var(--text-primary)" }}>{p.name}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>₹{p.price}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Minimum Order Value */}
          <div>
            <label style={labelStyle}>Minimum Order Value (₹)</label>
            <input
              type="number"
              min="0"
              placeholder="0 (no minimum requirement)"
              value={formMinOrder.value}
              onInput$={(e) => {
                formMinOrder.value = (e.target as HTMLInputElement).value;
              }}
              style={inputStyle}
            />
          </div>

          {/* Usage Limits */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Total Usage Limit</label>
              <input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={formUsageLimit.value}
                onInput$={(e) => {
                  formUsageLimit.value = (e.target as HTMLInputElement).value;
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Per Customer Limit</label>
              <input
                type="number"
                min="1"
                value={formPerCustomerLimit.value}
                onInput$={(e) => {
                  formPerCustomerLimit.value = (e.target as HTMLInputElement).value;
                }}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Validity Range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Valid From</label>
              <input
                type="date"
                value={formValidFrom.value}
                onInput$={(e) => {
                  formValidFrom.value = (e.target as HTMLInputElement).value;
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Valid Until (Expires)</label>
              <input
                type="date"
                value={formValidUntil.value}
                onInput$={(e) => {
                  formValidUntil.value = (e.target as HTMLInputElement).value;
                }}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Status Checkbox */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem",
              background: "var(--field-fill)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                Enable this coupon code
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                When enabled, customers can apply this code at checkout
              </div>
            </div>
            <input
              type="checkbox"
              checked={formIsActive.value}
              onChange$={(e) => {
                formIsActive.value = (e.target as HTMLInputElement).checked;
              }}
              style={{ width: "1.15rem", height: "1.15rem", accentColor: "var(--accent)", cursor: "pointer" }}
            />
          </div>

          {/* Drawer Actions */}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="button"
              onClick$={() => {
                isDrawerOpen.value = false;
              }}
              style={{
                padding: "0 1.15rem",
                height: "2.375rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSaving.value}
              onClick$={handleSave}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0 1.25rem",
                height: "2.375rem",
                background: isSaving.value ? "var(--muted)" : "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: isSaving.value ? "not-allowed" : "pointer",
              }}
            >
              <LuCheckCircle2 style={{ width: "1rem", height: "1rem" }} />
              {isSaving.value ? "Saving…" : editingId.value ? "Update Coupon" : "Create Coupon"}
            </button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
});
