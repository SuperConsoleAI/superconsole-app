import { component$, useSignal, $, useStylesScoped$ } from "@builder.io/qwik";
import { LuX, LuDollarSign, LuUser, LuPackage, LuCalendar, LuCheck, LuClock, LuDownload } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";
import type { PurchaseRow, ProductRow } from "~/lib/types";

const { spacing, typography, borderRadius } = designSystem;

const SALES_STYLES = `
  .sales-container {
    display: flex;
    flex-direction: column;
    gap: ${spacing.xl};
    width: 100%;
    padding-bottom: 2rem;
  }

  .sales-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: ${spacing.md};
    width: 100%;
  }

  @media (max-width: 768px) {
    .sales-stats {
      grid-template-columns: 1fr;
      gap: ${spacing.sm};
    }
  }

  .stat-card {
    padding: ${spacing.lg};
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    display: flex;
    flex-direction: column;
    gap: ${spacing.xs};
    min-width: 0;
  }

  @media (max-width: 768px) {
    .stat-card {
      padding: ${spacing.md};
    }
  }

  .stat-card__label {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    font-weight: ${typography.weights.medium};
  }

  .stat-card__value {
    font-size: ${typography.sizes["2xl"]};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .filters-container {
    display: flex;
    gap: ${spacing.md};
    margin-bottom: ${spacing.lg};
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: ${spacing.xs};
    min-width: 200px;
  }

  .filter-label {
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.semibold};
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-select {
    padding: ${spacing.sm} ${spacing.md};
    border: 1px solid var(--border);
    border-radius: ${borderRadius.md};
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: ${typography.sizes.sm};
    height: 2rem;
    cursor: pointer;
    transition: border-color ${designSystem.transitions.fast};
  }

  .filter-select:hover {
    border-color: var(--text-secondary);
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .table-container {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    overflow: hidden;
    width: 100%;
  }

  @media (max-width: 768px) {
    .table-container {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }

  .sales-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  @media (max-width: 768px) {
    .sales-table {
      min-width: 800px;
    }
  }

  .sales-table thead {
    background: var(--surface-3);
    border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));
  }

  .sales-table th {
    padding: 0.75rem 0.5rem;
    padding-left: 1rem;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .sales-table th {
      padding: 0.5rem 0.75rem;
    }
  }

  .sales-table th:nth-child(1) { width: 150px; }
  .sales-table th:nth-child(2) { width: 200px; padding-left: 2rem; }
  .sales-table th:nth-child(3) { width: auto; padding-left: 2rem; }
  .sales-table th:nth-child(4) { width: 140px; padding-left: 2rem; }
  .sales-table th:nth-child(5) { width: 140px; padding-left: 2rem; }

  .sales-table td {
    padding: ${spacing.md} ${spacing.lg};
    font-size: ${typography.sizes.sm};
    color: var(--text-primary);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .sales-table td {
      padding: ${spacing.sm} ${spacing.md};
    }
  }

  .sales-table td:nth-child(2) { padding-left: 2rem; }
  .sales-table td:nth-child(3) { padding-left: 2rem; white-space: normal; }
  .sales-table td:nth-child(4) { padding-left: 2rem; }
  .sales-table td:nth-child(5) { padding-left: 2rem; }

  .sales-table tbody tr {
    cursor: pointer;
    transition: background-color ${designSystem.transitions.fast};
  }

  .sales-table tbody tr:hover {
    background: var(--surface-1);
  }

  .sales-table tbody tr:last-child td {
    border-bottom: none;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: ${spacing.xs};
    padding: 4px 10px;
    border-radius: ${borderRadius.pill};
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
  }

  .status-badge--completed { background: rgba(16, 185, 129, 0.1); color: #10B981; }
  .status-badge--pending { background: rgba(245, 158, 11, 0.1); color: #F59E0B; }
  .status-badge--cancelled { background: rgba(239, 68, 68, 0.1); color: #EF4444; }

  .product-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: ${borderRadius.md};
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
    background: var(--surface-1);
    color: var(--text-primary);
    text-transform: capitalize;
    margin-left: ${spacing.sm};
  }

  .slide-panel-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
    animation: fadeIn ${designSystem.transitions.fast};
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .slide-panel {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: 100%; max-width: 432px;
    background: var(--surface-2);
    border-left: 1px solid var(--border);
    z-index: 101;
    display: flex; flex-direction: column;
    animation: slideInRight ${designSystem.transitions.normal};
  }

  @media (max-width: 768px) {
    .slide-panel {
      max-width: calc(100vw - 3rem);
    }
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .slide-panel__header {
    padding: ${spacing.xl};
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
  }

  .slide-panel__title {
    margin: 0; font-size: ${typography.sizes.xl}; font-weight: ${typography.weights.semibold}; color: var(--text-primary);
  }

  .slide-panel__close {
    background: none; border: none; padding: 0; cursor: pointer; color: var(--text-primary);
    display: flex; align-items: center; justify-content: center;
    transition: opacity ${designSystem.transitions.fast};
  }
  .slide-panel__close svg { width: 24px; height: 24px; }
  .slide-panel__close:hover { opacity: 0.7; }

  .slide-panel__content {
    flex: 1; overflow-y: auto; padding: ${spacing.xl};
  }

  .detail-section { margin-bottom: ${spacing.xl}; }
  .detail-section__title {
    font-size: ${typography.sizes.sm}; font-weight: ${typography.weights.semibold};
    color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;
    margin: 0 0 ${spacing.md} 0;
  }
  .detail-grid { display: grid; gap: ${spacing.md}; }
  .detail-item {
    display: flex; flex-direction: column; gap: ${spacing.xs};
    padding: ${spacing.md}; background: var(--surface-1); border-radius: ${borderRadius.md};
  }
  .detail-item__label {
    font-size: ${typography.sizes.xs}; color: var(--text-secondary);
    font-weight: ${typography.weights.medium}; display: flex; align-items: center; gap: ${spacing.xs};
  }
  .detail-item__label svg { width: 14px; height: 14px; }
  .detail-item__value { font-size: ${typography.sizes.base}; color: var(--text-primary); font-weight: ${typography.weights.medium}; }

  .empty-state { padding: ${spacing["3xl"]}; text-align: center; color: var(--text-secondary); }
  .empty-state h3 { margin: 0 0 ${spacing.sm} 0; font-size: ${typography.sizes.xl}; font-weight: ${typography.weights.semibold}; color: var(--text-primary); }
  .empty-state p { margin: 0; font-size: ${typography.sizes.base}; }

  .pagination {
    display: flex; justify-content: center; align-items: center; gap: ${spacing.sm};
    padding: ${spacing.xl} 0; flex-wrap: wrap;
  }
  .pagination-button {
    padding: ${spacing.sm} ${spacing.md}; border-radius: ${borderRadius.md};
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-primary);
    font-size: ${typography.sizes.sm}; font-weight: ${typography.weights.medium};
    cursor: pointer; transition: all ${designSystem.transitions.fast}; white-space: nowrap;
  }
  .pagination-button:hover:not(:disabled) { background: var(--surface-1); border-color: var(--accent); }
  .pagination-button:disabled { opacity: 0.4; cursor: not-allowed; }
  .pagination-button--active { background: var(--accent); color: white; border-color: var(--accent); }
  .pagination-info { font-size: ${typography.sizes.sm}; color: var(--text-secondary); white-space: nowrap; }
`;

