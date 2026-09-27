# Self-Check: Run Real Test Cases Through Phase 9 (Aggregator Orders + OTA Sync)

> Same method as the tax posting engine check — `cargo check` passing
> only proves it compiles, not that the logic is right. Run these
> concrete cases through the actual commands and print what comes out:
> resulting rows, not just success/failure.

---

## Part A — Food Aggregator Orders

### A1. Basic ingestion
Call `shop_ingest_aggregator_order` with a mock Zomato payload:
external order ID `ZOM-1001`, customer phone `+919876543210`, 2 line
items. Print the resulting `shop_documents` row (doc_number, channel,
service_mode), the `shop_document_lines` rows, the `shop_customers` row
it linked/created, and confirm a `kot` document was created.

### A2. Duplicate delivery (idempotency)
Call `shop_ingest_aggregator_order` again with the **exact same**
`ZOM-1001` payload. Print the result. Confirm: no second invoice, no
second KOT, no error thrown — the existing invoice is returned.

### A3. Cross-platform ID collision — the one that actually needs testing
Ingest a Swiggy order with external ID `1001` (same raw number Zomato
might independently generate). Print the resulting `doc_number` actually
stored. **Confirm whether `doc_number` is stored as the bare platform ID
(`"1001"`) or prefixed with platform (`"swiggy-1001"` /
`"zomato-1001"`).** If it's stored bare, two different platforms issuing
the same order number will either collide against the unique index
(insert fails, order lost) or silently overwrite each other depending on
how the uniqueness check is implemented. This needs an explicit answer,
not an assumption — report which behavior actually happens.

### A4. Same customer, second order
Ingest a second DoorDash order using the **same phone number** as A1.
Print whether it links to the existing `shop_customers` row or creates a
duplicate. Confirm `total_orders`/`total_spent` incremented rather than
reset.

### A5. Takeaway vs delivery
Ingest one order flagged takeaway, one flagged delivery from the same
platform. Print both `service_mode` values to confirm they're not both
defaulting to the same thing.

---

## Part B — OTA iCal Sync

Use a small hand-built `.ics` fixture with 2 `VEVENT` blocks for this
whole section, don't fetch a real Airbnb feed.

### B1. First sync
Run `shop_sync_ota_ical` against the fixture. Print the resulting
`shop_reservations` rows: `external_booking_id`, `source_channel`,
`slot_start`, `slot_end`, `status`.

### B2. Unchanged re-sync
Run the exact same fixture again. Print the row count before and after —
confirm it's unchanged (no duplicate rows created).

### B3. Modified event (guest extends stay)
Edit the fixture: change one `VEVENT`'s `DTEND` to a later date, same
`UID`. Re-run sync. Print the reservation row for that `UID` before and
after — confirm `slot_end` updated on the **existing** row, not a new
row inserted alongside it.

### B4. Removed event (cancelled on Airbnb) — likely gap, confirm directly
Edit the fixture: delete one `VEVENT` entirely (simulating a
cancellation on the OTA side). Re-run sync. Print what happens to the
`shop_reservations` row that had that `UID`. **State plainly whether
anything currently detects "this UID was in the last sync and is now
missing from the feed" and marks it cancelled, or whether removed events
are simply never noticed** because the sync only processes events present
in the current fetch. If nothing handles this, say so directly — it's a
real gap, not a nice-to-have.

### B5. Double-booking overlap check
Before running B1, manually create a dashboard/walk-in reservation at the
same `location_id` with dates overlapping one of the fixture's events.
Then run the iCal sync. Print whether the sync **rejects or flags** the
incoming OTA event because it overlaps an existing reservation, or
whether it inserts anyway, creating two overlapping bookings for the same
room. State which one actually happens — `shop_reservations`'s own
design comment says double-booking prevention should check for
overlapping `slot_start`/`slot_end` before confirming, so this needs to
be confirmed true for OTA-sourced inserts too, not just dashboard-created
ones.

### B6. Export feed validity
Call `shop_export_stay_ical` for the location used above. Print the raw
`.ics` text output. Confirm the cancelled/removed reservation from B4
(if it got marked cancelled) is excluded from the export, and that the
output is parseable RFC 5545 (correct `BEGIN:VCALENDAR`/`VEVENT`
structure, not just string concatenation that happens to look right).

---

## Report format
For each test: the command called, the exact input, and the actual
row(s) that exist in the database afterward — not a description of what
should have happened, the real output. Flag A3, B4, and B5 explicitly as
pass/fail/gap even if the others are all clean, since those three are the
ones most likely to have a real bug rather than just being untested.
