import { type PropFunction, type Signal, $, component$, useSignal, useComputed$, Slot, useTask$ } from "@builder.io/qwik";
import { LuPencil, LuExternalLink, LuTrash2, LuSearch, LuChevronLeft, LuChevronRight, LuTrendingUp, LuEye } from "@qwikest/icons/lucide";
import { SingleProductAnalytics } from "~/components/SingleProductAnalytics";

export type ProductItem = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  price_cents?: number;
  sale_price_cents?: number | null;
  hero_image_url?: string | null;
  seo_og_image?: string | null;
  cover_video_url?: string | null;
  button_text?: string | null;
  published?: boolean;
  total_sales?: number;
  lessons?: string;
  total_lessons?: number;
};

type ProductTableProps = {
  products: Signal<ProductItem[]>;
  profileSlug?: string;
  pathPrefix?: string;
  /** table name used for the default server-side toggle (default: 'products') */
  statusTable?: string;
  onEdit$: PropFunction<(id: string) => void>;
  onDelete$?: PropFunction<(id: string) => void>;
  onToggleStatus$?: PropFunction<(id: string, published: boolean) => void>;
  onView$?: PropFunction<(id: string, item: ProductItem) => void>;
  showPrice?: boolean;
  showSales?: boolean;
  showStatus?: boolean;
  showEdit?: boolean;
  showDelete?: boolean;
  showView?: boolean;
  showAnalytics?: boolean;
  salesLabel?: string;
  statusLabel?: string;
  renderStatus$?: import("@builder.io/qwik").PropFunction<(item: ProductItem) => any>;
  /** Render extra icon links/buttons per row, inserted before the delete button */
  extraActions$?: PropFunction<(item: ProductItem) => any>;
  onRowClick$?: PropFunction<(item: ProductItem) => void>;
  searchPlaceholder?: string;
  hideToolbar?: boolean;
  externalSearchQuery?: Signal<string>;
};



