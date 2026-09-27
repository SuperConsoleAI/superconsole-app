# Build Spec — Phase 4B: Auto-Posting, Payments, Reporting

Consolidated instruction file. Covers everything decided across this thread. Read before touching
`accounts.rs`, `tax.rs`, `shop-ops.rs`, or `commands/fin/`. Nothing here edits existing schema files
directly — migrations and new tables only, per house rule.

---

## 1. Migrations (small, additive, no existing column touched)

```sql
-- shop_vendors: GST compliance rating, manual entry v1 (real version needs GSP API access, later)
ALTER TABLE shop_vendors ADD COLUMN gst_compliance_rating INTEGER;

-- shop_document_lines: IMEI capture at point of sale (electronics/phone retailers)
ALTER TABLE shop_document_lines ADD COLUMN imei TEXT;
CREATE INDEX IF NOT EXISTS idx_shop_document_lines_imei
  ON shop_document_lines (imei) WHERE imei IS NOT NULL;

-- shop_orders: dedup key for future storefront webhook safety net
ALTER TABLE shop_orders ADD COLUMN gateway_payment_id TEXT;

-- shop_document_payments: dedup key for any gateway-sourced payment row
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_document_payments_gateway_ref
  ON shop_document_payments (profile_id, reference) WHERE reference IS NOT NULL;
```

Add all four to `MIGRATIONS_SQL` in the relevant schema files (`accounts.rs` for vendor rating,
`shop-ops.rs` for the other three). Not schema edits — these are the existing migration pattern.

---

## 2. One new table — gateway transaction staging (match-only, never posts to journal)

```sql
CREATE TABLE IF NOT EXISTS fin_gateway_transactions (
    id                   TEXT PRIMARY KEY,
    profile_id           TEXT NOT NULL,
    connection_id        TEXT NOT NULL,        -- FK to existing Connections table, NOT a new gateways table
    provider              TEXT NOT NULL,         -- razorpay | stripe | upi
    provider_txn_id       TEXT NOT NULL,
    amount                REAL NOT NULL,
    currency              TEXT NOT NULL DEFAULT 'INR',
    status                TEXT NOT NULL DEFAULT 'success',
    match_status          TEXT NOT NULL DEFAULT 'unmatched',  -- unmatched | matched | auto_created
    matched_document_id   TEXT,
    matched_payment_id    TEXT,
    received_at           INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    raw_payload            TEXT
);
CREATE UNIQUE INDEX idx_fin_gateway_txn_provider_ref
  ON fin_gateway_transactions (profile_id, provider, provider_txn_id);
```

Goes in `accounts.rs`. **Confirm the existing Connections table (used by `social_accounts` pattern)
has room for: encrypted API secret, webhook secret, publishable key.** If it's currently shaped only
for OAuth-style social connections, it may need a migration to add nullable columns for API-key-style
providers (payment gateways authenticate differently than social OAuth). Check before building the
gateway connect flow.

---

## 3. Commands to build — this is the actual work, not schema

### `commands/fin/journal.rs` — auto-posting engine
- On `shop_documents` status → `confirmed`: write `fin_journal_entries` + `fin_journal_lines`.
- doc_type → account mapping: **hardcoded Rust match statement**, not a rules table. Revisit only if
  a real user needs custom mappings.
- **CGST/SGST/IGST split logic lives here**: compare customer state (`shop_documents.state`) against
  the business's registered state (`fin_tax_configs.address` / a dedicated state field if one isn't
  already parsed out). Same state → split into CGST+SGST halves. Different state → IGST, full amount.
  This is the one genuinely new piece of tax logic — the components JSON already stores the result,
  this is what decides which components get populated.
- Balance check before every write: SUM(debit) == SUM(credit) or reject.

