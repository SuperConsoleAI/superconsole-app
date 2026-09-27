//! accounts.rs — Accounts & Finance schema
//! Path: src-tauri/src/db/schema/accounts.rs
//!
//! What lives here: double-entry bookkeeping, bank reconciliation,
//! direct expenses. QuickBooks-level financial reporting from these 6 tables.
//! Prefix: fin_  (not shop_) — this domain works for ANY profession.
//! Auto-posting hooks into both fin_journal_entries from shop_documents
//! (retail/hospitality) AND from crm_invoices (service/freelance
//! businesses) — whichever billing table a business actually uses,
//! the books stay correct.
//!
//! The golden rule of double-entry: every transaction has equal debits + credits.
//! An invoice posted: debit Accounts Receivable, credit Sales Revenue.
//! A payment received: debit Bank/Cash, credit Accounts Receivable.
//!
//! Tables (6):
//!   fin_accounts         — chart of accounts (tree of all financial buckets)
//!   fin_journal_entries  — every financial event (auto-posted from documents)
//!   fin_journal_lines    — debit + credit lines per entry (must balance)
//!   fin_bank_accounts    — business bank accounts
//!   fin_bank_transactions — imported bank statement rows for reconciliation
//!   fin_expenses         — direct costs not tied to a vendor invoice

