# Instruction: External Booking & Order Tracking (Airbnb/OTA + Food Aggregators)

> Two different integration shapes, same `connections` table (confirmed
> generic in Check 3, currently used for order-flow aggregators per
> Part 2.6). This splits them because their idempotency and sync
> mechanics are genuinely different — don't build one abstraction that
> forces both into the same shape.

---

## Part A — Food aggregator orders (Zomato / Swiggy / DoorDash / Uber Eats)

**Check first:** does `connections` already have any `service` rows for
these platforms from earlier aggregator work (Part 2.6 said this table
already covers "managing food aggregators from a single dashboard")? If
API credentials are already stored, this is purely about what happens
when an order comes in — don't re-provision connections that exist.

**No new columns needed for idempotency.** `shop_orders.order_number` is
already unique per `(profile_id, order_number)`, and `shop_documents` is
unique per `(profile_id, doc_type, doc_number)`. When an order lands from
Zomato/Swiggy/DoorDash:

- Set `channel` = the platform name (`zomato`, `swiggy`, `doordash`,
  `ubereats`) — it's free-text `TEXT`, not a constrained enum, so no
  migration needed to add new values
- Set `service_mode = 'delivery'` (or `takeaway` if the aggregator
  supports pickup orders)
- Set `order_number` (or `doc_number` if writing directly to
  `shop_documents`) = the aggregator's own order ID, not an internally
  generated one

That last point is what makes re-running a webhook/poll safe — if the
same aggregator order arrives twice, the existing unique index rejects
the duplicate insert instead of creating a second order. No new schema
required.

**What to actually build:**
- A receiver per platform (webhook handler if the aggregator pushes, poll
  job if it doesn't) that maps the aggregator's payload to
  `shop_create_order` / `shop_create_invoice`, using the mapping above
- Store each platform's credentials/webhook secret as a `connections` row
  (`service: "zomato_api"` etc.), same pattern already established

---

## Part B — OTA bookings (Airbnb / Booking.com / etc.)

This one's structurally different — Airbnb doesn't push webhooks, it
only exposes a read-only `.ics` calendar feed, and separately expects a
feed back to know when *you've* sold the room elsewhere. It's pull +
export, not push, and that has a real consequence worth naming up front:
**there is an inherent sync lag** (Airbnb's own iCal feeds typically
refresh every few hours) — some double-booking risk always exists with
this integration model industry-wide, it's not something this schema can
fully close. Don't oversell "zero double-bookings" in any UI copy built
on top of this.

**One new column is actually needed here**, unlike Part A —
`shop_reservations` has no existing unique business key equivalent to
`order_number`, so there's no free idempotency:

```sql
ALTER TABLE shop_reservations ADD COLUMN external_booking_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_reservations_external
  ON shop_reservations (profile_id, source_channel, external_booking_id)
  WHERE external_booking_id IS NOT NULL;
```

`source_channel` already exists (added in the earlier hospitality pass).
`external_booking_id` = the UID field from the parsed `.ics` event. The
partial unique index (WHERE clause) means walk-in/dashboard-created
reservations with no external ID are unaffected — only OTA-sourced rows
get dedup'd.

**What to actually build:**
- Per-location `connections` row (`service: "airbnb_ics"` /
  `"booking_com_ics"`), storing the import URL — confirmed this needs no
  new table, per Check 3
- A periodic pull job per location: fetch the `.ics`, parse events,
  upsert into `shop_reservations` keyed on
  `(profile_id, source_channel, external_booking_id)` — insert new,
  update `slot_start`/`slot_end` if Airbnb's feed shows a changed booking
- Export side: generate BusinessKit's own `.ics` feed per location
  (`shop_reservations` where `status != cancelled`) at a stable URL
  stored as `ics_export_token` in the same `connections` row's `extra`
  JSON, so Airbnb/other platforms can pull it and see rooms you've
  already sold elsewhere

---

## What NOT to build in this pass
- No unified "external bookings" table trying to cover both shapes —
  Part A dedups on existing order-number uniqueness, Part B needs its own
  column because reservations never had an equivalent key. Forcing them
  into one mechanism would either add unneeded columns to `shop_orders`
  or lose the real reservation dedup requirement.
- No real-time double-booking guarantee promise in Airbnb-direction UI —
  that's a platform limitation, not something to paper over
