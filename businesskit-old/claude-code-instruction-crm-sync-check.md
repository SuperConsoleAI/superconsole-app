# Instruction: Verify 3 Open Items Before Building CRM/Loyalty UI

> For Claude Code, run against the real repo (`/Users/2.o/businesskit`).
> These are read-only checks — report findings, don't change schema yet.
> Source: customer-crm-hospitality-gap-check.md, Part 2 / Part 2.6.

---

## Check 1 — CRM → `shop_customers` sync direction

**Files to read:** `src-tauri/src/commands/crm.rs`, and wherever
`shop_customers` rows are created/updated (search for `INSERT INTO
shop_customers` and `UPDATE shop_customers` across `src-tauri/src/commands/`).

**Question:** When a `shop_customers` row is created and linked via
`contact_id` to `crm_contacts`, does anything later read back from
`crm_contacts` / `crm_groups` / `crm_contact_groups` (e.g. at billing time,
or when building a campaign audience) — or is the link write-once at
creation with no read-back path?

**Why it matters:** If write-once, a customer added to a CRM group next
month won't show up in a loyalty/SMS campaign pulled from `shop_customers`,
even though the tables technically link. This blocks Part 1's "customer
labels for campaign targeting" claim of "no gap."

**Report back:** Which of these is true —
(a) live join at query time (no gap, ship campaign UI as-is)
(b) denormalized snapshot copied once, never refreshed (real gap — flag
    fields that go stale and how they should be refreshed)
(c) no relationship consulted anywhere outside initial creation (real gap —
    campaign audience queries need to join `crm_contact_groups` via
    `shop_customers.contact_id` directly, not rely on `shop_customers` alone)

---

## Check 2 — Does `crm_contacts` already have DOB / anniversary fields?

**File to read:** `src-tauri/src/db/schema/crm.rs`, `crm_contacts` table
definition.

**Question:** Does `crm_contacts` have a date-of-birth or anniversary
column already? 

**Report back:**
- If yes → note exact column name(s) and type. Birthday-campaign feature
  needs zero new columns, just query `shop_customers JOIN crm_contacts ON
  contact_id` filtered by month/day.
- If no → that's the one real missing field from the original gap doc.
  Recommend adding to `crm_contacts` (not `shop_customers` — CRM owns
  identity, shop_customers owns transactional/loyalty data).

---

## Check 3 — Does `connections` generalize to calendar/iCal sync?

**File to read:** `src-tauri/src/db/schema/*.rs` — find the `connections`
table definition (likely in a shared/core schema file, not yet reflected
in the mirrored docs).

**Question:** Does `connections` have a generic `connection_type` +
arbitrary config JSON (e.g. `config TEXT DEFAULT '{}'`), or is it scoped
specifically to order-flow aggregators (Zomato/Swiggy-style webhook
configs with fixed columns)?

**Report back:**
- If generic (type + JSON config) → confirm a new `connection_type:
  ics_calendar` row per `shop_locations.id` is enough to store an
  import/export `.ics` URL. Zero new tables — just document the config
  shape expected: `{ "location_id": "...", "ics_import_url": "...",
  "ics_export_token": "...", "last_synced_at": ... }`.
- If order-specific (fixed columns per aggregator) → flag that iCal sync
  needs either (a) new columns bolted onto `connections` (risk: pollutes
  an order-specific table with unrelated concept), or (b) a small
  dedicated table. Don't decide here — just report which situation we're
  in and hand back for a decision.

---

## Output format

One short paragraph per check, plain findings, no schema edits. This
feeds directly into two follow-up instruction files (wallet ledger,
SMS/WhatsApp channel generalization) that assume answers to Check 1 and
Check 2 are resolved first.
