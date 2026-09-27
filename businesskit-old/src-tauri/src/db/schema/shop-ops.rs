//! shop-ops.rs — Operations schema
//! Path: src-tauri/src/db/schema/shop-ops.rs
//!
//! What lives here: everything that runs the business day-to-day.
//! Stock, people, documents, orders, reservations, routes, manufacturing.
//!
//! Tables (35):
//!   STOCK (5)         shop_warehouses, shop_stock_ledger, shop_stock_adjustments,
//!                     shop_reorder_rules, shop_stock_transfers
//!   PEOPLE (7)        shop_customers, shop_customer_credit_ledger, shop_loyalty_ledger,
//!                     shop_configs, shop_vendors, shop_vendor_items, shop_staff
//!   DOCUMENTS (3)     shop_documents, shop_document_lines, shop_document_payments
//!   STOREFRONT (7)    shop_collections, shop_orders, shop_order_lines,
//!                     shop_order_fulfillments, shop_cart_sessions,
//!                     shop_discount_codes, shop_shipping_rates
//!   RESERVATIONS (4)  shop_reservations, shop_locations, shop_booking_guests, shop_folios
//!   DISTRIBUTION (2)  shop_sales_routes, shop_route_visits
//!   MANUFACTURING (4) shop_bom_headers, shop_bom_lines,
//!                     shop_production_orders, shop_production_logs
//!   ANALYTICS (2)     shop_analytics, shop_item_analytics
//!   JEWELLERY (2)     shop_metal_rates, shop_making_charges
//!   AUTOMOBILE (2)    shop_vehicles, shop_service_jobs

