# Customer CRM & Hospitality Gap Check

> Compared against Petpooja's CRM/Loyalty/Marketplace add-ons and
> Airbnb-host requirements. Same rule as the tax gap check: only
> flag what's a real schema gap, not what's just missing UI.

---

## Part 1 — Restaurant CRM & Loyalty (vs Petpooja)

| Petpooja sells this | You have | Gap |
|---|---|---|
| Customer labels for campaign targeting | `crm_groups` + `crm_contact_groups` | **No gap** — already there, just needs `shop_customers.contact_id` wired so a walk-in customer inherits CRM groups |
| SMS marketing campaigns (birthday/offer blasts) | `email_campaigns`, `email_templates`, `email_tracking_events` (email-only) | **Real gap** — no SMS/WhatsApp campaign table. Fix: generalize `email_*` → add `channel` column (`email`\|`sms`\|`whatsapp`), same move you made on `fin_gst_returns` → `fin_tax_returns`. Zero new tables. |
| Loyalty points earned/redeemed at billing, OTP-redeem, expiry rules | `shop_customers.loyalty_pts` (single running number) | **Real gap** — it's a balance, not a ledger. You can't answer "when did this customer earn these points" or expire them individually. Same problem `shop_stock_ledger` solves for inventory. |
| Wallet top-up (cash/card/UPI) customers can spend down | Nothing | **Real gap** — no wallet/store-credit balance separate from loyalty points. Real money in ≠ reward points. |
| Customer feedback per visit (app/SMS/QR-on-bill) | `review.rs` — standalone reviews app, connects generically to blog/shop/etc | **No gap** — that's the right shape, one review system for every subject type instead of a per-domain reviews table. Only add if speed demands it: 2 lookup columns (`guest_review_id`, `host_review_id` or similar) directly on the order/reservation row, so a listing page doesn't have to join `reviews` for every row. Fast-lookup denormalization, not a schema gap. |
| Blacklist/block a customer from promos or loyalty | `shop_customers.is_active` | **Partial** — `is_active` is a hard on/off for the whole customer record. No separate "blocked from promotions" flag. Minor — can piggyback on `notes` or wait for real demand. |
| Birthday/anniversary auto-campaigns | Not on `shop_customers` | **Check `crm_contacts`** — if DOB lives there already, no gap, just pull via `contact_id`. If not, that's the one field actually missing. |
| Table Reservation Manager — one screen for Zomato Dining, District, EazyDiner, own link, walk-ins | `shop_reservations` has no source field | **Real gap** — see Part 3, shared with hospitality. |

### Fix: one new table — `shop_loyalty_ledger`
Mirrors `shop_stock_ledger` exactly — append-only, never updated:

```
id, profile_id, customer_id, entry_type (earn|redeem|expire|adjust|wallet_topup|wallet_redeem),
points_delta, wallet_delta, document_id, reason, expires_at, created_at
```

`shop_customers.loyalty_pts` and a new `wallet_balance` column become denormalized
running totals — same relationship `shop_stock_ledger` has to on-hand stock. One
table gets you points history, wallet, and expiry in one shot.

---

## Part 2 — `crm_contacts` ↔ `shop_customers` sync direction

Not a schema question — moved to its own instruction file for Claude Code to
verify against `commands/crm.rs` and `commands/shop_customers` before any
loyalty/campaign UI gets built on top of it: see
`claude-code-instruction-crm-sync-check.md`.

---

## Part 2.5 — Restaurant order type: Dine-in / Delivery / Takeaway

This is the gap that actually matters most for restaurant reporting, and it's
missing from both `shop_documents` and `shop_orders`.

What exists today is **channel** — *how* the order entered the system
(`dashboard | pos | online | whatsapp | api` on `shop_documents`,
`online | pos | whatsapp | instagram | app` on `shop_orders`). That answers
"which app/aggregator." It does not answer **service mode** — *how the food
reaches the customer* — which is the exact split Petpooja reports on
("Dine In, Website, Delivery, Take Away" sales chart) and the split every
restaurant owner actually asks for at close of day.

`location_id` being set implies dine-in, but delivery vs. takeaway are
currently indistinguishable, and there's no single column to group by.

**Fix — one column, no new table:**
```
shop_documents.service_mode TEXT NOT NULL DEFAULT 'dine_in'
  -- dine_in | takeaway | delivery | drive_thru
```
Mirror the same column on `shop_orders` for online-placed orders. This is a
straight sibling to `channel`, not a replacement — `channel` says where the
order came from, `service_mode` says how it's fulfilled. Both needed,
neither substitutes for the other.

---

## Part 2.6 — Aggregator & delivery-agent integrations

You already have a `connections` table for external API integrations
(aggregators, B2B delivery agents) — this is the right shape and covers what
Petpooja sells separately as "Online Order Management" (single dashboard for
all aggregators) and delivery-agent access. **No new table needed here.**

