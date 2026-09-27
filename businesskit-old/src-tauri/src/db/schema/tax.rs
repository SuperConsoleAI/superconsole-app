//! tax.rs — Tax & Compliance schema
//! Path: src-tauri/src/db/schema/tax.rs
//!
//! What lives here: all tax configuration and compliance tracking.
//! Prefix: fin_  (not shop_) — this domain works for ANY profession,
//! not just businesses selling physical/bookable items. A freelancer,
//! lawyer, or consultant with zero shop_items can still set up a tax
//! regime and file returns using these tables alone.
//!
//! Designed regime-agnostic: one schema handles India GST, UK/EU VAT,
//! US Sales Tax, Gulf VAT, or exempt — set once per profile.
//!
//! Tables (8):
//!   fin_tax_configs      — regime setup per profile (GST / VAT / Sales Tax / exempt)
//!   fin_tax_rates        — named rates with component breakdown
//!   fin_hsn_sac_codes    — HSN (goods) + SAC (services) codes for India
//!   fin_gst_returns      — GSTR-1, GSTR-3B, GSTR-2B filing tracker
//!   fin_einvoice_log     — India e-invoice IRN + QR records
//!   fin_eway_bill_log    — India e-way bill for goods movement
//!   fin_tds_tcs_entries  — TDS deducted + TCS collected (India)
//!   fin_currency_rates   — daily exchange rates for multi-currency billing

