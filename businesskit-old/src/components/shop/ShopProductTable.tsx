// src/components/shop/ShopProductTable.tsx
//
// WHAT:  Reusable product table for the Shop Products page.
//        Adapted from ProductTable.tsx — same patterns (search, pagination, row hover,
//        published toggle) but typed for ShopItem from shop_items table.
//
// FEATURES:
//   - Search by name or SKU (client-side)
//   - Pagination (25 per page)
//   - Published toggle (calls onTogglePublished$ → parent invokes shop_update_item)
//   - Edit / Delete action buttons
//   - Avatar = first letter of name (no image field on shop items yet)
//   - Unit symbol shown as a small badge on the name cell

import {
  component$,
  useSignal,
  useComputed$,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuPencil,
  LuTrash2,
  LuSearch,
  LuBarChart2,
  LuChevronLeft,
  LuChevronRight,
  LuRotateCcw,
} from "@qwikest/icons/lucide";
import { fmtMoney } from "~/lib/fin-format";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  slug: string;
  item_type: string;
  category_id: string;
  shop_category_id?: string;
  parent_id?: string;
  user_id?: string;
  updated_by?: string;
  collection_id?: string;
  brand_id?: string;
  unit_id?: string;
  hsn_sac_code?: string;
  price: number;
  cost_price?: number;
  compare_price?: number;
  default_mrp?: number;
  unit_price?: number;
  discount_pct: number;
  extra_discount?: number;
  weight?: number;
  weight_unit?: string;
  dim_length?: number;
  width?: number;
  height?: number;
  dimension_unit?: string;
  pack_size?: string;
  conversion_factor?: number;
  scheme_on?: number;
  scheme_free?: number;
  country_of_origin?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  currency?: string;
  tax_rate_id?: string;
  is_taxable: number;
  tax_inclusive?: number;
  is_active: number;
  published: number;
  sort_order: number;
  track_inventory?: number;
  link_id?: string;
  affiliate_id?: string;
  external_url?: string;
  media_id?: string;
  media_url?: string;
  seo_og_image?: string;
  slider_id?: string;
  video_url?: string;
  video_media_id?: string;
  sections?: string;
  faq?: string;
  additional_details?: string;
  ai_summary?: string;
  options?: string;
  variant_group_by?: string;
  has_variants?: number;
  archived?: number;
  created_at?: number;
  updated_at?: number;
  notes?: string;
  agent_notes?: string;
  creator_name?: string;
  updater_name?: string;
}

export interface ShopUnit {
  id: string;
  name: string;
  symbol: string;
  unit_type?: string;
  is_decimal?: number;
  is_default?: number;
  is_active?: number;
}

export interface ShopCategory {
  id: string;
  name: string;
  is_default?: number;
}

export interface ShopProductTableProps {
  items: Signal<ShopItem[]>;
  units: Signal<ShopUnit[]>;
  categories: Signal<ShopCategory[]>;
  search?: Signal<string>;
  pageSize?: number;
  showLoadMore?: boolean;
  onEdit$: PropFunction<(item: ShopItem) => void>;
  onDelete$: PropFunction<(id: string) => void>;
  onRestore$?: PropFunction<(id: string) => void>;
  onInsight$?: PropFunction<(item: ShopItem) => void>;
  onTogglePublished$?: PropFunction<(id: string, published: boolean) => void>;
}

// ── Shared CSS (scoped via <style> tag) ───────────────────────────────────────