export const ProductTable = component$<ProductTableProps>(({
  products,
  profileSlug,
  pathPrefix = "/p/",
  onEdit$,
  onDelete$,
  onToggleStatus$,
  onView$,
  showPrice = true,
  showSales = false,
  showStatus = true,
  showEdit = true,
  showDelete = true,
  showView = true,
  showAnalytics = true,
  salesLabel = "Sales",
  statusLabel = "Status",
  renderStatus$,
  extraActions$,
  onRowClick$,
  searchPlaceholder = "Search products...",
  hideToolbar = false,
  externalSearchQuery,
}) => {
  const handleDelete$ = $(async (id: string) => {
    if (onDelete$) {
      await onDelete$(id);
      return;
    }

    const ok = typeof window === "undefined" ? true : window.confirm("Delete this product? This cannot be undone.");
    if (!ok) return;

    products.value = products.value.filter((p) => p.id !== id);
  });

  const analyticsProductId = useSignal<string | null>(null);

  const searchQuery = useSignal("");
  const currentPage = useSignal(1);
  const itemsPerPage = 25;

  const filteredProducts = useComputed$(() => {
    const q = (externalSearchQuery ? externalSearchQuery.value : searchQuery.value).trim().toLowerCase();
    if (!q) return products.value;
    return products.value.filter((p) => p.title.toLowerCase().includes(q));
  });

  const totalPages = useComputed$(() => Math.ceil(filteredProducts.value.length / itemsPerPage));

  const paginatedProducts = useComputed$(() => {
    const start = (currentPage.value - 1) * itemsPerPage;
    return filteredProducts.value.slice(start, start + itemsPerPage);
  });

  // Reset page to 1 when search or products change
  useTask$(({ track }) => {
    track(() => (externalSearchQuery ? externalSearchQuery.value : searchQuery.value));
    track(() => products.value);
    currentPage.value = 1;
  });

  return (
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <style>{PRODUCT_TABLE_STYLES}</style>
      {!hideToolbar && (
        <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between;">
          <div style="position: relative; flex: 1; max-width: 400px;">
            <div style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; pointer-events: none;">
              <LuSearch style="width: 1rem; height: 1rem;" />
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              bind:value={searchQuery}
              style="width: 100%; padding: 0.5rem 1rem 0.5rem 2.25rem; background: var(--surface-1); border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); border-radius: 0.5rem; color: var(--text-primary); font-size: 0.875rem;"
            />
          </div>
          <Slot name="headerActions" />
        </div>
      )}

      <div style="overflow-x: auto; background: var(--surface-2); border-radius: 0.75rem;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
          <thead>
            <tr style="background: var(--surface-3); border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));">
              <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; padding-left: 1rem; color: var(--text-secondary);">Title</th>
              {showPrice && <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Price</th>}
              {showSales && <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">{salesLabel}</th>}
              {showStatus && <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">{statusLabel}</th>}
              <th style="padding: 0.75rem 0.5rem; text-align: right; font-weight: 600; padding-right: 1rem; color: var(--text-secondary);">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.value.length === 0 ? (
              <tr>
                <td colSpan={5} style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No products found.
                </td>
              </tr>
            ) : (
              paginatedProducts.value.map((product) => (
                <tr
                  key={product.id}
                  class="product-table-row"
                  onClick$={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('a')) return;
                    if (onRowClick$) onRowClick$(product);
                  }}
                >
                  <td style="padding: 0.75rem 0.5rem; padding-left: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      {product.hero_image_url || product.seo_og_image ? (
                        <img src={(product.hero_image_url || product.seo_og_image)!} alt="" width={32} height={32} style="border-radius: 0.25rem; object-fit: cover;" />
                      ) : (
                        <div style="width: 2rem; height: 2rem; border-radius: 0.25rem; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 600;">{product.title.charAt(0).toUpperCase()}</div>
                      )}
                      <span>{product.title}</span>
                    </div>
                  </td>
                  {showPrice && (
                    <td style="padding: 0.75rem 0.5rem; font-weight: 500;">
                      {product.price_cents ? `$${(product.price_cents / 100).toFixed(2)}` : 'Free'}
                    </td>
                  )}
                  {showSales && (
                    <td style="padding: 0.75rem 0.5rem; font-weight: 500;">{product.total_sales ?? 0}</td>
                  )}
                  {showStatus && (
                    <td style="padding: 0.75rem 0.5rem;">
                      {renderStatus$ ? (
                        renderStatus$(product)
                      ) : (
                        <button
                          type="button"
                          style={`position: relative; width: 40px; height: 22px; background: ${product.published ? 'var(--accent)' : 'var(--surface-3)'}; border: 1px solid ${product.published ? 'var(--accent)' : 'var(--border)'}; border-radius: 11px; cursor: pointer; transition: all 0.2s ease; padding: 0;`}
                          onClick$={async () => {
                            const newStatus = !product.published;
                            products.value = products.value.map((p) =>
                              p.id === product.id ? { ...p, published: newStatus } : p
                            );
                            if (onToggleStatus$) {
                              await onToggleStatus$(product.id, newStatus);
                            }
                          }}
                        >
                          <div style={`position: absolute; top: 50%; left: ${product.published ? 'calc(100% - 18px)' : '2px'}; transform: translateY(-50%); width: 16px; height: 16px; background: var(--surface-2); border-radius: 50%; transition: all 0.2s ease;`} />
                        </button>
                      )}
                    </td>
                  )}
                  <td style="padding: 0.75rem 0.5rem; padding-right: 1rem;">
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;">
                      {extraActions$ && extraActions$(product)}
                      {onView$ && (
                        <button
                          type="button"
                          onClick$={() => onView$(product.id, product)}
                          title="View"
                          style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);"
                        >
                          <LuEye style="width: 1rem; height: 1rem;" />
                        </button>
                      )}
                      {showEdit && (
                        <button type="button" onClick$={() => onEdit$(product.id)} title="Edit" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);">
                          <LuPencil style="width: 1rem; height: 1rem;" />
                        </button>
                      )}
                      {showAnalytics && (
                        <button type="button" onClick$={() => analyticsProductId.value = product.id} title="Analytics" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);">
                          <LuTrendingUp style="width: 1rem; height: 1rem;" />
                        </button>
                      )}
                      {showView && (
                        <a
                          href={profileSlug
                            ? `https://${profileSlug}.businesskit.io${pathPrefix}${product.slug}`
                            : `${pathPrefix}${product.slug}`
                          }
                          target="_blank"
                          title="View"
                          style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary); text-decoration: none;"
                        >
                          <LuExternalLink style="width: 1rem; height: 1rem;" />
                        </a>
                      )}
                      {showDelete && (
                        <button
                          type="button"
                          onClick$={() => handleDelete$(product.id)}
                          title="Delete"
                          style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);"
                        >
                          <LuTrash2 style="width: 1rem; height: 1rem;" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages.value > 1 && (
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; font-size: 0.875rem; color: var(--text-secondary);">
          <div>
            Showing {(currentPage.value - 1) * itemsPerPage + 1} to {Math.min(currentPage.value * itemsPerPage, filteredProducts.value.length)} of {filteredProducts.value.length} entries
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button
              type="button"
              disabled={currentPage.value === 1}
              onClick$={() => currentPage.value--}
              style={`padding: 0.375rem 0.75rem; border-radius: 0.375rem; border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); display: flex; align-items: center; gap: 0.25rem; font-weight: 500; transition: all 0.2s; ${currentPage.value === 1 ? 'opacity: 0.5; cursor: not-allowed; background: transparent; color: var(--text-secondary);' : 'cursor: pointer; background: var(--surface-2); color: var(--text-primary); hover:bg-surface-3'}`}
            >
              <LuChevronLeft style="width: 1rem; height: 1rem;" /> Prev
            </button>
            <button
              type="button"
              disabled={currentPage.value >= totalPages.value}
              onClick$={() => currentPage.value++}
              style={`padding: 0.375rem 0.75rem; border-radius: 0.375rem; border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); display: flex; align-items: center; gap: 0.25rem; font-weight: 500; transition: all 0.2s; ${currentPage.value >= totalPages.value ? 'opacity: 0.5; cursor: not-allowed; background: transparent; color: var(--text-secondary);' : 'cursor: pointer; background: var(--surface-2); color: var(--text-primary); hover:bg-surface-3'}`}
            >
              Next <LuChevronRight style="width: 1rem; height: 1rem;" />
            </button>
          </div>
        </div>
      )}

      {analyticsProductId.value && (
        <SingleProductAnalytics
          productId={analyticsProductId.value}
          productTitle={products.value.find((p) => p.id === analyticsProductId.value)?.title || "Product Analytics"}
          onClose$={() => analyticsProductId.value = null}
        />
      )}
    </div>
  );
});

export const PRODUCT_TABLE_STYLES = `
  .product-table-row {
    border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));
    transition: background-color 0.2s ease;
  }
  .product-table-row:hover {
    background: var(--surface-3);
    cursor: pointer;
  }
`;

export default ProductTable;