The one thing worth re-checking: does the existing `connections` table
generalize to *calendar/availability* sync (iCal import/export for
`shop_locations`, the Airbnb-host gap in Part 3) or is it scoped to
order-only integrations (Zomato/Swiggy webhook style)? If it's already
generic (`connection_type`, arbitrary config JSON), the iCal gap in Part 3
is zero new tables — just a new `connection_type: ics_calendar` row per
location. If it's order-specific, that's worth knowing before assuming
Airbnb-style sync is "already solved."

---

## Part 3 — Hospitality / Airbnb-host gaps (`shop_locations`, `shop_reservations`)

| Airbnb host needs | You have | Gap |
|---|---|---|
| Know which platform a booking came from (Airbnb, Booking.com, own site, walk-in) | `shop_reservations` — no source/channel field | **Real gap** — same one restaurant table-booking needs. Fix: add `source_channel TEXT` + `meta TEXT DEFAULT '{}'` to `shop_reservations`. It currently has `notes` but no `meta` JSON, unlike every other core table (`shop_documents`, `shop_items`, `shop_orders` all have `meta`). That's the actual oversight. |
| Seasonal/weekend pricing, not one flat rate | `shop_locations.base_rate` — single value | **Real gap** — no date-based rate calendar. Fix: add `rate_overrides TEXT DEFAULT '{}'` JSON to `shop_locations`: `{"2026-12-24": 5000, "2026-12-25": 6000}`. One column, no new table. |
| Minimum/maximum nights, check-in/out times, house rules | Not present | **Real gap** — `shop_locations` has `amenities` JSON but no `booking_rules` JSON. Fix: add `booking_rules TEXT DEFAULT '{}'`: `{min_nights, max_nights, checkin_time, checkout_time, house_rules}`. |
| Cleaning fee / extra-guest fee / security deposit that auto-applies | `shop_folios.folio_lines` can hold ad hoc charges, but nothing defaults them | **Partial** — can live inside the new `booking_rules` JSON as default line items applied at folio-open. No new table needed. |
| iCal sync across platforms so you don't get double-booked | Existing `connections` table (see Part 2.6) — reach depends on whether it's generic or order-scoped | **Integration work either way, not a schema gap** — same category as the IRP/GSP e-invoice gap: needs a background sync job pulling/pushing `.ics` feeds per `shop_locations.id`. If `connections` already supports arbitrary `connection_type` + config JSON, this is zero new tables. Confirm scope before assuming it's unbuilt. |
| Two-way reviews (guest rates host, host rates guest) | `review.rs` (generic, see Part 1) | **No gap** — same generic reviews app handles this via a `direction` field if it doesn't already. If fast lookup matters on the booking list screen, denormalize `guest_review_id`/`host_review_id` onto `shop_reservations` — 2 columns, not a new table. |

---

## Part 4 — Large-chain / multi-outlet (flagged, not analyzed here)

petpooja.com/poss/large-chain-restaurant-pos-software adds one more category
that's genuinely out of scope for this doc: centralized menu across outlets,
outlet grouping by zone/region, ERP push (Tally/SAP/Dynamics), central
kitchen with low-stock alerts routed between outlets, and outlet-wise staff
rights reporting. `shop_warehouses` already covers multi-location stock, and
`rbac.rs` presumably covers staff rights — but "outlet" as its own reportable
unit (separate P&L, zone grouping) isn't obviously modeled yet. Worth its own
gap check later; not folding it into this one since it's a different scale of
problem (multi-outlet chain ops) than customer/loyalty/hospitality.

---

## Net Schema Change

| Action | Where |
|---|---|
| New table | `shop_loyalty_ledger` (points + wallet, one ledger) |
| New column | `shop_customers.wallet_balance REAL DEFAULT 0` |
| New column | `shop_reservations.source_channel TEXT`, `shop_reservations.meta TEXT DEFAULT '{}'` |
| New column | `shop_locations.rate_overrides TEXT DEFAULT '{}'`, `shop_locations.booking_rules TEXT DEFAULT '{}'` |
| New column | `shop_documents.service_mode TEXT DEFAULT 'dine_in'`, same on `shop_orders` |
| Generalize (rename, don't duplicate) | `email_*` tables → add `channel` column instead of building parallel `sms_*` tables |
| Verify, don't build (see instruction file) | Does the existing `connections` table generalize to iCal/calendar sync, or is it order-only? Does `crm_contacts` already have DOB? Does CRM→`shop_customers` sync read back or only write-once? |

**Net result: 1 new table, 7 new columns across 4 existing tables, 1
rename/generalize. Reviews and aggregator integrations turned out to be
already-solved — not counted. No per-industry table explosion — same
pattern as the tax gap check.**