const TABLE_STYLES = `
  .spt-row {
    border-bottom: 1px solid var(--border);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .spt-row:hover { background: var(--surface-3); }
  .spt-btn {
    padding: 0.3rem 0.45rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    transition: border-color 0.15s, color 0.15s;
  }
  .spt-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .spt-btn-danger { border: 1px solid transparent; background: transparent; color: var(--error); }
  .spt-btn-danger:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.25); }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export const ShopProductTable = component$<ShopProductTableProps>((
  { items, units, categories, search, pageSize = 30, showLoadMore = false, onEdit$, onDelete$, onRestore$, onInsight$, onTogglePublished$ },
) => {
  const query        = useSignal("");
  const currentPage  = useSignal(1);
  const visibleLimit = useSignal(pageSize || 30);

  // If external search signal provided, keep query in sync
  useTask$(({ track }) => {
    if (search) track(() => search.value);
    track(() => query.value);
    track(() => items.value);
    currentPage.value = 1;
    visibleLimit.value = pageSize || 30;
  });

  const activeQuery = useComputed$(() => search ? search.value : query.value);

  const filtered = useComputed$(() => {
    const q = activeQuery.value.toLowerCase().trim();
    if (!q) return items.value;
    return items.value.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.sku ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = useComputed$(() =>
    Math.max(1, Math.ceil(filtered.value.length / (pageSize || 25)))
  );

  const page = useComputed$(() => {
    if (showLoadMore) {
      return filtered.value.slice(0, visibleLimit.value);
    }
    const ps = pageSize || 25;
    return filtered.value.slice(
      (currentPage.value - 1) * ps,
      currentPage.value * ps,
    );
  });

  const unitSymbol = (unitId?: string) => {
    if (!unitId) return null;
    return units.value.find(u => u.id === unitId)?.symbol ?? null;
  };

  const catName = (catId: string) =>
    categories.value.find(c => c.id === catId)?.name ?? "—";

  const fmt = (n: number, cur?: string) => fmtMoney(n, cur);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <style>{TABLE_STYLES}</style>

      {/* Internal search bar — only shown when no external search prop */}
      {!search && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "var(--field-fill)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            padding: "0 0.75rem",
            height: "2.25rem",
            maxWidth: "360px",
          }}
        >
          <LuSearch style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={query.value}
            onInput$={(e) => { query.value = (e.target as HTMLInputElement).value; }}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
            }}
          />
        </div>
      )}

      {/* Table */}
      <div
        style={{
          overflowX: "auto",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
              {[
                { label: "Product",   align: "left"  },
                { label: "Category",  align: "left"  },
                { label: "Price",     align: "right" },
                { label: "Cost",      align: "right" },
                { label: "Published", align: "center"},
                { label: "Actions",   align: "right" },
              ].map(h => (
                <th
                  key={h.label}
                  style={{
                    padding: "0.625rem 0.875rem",
                    textAlign: h.align as "left" | "right" | "center",
                    fontWeight: "600",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.value.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                  }}
                >
                  {query.value ? "No products match your search." : "No products yet."}
                </td>
              </tr>
            ) : (
              page.value.map(item => {
                const sym = unitSymbol(item.unit_id);
                const isPublished = item.published === 1;

                return (
                  <tr
                    key={item.id}
                    class="spt-row"
                    onClick$={$(() => onEdit$(item))}
                  >
                    {/* Product name + avatar + sku */}
                    <td style={{ padding: "0.75rem 0.875rem", maxWidth: "18rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                        {/* Avatar / Thumbnail */}
                        {item.seo_og_image || (item as any).media_url ? (
                          <div
                            style={{
                              width: "2.25rem",
                              height: "2.25rem",
                              borderRadius: "0.375rem",
                              overflow: "hidden",
                              border: "1px solid var(--border)",
                              background: "var(--surface-3)",
                              flexShrink: 0,
                            }}
                          >
                            <img
                              src={item.seo_og_image || (item as any).media_url}
                              alt={item.name}
                              width="36"
                              height="36"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError$={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: "2.25rem",
                              height: "2.25rem",
                              borderRadius: "0.375rem",
                              background: "var(--accent-soft)",
                              color: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "700",
                              fontSize: "0.875rem",
                              flexShrink: 0,
                            }}
                          >
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <div
                            style={{
                              fontWeight: "500",
                              color: "var(--text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.375rem",
                            }}
                            title={item.name}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.name}
                            </span>
                            {sym && (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  background: "var(--surface-3)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "0.25rem",
                                  padding: "0.05rem 0.3rem",
                                  color: "var(--text-secondary)",
                                  fontWeight: "500",
                                  flexShrink: 0,
                                }}
                              >
                                {sym}
                              </span>
                            )}
                            {(item.archived ?? 0) === 1 && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  background: "rgba(239,68,68,0.12)",
                                  color: "#ef4444",
                                  border: "1px solid rgba(239,68,68,0.25)",
                                  borderRadius: "0.25rem",
                                  padding: "0.05rem 0.3rem",
                                  fontWeight: "700",
                                  flexShrink: 0,
                                }}
                              >
                                Archived
                              </span>
                            )}
                          </div>
                          {item.sku && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                marginTop: "0.1rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={item.sku}
                            >
                              SKU: {item.sku}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td style={{ padding: "0.75rem 0.875rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {catName(item.category_id)}
                    </td>

                    {/* Price */}
                    <td style={{ padding: "0.75rem 0.875rem", textAlign: "right", fontWeight: "600", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                      {fmt(item.price, item.currency)}
                    </td>

                    {/* Cost */}
                    <td style={{ padding: "0.75rem 0.875rem", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {item.cost_price ? fmt(item.cost_price, item.currency) : "—"}
                    </td>

                    {/* Published Toggle */}
                    <td
                      style={{ padding: "0.75rem 0.875rem", textAlign: "center" }}
                      onClick$={(e) => e.stopPropagation()}
                    >
                      {(item.archived ?? 0) === 1 ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", opacity: 0.7 }}>Archived</span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isPublished}
                          title={isPublished ? "Click to unpublish (Draft)" : "Click to publish (Live)"}
                          onClick$={$(() => {
                            if (onTogglePublished$) onTogglePublished$(item.id, !isPublished);
                          })}
                          style={{
                            position: "relative",
                            display: "inline-flex",
                            alignItems: "center",
                            width: "2.5rem",
                            height: "1.375rem",
                            borderRadius: "9999px",
                            border: "none",
                            cursor: "pointer",
                            background: isPublished ? "var(--accent)" : "var(--border)",
                            transition: "background 200ms ease",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: "0.1875rem",
                              left: isPublished ? "1.1875rem" : "0.1875rem",
                              width: "1rem",
                              height: "1rem",
                              background: isPublished ? "var(--button-primary-text)" : "white",
                              borderRadius: "9999px",
                              transition: "left 200ms ease",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            }}
                          />
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td
                      style={{ padding: "0.75rem 0.875rem" }}
                      onClick$={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.375rem" }}>
                        {(item.archived ?? 0) === 1 && onRestore$ ? (
                          <button
                            type="button"
                            class="spt-btn"
                            title="Restore product"
                            onClick$={$(() => onRestore$(item.id))}
                            style={{ color: "#10b981" }}
                          >
                            <LuRotateCcw style="width:0.875rem;height:0.875rem;" />
                          </button>
                        ) : null}
                        {onInsight$ && (
                          <button
                            type="button"
                            class="spt-btn"
                            title="Billing insights"
                            onClick$={$(() => onInsight$(item))}
                            style={{ color: "#8b5cf6" }}
                          >
                            <LuBarChart2 style="width:0.875rem;height:0.875rem;" />
                          </button>
                        )}
                        <button
                          type="button"
                          class="spt-btn"
                          title="Edit"
                          onClick$={$(() => onEdit$(item))}
                        >
                          <LuPencil style="width:0.875rem;height:0.875rem;" />
                        </button>
                        {(item.archived ?? 0) !== 1 && (
                          <button
                            type="button"
                            class="spt-btn spt-btn-danger"
                            title="Archive product"
                            onClick$={$(() => onDelete$(item.id))}
                          >
                            <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination / Load More */}
      {showLoadMore ? (
        filtered.value.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
              padding: "0.5rem 0",
            }}
          >
            {filtered.value.length > visibleLimit.value ? (
              <button
                type="button"
                onClick$={() => { visibleLimit.value += (pageSize || 30); }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  padding: "0.5rem 1.25rem",
                  fontSize: "0.8125rem",
                  fontWeight: "600",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Load More ({Math.min(pageSize || 30, filtered.value.length - visibleLimit.value)} of {filtered.value.length - visibleLimit.value} remaining)
              </button>
            ) : null}
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", opacity: 0.85 }}>
              Showing {Math.min(visibleLimit.value, filtered.value.length)} of {filtered.value.length} products
            </span>
          </div>
        )
      ) : (
        /* Classic Page Pagination */
        totalPages.value > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              Showing {(currentPage.value - 1) * (pageSize || 25) + 1}–
              {Math.min(currentPage.value * (pageSize || 25), filtered.value.length)} of{" "}
              {filtered.value.length}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={currentPage.value === 1}
                onClick$={() => { currentPage.value--; }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: currentPage.value === 1 ? "transparent" : "var(--surface-2)",
                  color: currentPage.value === 1 ? "var(--text-secondary)" : "var(--text-primary)",
                  cursor: currentPage.value === 1 ? "not-allowed" : "pointer",
                  opacity: currentPage.value === 1 ? "0.5" : "1",
                  fontWeight: "500",
                }}
              >
                <LuChevronLeft style="width:1rem;height:1rem;" /> Prev
              </button>
              <button
                type="button"
                disabled={currentPage.value >= totalPages.value}
                onClick$={() => { currentPage.value++; }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: currentPage.value >= totalPages.value ? "transparent" : "var(--surface-2)",
                  color: currentPage.value >= totalPages.value ? "var(--text-secondary)" : "var(--text-primary)",
                  cursor: currentPage.value >= totalPages.value ? "not-allowed" : "pointer",
                  opacity: currentPage.value >= totalPages.value ? "0.5" : "1",
                  fontWeight: "500",
                }}
              >
                Next <LuChevronRight style="width:1rem;height:1rem;" />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
});
