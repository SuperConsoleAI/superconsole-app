# Self-Check Round 2: Phase 9 Remaining Gaps

> First round confirmed create/dedup/cancel-detection/overlap-detection
> all work. This round targets things that weren't tested at all —
> most likely real gaps, not just unverified paths.

---

## 1. iCal date-only events (highest priority — likely real bug)

**Why this matters:** the B1–B6 fixture used full `DTSTART`/`DTEND`
datetime values with explicit UTC timestamps. Real Airbnb exports
commonly use **date-only** all-day event format instead:

```
DTSTART;VALUE=DATE:20260910
DTEND;VALUE=DATE:20260914
```

No time component, no `Z` suffix — this is the actual format Airbnb
uses for check-in/checkout in a lot of their calendar exports, not the
timestamp format that was tested.

**Test:** build a fixture using `VALUE=DATE` format instead of full
datetime. Run `shop_sync_ota_ical` against it. Print the resulting
`slot_start`/`slot_end`. Confirm the parser handles this format at all —
if it only recognizes the datetime format tested in round 1, this either
fails silently (event skipped) or parses garbage. State plainly which one
happens.

---

## 2. Stock ledger on aggregator order ingestion

**Why this matters:** A1 confirmed `shop_documents` +
`shop_document_lines` get created, but didn't check whether
`shop_stock_ledger` gets a corresponding `movement_type: 'sale'` row for
items with `track_inventory = 1`. If aggregator-sourced orders don't
decrement stock the way dashboard/POS orders do, on-hand inventory drifts
out of sync with reality every time a Zomato/Swiggy order comes in.

**Test:** ingest an aggregator order for an item with `track_inventory =
1` and known `stock_qty`. Print the `shop_stock_ledger` rows created (or
confirm none were, if that's the actual behavior) and the item's
resulting balance. State whether this path was wired in or skipped.

---

## 3. Order modification / cancellation from the aggregator side

**Why this matters:** round 1 only tested exact-duplicate re-delivery
(A2) and one-time cancellation-via-absence for OTA bookings (B4).
Aggregators also send **update** webhooks — item added/removed, order
cancelled by customer *after* it was already ingested. Nothing tested
whether `shop_ingest_aggregator_order` can update an existing invoice's
line items, or whether there's any command to mark an already-created
aggregator invoice as `cancelled` when the platform sends a cancellation
event.

**Test:** ingest `ZOM-2001`, then call the ingestion path again with the
same order ID but a changed line item (different quantity). Print
whether it updated the existing invoice or just returned the stale one
as a duplicate (per A2's `is_duplicate` logic, this may currently treat
any repeat of the same doc_number as a no-op duplicate, silently
dropping the actual change). Separately: is there any
`shop_cancel_aggregator_order` equivalent, or does a cancelled platform
order have no path to update `shop_documents.status` at all right now?

---

## 4. Tax breakdown compliance on aggregator invoices

**Why this matters:** A1's payload passed `subtotal`/`tax`/`grand_total`
directly. For India GST compliance, `shop_documents.tax_breakdown` needs
the actual CGST/SGST/IGST split (per `fin_tax_rates`), not just a lump
tax figure — otherwise these invoices won't reconcile correctly on a
GSTR filing even though the totals look right.

**Test:** ingest an aggregator order and print the resulting
`shop_documents.tax_breakdown` JSON. Confirm it's a real component split
matching the profile's configured tax regime, not just
`{"tax": 45}` copied wholesale from the aggregator payload. If it's the
latter, that's a compliance gap worth knowing about now rather than at
filing time.

---

## 5. Item/menu matching failure mode

**Why this matters:** A1's line items (Paneer Butter Masala, Butter
Naan) matched cleanly, but real-world aggregator menu sync regularly
breaks — the platform's item name/ID drifts from what's in `shop_items`
after a menu edit. Nothing tested what happens when a line item in the
payload **doesn't** match any existing item.

**Test:** ingest an order containing one line item with a name/SKU that
doesn't exist in `shop_items`. Print what happens — does ingestion fail
entirely (whole order lost), skip just that line (partial order,
silently short), or auto-create a placeholder item? State which one
happens; this determines whether a single menu-sync mismatch can drop a
paying customer's order without anyone noticing.

---

## Not testing (out of scope for this round, flagging only)

- Aggregator commission/fee tracking against `shop_documents.profit` —
  Zomato/Swiggy take 20–30% commission; the `profit` field as currently
  calculated (`SUM((unit_price-unit_cost)*qty)`) doesn't account for it,
  so P&L on aggregator-sourced orders is likely overstated. This is an
  accounts/reporting decision, not a Phase 9 bug — separate instruction
  file if you want it addressed.
- UI/notification path for `status: 'conflict'` reservations from B5 —
  confirmed the DB flag works, but whether an operator actually sees an
  alert for it is a frontend question, not a backend one.

________

All five hold up under the actual output — this is a genuinely solid round, not just "no errors." Three things worth resolving before calling Phase 9 closed, though, all found by reading the *side effects* of what already passed rather than the tests themselves:

**1. Cancellation reverses stock but what about loyalty points and customer stats?**
A1/A4 confirmed `total_orders`/`total_spent` increment on ingestion. If aggregator orders auto-settle (customer already paid Zomato, so the invoice may hit `shop_record_payment` automatically as part of ingestion), loyalty points could already be credited via `shop_loyalty_ledger` before a cancellation reverses stock. Cancellation restores inventory but nothing in the report mentions reversing `loyalty_pts`, `total_orders`, or `total_spent` on the customer row. Ask directly: does `shop_cancel_aggregator_order` touch anything on `shop_customers` or `shop_loyalty_ledger`, or only stock? If not, a cancelled Zomato order permanently inflates a customer's lifetime spend and hands out points for an order that never happened.

**2. Is the GST split hardcoded, or does it branch on `fin_tax_configs.regime`?**
The test output showed `cgst`/`sgst`/`igst` — correct for an India profile, but the report describes it as "calculates the intra-state GST component split," which reads like fixed logic, not regime-aware logic. Given BusinessKit's explicit global-first design (`fin_tax_configs.regime` supporting VAT/Sales Tax for UAE/US/Europe), a UAE restaurant using Zomato-equivalent aggregators would need a VAT breakdown, not a CGST/SGST one. Ask directly: does this branch on the profile's actual `regime`, or will a non-India profile get a nonsensical `cgst`/`sgst` split on every aggregator invoice?

**3. Minor, not a blocker — the ad-hoc fallback item (`agg-item-1`) won't join to `shop_item_analytics`.**
Correct call to not lose the order, but worth documenting as a known limitation: any "top-selling items" or per-item revenue report will silently exclude these lines since there's no real `shop_items.id` to join against. Not worth fixing now — just flag it so it doesn't get mistaken for a reporting bug later when someone notices aggregator revenue and per-item revenue don't add up.

Get 1 and 2 answered before marking this phase done — both are the kind of thing that looks fine in testing and quietly corrupts real numbers (customer lifetime value, tax filings) once live orders start flowing.