export interface ProductSalesProps {
  sales: PurchaseRow[];
  products: ProductRow[];
  productTypeFilterValue?: string;
}

export const ProductSales = component$<ProductSalesProps>(({ sales, products, productTypeFilterValue = "all" }) => {
  useStylesScoped$(SALES_STYLES);
  const selectedSale = useSignal<PurchaseRow | null>(null);
  const currentPage = useSignal(1);
  const itemsPerPage = 20;
  const filterProductId = useSignal<string>("all");

  const handleRowClick = $((sale: PurchaseRow) => {
    selectedSale.value = sale;
  });

  const handleClose = $(() => {
    selectedSale.value = null;
  });

  // Filter sales based on selected product filter
  const filteredSales = sales.filter((sale) => {
    if (filterProductId.value !== "all" && sale.product_id !== filterProductId.value) {
      return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const startIndex = (currentPage.value - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSales = filteredSales.slice(startIndex, endIndex);

  const goToPage = $((page: number) => {
    currentPage.value = page;
  });

  const formatCurrency = (cents: number, currency: string) => {
    const amount = cents / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.amount_cents, 0);
  const totalSalesCount = filteredSales.length;
  const averageOrderValue = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;

  return (
    <div class="sales-container">
      <div class="sales-stats">
        <div class="stat-card">
          <div class="stat-card__label">Total Revenue</div>
          <div class="stat-card__value">{formatCurrency(totalRevenue, "usd")}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Total Sales</div>
          <div class="stat-card__value">{totalSalesCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Average Order Value</div>
          <div class="stat-card__value">{formatCurrency(averageOrderValue, "usd")}</div>
        </div>
      </div>

      <div class="filters-container">
        <div class="filter-group">
          <label class="filter-label" for="product-filter">Filter by Product</label>
          <select
            id="product-filter"
            class="filter-select"
            value={filterProductId.value}
            onChange$={(e) => {
              filterProductId.value = (e.target as HTMLSelectElement).value;
              currentPage.value = 1;
            }}
          >
            <option value="all">All Products</option>
            {products
              .filter(p => productTypeFilterValue === "all" || p.product_type === productTypeFilterValue || p.category_id === productTypeFilterValue)
              .map((product) => (
                <option key={product.id} value={product.id}>{product.title}</option>
              ))}
          </select>
        </div>
      </div>

      <div class="table-container">
        {sales.length === 0 ? (
          <div class="empty-state">
            <h3>No sales yet</h3>
            <p>When customers purchase your products, they'll appear here.</p>
          </div>
        ) : (
          <table class="sales-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.map((sale) => (
                <tr key={sale.id} onClick$={() => handleRowClick(sale)}>
                  <td style="color: var(--text-secondary);">{formatDate(sale.created_at)}</td>
                  <td>
                    <span style="font-size: 0.875rem; color: var(--text-primary);">{sale.email}</span>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      {(() => {
                        const matchedProduct = products.find(p => p.id === sale.product_id);
                        const displayType = (matchedProduct?.product_type || matchedProduct?.category_id || sale.product_type || (productTypeFilterValue !== "all" ? productTypeFilterValue : "product")).toLowerCase();
                        const Icon = displayType === 'downloads' ? LuDownload : LuPackage;
                        
                        return (
                          <>
                            <span class="product-type-badge">
                              <Icon style="width: 0.875rem; height: 0.875rem;" />
                              {displayType}
                            </span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{matchedProduct ? matchedProduct.title : (sale.product_title || "Unknown Product")}</span>
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td style="font-weight: 600;">{formatCurrency(sale.amount_cents, sale.currency)}</td>
                  <td>
                    <span class={`status-badge status-badge--${sale.payment_status === "completed" ? "completed" : sale.payment_status === "pending" ? "pending" : "cancelled"}`}>
                      {sale.payment_status === "completed" ? <LuCheck width={14} height={14} /> : <LuClock width={14} height={14} />}
                      {sale.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sales.length > itemsPerPage && (
        <div class="pagination">
          <button
            class="pagination-button"
            onClick$={() => goToPage(currentPage.value - 1)}
            disabled={currentPage.value === 1}
          >
            Previous
          </button>
          
          <span class="pagination-info">
            Page {currentPage.value} of {totalPages}
          </span>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage.value <= 3) {
              pageNum = i + 1;
            } else if (currentPage.value >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage.value - 2 + i;
            }
            
            return (
              <button
                key={pageNum}
                class={`pagination-button ${currentPage.value === pageNum ? 'pagination-button--active' : ''}`}
                onClick$={() => goToPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            class="pagination-button"
            onClick$={() => goToPage(currentPage.value + 1)}
            disabled={currentPage.value === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {selectedSale.value && (
        <>
          <div class="slide-panel-overlay" onClick$={handleClose} />
          <div class="slide-panel">
            <div class="slide-panel__header">
              <h2 class="slide-panel__title">Sale Details</h2>
              <button class="slide-panel__close" onClick$={handleClose} aria-label="Close">
                <LuX />
              </button>
            </div>
            <div class="slide-panel__content">
              <div class="detail-section">
                <h3 class="detail-section__title">Customer Information</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuUser />
                      Name
                    </div>
                    <div class="detail-item__value">{selectedSale.value.customer_name || "Anonymous"}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuUser />
                      Email
                    </div>
                    <div class="detail-item__value">{selectedSale.value.email}</div>
                  </div>
                </div>
              </div>

              <div class="detail-section">
                <h3 class="detail-section__title">Product Details</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuPackage />
                      Product
                      <span class="product-type-badge">{selectedSale.value.product_type}</span>
                    </div>
                    <div class="detail-item__value">{selectedSale.value.product_title}</div>
                  </div>
                </div>
              </div>

              <div class="detail-section">
                <h3 class="detail-section__title">Payment Information</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuDollarSign />
                      Amount
                    </div>
                    <div class="detail-item__value">{formatCurrency(selectedSale.value.amount_cents, selectedSale.value.currency)}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuDollarSign />
                      Platform Fee
                    </div>
                    <div class="detail-item__value">{formatCurrency(selectedSale.value.platform_fee_cents, selectedSale.value.currency)}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuDollarSign />
                      Net Amount
                    </div>
                    <div class="detail-item__value">{formatCurrency(selectedSale.value.amount_cents - selectedSale.value.platform_fee_cents, selectedSale.value.currency)}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      Payment Processor
                    </div>
                    <div class="detail-item__value" style="text-transform: capitalize;">{selectedSale.value.payment_processor}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      Payment Status
                    </div>
                    <div class="detail-item__value">
                      <span class={`status-badge status-badge--${selectedSale.value.payment_status === "completed" ? "completed" : selectedSale.value.payment_status === "pending" ? "pending" : "cancelled"}`}>
                        {selectedSale.value.payment_status === "completed" ? <LuCheck width={14} height={14} /> : <LuClock width={14} height={14} />}
                        {selectedSale.value.payment_status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="detail-section">
                <h3 class="detail-section__title">Access Information</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-item__label">
                      Access Count
                    </div>
                    <div class="detail-item__value">{selectedSale.value.access_count} times</div>
                  </div>
                  {selectedSale.value.last_accessed_at && (
                    <div class="detail-item">
                      <div class="detail-item__label">
                        <LuCalendar />
                        Last Accessed
                      </div>
                      <div class="detail-item__value">{formatDate(selectedSale.value.last_accessed_at)}</div>
                    </div>
                  )}
                  {selectedSale.value.approval_status && (
                    <div class="detail-item">
                      <div class="detail-item__label">
                        Approval Status
                      </div>
                      <div class="detail-item__value" style="text-transform: capitalize;">{selectedSale.value.approval_status}</div>
                    </div>
                  )}
                </div>
              </div>

              <div class="detail-section">
                <h3 class="detail-section__title">Sale Information</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-item__label">
                      <LuCalendar />
                      Purchase Date
                    </div>
                    <div class="detail-item__value">{formatDate(selectedSale.value.created_at)}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-item__label">
                      Sale ID
                    </div>
                    <div class="detail-item__value" style="font-family: monospace; font-size: 0.75rem; word-break: break-all;">{selectedSale.value.id}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
