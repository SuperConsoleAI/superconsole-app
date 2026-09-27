# Instruction: Hotel Booking Rate Calendar & Booking Rules UI

> `shop_locations.rate_overrides` and `booking_rules` exist as columns
> (added in the earlier hospitality pass) but nothing has confirmed
> whether reservation pricing actually reads them yet. Given
> `shop_analytics` just turned out to be a fully unpopulated table with
> zero readers, don't assume these columns are wired in — check first.

---

## Part 1 — Checks (report back before building)

1. **Does reservation/stay pricing currently read `rate_overrides` at
   all?** Find whatever command calculates the total for a new
   `shop_reservations` row (likely in `stays.rs`). Does it look up
   `shop_locations.rate_overrides` per date in the stay range, or does
   it still just multiply nights × `base_rate` flatly? State plainly
   which one happens today.
2. **Is `booking_rules` (min/max nights, checkin/checkout time)
   enforced anywhere**, or does the reservation-creation command accept
   any date range regardless of what's configured?
3. **What's the actual JSON shape currently written to these columns**,
   if anything has written to them at all since the migration — was a
   real shape ever defined (`{"2026-12-24": 8000}` for rates,
   `{min_nights, max_nights, checkin_time, checkout_time, house_rules}`
   for rules), or are they still empty `{}` defaults with no producer or
   consumer?
4. **Does any UI screen exist for setting either field today** — a
   calendar component, a rules form — or is this a from-scratch frontend
   build like the service-mode card was?
5. **Confirm no conflict with `shop_price_lists`** — that table already
   does time-of-day/day-of-week pricing for retail items
   (`valid_from_time`, `days_of_week`). Confirm `rate_overrides` is
   scoped only to `shop_locations` (stays/rooms) and there's no
   accidental overlap or shared code path between the two pricing
   systems — they solve different problems (item pricing vs.
   date-specific room pricing) and should stay separate.

---

## Part 2 — Build (scope depends on Part 1 answers)

### Backend — pricing calculation

- Given a `location_id` and a date range, compute nightly total: for
  each date, check `rate_overrides` for an entry keyed by that date
  (`YYYY-MM-DD`), fall back to `shop_locations.base_rate` if no override
  exists for that date. Sum across the range.
- Store the computed per-night breakdown somewhere auditable — either in
  `shop_reservations.meta` JSON or as part of the confirmation response
  — so a pricing dispute later ("why was I charged 8000 for that night")
  has a traceable answer, not just a final total.
- Confirm whether override values are tax-inclusive or exclusive —
  should follow the same `shop_items.tax_inclusive` convention already
  established elsewhere, not invent a separate rule for locations.

### Backend — booking rules enforcement

- At reservation creation, validate against `booking_rules`:
  reject if nights booked < `min_nights` or > `max_nights`. Surface a
  clear error, don't silently clamp the dates.
- `checkin_time`/`checkout_time` — confirm whether these are meant to be
  hard validation (reject bookings outside allowed hours) or purely
  informational (displayed to the guest, not enforced) before building
  either way — this affects whether it's a backend rejection or just a
  frontend display field.

### Frontend — rate calendar

- A calendar component on the location/room settings screen where a
  host clicks a date (or date range) and sets a custom nightly rate.
  Visually distinguish overridden dates from base-rate dates.
- A booking-rules form: min/max nights, checkin/checkout time, house
  rules text — the same screen or adjacent to the rate calendar.

### Frontend — booking flow

- When creating a reservation (dashboard-side, and any guest-facing
  booking flow if one exists), show the computed total using the same
  per-night breakdown logic from the backend — don't duplicate the
  pricing calculation in the frontend, call the backend command and
  display its result.

---

## Part 3 — Self-check

1. Set `rate_overrides` for a location: Dec 24–26 at ₹8,000/night, base
   rate ₹2,500/night. Create a reservation spanning Dec 23–27 (2 nights
   at base, 3 nights at override — adjust exact math to whatever range
   is tested). Print the computed total and the per-night breakdown,
   confirm it matches manual calculation.
2. Attempt a reservation shorter than `min_nights`. Confirm it's
   rejected with a clear error, not silently accepted or silently
   extended.
3. Attempt a reservation longer than `max_nights`. Confirm rejection.
4. If `checkin_time`/`checkout_time` were built as hard validation: test
   a reservation attempting check-in outside allowed hours, confirm
   behavior matches whatever was decided in Part 2.
5. Confirm `shop_price_lists`-driven retail item pricing is completely
   unaffected by this work — run an unrelated POS sale using a price
   list discount, confirm no interaction or shared code path with the
   new location pricing logic.