### `commands/fin/gst.rs` or extend `reports.rs` — per-vendor ITC report
- `get_vendor_itc_summary(profile_id)` — aggregates `fin_journal_lines` by `vendor_id` where account
  is a GST Input Credit account. Returns party name, ITC amount, balance. No new columns — pure query,
  same pattern as `shop_item_billing_analytics` but computed on demand rather than cached (cache later
  only if it's slow).

### `commands/fin/gateway.rs` (new file) — three-case payment handling
1. **POS with integrated reader (sync)**: app calls terminal SDK directly, gets synchronous
   success/fail, writes `shop_document_payments` with reference in the same transaction as the bill.
   No staging involved.
2. **Payment on another device**: owner marks `payment_mode` manually. No gateway call from our side,
   nothing to reconcile.
3. **Async off-platform (payment links, unattended QR)**: webhook → `fin_gateway_transactions` insert
   (idempotent via unique index) → attempt match against today's `shop_document_payments` (same
   amount, payment_mode in card/upi/razorpay, ±15–30 min window) → matched: link IDs, stop. Unmatched
   after grace window: create new `shop_documents`(doc_type=payment) + `shop_document_payments`,
   `match_status = auto_created`. Multiple ambiguous matches: leave unmatched, surface to owner —
   never auto-guess.

### Cloudflare Worker — webhook receiver (outside Tauri app entirely)
- Lives in `deploy/` alongside existing storefront Worker deployers.
- Verifies gateway signature, writes directly to the user's Turso UserDB via `v2/pipeline` HTTP API.
- Desktop app doesn't need to be running — it just reads whatever's already in the DB next launch.

### `reference` on `shop_document_payments` — no new column, two fill rules
The column already exists (`reference TEXT`, nullable). It doubles as the transaction ID / UTR /
gateway payment ID depending on path. Two rules, not two columns:
- **Off-platform (manual entry)**: `reference` stays null by default. Staff types one in only if the
  seller wants it recorded — never required, never blocks billing.
- **In-platform integrated gateway (reader/terminal)**: `reference` must be auto-populated by the app
  from the terminal SDK's synchronous response, every time, no exceptions — the app already has this
  value the instant the payment succeeds, there's no reason to leave it blank.
- Whether a payment is "gateway-verified" vs "manually noted" is **not a stored flag** — it's inferred
  by checking whether `reference` matches a `provider_txn_id` in `fin_gateway_transactions`. Don't add
  a boolean column for this; it'd just duplicate what's already derivable.

### Storefront checkout (`shop_orders` flow) — confirm synchronous
- CF Worker calls the gateway, gets result in the same request, updates `shop_orders.payment_status`
  directly. No webhook dependency for v1. `gateway_payment_id` migration above is the safety-net key
  if a webhook confirmation step gets added later.

---

## 4. Config decision, not code — Canada tax regime

Canada stacks GST (federal 5%) + HST/PST (provincial) — same shape as US sales tax stacking, not
single-rate VAT. No schema change: seed `fin_tax_configs.regime = 'GST_HST'` with the right
`fin_tax_rates.components` per province when building the Canada onboarding flow. Not urgent —
India/USA/Europe/UAE are fully covered today.

---

## 5. Explicitly NOT doing right now

- `fin_payment_gateways` as a standalone table — dropped, reuse Connections table instead
- `fin_journal_entries.created_by` (system/agent/manual) — dropped, `entry_type` (auto/manual)
  already covers it since agents never write journal entries directly, only the posting engine does
- Confidence-threshold / auto-apply columns for agents — add when the agent actually gets built,
  not before
- Proper serial-number inventory tracking (one row per physical unit, like a qty=1 batch) — IMEI
  column on `shop_document_lines` covers the real need (warranty lookup by IMEI); a dedicated
  `shop_item_serials` table is over-engineering until an electronics-heavy user asks for pre-sale
  serial tracking
- GST Rating automation via GSP API — manual column only, same "later" bucket as e-invoice/GSTR
  filing from the Busy gap analysis

---

## Build order

1. Four migrations (section 1) — five minutes of work, unblocks everything else
2. `fin_gateway_transactions` table + confirm Connections table has gateway-shaped credential fields
3. `commands/fin/journal.rs` — posting engine + CGST/SGST/IGST split logic (highest priority, this is
   the "accounts build auto when POS/online orders land" feature)
4. `commands/fin/gateway.rs` — three-case payment matching
5. CF Worker webhook receiver
6. `get_vendor_itc_summary` report
7. Canada regime seed data — whenever Canada onboarding actually gets built
