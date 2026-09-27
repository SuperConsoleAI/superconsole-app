# Instruction: POS Service-Mode Switcher + Reviews Connection

> Same discipline as the CRM/loyalty work: check first, then build.
> Backend for service_mode already shipped (shop_documents, shop_orders,
> billing.rs) — this is the remaining frontend + reviews-wiring gap.

---

## Part 1 — Checks (read-only, report back before writing any code)

**Check 1 — Does a service-mode UI already exist?**
Look at `src/routes/dashboard/shop/` POS/order screens (likely
`pos/index.tsx` or similar) and `src/components/shop/NewBillModal.tsx`
(already touched in the wallet work). Does the order-creation flow read or
write `service_mode` anywhere, or does every order still silently default
to `dine_in` with no control in the UI?

**Check 2 — How does `review.rs` actually connect to a subject today?**
Read `src-tauri/src/db/schema/review.rs` (or `feedback.rs` if reviews live
there instead — confirm which file). Report the exact column(s) used to
link a review to what it's reviewing — polymorphic FK columns like
`email_events` uses (`newsletter_id | purchase_id | proposal_id |
invoice_id`, exactly one set), or a single `subject_type` + `subject_id`
pair, or something else. Also report whether it already supports a
`direction` field (guest_to_host / host_to_guest) for two-way hospitality
reviews, or whether that's genuinely missing.

Don't implement anything until both checks come back — Part 2 assumes
answers that could turn out wrong, same as the `email_campaigns` false
assumption earlier in this thread.

---

## Part 2 — Implementation (once Check 1 confirms no UI exists)

### POS service-mode switcher
- 3-way toggle (Dine-in / Takeaway / Delivery) on the order-creation
  screen, defaulting to `dine_in`
- Editable until the order is confirmed/paid, locked after — same rule as
  other document fields (price snapshots, etc.)
- Passed through the existing `invoke()` call that creates the
  `shop_document` — one extra field on the payload, column already
  defaults, no backend change needed
- Add the same toggle to the online-order flow if `shop_orders` also
  needs it set at checkout (delivery/takeaway distinction matters there
  too, not just POS)
- Confirm `shop_analytics` / daily close-out reports actually group by
  `service_mode` — if the column's being written but nothing reads it
  back into a report yet, that's still an open thread even after the
  toggle ships

### Reviews connection (once Check 2 confirms the linking mechanism)
- Wire a review prompt after order completion (restaurant) and after
  checkout (hospitality) — attach via whatever key Check 2 reports
  (`document_id` most likely for restaurant orders, `reservation_id` for
  stays)
- If Check 2 confirms no `direction` field exists and two-way review is
  wanted for hospitality (guest reviews host, host reviews guest), add
  that as a column — don't build two-way logic around a workaround if
  the field is cheap to add
- Fast-lookup denormalization only if a listing screen actually needs it
  (per the original gap doc: `guest_review_id`/`host_review_id` directly
  on `shop_reservations` to avoid a join on every row) — confirm this is
  actually a performance problem before adding it, don't add
  speculatively

---

## Explicitly not in this pass
- Hotel booking UI for `rate_overrides`/`booking_rules` — separate,
  larger UI task, not bundled here
- iCal/channel sync — deferred, integration work, not touched
- Large-chain/multi-outlet — its own future item, not touched
