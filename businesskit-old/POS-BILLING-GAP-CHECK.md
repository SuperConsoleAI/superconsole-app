# Shopify POS Billing Flow — Gap Check

## ✅ Already covered, confirmed by schema — no work needed

**Split payment (Image 8)** — Cash ₹5,000 + remaining ₹3,282.68 as a second payment.
`shop_document_payments` already supports multiple rows per document exactly for this
("Multiple rows per document when paid in instalments or split modes" — your own comment in
`shop-ops.rs`). `shop_documents.amount_paid` / `amount_due` = running totals. Nothing new needed.

**Partial payment status** — `shop_documents.status` already has `partial` as a value alongside
`draft | confirmed | paid | cancelled | void`. Directly matches "Mark as partially paid."

**Mark unpaid** — not a special state, just `status = confirmed` with zero rows in
`shop_document_payments`. Already the natural default, no schema needed.

**Draft order (Image 1, "Load draft order")** — `shop_documents.status = 'draft'` already exists.
Save a cart mid-build, resume later, confirm when ready. Covered.

**Discount → tax recalculated on the discounted amount (Image 3 → 4)** — tax went from ₹1,619.82
to ₹1,263.46 after a 22% discount, because tax is computed on the post-discount taxable value, not
the original price. `shop_documents.taxable_amt` is explicitly the post-discount figure, separate
from `subtotal` — schema already models this correctly.
**One thing to verify, not a schema gap:** confirm `journal.rs`'s posting logic actually recomputes
`taxable_amt` from `subtotal − discount_amt` before calculating `tax_amount`, rather than taxing the
original subtotal and discounting after. Worth a quick check against the actual invoice math, since
this is exactly the kind of bug that looks fine until someone applies a discount and audits the GST.

---

## ⚠️ Real gaps — decide now, before someone hits them in testing

### 1. Refund on mid-split-payment cancellation (Image 9)
"₹500 has been paid... Processed payments will automatically be refunded" — canceling an order
that already has a partial payment recorded needs to *reverse* that payment, not just void the
document.

`shop_document_payments` has no way to represent a refund today — no negative amounts implied, no
`payment_type` distinguishing payment vs refund. Two options:
- **Allow negative `amount`** in `shop_document_payments` for refund rows — zero schema change,
  journal posting engine just flips DR/CR when amount is negative. Simplest, matches your
  minimal-architecture instinct.
- Add a `payment_type` column (`payment` | `refund`) — clearer for reporting, small migration.

**Recommend the negative-amount convention** — no new column, and it naturally nets out in
`SUM(shop_document_payments.amount)` for `amount_paid` without special-casing refund rows in every
report query.

### 2. Gift cards (Image 6, "Add gift card")
No table for this anywhere in your schema. Gift cards need: code, initial balance, current balance
(partial redemption), issued-to, expiry. This is structurally different from `shop_discount_codes`
(which is a one-time coupon, not a stored-value balance you draw down over multiple purchases).

Genuinely new — a `shop_gift_cards` table, if you want this feature. **Not urgent** unless a retail
user specifically asks; flag and defer, don't build speculatively.

### 3. Manual discount + reason (Image 4, "Reason" field)
A 22% ad-hoc discount at POS with a typed reason, for audit ("why was this discounted"). No field
captures this today — `shop_documents.discount_amt` is just a number.

**Don't add a column** — this is exactly the JSON-bag case from the framework we set earlier:
audit text, never queried by exact value, low volume. Use existing `shop_documents.meta` JSON:
`{"discount_reason": "...", "discount_type": "manual"}`. `staff_id` already on the document covers
who applied it.

---

## 🔮 Future — noted, not building now

- **POS sale that also needs shipping** (Image 10, "Prepare for shipping" under POS orders) — your
  fulfillment tracking (`shop_order_fulfillments`) is keyed to `shop_orders`, not `shop_documents`.
  A POS walk-in who wants an out-of-stock item shipped would need both a `shop_documents` row (for
  billing) and a `shop_orders` row (to get fulfillment tracking) created together. That's a command
  orchestration decision for later, not a schema gap — the pieces already exist, they just aren't
  wired to work together for this specific POS+ship hybrid case yet.
- **Automatic/rule-based discounts** (Image 1, "Automatic discounts" toggle) — `shop_discount_codes`
  is code-entry only, no flag for "applies automatically without a code, based on cart conditions."
  A real feature, but a rules-eligibility engine is nontrivial — defer until a user actually asks for
  BOGO-style auto-discounts.

## Net result
Split/partial/unpaid/draft — all already correct in schema, nothing to build. Refund-on-cancel is
the one gap worth fixing before a real user hits it (negative-amount convention, zero schema
change). Gift cards and auto-discounts are real features but genuinely optional until demand shows up.