pub const TAX_SCHEMA: &[&str] = &[
    // ── fin_tax_configs ─────────────────────────────────────────────────────
    // One row per profile. Sets the tax world this business lives in.
    // Changing country = new row. Zero schema changes needed.
    //
    // regime values:
    //   GST        → India. Components: CGST, SGST, IGST, CESS
    //   VAT        → UK, EU, Gulf. Single rate component.
    //   SALES_TAX  → US. Stacked: state + county + city rates.
    //   EXEMPT     → No tax. Zero-rated businesses.
    //
    // components JSON = names of tax parts for this regime:
    //   GST:       ["CGST","SGST","IGST","CESS"]
    //   VAT:       ["VAT"]
    //   SALES_TAX: ["STATE","COUNTY","CITY"]
    //
    // fiscal_year_start = MM-DD:
    //   India: "04-01" (April 1)
    //   Most others: "01-01" (January 1)
    //
    // einvoice_enabled = 1 for India B2B invoices above ₹5Cr annual turnover
    // eway_enabled = 1 for India goods movement above ₹50K value
    r#"CREATE TABLE IF NOT EXISTS fin_tax_configs (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL UNIQUE,
    regime              TEXT NOT NULL DEFAULT 'GST',
    country             TEXT NOT NULL DEFAULT 'IN',
    currency            TEXT NOT NULL DEFAULT 'INR',
    gstin               TEXT,
    legal_name          TEXT,
    pan                 TEXT,
    tan                 TEXT,
    vat_number          TEXT,
    tax_id              TEXT,
    dl_no               TEXT,                              -- Drug License No. (pharma/medical businesses)
    address             TEXT,                              -- Full business address printed on invoices
    postal_code         TEXT,                              -- Postal / PIN / ZIP code for tax invoices & e-way logistics
    invoice_terms       TEXT,                              -- Payment/delivery terms printed at invoice footer
    phone               TEXT,                              -- Business contact number printed on invoices
    state_code          TEXT,                              -- e.g. "BIHAR[10]"
    default_bill_design TEXT NOT NULL DEFAULT 'dotmatrix', -- dotmatrix | thermal | standard
    header_top_text     TEXT NOT NULL DEFAULT '[ OM ]',    -- e.g. "[ OM ]"
    invoice_title_text  TEXT NOT NULL DEFAULT '[ GST INVOICE ]', -- e.g. "[ GST INVOICE ]"
    digital_sign_url    TEXT,                              -- Digital signature image URL or data
    signatory_name      TEXT,                              -- Name printed under signature
    jurisdiction_city   TEXT,                              -- e.g. "PATNA"
    auto_print_enabled  INTEGER NOT NULL DEFAULT 0,        -- 1 = Auto-print receipt on POS bill settlement
    pos_printer_type    TEXT NOT NULL DEFAULT 'system',    -- system | escpos_network
    pos_printer_ip      TEXT NOT NULL DEFAULT '',          -- IP:port for ESC/POS network thermal printer
    filing_frequency    TEXT NOT NULL DEFAULT 'monthly',
    lut_number          TEXT,                              -- Letter of Undertaking for zero-rated exports/SEZ (e.g. "AD270324000123A")
    lut_valid_until     INTEGER,                           -- LUT expiration timestamp
    einvoice_enabled    INTEGER NOT NULL DEFAULT 0,
    eway_enabled        INTEGER NOT NULL DEFAULT 0,
    tax_mode            TEXT NOT NULL DEFAULT 'item',      -- 'item' (per shop_items) | 'global' (flat checkout rate)
    global_tax_rate     REAL,                              -- flat % rate applied at checkout when tax_mode = 'global'
    global_tax_rate_id  TEXT,                              -- optional reference to fin_tax_rates for global rate
    tax_inclusive       INTEGER NOT NULL DEFAULT 0,        -- 1 = All store prices include tax (MRP pricing), 0 = Tax added on top
    watermark           INTEGER NOT NULL DEFAULT 1,        -- 1 = Print "Bill Generated on BusinessKit App" watermark at footer
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    // ── fin_tax_rates ───────────────────────────────────────────────────────
    // Named tax rates. Referenced by shop_items.tax_rate_id and
    // shop_document_lines.tax_rate_id (snapshot on every transaction).
    //
    // rate_pct = aggregate % shown to user (GST 18%, VAT 20%)
    // components JSON = breakdown per part:
    //   GST 18%:  { "cgst": 9, "sgst": 9, "igst": 18, "cess": 0 }
    //   VAT 20%:  { "vat": 20 }
    //   US 8.5%:  { "state": 6, "county": 1.5, "city": 1 }
    //   Zero:     { "cgst": 0, "sgst": 0, "igst": 0 }
    r#"CREATE TABLE IF NOT EXISTS fin_tax_rates (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    rate_pct    REAL NOT NULL DEFAULT 0,
    components  TEXT NOT NULL DEFAULT '{}',
    is_default  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_tax_rates_profile
     ON fin_tax_rates (profile_id)"#,
    // ── fin_hsn_sac_codes ───────────────────────────────────────────────────
    // HSN = Harmonised System of Nomenclature (goods codes)
    // SAC = Services Accounting Code
    // Required on every Indian GST invoice. Maps a code to a default tax rate.
    // Non-India businesses can ignore this table entirely.
    //
    // code_type: HSN | SAC
    // tax_rate_id → fin_tax_rates.id (default rate for items under this code)
    r#"CREATE TABLE IF NOT EXISTS fin_hsn_sac_codes (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    code        TEXT NOT NULL,
    code_type   TEXT NOT NULL DEFAULT 'HSN',
    description TEXT,
    tax_rate_id TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_hsn_sac_codes_code
     ON fin_hsn_sac_codes (profile_id, code)"#,
    // ── fin_tax_returns ─────────────────────────────────────────────────────
    // Regime-agnostic tax return filing tracker (renamed & generalized from fin_gst_returns).
    // Serves India GST (GSTR1/3B), UK/EU VAT returns, and US Sales Tax state filings.
    //
    // regime: GST | VAT | SALES_TAX
    // return_type: GSTR1 | GSTR3B | VAT200 | SALES_TAX_STATE
    // period = 'MM-YYYY' or 'Q1-2025'
    // tax_breakdown JSON = {"cgst":X,"sgst":X} or {"vat":X} or {"state":X,"county":X}
    // credit_claimed = Input Tax Credit (GST) / Input VAT (VAT) offset
    // net_liability = total_tax - credit_claimed
    // status: draft | filed | late_filed
    r#"CREATE TABLE IF NOT EXISTS fin_tax_returns (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    regime         TEXT NOT NULL DEFAULT 'GST',
    return_type    TEXT NOT NULL,
    period         TEXT NOT NULL,
    total_taxable  REAL NOT NULL DEFAULT 0,
    total_tax      REAL NOT NULL DEFAULT 0,
    tax_breakdown  TEXT NOT NULL DEFAULT '{}',
    credit_claimed REAL NOT NULL DEFAULT 0,
    net_liability  REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'draft',
    filed_at       INTEGER,
    arn            TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_tax_returns_profile
     ON fin_tax_returns (profile_id, period)"#,
    // ── fin_tax_exemptions ──────────────────────────────────────────────────
    // B2B Tax Exemption & Reverse Charge tracking.
    // US Resale Certificates, EU Reverse Charge, Diplomatic & Non-profit exemptions.
    //
    // exemption_type: resale_certificate | reverse_charge | diplomatic | nonprofit | export
    r#"CREATE TABLE IF NOT EXISTS fin_tax_exemptions (
    id                 TEXT PRIMARY KEY,
    profile_id         TEXT NOT NULL,
    party_id           TEXT NOT NULL,
    exemption_type     TEXT NOT NULL,
    certificate_number TEXT,
    valid_from         INTEGER,
    valid_until        INTEGER,
    document_media_id  TEXT,
    notes              TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1,
    created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_tax_exemptions_party
     ON fin_tax_exemptions (profile_id, party_id)"#,
    // ── fin_tax_nexus ───────────────────────────────────────────────────────
    // US Economic & Physical Nexus compliance tracking per jurisdiction.
    //
    // nexus_type: economic | physical
    r#"CREATE TABLE IF NOT EXISTS fin_tax_nexus (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    state_code       TEXT NOT NULL,
    nexus_type       TEXT NOT NULL DEFAULT 'economic',
    threshold_amount REAL NOT NULL DEFAULT 100000,
    threshold_txns   INTEGER NOT NULL DEFAULT 200,
    current_ytd_sales REAL NOT NULL DEFAULT 0,
    current_ytd_txns INTEGER NOT NULL DEFAULT 0,
    registered       INTEGER NOT NULL DEFAULT 0,
    registered_at    INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_tax_nexus_state
     ON fin_tax_nexus (profile_id, state_code)"#,
    // ── fin_einvoice_log ────────────────────────────────────────────────────
    // India e-invoice records. Mandatory for B2B invoices above ₹5Cr turnover.
    // IRP = Invoice Registration Portal (government system).
    //
    // irn   = Invoice Reference Number (64-char hash, unique per invoice)
    // ack_no = Acknowledgement number from IRP
    // qr_code = QR code data string — embedded on printed invoice
    // signed_invoice = full signed JSON from IRP (store for audit)
    //
    // status: pending | generated | cancelled | error
    r#"CREATE TABLE IF NOT EXISTS fin_einvoice_log (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    document_id    TEXT NOT NULL,
    irn            TEXT,
    ack_number     TEXT,
    ack_date       INTEGER,
    qr_code        TEXT,
    signed_invoice TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    error_msg      TEXT,
    cancel_date    INTEGER,
    cancel_reason  TEXT,
    cancel_remarks TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_einvoice_log_doc
     ON fin_einvoice_log (document_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_einvoice_log_irn
     ON fin_einvoice_log (irn)"#,
    // ── fin_eway_bill_log ───────────────────────────────────────────────────
    // India e-way bill records.
    // Required when moving goods worth ₹50K+ between states (or within some states).
    // Linked to a shop_document (delivery_note or invoice).
    //
    // valid_upto = datetime when the bill expires (distance-based)
    // status: pending | generated | cancelled | expired
    r#"CREATE TABLE IF NOT EXISTS fin_eway_bill_log (
    id                   TEXT PRIMARY KEY,
    profile_id           TEXT NOT NULL,
    document_id          TEXT NOT NULL,
    ewb_number           TEXT,
    ewb_date             INTEGER,
    valid_upto           INTEGER,
    vehicle_number       TEXT,
    transport_mode       TEXT NOT NULL DEFAULT 'road',
    transporter_id       TEXT,
    transporter_doc_no   TEXT,
    transporter_doc_date INTEGER,
    distance_km          INTEGER NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'pending',
    error_msg            TEXT,
    cancel_date          INTEGER,
    cancel_reason        TEXT,
    created_at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_eway_bill_log_doc
     ON fin_eway_bill_log (document_id)"#,
    // ── fin_tds_tcs_entries ─────────────────────────────────────────────────
    // India TDS (Tax Deducted at Source) and TCS (Tax Collected at Source).
    //
    // TDS = you deduct tax from vendor payment before paying them
    //   e.g. pay contractor ₹10,000, deduct TDS ₹1,000, pay ₹9,000
    //
    // TCS = you collect tax from buyer on top of sale price
    //   e.g. sell scrap for ₹1,00,000, collect TCS ₹1,000 extra
    //
    // entry_type: TDS | TCS
    // section_code: '194C' (contractors), '194Q' (goods purchase), '206C' (scrap) etc.
    // challan_no = government payment challan reference after depositing with IT dept
    // period = 'MM-YYYY'
    r#"CREATE TABLE IF NOT EXISTS fin_tds_tcs_entries (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    entry_type     TEXT NOT NULL,
    document_id    TEXT,
    section_code   TEXT NOT NULL,
    party_id       TEXT,
    base_amount    REAL NOT NULL DEFAULT 0,
    rate_pct       REAL NOT NULL DEFAULT 0,
    tds_tcs_amount REAL NOT NULL DEFAULT 0,
    challan_no     TEXT,
    deposited_at   INTEGER,
    period         TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_tds_tcs_profile
     ON fin_tds_tcs_entries (profile_id, period)"#,
    // ── fin_currency_rates ──────────────────────────────────────────────────
    // Daily exchange rates for multi-currency billing.
    // Base currency is set in fin_tax_configs.currency.
    // Rate means: 1 from_currency = rate × to_currency
    //   e.g. from=USD, to=INR, rate=84.5 → 1 USD = ₹84.50
    //
    // source: manual | RBI | ECB | open_exchange_rates
    r#"CREATE TABLE IF NOT EXISTS fin_currency_rates (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency   TEXT NOT NULL,
    rate          REAL NOT NULL,
    rate_date     INTEGER NOT NULL,
    source        TEXT NOT NULL DEFAULT 'manual',
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_currency_rates_date
     ON fin_currency_rates (profile_id, from_currency, to_currency, rate_date)"#,
];
