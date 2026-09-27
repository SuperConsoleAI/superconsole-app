// src-tauri/src/commands/shop/mod.rs
//
// Shop command modules — Phase 1 + Phase 2 + Phase 3
//
// Submodules:
//   items.rs      — create_item, list_items, update_item, delete_item
//   categories.rs — list_categories, create_category
//   units.rs      — list_units
//   billing.rs    — create_invoice, get_invoice, list_invoices
//   payments.rs   — record_payment, get_payment_status
//   stock.rs      — Phase 2: stock position, receive, adjust, transfer, reorder, barcode
//   customers.rs  — Phase 3: create_customer, list_customers, search, get_detail
//   vendors.rs    — Phase 3: create_vendor, list_vendors, get_detail, link_item

pub mod affiliates;
pub mod billing;
pub mod brands;
pub mod categories;
pub mod collections;
pub mod customers;
pub mod demo;
pub mod discounts;
pub mod items;
pub mod payments;
pub mod price_lists;
pub mod restaurant;
pub mod reviews;
pub mod shift;
pub mod shop_analytics;
pub mod stock;
pub mod stays;
pub mod units;
pub mod variants;
pub mod vendors;