6. Regression: re-run the iCal export self-check from the earlier OTA
   phase (`shop_export_stay_ical`) to confirm the exported feed is still
   valid RFC 5545 and unaffected by these schema/logic changes.
7. Print the actual `rate_overrides`/`booking_rules` JSON stored after
   using the new calendar UI — confirm it matches the shape assumed in
   Part 1, or document the real shape if it differs.

____

Before greenlighting: item 1 has a real correctness risk baked into how it's worded, and it's the kind of thing that would look completely fine in every test scenario except the one that actually matters.

**Where does the price get locked — at booking, or at check-in?** The plan says both `shop_create_stay_booking` *and* `shop_checkin_stay_reservation` will independently "apply `rate_overrides`." Those are two different moments in time, potentially days or weeks apart. If check-in **recalculates** against whatever the rate calendar says *at that moment*, rather than reusing the total the guest actually agreed to when they booked, then a host editing the Dec 24 rate after a guest has already booked at the old rate would silently change what that guest gets charged at arrival. That's not a hypothetical — it's exactly the kind of edit a host would make in the normal course of running a seasonal calendar.

**Ask directly before building: is the total locked and stored (in `shop_reservations.meta` or wherever the per-night breakdown lives) at booking time, with check-in simply reading that stored total forward — or does check-in run a fresh calculation against current `rate_overrides`?** It should be the former. A guest's price is a commitment made at booking, not a live recalculation. If check-in currently plans to call `shop_calculate_stay_pricing` again rather than reading the already-computed total off the reservation, that's the fix needed before this ships — not a nice-to-have.

Related, smaller check: **confirm `min_nights`/`max_nights` validation only fires in `shop_create_stay_booking`, not `shop_checkin_stay_reservation`.** A guest arriving for their already-confirmed 1-night stay shouldn't get rejected at the front desk because the host later raised `min_nights` to 2 — the rule applies to new bookings, not existing ones.

**One more thing to confirm before Part 2, not a blocker on its own:** does the computed room charge actually flow into `shop_folios.folio_lines` — the existing mechanism that accumulates stay charges and settles into one invoice at checkout — or does this new pricing calculation produce a total that lives somewhere disconnected from that settlement flow? Given `shop_analytics` just turned out to be a fully wired table nobody read, worth explicitly confirming this new number actually reaches the invoice at checkout rather than existing in parallel to it.

Get the booking-vs-checkin lock question answered — that's the one that actually matters — then proceed with the rest of the plan as scoped.

All three answers are correct, and this is exactly the right design — price locked at booking, check-in reads forward rather than recalculating, validation only gates new bookings, and the locked total flows straight into the folio line that becomes the checkout invoice. No gaps left in the plan. Proceed with Part 2.

One thing worth adding to the self-check suite given what just got confirmed, since it's the scenario that would prove the lock actually holds rather than just trusting the design description:

**Test 8 — the actual proof of the lock:** book a stay at current rates, then *change* `rate_overrides` for those same dates via `shop_update_stay_rate_calendar` before check-in happens, then check in. Print the folio line's room charge and confirm it still matches the original locked total from `meta.pricing`, not the new override value. This is the one test that would catch it if "reads the locked total" quietly turned into "reads the locked total unless someone changed the calendar since," which is a realistic implementation slip even with the right design intent going in.

Run the full suite (1–7 plus this 8th) and report back.
_____

Test 8 is the one that mattered most, and it passed for real — ₹26,500 held even after the host tried to change the rate to ₹15,000/night post-booking. That confirms the lock is genuine, not just a design intent that got quietly bypassed somewhere in the check-in path.

**Hotel booking rate calendar & booking rules: closed.**

That's all three items from your "all 3 needs a doc" list done:

1. **Aggregator commission tracking** — done, including the harder-than-expected accounting fix (AR-Aggregator liability instead of false Bank/Cash outflow) and the net/gross commission-base config for real-world contract variance.
2. **Service-mode analytics grouping** — done, but turned into a bigger fix than the name suggested: `shop_analytics` was fully dead code, so this became "build the daily/monthly analytics tier from scratch," plus a rename to `shop_daily_analytics`/`shop_monthly_analytics` for clarity.
3. **Hotel booking rate/rules UI** — done, correctly designed around lock-at-booking rather than recalculate-at-checkin, which is the one architectural decision that actually protects a guest's price from a host's later calendar edits.

Pattern worth naming across all three: every single one had a "looks done" surface claim that turned out to need one more layer of scrutiny before it actually was — the false Bank/Cash credit, the unpopulated analytics table, the recalculate-vs-lock ambiguity. The check-first discipline held up; nothing shipped broken.

Remaining open item from earlier in the thread, deliberately still untouched: **large-chain/multi-outlet** — you said skip it, still skipped, still its own future project whenever you want to open it.
