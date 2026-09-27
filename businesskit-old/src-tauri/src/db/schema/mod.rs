//! mod.rs — Schema module root
//! Path: src-tauri/src/db/schema/mod.rs
//!
//! Exposes all schema slices and a single provision function
//! that runs all CREATE TABLE statements against the user's Turso DB.
//!
//! File map:
//!   shop.rs      → item master (8 tables)   — storefront + POS display
//!   shop-ops.rs  → operations (35 tables)   — stock, people, documents, orders,
//!                                              reservations, routes, manufacturing,
//!                                              jewellery, automobile, analytics
//!   tax.rs       → tax & compliance (8)     — GST/VAT/Sales Tax, e-invoice, TDS
//!   accounts.rs  → accounts & finance (6)   — double-entry, bank, expenses
//!   payroll.rs   → payroll & HR (5)         — employees, attendance, payslips
//!
//! Total: 62 tables across 5 files
//!
//! NOTE ON FILE NAMING: the file on disk is "shop-ops.rs" (hyphen) but Rust
//! module names cannot contain hyphens. The #[path] attribute below maps
//! the Rust module name `shop_ops` to the actual file `shop-ops.rs`.
//! Keep the hyphenated filename — do not rename to underscore.

// ── Existing SaaS schema modules (BusinessKit platform) ──────────────────────
pub mod ads;
pub mod affiliate;
pub mod agents;
#[path = "chat-agent.rs"]
pub mod chat_agent;
pub mod community;
pub mod community_triggers;
pub mod content;
pub mod crm;
pub mod email;
pub mod feedback;
pub mod forms;
pub mod gsc;
pub mod jobs;
pub mod links;
pub mod pages;
pub mod product_triggers;
pub mod products;
pub mod review;
pub mod social;

// ── Shop schema modules (Phase 0 — Foundation) ───────────────────────────────
pub mod shop;

#[path = "shop-ops.rs"]
pub mod shop_ops;

pub mod accounts;
pub mod payroll;
pub mod tax;

use accounts::ACCOUNTS_SCHEMA;
use payroll::PAYROLL_SCHEMA;
use shop::SHOP_SCHEMA;
use shop_ops::SHOP_OPS_SCHEMA;
use tax::TAX_SCHEMA;

#[derive(Clone, Copy)]
pub struct Migration {
    pub id: &'static str,
    pub table: &'static str,
    pub sql: &'static str,
}

/// Run all CREATE TABLE + CREATE INDEX statements.
/// Every statement is idempotent (IF NOT EXISTS) — safe to call on every launch.
/// Order matters: shop.rs first (items referenced by ops tables).
pub async fn provision_all(conn: &crate::db::turso::TursoConn) -> anyhow::Result<()> {
    let all: &[&[&str]] = &[
        SHOP_SCHEMA,
        SHOP_OPS_SCHEMA,
        TAX_SCHEMA,
        ACCOUNTS_SCHEMA,
        PAYROLL_SCHEMA,
    ];

    for group in all {
        for stmt in *group {
            conn.execute(stmt, vec![]).await.map_err(|e| {
                eprintln!(
                    "[schema] provision failed:\n  stmt: {}...\n  err:  {}",
                    &stmt[..60.min(stmt.len())],
                    e
                );
                e
            })?;
        }
    }

    Ok(())
}

// ── Table counts per file ─────────────────────────────────────────────────────
//
//  shop.rs       8   shop_categories, shop_brands, shop_units, shop_items,
//                    shop_item_variants, shop_item_batches, shop_barcodes,
//                    shop_price_lists
//
//  shop-ops.rs  35   STOCK (5):         shop_warehouses, shop_stock_ledger,
//                                       shop_stock_adjustments, shop_reorder_rules,
//                                       shop_stock_transfers
//                    PEOPLE (4):        shop_customers, shop_vendors,
//                                       shop_vendor_items, shop_staff
//                    DOCUMENTS (3):     shop_documents, shop_document_lines,
//                                       shop_document_payments
//                    STOREFRONT (7):    shop_collections, shop_orders,
//                                       shop_order_lines, shop_order_fulfillments,
//                                       shop_cart_sessions, shop_discount_codes,
//                                       shop_shipping_rates
//                    RESERVATIONS (4):  shop_locations, shop_reservations,
//                                       shop_booking_guests, shop_folios
//                    DISTRIBUTION (2):  shop_sales_routes, shop_route_visits
//                    MANUFACTURING (4): shop_bom_headers, shop_bom_lines,
//                                       shop_production_orders, shop_production_logs
//                    JEWELLERY (2):     shop_metal_rates, shop_making_charges
//                    AUTOMOBILE (2):    shop_vehicles, shop_service_jobs
//                    ANALYTICS (2):     shop_analytics, shop_item_analytics
//
//  tax.rs        8   shop_tax_configs, shop_tax_rates, shop_hsn_sac_codes,
//                    shop_gst_returns, shop_einvoice_log, shop_eway_bill_log,
//                    shop_tds_tcs_entries, shop_currency_rates
//
//  accounts.rs   6   shop_accounts, shop_journal_entries, shop_journal_lines,
//                    shop_bank_accounts, shop_bank_transactions, shop_expenses
//
//  payroll.rs    5   shop_employees, shop_salary_components, shop_attendance,
//                    shop_payroll_runs, shop_payslips
//
//  TOTAL        62