pub const SHOP_OPS_SCHEMA: &[&str] = &[
    // ══════════════════════════════════════════════════════════════════════════
    // STOCK — where physical goods are
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_warehouses ──────────────────────────────────────────────────────
    // Named stock locations: main shop, back storeroom, branch, transit.
    // ownership_type handles consignment stock:
    //   own               → your stock, your location
    //   vendor_owned      → supplier's stock sitting in your store
    //   customer_consign  → your stock sitting at customer's site
    // owner_party_id → shop_vendors.id or shop_customers.id when not 'own'
    r#"CREATE TABLE IF NOT EXISTS shop_warehouses (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    name           TEXT NOT NULL,
    warehouse_type TEXT NOT NULL DEFAULT 'store',
    ownership_type TEXT NOT NULL DEFAULT 'own',
    owner_party_id TEXT,
    address        TEXT,
    notes          TEXT,
    agent_notes    TEXT,
    is_default     INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_warehouses_profile
     ON shop_warehouses (profile_id)"#,
    // ── shop_stock_ledger ────────────────────────────────────────────────────
    // THE most important inventory table. Append-only — never update or delete.
    // Every purchase, sale, return, transfer, or adjustment writes one row.
    // Current stock = SUM(qty_in) - SUM(qty_out) for item + warehouse.
    //
    // Think of it like a bank statement: you never erase entries.
    //
    // movement_type values:
    //   purchase | sale | transfer_in | transfer_out | adjustment | return | opening
    //
    // balance_after = denormalized running balance (fast dashboard queries)
    // unit_cost = cost at time of movement (for FIFO/AVCO margin calculation)
    r#"CREATE TABLE IF NOT EXISTS shop_stock_ledger (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    variant_id    TEXT,
    batch_id      TEXT,
    warehouse_id  TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    qty_in        REAL NOT NULL DEFAULT 0,
    qty_out       REAL NOT NULL DEFAULT 0,
    balance_after REAL NOT NULL DEFAULT 0,
    unit_cost     REAL NOT NULL DEFAULT 0,
    document_id   TEXT,
    notes         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_stock_ledger_item
     ON shop_stock_ledger (item_id, warehouse_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_stock_ledger_profile
     ON shop_stock_ledger (profile_id, created_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_stock_ledger_doc
     ON shop_stock_ledger (document_id)"#,
    // ── shop_stock_adjustments ───────────────────────────────────────────────
    // Manual stock corrections when physical count doesn't match the ledger.
    // Damage, theft, expiry write-off, opening stock entry.
    // Always writes a corresponding row to shop_stock_ledger after save.
    // adjustment_type: damage | theft | expiry | count | opening | other
    r#"CREATE TABLE IF NOT EXISTS shop_stock_adjustments (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    variant_id      TEXT,
    batch_id        TEXT,
    warehouse_id    TEXT NOT NULL,
    adjustment_type TEXT NOT NULL,
    qty_change      REAL NOT NULL,
    reason          TEXT NOT NULL,
    approved_by     TEXT,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_stock_adjustments_profile
     ON shop_stock_adjustments (profile_id)"#,
    // ── shop_reorder_rules ───────────────────────────────────────────────────
    // When stock of an item in a warehouse drops below min_qty:
    // alert the purchasing agent to order reorder_qty more from preferred_vendor.
    // lead_time_days = how many days delivery takes (plan ahead).
    r#"CREATE TABLE IF NOT EXISTS shop_reorder_rules (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL,
    item_id             TEXT NOT NULL,
    variant_id          TEXT,
    warehouse_id        TEXT NOT NULL,
    min_qty             REAL NOT NULL DEFAULT 0,
    reorder_qty         REAL NOT NULL DEFAULT 0,
    preferred_vendor_id TEXT,
    lead_time_days      INTEGER NOT NULL DEFAULT 3,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_reorder_rules_uniq
     ON shop_reorder_rules (item_id, warehouse_id)"#,
    // ── shop_stock_transfers ─────────────────────────────────────────────────
    // Move stock between own warehouses.
    // Creates two stock_ledger rows: transfer_out from source, transfer_in to dest.
    // status: draft | in_transit | received | cancelled
    r#"CREATE TABLE IF NOT EXISTS shop_stock_transfers (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    from_warehouse_id TEXT NOT NULL,
    to_warehouse_id   TEXT NOT NULL,
    item_id           TEXT NOT NULL,
    variant_id        TEXT,
    batch_id          TEXT,
    qty               REAL NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',
    notes             TEXT,
    dispatched_at     INTEGER,
    received_at       INTEGER,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_stock_transfers_profile
     ON shop_stock_transfers (profile_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // PEOPLE — customers, vendors, staff
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_customers ───────────────────────────────────────────────────────
    // The buying side of a person. Extends crm_contacts (contact_id FK).
    // contact_id is nullable: walk-in customers may have no CRM record yet.
    // name/phone/email are denormalized snapshots so billing works even if
    // the CRM contact is later updated.
    // credit_used tracks outstanding amount owed to you.
    // loyalty_points for retail reward programs.
    r#"CREATE TABLE IF NOT EXISTS shop_customers (
    id                      TEXT PRIMARY KEY,
    profile_id              TEXT NOT NULL,
    contact_id              TEXT,
    name                    TEXT NOT NULL,
    phone                   TEXT,
    email                   TEXT,
    gstin                   TEXT,
    pan                     TEXT,
    billing_addr            TEXT,
    pincode                 TEXT,
    city                    TEXT,
    state                   TEXT,
    country                 TEXT,
    price_list_id           TEXT,
    credit_limit            REAL NOT NULL DEFAULT 0,
    credit_used             REAL NOT NULL DEFAULT 0,
    wallet_balance          REAL NOT NULL DEFAULT 0,
    loyalty_pts             REAL NOT NULL DEFAULT 0,
    loyalty_pts_expiring_at INTEGER,
    total_orders            INTEGER NOT NULL DEFAULT 0,
    total_spent             REAL NOT NULL DEFAULT 0,
    notes                   TEXT,
    agent_notes             TEXT,
    tags                    TEXT NOT NULL DEFAULT '[]',
    collect_taxes           INTEGER NOT NULL DEFAULT 1,
    accepts_email_marketing    INTEGER NOT NULL DEFAULT 0,
    accepts_sms_marketing      INTEGER NOT NULL DEFAULT 0,
    accepts_whatsapp_marketing INTEGER NOT NULL DEFAULT 0,
    date_of_birth           TEXT,
    anniversary             TEXT,
    addresses               TEXT NOT NULL DEFAULT '[]',
    gst_supply_type         TEXT NOT NULL DEFAULT 'regular',               -- regular | sez | export | overseas_consumer
    dl_no                   TEXT,                                          -- Drug License No. (pharma/medical invoices)
    media_id                TEXT,
    image_url               TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at              INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_customers_profile
     ON shop_customers (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_customers_contact
     ON shop_customers (contact_id)"#,
    // ── shop_tags ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS shop_tags (
    id         TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    color      TEXT,
    tag_type   TEXT NOT NULL DEFAULT 'customer',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_tags_uniq
     ON shop_tags (profile_id, name, tag_type)"#,
    // ── shop_customer_credit_ledger ──────────────────────────────────────────
    // Append-only store credit ledger tracking every issuance, redemption,
    // refund, and adjustment.
    // balance_after is the customer's store_credit balance after this entry.
    r#"CREATE TABLE IF NOT EXISTS shop_customer_credit_ledger (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    customer_id   TEXT NOT NULL,
    entry_type    TEXT NOT NULL,
    amount        REAL NOT NULL,
    balance_after REAL NOT NULL,
    document_id   TEXT,
    payment_id    TEXT,
    notes         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_customer_credit_ledger_cust
     ON shop_customer_credit_ledger (customer_id, created_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_customer_credit_ledger_doc
     ON shop_customer_credit_ledger (document_id)"#,
    // ── shop_loyalty_ledger ──────────────────────────────────────────────────
    // Append-only loyalty reward points ledger (earn, redeem, expire, adjust).
    // balance_after is the customer's loyalty_pts balance after this entry.
    r#"CREATE TABLE IF NOT EXISTS shop_loyalty_ledger (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    customer_id   TEXT NOT NULL,
    entry_type    TEXT NOT NULL,
    points        REAL NOT NULL,
    balance_after REAL NOT NULL,
    document_id   TEXT,
    reason        TEXT,
    expires_at    INTEGER,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_loyalty_ledger_cust
     ON shop_loyalty_ledger (customer_id, created_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_loyalty_ledger_doc
     ON shop_loyalty_ledger (document_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_loyalty_ledger_profile
     ON shop_loyalty_ledger (profile_id, customer_id)"#,
    // ── shop_configs ─────────────────────────────────────────────────────────
    // Generalized shop configuration store (loyalty, pos, billing, restaurant, stays, etc.).
    // config_val is JSON payload.
    r#"CREATE TABLE IF NOT EXISTS shop_configs (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    config_key  TEXT NOT NULL,
    config_val  TEXT NOT NULL DEFAULT '{}',
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_configs_profile_key
     ON shop_configs (profile_id, config_key)"#,
    // ── shop_vendors ─────────────────────────────────────────────────────────
    // The supplying side of a person. Extends crm_contacts (contact_id FK).
    // payment_terms: immediate | net7 | net15 | net30 | net60
    // bank_details JSON: { bank, account_no, ifsc, upi }
    // Performance columns (updated from purchase history):
    //   on_time_pct, defect_rate_pct, price_variance_pct
    r#"CREATE TABLE IF NOT EXISTS shop_vendors (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    contact_id        TEXT,
    name              TEXT NOT NULL,
    phone             TEXT,
    email             TEXT,
    gstin             TEXT,
    pan               TEXT,
    payment_terms     TEXT NOT NULL DEFAULT 'immediate',
    credit_limit      REAL NOT NULL DEFAULT 0,
    credit_used       REAL NOT NULL DEFAULT 0,
    lead_time_days    INTEGER NOT NULL DEFAULT 3,
    address           TEXT NOT NULL DEFAULT '{}',
    city              TEXT,
    state             TEXT,
    country           TEXT,
    bank_details      TEXT NOT NULL DEFAULT '{}',
    rating            INTEGER NOT NULL DEFAULT 0,
    gst_compliance_rating INTEGER,
    on_time_pct       REAL NOT NULL DEFAULT 0,
    defect_rate_pct   REAL NOT NULL DEFAULT 0,
    price_variance_pct REAL NOT NULL DEFAULT 0,
    notes             TEXT,
    agent_notes       TEXT,
    dl_no             TEXT,                                      -- Drug License No. (pharma/medical invoices)
    media_id          TEXT,
    image_url         TEXT,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_vendors_profile
     ON shop_vendors (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_vendors_contact
     ON shop_vendors (contact_id)"#,
    // ── shop_vendor_items ────────────────────────────────────────────────────
    // Which vendor supplies which item at what cost.
    // Enables: best vendor suggestion, price comparison, auto-fill PO cost.
    // is_preferred = 1 marks the default vendor for this item.
    r#"CREATE TABLE IF NOT EXISTS shop_vendor_items (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    vendor_id      TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    vendor_sku     TEXT,
    purchase_price REAL NOT NULL DEFAULT 0,
    min_order_qty  REAL NOT NULL DEFAULT 1,
    lead_time_days INTEGER NOT NULL DEFAULT 3,
    is_preferred   INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_vendor_items_uniq
     ON shop_vendor_items (vendor_id, item_id)"#,
    // ── shop_staff ───────────────────────────────────────────────────────────
    // People who work for the business.
    // One table, role field differentiates:
    //   waiter       → restaurant (waiter-wise reports, tips, table assignment)
    //   stylist      → salon (appointments booked with specific person)
    //   doctor       → clinic (slot booked with specific doctor)
    //   driver       → delivery + distribution
    //   salesman     → distribution route visits, collection targets
    //   receptionist → hotel front desk
    //   housekeeper  → hotel room assignment
    //
    // Referenced by shop_documents.staff_id and shop_reservations.staff_id.
    // commission_pct = % of sale amount earned as commission (salon/retail).
    r#"CREATE TABLE IF NOT EXISTS shop_staff (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    user_id        TEXT,
    first_name     TEXT,
    last_name      TEXT,
    display_name   TEXT,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'staff',
    department     TEXT,
    phone          TEXT,
    email          TEXT,
    commission_pct REAL NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_staff_profile
     ON shop_staff (profile_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // DOCUMENTS — every transaction, one table
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_documents ───────────────────────────────────────────────────────
    // One row per business document. doc_type is the only differentiator.
    // Three tables replace 15+ separate transaction tables.
    //
    // doc_type values:
    //   Physical goods:  invoice | purchase_order | goods_receipt | sales_order |
    //                    challan | delivery_note | credit_note | debit_note |
    //                    estimate | proforma | return | job_order
    //   Hospitality:     booking | checkin | checkout | kot | folio_charge
    //   Finance:         payment | receipt | journal | expense
    //
    // channel: dashboard | pos | online | whatsapp | api
    // status:  draft | confirmed | partial | paid | cancelled | void
    //
    // staff_id → shop_staff.id (which waiter/stylist served this)
    // location_id → shop_locations.id (which table/room/counter)
    //
    // tax_breakdown JSON: { "cgst": 450, "sgst": 450, "igst": 0, "cess": 0 }
    // meta JSON: booking dates, folio refs, parent document link, etc.
    r#"CREATE TABLE IF NOT EXISTS shop_documents (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    user_id       TEXT NOT NULL DEFAULT 'owner',
    updated_by    TEXT NOT NULL DEFAULT 'owner',
    doc_type      TEXT NOT NULL,
    doc_number    TEXT NOT NULL,
    ref_number    TEXT,                         -- Vendor invoice / bill / order #
    transaction_id TEXT,                        -- Payment Txn / UTR reference ID
    payment_method TEXT,                        -- cash | upi | bank_transfer | card | credit
    media_id      TEXT,                         -- invoice screenshot / document attachment
    doc_date      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    due_date      INTEGER,
    vendor_bill_date INTEGER,                   -- Vendor's actual invoice/bill date
    customer_id   TEXT,
    vendor_id     TEXT,
    warehouse_id  TEXT,
    location_id   TEXT,
    staff_id      TEXT,
    channel       TEXT NOT NULL DEFAULT 'dashboard',
    service_mode  TEXT NOT NULL DEFAULT 'dine_in',              -- dine_in | takeaway | delivery | drive_thru
    status        TEXT NOT NULL DEFAULT 'draft',
    currency      TEXT NOT NULL DEFAULT 'INR',
    exchange_rate REAL NOT NULL DEFAULT 1,
    subtotal      REAL NOT NULL DEFAULT 0,
    discount_amt  REAL NOT NULL DEFAULT 0,
    cash_discount_pct REAL NOT NULL DEFAULT 0,  -- Cash discount % (CD Rate)
    cash_discount_amt REAL NOT NULL DEFAULT 0,  -- Cash discount amount
    inward_expense REAL NOT NULL DEFAULT 0,     -- Inward freight, loading, octroi, and handling expenses
    taxable_amt   REAL NOT NULL DEFAULT 0,
    tax_amount    REAL NOT NULL DEFAULT 0,
    tax_breakdown TEXT NOT NULL DEFAULT '{}',
    round_off     REAL NOT NULL DEFAULT 0,
    grand_total   REAL NOT NULL DEFAULT 0,
    amount_paid   REAL NOT NULL DEFAULT 0,
    amount_due    REAL NOT NULL DEFAULT 0,
    commission_amount REAL NOT NULL DEFAULT 0,  -- Aggregator / marketplace fee on pre-tax subtotal
    profit        REAL NOT NULL DEFAULT 0,  -- SUM((unit_price - unit_cost)*qty) snapshot
    transporter_name TEXT,                  -- Transporter / Courier name
    lr_number     TEXT,                     -- Lorry Receipt (LR) / Bilty / Airway Bill No.
    vehicle_number TEXT,                    -- Vehicle / Truck registration number
    city          TEXT,                     -- snapshot from customer at billing time
    state         TEXT,
    country       TEXT,
    notes         TEXT,
    agent_notes   TEXT,
    terms         TEXT,
    meta          TEXT NOT NULL DEFAULT '{}',
    is_modified   INTEGER NOT NULL DEFAULT 0,
    modified_at   INTEGER,
    modified_by   TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_profile
     ON shop_documents (profile_id, doc_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_modified
     ON shop_documents (profile_id, is_modified, modified_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_user
     ON shop_documents (profile_id, user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_updated_by
     ON shop_documents (profile_id, updated_by)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_customer
     ON shop_documents (customer_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_vendor
     ON shop_documents (vendor_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_documents_status
     ON shop_documents (profile_id, status, doc_date)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_documents_number
     ON shop_documents (profile_id, doc_type, doc_number)"#,
    // ── shop_document_lines ──────────────────────────────────────────────────
    // Line items inside each document. Immutable price snapshot at transaction time.
    // Changing item price tomorrow never affects past invoices.
    //
    // unit_cost snapshot enables margin per line:
    //   margin = (unit_price - unit_cost) * qty
    //
    // tax_breakdown JSON: { "cgst": 45, "sgst": 45, "igst": 0 }
    r#"CREATE TABLE IF NOT EXISTS shop_document_lines (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    document_id   TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    variant_id    TEXT,
    batch_id      TEXT,
    imei          TEXT,
    description   TEXT,
    hsn_sac_code  TEXT,
    qty           REAL NOT NULL DEFAULT 1,
    unit_id       TEXT,
    pack_size     TEXT,                       -- Packaging spec snapshot (e.g. "15.00x1X10")
    conversion_factor REAL NOT NULL DEFAULT 1, -- Units per pack
    unit_price    REAL NOT NULL DEFAULT 0,
    unit_cost     REAL NOT NULL DEFAULT 0,
    landing_cost  REAL NOT NULL DEFAULT 0,    -- Computed landed cost per unit after schemes, discounts & taxes
    mrp           REAL NOT NULL DEFAULT 0,    -- MRP snapshot at time of this line
    free_qty      REAL NOT NULL DEFAULT 0,    -- Free scheme units (pharma "buy 200 get 10 free") — not billed, still stock
    scheme_on     REAL NOT NULL DEFAULT 0,    -- Scheme Buy criteria (e.g. Buy 9)
    scheme_free   REAL NOT NULL DEFAULT 0,    -- Scheme Free quantity (e.g. Get 1 Free)
    discount_pct  REAL NOT NULL DEFAULT 0,
    discount_amt  REAL NOT NULL DEFAULT 0,
    taxable_amt   REAL NOT NULL DEFAULT 0,
    tax_rate_id   TEXT,
    tax_rate_pct  REAL NOT NULL DEFAULT 0,
    tax_inclusive INTEGER NOT NULL DEFAULT 0,
    tax_amount    REAL NOT NULL DEFAULT 0,
    tax_breakdown TEXT NOT NULL DEFAULT '{}',
    line_meta     TEXT NOT NULL DEFAULT '{}',
    pricing_snapshot TEXT,                     -- Purchase pricing breakdown JSON: { rate, discount, discount2, tax, tax_code }
    line_total    REAL NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_document_lines_doc
     ON shop_document_lines (document_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_document_lines_tax_inclusive
     ON shop_document_lines (document_id, tax_inclusive)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_document_lines_item
     ON shop_document_lines (item_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_document_lines_imei
     ON shop_document_lines (imei) WHERE imei IS NOT NULL"#,
    // ── shop_document_payments ───────────────────────────────────────────────
    // Payment records per document. Supports partial and split payments.
    // Multiple rows per document when paid in instalments or split modes.
    // amount_due on parent doc = grand_total - SUM of all rows here.
    //
    // payment_mode: cash | card | upi | neft | rtgs | cheque | wallet | advance
    // tip_amount: for restaurant table service tips (separate from bill amount)
    r#"CREATE TABLE IF NOT EXISTS shop_document_payments (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    document_id  TEXT NOT NULL,
    amount       REAL NOT NULL,
    tip_amount   REAL NOT NULL DEFAULT 0,
    currency     TEXT NOT NULL DEFAULT 'INR',
    payment_mode TEXT NOT NULL DEFAULT 'cash',
    reference    TEXT,
    payment_date INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    notes        TEXT,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_document_payments_doc
     ON shop_document_payments (document_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_document_payments_gateway_ref
     ON shop_document_payments (profile_id, reference) WHERE reference IS NOT NULL"#,
    // ══════════════════════════════════════════════════════════════════════════
    // STOREFRONT — online shop layer (Qwik web deployed to user's CF account)
    // ══════════════════════════════════════════════════════════════════════════


    // ── shop_orders ──────────────────────────────────────────────────────────
    // Customer-placed online orders from public storefront.
    // Separate from internal shop_documents — this is the customer-facing record.
    // document_id links to the invoice created when order is fulfilled.
    //
    // channel: online | pos | whatsapp | instagram | app
    // status:  pending | confirmed | processing | shipped | delivered | cancelled | refunded
    // payment_status: unpaid | partial | paid | refunded
    // fulfillment_status: unfulfilled | partial | fulfilled
    //
    // shipping_addr / billing_addr = JSON snapshots (immutable after order placed)
    r#"CREATE TABLE IF NOT EXISTS shop_orders (
    id                 TEXT PRIMARY KEY,
    profile_id         TEXT NOT NULL,
    order_number       TEXT NOT NULL,
    customer_id        TEXT,
    customer_name      TEXT,
    customer_email     TEXT,
    customer_phone     TEXT,
    channel            TEXT NOT NULL DEFAULT 'online',
    service_mode       TEXT NOT NULL DEFAULT 'delivery',            -- delivery | takeaway | dine_in
    status             TEXT NOT NULL DEFAULT 'pending',
    payment_status     TEXT NOT NULL DEFAULT 'unpaid',
    fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
    currency           TEXT NOT NULL DEFAULT 'INR',
    subtotal           REAL NOT NULL DEFAULT 0,
    discount_amt       REAL NOT NULL DEFAULT 0,
    discount_code_id   TEXT,
    shipping_amount    REAL NOT NULL DEFAULT 0,
    tax_amount         REAL NOT NULL DEFAULT 0,
    grand_total        REAL NOT NULL DEFAULT 0,
    amount_paid        REAL NOT NULL DEFAULT 0,
    shipping_addr      TEXT NOT NULL DEFAULT '{}',
    billing_addr       TEXT NOT NULL DEFAULT '{}',
    document_id        TEXT,
    gateway_payment_id TEXT,
    notes              TEXT,
    meta               TEXT NOT NULL DEFAULT '{}',
    placed_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_orders_profile
     ON shop_orders (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_orders_customer
     ON shop_orders (customer_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_orders_number
     ON shop_orders (profile_id, order_number)"#,
    // ── shop_order_lines ─────────────────────────────────────────────────────
    // Line items per online order. IMMUTABLE after order is placed.
    // item_name / variant_name / sku are snapshots — survive item name changes.
    // reservation_id links to shop_reservations for service/event/stay orders.
    r#"CREATE TABLE IF NOT EXISTS shop_order_lines (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    order_id       TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    variant_id     TEXT,
    item_name      TEXT NOT NULL,
    variant_name   TEXT,
    sku            TEXT,
    qty            REAL NOT NULL DEFAULT 1,
    unit_price     REAL NOT NULL DEFAULT 0,
    unit_cost      REAL NOT NULL DEFAULT 0,
    discount_amt   REAL NOT NULL DEFAULT 0,
    tax_amount     REAL NOT NULL DEFAULT 0,
    line_total     REAL NOT NULL DEFAULT 0,
    reservation_id TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_order_lines_order
     ON shop_order_lines (order_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_order_lines_item
     ON shop_order_lines (item_id)"#,
    // ── shop_order_fulfillments ──────────────────────────────────────────────
    // Shipping / delivery tracking. One order can have multiple fulfillments
    // when shipped in parts.
    // line_ids JSON: array of shop_order_lines.id included in this shipment.
    // status: pending | picked | in_transit | delivered | failed
    r#"CREATE TABLE IF NOT EXISTS shop_order_fulfillments (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    order_id       TEXT NOT NULL,
    line_ids       TEXT NOT NULL DEFAULT '[]',
    courier        TEXT,
    tracking_no    TEXT,
    tracking_url   TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    dispatched_at  INTEGER,
    delivered_at   INTEGER,
    notes          TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_order_fulfillments_order
     ON shop_order_fulfillments (order_id)"#,
    // ── shop_cart_sessions ───────────────────────────────────────────────────
    // Abandoned cart recovery. Stores in-progress cart before checkout.
    // customer_id is nullable for anonymous/guest shoppers.
    // converted_at is set when the order is placed (cart is then dead).
    // items JSON: [{ item_id, variant_id, qty, price }, ...]
    r#"CREATE TABLE IF NOT EXISTS shop_cart_sessions (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    customer_id  TEXT,
    session_token TEXT NOT NULL,
    items        TEXT NOT NULL DEFAULT '[]',
    discount_code TEXT,
    last_seen_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    converted_at INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_cart_sessions_profile
     ON shop_cart_sessions (profile_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_cart_sessions_token
     ON shop_cart_sessions (session_token)"#,
    // ── shop_discount_codes ──────────────────────────────────────────────────
    // Coupon codes for the public storefront.
    // discount_type: percent | flat | free_shipping | bogo
    // eligible_items JSON: [] = all items, [id1, id2] = specific items only
    r#"CREATE TABLE IF NOT EXISTS shop_discount_codes (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL,
    user_id             TEXT NOT NULL DEFAULT 'owner',
    updated_by          TEXT NOT NULL DEFAULT 'owner',
    code                TEXT NOT NULL,
    discount_type       TEXT NOT NULL DEFAULT 'percent',
    value               REAL NOT NULL DEFAULT 0,
    min_order_value     REAL NOT NULL DEFAULT 0,
    max_discount        REAL,
    usage_limit         INTEGER,
    usage_count         INTEGER NOT NULL DEFAULT 0,
    per_customer_limit  INTEGER NOT NULL DEFAULT 1,
    eligible_items      TEXT NOT NULL DEFAULT '[]',
    valid_from          INTEGER,
    valid_until         INTEGER,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_discount_codes_code
     ON shop_discount_codes (profile_id, code)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_discount_codes_profile
     ON shop_discount_codes (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_discount_codes_user
     ON shop_discount_codes (profile_id, user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_discount_codes_updated_by
     ON shop_discount_codes (profile_id, updated_by)"#,
    // ── shop_shipping_rates ──────────────────────────────────────────────────
    // Shipping zones and rates combined in one table.
    // rate_type: flat | weight_based | free_above
    // countries JSON: ["IN", "US", "GB"] — ISO country codes
    // states JSON: ["MH", "DL"] — for domestic sub-zones
    // weight_rates JSON: [{ max_kg: 1, rate: 50 }, { max_kg: 5, rate: 100 }]
    r#"CREATE TABLE IF NOT EXISTS shop_shipping_rates (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    zone_name   TEXT NOT NULL,
    countries   TEXT NOT NULL DEFAULT '[]',
    states      TEXT NOT NULL DEFAULT '[]',
    rate_type   TEXT NOT NULL DEFAULT 'flat',
    flat_rate   REAL NOT NULL DEFAULT 0,
    free_above  REAL,
    weight_rates TEXT NOT NULL DEFAULT '[]',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_shipping_rates_profile
     ON shop_shipping_rates (profile_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // RESERVATIONS — time-based availability
    // Like stock_ledger but for time instead of quantity.
    // Used by: hotel, restaurant, salon, clinic, events, rentals
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_locations ───────────────────────────────────────────────────────
    // Physical sub-units within a business.
    // location_type: room | table | counter | bay | seat | event_slot
    //
    // Examples:
    //   Hotel:      Room 101 (type=room, capacity=2)
    //   Restaurant: Table 4  (type=table, capacity=4)
    //   Salon:      Chair 2  (type=bay, capacity=1)
    //   Clinic:     Room B   (type=room, capacity=1)
    //   POS:        Counter 1 (type=counter)
    //
    // amenities JSON: ["AC", "WiFi", "TV", "Sea View"]
    // status: available | occupied | reserved | maintenance | blocked
    r#"CREATE TABLE IF NOT EXISTS shop_locations (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    location_type TEXT NOT NULL,
    name          TEXT NOT NULL,
    number        TEXT,
    floor         TEXT,
    capacity      INTEGER NOT NULL DEFAULT 1,
    base_rate     REAL NOT NULL DEFAULT 0,
    amenities     TEXT NOT NULL DEFAULT '[]',
    rate_overrides TEXT NOT NULL DEFAULT '{}',                  -- Date-based rate map e.g. {"2026-12-24": 5000}
    booking_rules TEXT NOT NULL DEFAULT '{}',                  -- {min_nights, max_nights, checkin_time, checkout_time, house_rules}
    media_id      TEXT,
    status        TEXT NOT NULL DEFAULT 'available',
    is_active     INTEGER NOT NULL DEFAULT 1,
    archived      INTEGER NOT NULL DEFAULT 0,
    archived_at   INTEGER,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_locations_profile
     ON shop_locations (profile_id, location_type)"#,
    // ── shop_reservations ────────────────────────────────────────────────────
    // The availability + double-booking prevention layer.
    // Before confirming any booking: check no row exists with same
    // item_id + location_id where slot_start / slot_end overlaps.
    //
    // status: hold | confirmed | checked_in | checked_out | cancelled | no_show
    // staff_id: salon appointment with specific stylist, doctor slot, room assigned to housekeeper
    //
    // For events: slot_start = event_start, slot_end = event_end
    // For stays:  slot_start = check_in date, slot_end = check_out date
    // For salon:  slot_start = appointment time, slot_end = start + duration_mins
    r#"CREATE TABLE IF NOT EXISTS shop_reservations (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    item_type      TEXT NOT NULL,
    location_id    TEXT,
    staff_id       TEXT,
    order_id       TEXT,
    document_id    TEXT,
    customer_id    TEXT,
    source_channel TEXT NOT NULL DEFAULT 'direct',              -- direct | walk_in | airbnb | booking_com | zomato | eazydiner
    external_booking_id TEXT,                                   -- UID from Airbnb/OTA .ics feeds
    status         TEXT NOT NULL DEFAULT 'hold',
    slot_start     INTEGER NOT NULL,
    slot_end       INTEGER NOT NULL,
    party_size     INTEGER NOT NULL DEFAULT 1,
    notes          TEXT,
    meta           TEXT NOT NULL DEFAULT '{}',
    confirmed_at   INTEGER,
    cancelled_at   INTEGER,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_reservations_item
     ON shop_reservations (item_id, slot_start, slot_end)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_reservations_location
     ON shop_reservations (location_id, slot_start, slot_end)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_reservations_profile
     ON shop_reservations (profile_id, status, slot_start)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_reservations_customer
     ON shop_reservations (customer_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_reservations_external
     ON shop_reservations (profile_id, source_channel, external_booking_id)
     WHERE external_booking_id IS NOT NULL"#,
    // ── shop_booking_guests ──────────────────────────────────────────────────
    // Guest details per reservation. Hotels need ID proof + nationality.
    // One booking can have multiple guests (family check-in).
    // is_primary = 1 marks the lead guest who made the booking.
    // id_type: passport | aadhaar | driving_license | pan | voter_id
    r#"CREATE TABLE IF NOT EXISTS shop_booking_guests (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    reservation_id TEXT NOT NULL,
    contact_id     TEXT,
    name           TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    id_type        TEXT,
    id_number      TEXT,
    nationality    TEXT,
    dob            INTEGER,
    is_primary     INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_booking_guests_reservation
     ON shop_booking_guests (reservation_id)"#,
    // ── shop_folios ──────────────────────────────────────────────────────────
    // Hotel running tab. Accumulates all charges during a stay:
    // room rate per night, restaurant bills, minibar, laundry, room service.
    // On checkout: folio settles into one final invoice (shop_documents).
    //
    // folio_lines JSON: [{ date, description, amount, type }, ...]
    // status: open | settled | void
    r#"CREATE TABLE IF NOT EXISTS shop_folios (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    reservation_id    TEXT NOT NULL,
    customer_id       TEXT,
    status            TEXT NOT NULL DEFAULT 'open',
    total_charges     REAL NOT NULL DEFAULT 0,
    total_paid        REAL NOT NULL DEFAULT 0,
    folio_lines       TEXT NOT NULL DEFAULT '[]',
    settlement_doc_id TEXT,
    opened_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    settled_at        INTEGER,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_folios_reservation
     ON shop_folios (reservation_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // DISTRIBUTION — salesman routes, retail visits
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_sales_routes ────────────────────────────────────────────────────
    // Salesman beat / route definition.
    // A route = one salesman + list of retailers to visit on specific days.
    // stops JSON: [{ customer_id, address, seq_no }, ...]
    // days_of_week JSON: ["mon", "wed", "fri"]
    r#"CREATE TABLE IF NOT EXISTS shop_sales_routes (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    staff_id     TEXT NOT NULL,
    name         TEXT NOT NULL,
    days_of_week TEXT NOT NULL DEFAULT '[]',
    stops        TEXT NOT NULL DEFAULT '[]',
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_sales_routes_profile
     ON shop_sales_routes (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_sales_routes_staff
     ON shop_sales_routes (staff_id)"#,
    // ── shop_route_visits ────────────────────────────────────────────────────
    // Record of each retailer visit by a salesman.
    // Salesman visits Shop A, takes order of ₹4,500, collects ₹3,000 outstanding.
    // order_id links to the sales order placed during the visit.
    // collection_amount = cash or cheque collected from retailer during visit.
    r#"CREATE TABLE IF NOT EXISTS shop_route_visits (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    route_id          TEXT NOT NULL,
    staff_id          TEXT NOT NULL,
    customer_id       TEXT NOT NULL,
    visited_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    order_id          TEXT,
    order_amount      REAL NOT NULL DEFAULT 0,
    collection_amount REAL NOT NULL DEFAULT 0,
    payment_mode      TEXT,
    notes             TEXT,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_route_visits_route
     ON shop_route_visits (route_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_route_visits_staff
     ON shop_route_visits (staff_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // MANUFACTURING — recipe / BOM / production
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_bom_headers ─────────────────────────────────────────────────────
    // Bill of Materials (BOM) / Recipe header.
    // item_id = the finished product (butter chicken dish, garment, medicine)
    // yield_qty = how many units produced per one production run
    // Used by: restaurant (recipes), any manufacturer
    r#"CREATE TABLE IF NOT EXISTS shop_bom_headers (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    version     TEXT NOT NULL DEFAULT 'v1',
    yield_qty   REAL NOT NULL DEFAULT 1,
    yield_unit_id TEXT,
    notes       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_bom_headers_item
     ON shop_bom_headers (item_id)"#,
    // ── shop_bom_lines ───────────────────────────────────────────────────────
    // Ingredients / components per BOM.
    // qty_required = per yield_qty of finished product
    // wastage_pct = expected loss during production (5% flour wastage in baking)
    r#"CREATE TABLE IF NOT EXISTS shop_bom_lines (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    bom_id            TEXT NOT NULL,
    component_item_id TEXT NOT NULL,
    qty_required      REAL NOT NULL DEFAULT 0,
    unit_id           TEXT,
    wastage_pct       REAL NOT NULL DEFAULT 0,
    is_optional       INTEGER NOT NULL DEFAULT 0,
    notes             TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_bom_lines_bom
     ON shop_bom_lines (bom_id)"#,
    // ── shop_production_orders ───────────────────────────────────────────────
    // Instruction to produce X qty of a finished product from a BOM.
    // status: draft | in_progress | completed | cancelled
    r#"CREATE TABLE IF NOT EXISTS shop_production_orders (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    bom_id       TEXT NOT NULL,
    warehouse_id TEXT,
    planned_qty  REAL NOT NULL DEFAULT 0,
    actual_qty   REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'draft',
    scheduled_at INTEGER,
    started_at   INTEGER,
    completed_at INTEGER,
    notes        TEXT,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_production_orders_profile
     ON shop_production_orders (profile_id, status)"#,
    // ── shop_production_logs ─────────────────────────────────────────────────
    // Actual materials consumed and output produced.
    // On completion: writes to shop_stock_ledger automatically.
    // log_type: consumed | produced | wastage
    r#"CREATE TABLE IF NOT EXISTS shop_production_logs (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL,
    production_order_id TEXT NOT NULL,
    log_type            TEXT NOT NULL,
    item_id             TEXT NOT NULL,
    variant_id          TEXT,
    batch_id            TEXT,
    qty                 REAL NOT NULL DEFAULT 0,
    unit_id             TEXT,
    warehouse_id        TEXT,
    notes               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_production_logs_order
     ON shop_production_logs (production_order_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // JEWELLERY — metal rates + making charges
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_metal_rates ─────────────────────────────────────────────────────
    // Daily gold / silver / platinum rates per gram.
    // Price of jewellery = (weight_grams * metal_rate) + making_charge
    // metal_type: gold_22k | gold_18k | silver | platinum
    r#"CREATE TABLE IF NOT EXISTS shop_metal_rates (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    metal_type  TEXT NOT NULL,
    rate_per_gm REAL NOT NULL,
    rate_date   INTEGER NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_metal_rates_date
     ON shop_metal_rates (profile_id, metal_type, rate_date)"#,
    // ── shop_making_charges ──────────────────────────────────────────────────
    // Labour / crafting charges applied on top of metal cost.
    // charge_type: per_gram | flat | percent_of_metal_value
    // Applied when creating jewellery invoices.
    r#"CREATE TABLE IF NOT EXISTS shop_making_charges (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    metal_type  TEXT NOT NULL,
    charge_type TEXT NOT NULL DEFAULT 'per_gram',
    value       REAL NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_making_charges_profile
     ON shop_making_charges (profile_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // AUTOMOBILE — vehicle profiles + service jobs
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_vehicles ────────────────────────────────────────────────────────
    // Vehicle record linked to a customer.
    // One customer can have multiple vehicles.
    // Enables full service history per vehicle (VIN / chassis lookup).
    // Supports: auto workshop, car rental, automobile dealer service centre
    r#"CREATE TABLE IF NOT EXISTS shop_vehicles (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    customer_id   TEXT NOT NULL,
    make          TEXT NOT NULL,
    model         TEXT NOT NULL,
    year          INTEGER,
    color         TEXT,
    reg_number    TEXT,
    vin           TEXT,
    chassis_no    TEXT,
    engine_no     TEXT,
    fuel_type     TEXT,
    last_odometer INTEGER NOT NULL DEFAULT 0,
    insurance_exp INTEGER,
    notes         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_vehicles_customer
     ON shop_vehicles (customer_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_vehicles_profile
     ON shop_vehicles (profile_id)"#,
    // ── shop_service_jobs ────────────────────────────────────────────────────
    // Service / repair job card for a vehicle.
    // Links vehicle → document (invoice) → items (spare parts + labour).
    // odometer_in / out tracks km at drop-off and pickup.
    // status: received | diagnosing | in_progress | waiting_parts | ready | delivered
    r#"CREATE TABLE IF NOT EXISTS shop_service_jobs (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    vehicle_id    TEXT NOT NULL,
    customer_id   TEXT NOT NULL,
    document_id   TEXT,
    job_number    TEXT NOT NULL,
    complaint     TEXT,
    diagnosis     TEXT,
    odometer_in   INTEGER NOT NULL DEFAULT 0,
    odometer_out  INTEGER NOT NULL DEFAULT 0,
    staff_id      TEXT,
    status        TEXT NOT NULL DEFAULT 'received',
    received_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    promised_at   INTEGER,
    delivered_at  INTEGER,
    notes         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_service_jobs_number
     ON shop_service_jobs (profile_id, job_number)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_service_jobs_vehicle
     ON shop_service_jobs (vehicle_id)"#,
    // ══════════════════════════════════════════════════════════════════════════
    // ANALYTICS SUBSYSTEM
    // 
    // Two distinct analytical layers exist in BusinessKit:
    // 1. TIERED TIME-SERIES ROLLUPS (Relational snapshots for reports & AI Agents):
    //    - shop_daily_analytics:   Daily snapshot per (profile, date, item_type, service_mode)
    //    - shop_monthly_analytics: Monthly snapshot aggregated from shop_daily_analytics
    //    - shop_item_analytics:    Per-item daily performance (units, occupancy, revenue)
    //
    // 2. INSTANT HEADER CACHES (Single-row pre-serialized JSON caches for O(1) POS UI):
    //    - shop_billing_analytics:      1 row per profile holding lifetime KPIs + 7d/30d/12m JSON
    //    - shop_item_billing_analytics: 1 row per item holding lifetime KPIs + 7d/30d/12m JSON
    // ══════════════════════════════════════════════════════════════════════════

    // ── shop_daily_analytics ─────────────────────────────────────────────────
    // Daily profile-level summary segmented by item_type & service_mode.
    // item_type = 'all' and service_mode = 'all' for overall daily grand total.
    r#"CREATE TABLE IF NOT EXISTS shop_daily_analytics (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    snapshot_date    INTEGER NOT NULL,
    item_type        TEXT NOT NULL DEFAULT 'all',
    service_mode     TEXT NOT NULL DEFAULT 'all',
    orders_count     INTEGER NOT NULL DEFAULT 0,
    revenue          REAL NOT NULL DEFAULT 0,
    cost             REAL NOT NULL DEFAULT 0,
    gross_margin     REAL NOT NULL DEFAULT 0,
    gross_margin_pct REAL NOT NULL DEFAULT 0,
    discount_given   REAL NOT NULL DEFAULT 0,
    tax_collected    REAL NOT NULL DEFAULT 0,
    refunds          REAL NOT NULL DEFAULT 0,
    net_revenue      REAL NOT NULL DEFAULT 0,
    new_customers    INTEGER NOT NULL DEFAULT 0,
    repeat_customers INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_daily_analytics_segment
     ON shop_daily_analytics (profile_id, snapshot_date, item_type, service_mode)"#,

    // ── shop_monthly_analytics ───────────────────────────────────────────────
    // Monthly summary aggregated directly from shop_daily_analytics for high-speed trend queries.
    r#"CREATE TABLE IF NOT EXISTS shop_monthly_analytics (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    snapshot_month   INTEGER NOT NULL,
    item_type        TEXT NOT NULL DEFAULT 'all',
    service_mode     TEXT NOT NULL DEFAULT 'all',
    orders_count     INTEGER NOT NULL DEFAULT 0,
    revenue          REAL NOT NULL DEFAULT 0,
    cost             REAL NOT NULL DEFAULT 0,
    gross_margin     REAL NOT NULL DEFAULT 0,
    gross_margin_pct REAL NOT NULL DEFAULT 0,
    discount_given   REAL NOT NULL DEFAULT 0,
    tax_collected    REAL NOT NULL DEFAULT 0,
    refunds          REAL NOT NULL DEFAULT 0,
    net_revenue      REAL NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_monthly_analytics_segment
     ON shop_monthly_analytics (profile_id, snapshot_month, item_type, service_mode)"#,
    // ── shop_item_analytics ──────────────────────────────────────────────────
    // Per-item daily performance. Agent queries:
    //   "What sold most this week?" "Which service has best margin?"
    //   "Which hotel room had highest occupancy?"
    r#"CREATE TABLE IF NOT EXISTS shop_item_analytics (
    id                 TEXT PRIMARY KEY,
    profile_id         TEXT NOT NULL,
    item_id            TEXT NOT NULL,
    snapshot_date      INTEGER NOT NULL,
    units_sold         REAL NOT NULL DEFAULT 0,
    revenue            REAL NOT NULL DEFAULT 0,
    cost               REAL NOT NULL DEFAULT 0,
    gross_margin       REAL NOT NULL DEFAULT 0,
    discount_given     REAL NOT NULL DEFAULT 0,
    returns_qty        REAL NOT NULL DEFAULT 0,
    returns_value      REAL NOT NULL DEFAULT 0,
    reservations_made  INTEGER NOT NULL DEFAULT 0,
    cancellations      INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_item_analytics_date
     ON shop_item_analytics (item_id, snapshot_date)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_analytics_profile
     ON shop_item_analytics (profile_id, snapshot_date)"#,
    // ── shop_billing_analytics ───────────────────────────────────────────────
    // One row per profile. Lifetime totals are incremental (aggregated since
    // last_aggregated_at). 7d / 30d / 12m arrays are re-windowed on each visit.
    // Pattern mirrors cms_analytics.
    r#"CREATE TABLE IF NOT EXISTS shop_billing_analytics (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL UNIQUE,

    total_invoices    INTEGER NOT NULL DEFAULT 0,
    total_revenue     REAL    NOT NULL DEFAULT 0,
    total_profit      REAL    NOT NULL DEFAULT 0,
    total_cost        REAL    NOT NULL DEFAULT 0,

    -- JSON arrays: [{\"date\":\"YYYY-MM-DD\",\"revenue\":0,\"profit\":0,\"invoices\":0}]
    revenue_7d        TEXT NOT NULL DEFAULT '[]',
    revenue_30d       TEXT NOT NULL DEFAULT '[]',
    revenue_12m       TEXT NOT NULL DEFAULT '[]',

    profit_7d         TEXT NOT NULL DEFAULT '[]',
    profit_30d        TEXT NOT NULL DEFAULT '[]',
    profit_12m        TEXT NOT NULL DEFAULT '[]',

    -- Geo breakdown
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    state_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',

    -- Universal Book-Time & Occupancy Analytics
    total_reservations    INTEGER NOT NULL DEFAULT 0,
    total_cancellations   INTEGER NOT NULL DEFAULT 0,
    total_no_shows        INTEGER NOT NULL DEFAULT 0,
    total_booked_hours    REAL    NOT NULL DEFAULT 0,
    overall_occupancy_pct REAL    NOT NULL DEFAULT 0,
    capacity_utilization  REAL    NOT NULL DEFAULT 0,
    avg_booking_duration  REAL    NOT NULL DEFAULT 0,
    revpar                REAL    NOT NULL DEFAULT 0,

    -- Time-Series Arrays for Charts (JSON)
    occupancy_7d          TEXT    NOT NULL DEFAULT '[]',
    occupancy_30d         TEXT    NOT NULL DEFAULT '[]',
    occupancy_12m         TEXT    NOT NULL DEFAULT '[]',

    -- JSON objects: {"2025":50000,"2026":120000} — one entry per year for lifetime bar chart
    revenue_lifetime    TEXT NOT NULL DEFAULT '{}',
    profit_lifetime     TEXT NOT NULL DEFAULT '{}',
    invoices_lifetime   TEXT NOT NULL DEFAULT '{}',
    occupancy_lifetime  TEXT NOT NULL DEFAULT '{}',

    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_billing_analytics_profile
     ON shop_billing_analytics (profile_id)"#,
    // ── shop_item_billing_analytics ──────────────────────────────────────────
    // One row per (profile_id, item_id). Mirrors shop_billing_analytics but
    // scoped to a single product/service. Aggregated on demand via
    // shop_aggregate_item_billing_analytics command.
    r#"CREATE TABLE IF NOT EXISTS shop_item_billing_analytics (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    item_id           TEXT NOT NULL,
    item_name         TEXT NOT NULL DEFAULT '',

    total_invoices    INTEGER NOT NULL DEFAULT 0,
    total_units       REAL    NOT NULL DEFAULT 0,
    total_revenue     REAL    NOT NULL DEFAULT 0,
    total_profit      REAL    NOT NULL DEFAULT 0,
    total_cost        REAL    NOT NULL DEFAULT 0,
    total_discount    REAL    NOT NULL DEFAULT 0,

    -- Universal Book-Time & Operational Metrics
    total_reservations    INTEGER NOT NULL DEFAULT 0,
    total_cancellations   INTEGER NOT NULL DEFAULT 0,
    total_no_shows        INTEGER NOT NULL DEFAULT 0,
    total_booked_hours    REAL    NOT NULL DEFAULT 0,
    occupancy_pct         REAL    NOT NULL DEFAULT 0,
    capacity_utilization  REAL    NOT NULL DEFAULT 0,
    avg_booking_duration  REAL    NOT NULL DEFAULT 0,
    revpar                REAL    NOT NULL DEFAULT 0,

    occupancy_7d          TEXT    NOT NULL DEFAULT '[]',
    occupancy_30d         TEXT    NOT NULL DEFAULT '[]',
    occupancy_12m         TEXT    NOT NULL DEFAULT '[]',

    -- JSON arrays: [{"date":"YYYY-MM-DD","revenue":0,"profit":0,"units":0,"invoices":0}]
    revenue_7d        TEXT NOT NULL DEFAULT '[]',
    revenue_30d       TEXT NOT NULL DEFAULT '[]',
    revenue_12m       TEXT NOT NULL DEFAULT '[]',

    profit_7d         TEXT NOT NULL DEFAULT '[]',
    profit_30d        TEXT NOT NULL DEFAULT '[]',
    profit_12m        TEXT NOT NULL DEFAULT '[]',

    -- Geo breakdown: where this item was sold
    city_breakdown    TEXT NOT NULL DEFAULT '{}',
    state_breakdown   TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',

    -- JSON objects: {"2025":50000,"2026":120000}
    revenue_lifetime    TEXT NOT NULL DEFAULT '{}',
    profit_lifetime     TEXT NOT NULL DEFAULT '{}',
    invoices_lifetime   TEXT NOT NULL DEFAULT '{}',
    units_lifetime      TEXT NOT NULL DEFAULT '{}',
    occupancy_lifetime  TEXT NOT NULL DEFAULT '{}',

    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

    UNIQUE (profile_id, item_id)
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_billing_analytics_profile
     ON shop_item_billing_analytics (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_billing_analytics_item
     ON shop_item_billing_analytics (item_id)"#,
    r#"CREATE TABLE IF NOT EXISTS shop_shifts (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    staff_id       TEXT,
    opened_by      TEXT NOT NULL DEFAULT 'owner',
    closed_by      TEXT,
    opened_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    closed_at      INTEGER,
    opening_float  REAL NOT NULL DEFAULT 0,
    cash_sales     REAL NOT NULL DEFAULT 0,
    cash_refunds   REAL NOT NULL DEFAULT 0,
    cash_payouts   REAL NOT NULL DEFAULT 0,
    expected_cash  REAL NOT NULL DEFAULT 0,
    counted_cash   REAL,
    variance       REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'open',
    notes          TEXT,
    summary_json   TEXT NOT NULL DEFAULT '{}',
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_shifts_profile
     ON shop_shifts (profile_id, status, opened_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS demo_bills (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL DEFAULT 'default',
    original_invoice_id TEXT,
    doc_number          TEXT NOT NULL,
    doc_date            INTEGER NOT NULL,
    payment_mode        TEXT NOT NULL DEFAULT 'cash',
    customer_name       TEXT,
    customer_phone      TEXT,
    customer_address    TEXT,
    customer_gstin      TEXT,
    customer_dl_no      TEXT,
    subtotal            REAL NOT NULL DEFAULT 0,
    discount_amt        REAL NOT NULL DEFAULT 0,
    tax_amount          REAL NOT NULL DEFAULT 0,
    grand_total         REAL NOT NULL DEFAULT 0,
    notes               TEXT,
    lines_snapshot      TEXT NOT NULL DEFAULT '[]',
    user_id             TEXT,
    staff_id            TEXT,
    action              TEXT,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_demo_bills_profile
     ON demo_bills (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_demo_bills_original_inv
     ON demo_bills (original_invoice_id)"#,
];

use super::Migration;

pub const MIGRATIONS_SQL: &[Migration] = &[];
