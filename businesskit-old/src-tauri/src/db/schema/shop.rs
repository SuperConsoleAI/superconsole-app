//! shop.rs — Item master schema
//! Path: src-tauri/src/db/schema/shop.rs
//!
//! What lives here: everything needed to display and sell items
//! on the public storefront and POS.
//!
//! Tables (8):
//!   shop_categories      — product category tree
//!   shop_brands          — brand / manufacturer master
//!   shop_units           — units of measurement (kg, piece, hour, night)
//!   shop_items           — every sellable thing (physical/service/event/stay/rental/bundle)
//!   shop_item_variants   — size / color / weight variants of an item
//!   shop_item_batches    — batch + expiry tracking (pharma, food, perishables)
//!   shop_barcodes        — multiple barcodes per item/variant for scanner billing
//!   shop_price_lists     — named price tiers (retail/wholesale/staff/happy-hours)

use crate::db::schema::Migration;

pub const SHOP_SCHEMA: &[&str] = &[
    // ── shop_categories ──────────────────────────────────────────────────────
    // Hierarchical product categories. parent_id = NULL means root category.
    // Example: Electronics → Phones → Android
    r#"CREATE TABLE IF NOT EXISTS shop_categories (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    parent_id   TEXT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    description TEXT,
    media_id    TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_default  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    attributes  TEXT NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_categories_profile
     ON shop_categories (profile_id)"#,
    // ── shop_brands ──────────────────────────────────────────────────────────
    // Brand master with full page customization support for brand storefront pages.
    r#"CREATE TABLE IF NOT EXISTS shop_brands (
    -- ── Core Identification ──
    id                 TEXT PRIMARY KEY,
    profile_id         TEXT NOT NULL,
    name               TEXT NOT NULL,
    slug               TEXT NOT NULL,
    country_origin     TEXT,
    website_url        TEXT,                        -- official brand website
    media_id           TEXT,                        -- brand logo media reference
    logo_url           TEXT,                        -- direct brand logo URL
    cover_image_url    TEXT,                        -- hero banner image for dedicated brand page

    -- ── Content & Story ──
    description        TEXT,                        -- rich brand description / story
    sections           TEXT NOT NULL DEFAULT '[]',   -- page builder layout sections (user_components blocks)
    faq                TEXT NOT NULL DEFAULT '[]',   -- brand FAQ schema JSON: [{ question, answer }]
    additional_details TEXT NOT NULL DEFAULT '{}',  -- key|value JSON metadata: { "Founded": "1994", "Headquarters": "Tokyo", ... }
    ai_summary         TEXT,                        -- AI summary for brand page & SEO

    -- ── SEO & Custom Styling ──
    seo_title          TEXT,                        -- brand page SEO Title
    seo_description    TEXT,                        -- brand page Meta Description
    seo_og_image       TEXT,                        -- brand page OpenGraph share image
    theme              TEXT DEFAULT '{}',           -- brand custom theme colors/fonts
    custom_css         TEXT,                        -- brand page custom CSS

    -- ── Status & Timestamps ──
    is_active          INTEGER NOT NULL DEFAULT 1,
    created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_brands_profile
     ON shop_brands (profile_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_brands_slug
     ON shop_brands (profile_id, slug)"#,
    // ── shop_units ───────────────────────────────────────────────────────────
    // How quantity is counted on every transaction.
    // Examples: piece, kg, litre, dozen, box, carton, hour, night, session.
    // is_decimal = 1 means 2.5 kg is valid; 0 means whole numbers only.
    r#"CREATE TABLE IF NOT EXISTS shop_units (
    id         TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    symbol     TEXT NOT NULL,
    unit_type  TEXT NOT NULL DEFAULT 'count',
    is_decimal INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_units_profile
     ON shop_units (profile_id)"#,
    // ── shop_items ───────────────────────────────────────────────────────────
    // The backbone. Every product, service, event, room, or rental starts here.
    //
    // item_type drives all logic:
    //   physical  → has stock, sold by qty (retail, pharmacy, grocery)
    //   service   → sold by time slot (salon, doctor, web dev, restaurant)
    //   event     → has date + seat capacity (concerts, workshops)
    //   stay      → booked by date range (hotel room, homestay)
    //   rental    → borrowed for a period (car, equipment)
    //   bundle    → group of other items sold together
    //
    // category_id links to the main categories table (cat_5 Store,
    // cat_8 Events, cat_25 Services, cat_30 Booking, cat_50 Stays, cat_51 Rentals)
    //
    // cost_price + price → margin = price - cost_price
    // track_inventory = 1 for physical goods only
    // item_meta = JSON bag for type-specific extras that are never filtered:
    //   event:   { event_date, venue, total_seats }
    //   stay:    { max_occupancy, amenities, check_in_time }
    //   service: { slot_duration_mins, buffer_mins }
    //   rental:  { deposit_amount, rental_unit }
    r#"CREATE TABLE IF NOT EXISTS shop_items (
    -- ── Core Identification ──
    id                 TEXT PRIMARY KEY,
    profile_id         TEXT NOT NULL,
    user_id            TEXT NOT NULL DEFAULT 'owner',
    updated_by         TEXT NOT NULL DEFAULT 'owner',
    link_id            TEXT,                        -- links table reference (auto-synced)
    affiliate_id       TEXT,                        -- shop_affiliates account reference
    item_type          TEXT NOT NULL DEFAULT 'physical',
    category_id        TEXT NOT NULL DEFAULT 'cat_6',
    shop_category_id   TEXT,                        -- shop_categories table reference
    parent_id          TEXT,                        -- parent shop_item reference (e.g. product bundles/sets)
    collection_id      TEXT,
    brand_id           TEXT,
    unit_id            TEXT,

    -- ── Basic Information ──
    name               TEXT NOT NULL,
    slug               TEXT NOT NULL,
    description        TEXT,
    external_url       TEXT,                        -- raw external landing URL (e.g. Amazon product page)
    sku                TEXT,
    barcode            TEXT,
    hsn_sac_code       TEXT,
    media_id           TEXT,
    media_url          TEXT,
    slider_id          TEXT,
    video_url          TEXT,
    video_media_id     TEXT,

    -- ── Pricing & Taxes ──
    price              REAL NOT NULL DEFAULT 0,
    cost_price         REAL NOT NULL DEFAULT 0,
    compare_price      REAL,
    default_mrp        REAL NOT NULL DEFAULT 0,    -- Maximum Retail Price ceiling
    unit_price         REAL NOT NULL DEFAULT 0,    -- Per-unit price calculation (e.g. ₹70/100g)
    discount_pct       REAL NOT NULL DEFAULT 0,    -- Default % discount
    extra_discount     REAL NOT NULL DEFAULT 0,    -- Secondary promo % discount (dis1 + dis2)
    currency           TEXT NOT NULL DEFAULT 'INR',
    tax_rate_id        TEXT,
    is_taxable         INTEGER NOT NULL DEFAULT 1,
    tax_inclusive      INTEGER NOT NULL DEFAULT 0,

    -- ── Weight, Dimensions & Packaging ──
    weight             REAL NOT NULL DEFAULT 0,
    weight_unit        TEXT NOT NULL DEFAULT 'kg',
    dim_length         REAL NOT NULL DEFAULT 0,
    width              REAL NOT NULL DEFAULT 0,
    height             REAL NOT NULL DEFAULT 0,
    dimension_unit     TEXT NOT NULL DEFAULT 'cm',
    pack_size          TEXT,                        -- Packaging spec (e.g. "15.00x1X10", "10 TAB", "100ml")
    conversion_factor  REAL NOT NULL DEFAULT 1,    -- Units per pack (e.g. 10 tablets per strip)
    scheme_on          REAL NOT NULL DEFAULT 0,    -- Buy criteria (e.g. Buy 10)
    scheme_free        REAL NOT NULL DEFAULT 0,    -- Bonus free units (e.g. Get 1 Free)
    country_of_origin  TEXT,

    -- ── Inventory & Status ──
    track_inventory    INTEGER NOT NULL DEFAULT 0,
    allow_backorder    INTEGER NOT NULL DEFAULT 0,
    is_active          INTEGER NOT NULL DEFAULT 1,
    is_featured        INTEGER NOT NULL DEFAULT 0,
    published          INTEGER NOT NULL DEFAULT 0,
    archived           INTEGER NOT NULL DEFAULT 0,
    archived_at        INTEGER,
    sort_order         INTEGER NOT NULL DEFAULT 0,

    -- ── Page Design, Content & Metadata ──
    sections           TEXT NOT NULL DEFAULT '[]',   -- layout sections (user_components blocks)
    hide_default_sections INTEGER NOT NULL DEFAULT 0, -- 1 = hide global cms.sections layout
    faq                TEXT NOT NULL DEFAULT '[]',   -- FAQ schema JSON: [{ question, answer }]
    additional_details TEXT NOT NULL DEFAULT '{}',  -- key|value JSON metadata: { "Warranty": "1 Year", ... }
    item_meta          TEXT NOT NULL DEFAULT '{}',   -- type-specific extras (booking, stays, rentals)
    options            TEXT NOT NULL DEFAULT '[]',   -- variant options JSON: [{ name: "Color", values: ["Red", "Blue"] }]
    variant_group_by   TEXT,                        -- default group_by preference (e.g. "Colour", "Size")
    has_variants       INTEGER NOT NULL DEFAULT 0,  -- 1 = has item variants in shop_item_variants
    ai_summary         TEXT,                        -- AI summary for product page / SEO
    tags               TEXT NOT NULL DEFAULT '[]',

    -- ── SEO & Social Metadata ──
    seo_title          TEXT,
    seo_description    TEXT,
    seo_og_image       TEXT,
    seo_robots         TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0,

    -- ── Reviews & Ratings ──
    avg_rating         REAL NOT NULL DEFAULT 0,
    review_count       INTEGER NOT NULL DEFAULT 0,

    -- ── Notes & Agent Memory ──
    notes              TEXT,                        -- Human/user notes, care instructions & handling rules
    agent_notes        TEXT,                        -- Dedicated agent operational memory & learned aliases/pricing nuances

    -- ── Timestamps ──
    created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_profile
     ON shop_items (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_user
     ON shop_items (profile_id, user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_archived
     ON shop_items (profile_id, archived)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_updated_by
     ON shop_items (profile_id, updated_by)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_type
     ON shop_items (profile_id, item_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_category
     ON shop_items (profile_id, category_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_shop_category
     ON shop_items (profile_id, shop_category_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_parent
     ON shop_items (profile_id, parent_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_tax_inclusive
     ON shop_items (profile_id, tax_inclusive)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_items_slug
     ON shop_items (profile_id, slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_collection
     ON shop_items (profile_id, collection_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_brand
     ON shop_items (profile_id, brand_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_brand_active
     ON shop_items (profile_id, brand_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_affiliate
     ON shop_items (profile_id, affiliate_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_link
     ON shop_items (profile_id, link_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_link_active
     ON shop_items (profile_id, link_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_media_id
     ON shop_items (profile_id, media_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_items_slider_id
     ON shop_items (profile_id, slider_id)"#,
    // ── shop_affiliates ──────────────────────────────────────────────────────
    // User affiliate accounts/networks master (Amazon, Flipkart, Impact, CJ, etc.)
    r#"CREATE TABLE IF NOT EXISTS shop_affiliates (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    name           TEXT NOT NULL,               -- e.g. "Amazon India Associates"
    platform       TEXT NOT NULL DEFAULT 'amazon', -- amazon | flipkart | impact | cj | shareasale | custom
    affiliate_tag  TEXT NOT NULL,               -- e.g. "myassoc-20"
    tag_param      TEXT NOT NULL DEFAULT 'tag', -- URL query parameter ("tag", "affid", "ref")
    base_domain    TEXT,                        -- e.g. "amazon.in"
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_affiliates_profile
     ON shop_affiliates (profile_id)"#,
    // ── shop_item_variants ───────────────────────────────────────────────────
    // Colour/size/weight variants of a parent item.
    // Each variant is its own stockable unit with its own price delta and SKU.
    // attributes JSON example: { "color": "Red", "size": "XL", "weight": "500g" }
    // price_delta is added to parent item price (can be negative for smaller sizes).
    r#"CREATE TABLE IF NOT EXISTS shop_item_variants (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    sku           TEXT,
    barcode       TEXT,
    price         REAL,
    price_delta   REAL NOT NULL DEFAULT 0,
    cost_price    REAL NOT NULL DEFAULT 0,
    compare_price REAL,
    default_mrp   REAL NOT NULL DEFAULT 0,
    unit_price    REAL NOT NULL DEFAULT 0,
    discount_pct  REAL NOT NULL DEFAULT 0,
    extra_discount REAL NOT NULL DEFAULT 0,
    stock_qty     REAL NOT NULL DEFAULT 0,
    media_id      TEXT,
    media_url     TEXT,
    slider_id     TEXT,
    hsn_sac_code  TEXT,
    weight        REAL NOT NULL DEFAULT 0,
    weight_unit   TEXT NOT NULL DEFAULT 'kg',
    dim_length    REAL NOT NULL DEFAULT 0,
    width         REAL NOT NULL DEFAULT 0,
    height        REAL NOT NULL DEFAULT 0,
    dimension_unit TEXT NOT NULL DEFAULT 'cm',
    pack_size     TEXT,
    conversion_factor REAL NOT NULL DEFAULT 1,
    scheme_on          REAL NOT NULL DEFAULT 0,    -- Buy criteria (e.g. Buy 10)
    scheme_free        REAL NOT NULL DEFAULT 0,    -- Bonus free units (e.g. Get 1 Free)
    country_of_origin TEXT,
    allow_backorder INTEGER NOT NULL DEFAULT 0,
    track_inventory INTEGER NOT NULL DEFAULT 1,
    tax_rate_id   TEXT,
    is_taxable    INTEGER NOT NULL DEFAULT 1,
    tax_inclusive INTEGER NOT NULL DEFAULT 0,
    attributes    TEXT NOT NULL DEFAULT '{}',
    color_hex     TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,

    -- ── SEO & Social Metadata ──
    seo_title          TEXT,
    seo_og_image       TEXT,
    seo_description    TEXT,
    seo_robots         TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0,

    notes         TEXT,
    agent_notes   TEXT,

    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_variants_item
     ON shop_item_variants (item_id)"#,
    // ── shop_item_batches ────────────────────────────────────────────────────
    // Batch tracking for pharma, food, ayurvedic, cosmetics, perishables.
    // One item can have multiple active batches with different expiry dates.
    // When you sell, you sell from a specific batch → complete audit trail.
    // qty_remaining updated by stock_ledger trigger when goods are sold.
    r#"CREATE TABLE IF NOT EXISTS shop_item_batches (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    variant_id     TEXT,
    batch_no       TEXT NOT NULL,
    mfg_date       INTEGER,
    expiry_date    INTEGER,
    qty_received   REAL NOT NULL DEFAULT 0,
    qty_remaining  REAL NOT NULL DEFAULT 0,
    purchase_price REAL NOT NULL DEFAULT 0,
    mrp            REAL NOT NULL DEFAULT 0,    -- Batch-specific Maximum Retail Price ceiling
    landing_cost   REAL NOT NULL DEFAULT 0,    -- Net landed cost per unit after free goods, discounts & taxes
    pack_size      TEXT,                        -- Packaging spec snapshot (e.g. "10x10 TAB")
    conversion_factor REAL NOT NULL DEFAULT 1, -- Units per pack
    warehouse_id   TEXT,
    shelf_location TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1,
    notes          TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_batches_item
     ON shop_item_batches (item_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_item_batches_expiry
     ON shop_item_batches (expiry_date)"#,
    // ── shop_barcodes ────────────────────────────────────────────────────────
    // One item can have multiple barcodes (manufacturer + your own + QR).
    // Tauri POS scans these to look up items instantly.
    // barcode_type: EAN13 | UPC | QR | CODE128 | custom
    r#"CREATE TABLE IF NOT EXISTS shop_barcodes (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    item_id      TEXT NOT NULL,
    variant_id   TEXT,
    barcode      TEXT NOT NULL,
    barcode_type TEXT NOT NULL DEFAULT 'EAN13',
    is_primary   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_barcodes_item
     ON shop_barcodes (item_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_barcodes_value
     ON shop_barcodes (profile_id, barcode)"#,
    // ── shop_price_lists ─────────────────────────────────────────────────────
    // Named price tiers per customer segment.
    // Examples: Retail, Wholesale, Staff Discount, Happy Hours (6–8pm only).
    //
    // valid_from_time / valid_until_time = "18:00" / "20:00" (24h, optional)
    // days_of_week = JSON array: ["mon","tue","wed","thu","fri"] (optional)
    // price_list_items = JSON map: { "item_id": override_price, ... }
    // discount_pct = global % off base price for all items not in price_list_items
    r#"CREATE TABLE IF NOT EXISTS shop_price_lists (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    currency         TEXT NOT NULL DEFAULT 'INR',
    discount_pct     REAL NOT NULL DEFAULT 0,
    price_list_items TEXT NOT NULL DEFAULT '{}',
    valid_from_time  TEXT,
    valid_until_time TEXT,
    days_of_week     TEXT NOT NULL DEFAULT '[]',
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_price_lists_profile
     ON shop_price_lists (profile_id)"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