pub const ACCOUNTS_SCHEMA: &[&str] = &[
    // ── fin_accounts ────────────────────────────────────────────────────────
    // Chart of accounts — the tree of all financial buckets.
    // parent_id = NULL for root accounts. Nested via parent_id for grouping.
    //
    // account_type:
    //   asset     → things you own (cash, bank, inventory, receivables)
    //   liability → things you owe (payables, loans, tax payable)
    //   equity    → owner's stake (capital, retained earnings)
    //   income    → money earned (sales, service revenue, interest)
    //   expense   → money spent (rent, salary, cost of goods)
    //
    // account_subtype helps group reports:
    //   asset:    bank | cash | receivable | inventory | fixed_asset
    //   liability: payable | loan | tax_payable
    //   income:   revenue | other_income
    //   expense:  cogs | operating | admin | finance
    //
    // is_system = 1 → auto-created on setup, cannot be deleted
    // account_code = optional numeric code (1001=Cash, 4001=Sales Revenue)
    r#"CREATE TABLE IF NOT EXISTS fin_accounts (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    parent_id       TEXT,
    name            TEXT NOT NULL,
    account_code    TEXT,
    account_type    TEXT NOT NULL,
    account_subtype TEXT,
    description     TEXT,
    is_system       INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_accounts_profile
     ON fin_accounts (profile_id, account_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_accounts_parent
     ON fin_accounts (parent_id)"#,
    // ── fin_journal_entries ─────────────────────────────────────────────────
    // Every financial event in the business. Created automatically when a
    // shop_document is confirmed. Can also be created manually.
    //
    // What auto-posting looks like:
    //   Confirm invoice INV-001 for ₹10,000 + 18% GST (₹1,800):
    //     Entry: "Invoice INV-001 — Customer ABC"
    //     Lines:
    //       DR  Accounts Receivable     11,800
    //       CR  Sales Revenue           10,000
    //       CR  GST Payable (CGST)         900
    //       CR  GST Payable (SGST)         900
    //
    // entry_type: auto (from document) | manual
    // is_reconciled = 1 when matched against bank statement
    r#"CREATE TABLE IF NOT EXISTS fin_journal_entries (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    entry_date     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    narration      TEXT NOT NULL,
    document_id    TEXT,
    entry_type     TEXT NOT NULL DEFAULT 'auto',
    is_reconciled  INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_journal_entries_profile
     ON fin_journal_entries (profile_id, entry_date)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_journal_entries_doc
     ON fin_journal_entries (document_id)"#,
    // ── fin_journal_lines ───────────────────────────────────────────────────
    // The actual debit and credit lines per journal entry.
    // Rule: SUM(debit) must equal SUM(credit) for every entry_id. Always.
    // Every line maps to one account in the chart of accounts.
    //
    // Example from invoice above (entry_id = JE-001):
    //   id  entry_id  account_id          debit    credit
    //   1   JE-001    Accounts Receivable  11800    0
    //   2   JE-001    Sales Revenue        0        10000
    //   3   JE-001    GST Payable CGST     0        900
    //   4   JE-001    GST Payable SGST     0        900
    //   Total:                             11800    11800  ✓
    r#"CREATE TABLE IF NOT EXISTS fin_journal_lines (
    id         TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    entry_id   TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit      REAL NOT NULL DEFAULT 0,
    credit     REAL NOT NULL DEFAULT 0,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_entry
     ON fin_journal_lines (entry_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_account
     ON fin_journal_lines (account_id)"#,
    // ── fin_bank_accounts ───────────────────────────────────────────────────
    // Business bank accounts registered in the system.
    // account_id links to a bank-type entry in fin_accounts (chart of accounts).
    // opening_balance = starting balance when account was added to the system.
    //
    // account_type: current | savings | overdraft | credit_card
    // ifsc_code = India bank branch code (11 chars)
    // swift_code = International wire transfer code
    r#"CREATE TABLE IF NOT EXISTS fin_bank_accounts (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    bank_name       TEXT NOT NULL,
    account_number  TEXT,
    ifsc_code       TEXT,
    swift_code      TEXT,
    account_type    TEXT NOT NULL DEFAULT 'current',
    opening_balance REAL NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'INR',
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_bank_accounts_profile
     ON fin_bank_accounts (profile_id)"#,
    // ── fin_bank_transactions ───────────────────────────────────────────────
    // Imported bank statement rows — used for reconciliation.
    // You import your bank CSV/PDF → rows land here.
    // Then you match each row to a journal_entry to confirm nothing is missing.
    //
    // is_reconciled = 0 → unmatched (needs attention)
    // is_reconciled = 1 → matched to a journal_entry_id
    //
    // debit  = money leaving your account (payment sent)
    // credit = money entering your account (payment received)
    // balance = running balance as shown in bank statement
    r#"CREATE TABLE IF NOT EXISTS fin_bank_transactions (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    bank_account_id  TEXT NOT NULL,
    txn_date         INTEGER NOT NULL,
    description      TEXT,
    debit            REAL NOT NULL DEFAULT 0,
    credit           REAL NOT NULL DEFAULT 0,
    balance          REAL NOT NULL DEFAULT 0,
    reference        TEXT,
    journal_entry_id TEXT,
    is_reconciled    INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_bank_transactions_account
     ON fin_bank_transactions (bank_account_id, txn_date)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_bank_transactions_reconciled
     ON fin_bank_transactions (profile_id, is_reconciled)"#,
    // ── fin_expenses ────────────────────────────────────────────────────────
    // Direct business costs not linked to a vendor invoice or purchase order.
    // Examples: cash rent paid, petrol receipt, office supplies bought at a shop.
    //
    // These are expenses you paid directly — not through a vendor credit cycle.
    // On save: auto-posts a journal entry (DR Expense Account, CR Bank/Cash).
    //
    // category: Rent | Travel | Marketing | Utilities | Salary | Maintenance | Other
    // account_id → fin_accounts.id (which expense account to debit)
    // paid_by = name of person who paid (cash reimbursement tracking)
    // receipt_media_id → media.id (photo of physical receipt)
    // is_reimbursable = 1 means employee paid and needs to be paid back
    r#"CREATE TABLE IF NOT EXISTS fin_expenses (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    expense_date     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    category         TEXT NOT NULL,
    account_id       TEXT,
    amount           REAL NOT NULL DEFAULT 0,
    tax_amount       REAL NOT NULL DEFAULT 0,
    total_amount     REAL NOT NULL DEFAULT 0,
    payment_mode     TEXT NOT NULL DEFAULT 'cash',
    paid_by          TEXT,
    vendor_id        TEXT,
    receipt_media_id TEXT,
    description      TEXT,
    document_id      TEXT,
    is_reimbursable  INTEGER NOT NULL DEFAULT 0,
    journal_entry_id TEXT,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_expenses_profile
     ON fin_expenses (profile_id, expense_date)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fin_expenses_doc
     ON fin_expenses (profile_id, document_id)"#,
    // ── fin_gateway_transactions ─────────────────────────────────────────────
    // Staging table for payment gateway webhooks & terminal transactions.
    // Match-only — never posts directly to journal. Reconciled against shop_document_payments.
    // connection_id links to connections table.
    // match_status: unmatched | matched | auto_created
    r#"CREATE TABLE IF NOT EXISTS fin_gateway_transactions (
    id                   TEXT PRIMARY KEY,
    profile_id           TEXT NOT NULL,
    connection_id        TEXT NOT NULL,
    provider             TEXT NOT NULL,
    provider_txn_id      TEXT NOT NULL,
    amount               REAL NOT NULL,
    currency             TEXT NOT NULL DEFAULT 'INR',
    status               TEXT NOT NULL DEFAULT 'success',
    match_status         TEXT NOT NULL DEFAULT 'unmatched',
    matched_document_id  TEXT,
    matched_payment_id   TEXT,
    received_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    raw_payload          TEXT
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_gateway_txn_provider_ref
     ON fin_gateway_transactions (profile_id, provider, provider_txn_id)"#,
];
use super::Migration;

/// ALTER TABLE migrations for fin_accounts tables.
pub const MIGRATIONS_SQL: &[Migration] = &[
    // placeholder — add column migrations here as schema evolves
];
