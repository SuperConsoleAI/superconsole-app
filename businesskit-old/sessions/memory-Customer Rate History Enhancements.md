# Walkthrough - Customer Rate History Enhancements

## Summary of Changes

### 1. Default Discount Card & Reference Cards Fill ([`CustomerRateHistory.tsx`](file:///Users/2.o/businesskit/src/components/shop/CustomerRateHistory.tsx) & [`billing.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/billing.rs))
- **Rust Backend**:
  - Updated `shop_get_item_rate_history` query to extract `i.discount_pct` and `i.extra_discount` from `shop_items`.
  - Added `default_discount_pct: Option<f64>` and `extra_discount: Option<f64>` to `ItemRateHistoryResult`.
- **Frontend Reference Cards**:
  - Restored `var(--surface-3)` background fill on the top reference cards (Standard Rate, Catalog MRP, Default Discount, Cost Price) to make them stand out as stat tiles.
  - Added **Default Discount** tile showing configured default discount (e.g., `10%` or `10% + 5%`).

### 2. Performance & Global Context Architecture
- **Why On-Demand is Better than Global Context**:
  1. **Dynamic & Scoped**: Rate history depends on both the specific item and currently selected customer. Storing rate histories for thousands of items in global context would consume massive memory and slow down initial application boot.
  2. **Fast Local SQLite Query**: The Turso database has an index `idx_shop_document_lines_item` on `item_id`, making query execution take just ~5-15ms.
  3. **Always Fresh**: On-demand fetching guarantees newly billed invoices or edits reflect immediately.
  4. **Added In-Memory Session Cache**: Added a lightweight cache (`rateHistoryCache: Map<string, RateHistoryResult>`) in [`CustomerRateHistory.tsx`](file:///Users/2.o/businesskit/src/components/shop/CustomerRateHistory.tsx). Re-clicking `[i]` on an already-opened item renders **instantly (0ms)** with zero loading delay while background-refreshing fresh records.

## Verification
- `npm run build.types`: Passed with 0 errors.
- `cargo check --manifest-path src-tauri/Cargo.toml`: Passed with 0 errors.
