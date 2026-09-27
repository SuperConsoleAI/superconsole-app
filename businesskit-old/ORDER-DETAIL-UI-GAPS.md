# Order Detail UI — State Matrix, Customer Credit, Edit Lock, Collect-Later

## 1. UI state matrix — confirm all 4 covered by one command

The order detail screen (Images 1 & 3) needs the same shape regardless of status — just different
values. This is one `get_document_detail(document_id)` command, not four separate ones:

| Status | Badge | Paid | Outstanding | Show |
|---|---|---|---|---|
| Draft | (none shown, still in cart) | — | — | Edit only, no payment summary yet |
| Unpaid | "Unpaid" | ₹0 | full total | Collect payment, Send receipt, Return/exchange |
| Partial | "Partially paid" | >0, <total | remainder | Collect payment, Send receipt, Return/exchange, **View transactions** |
| Paid | "Paid" | = total | ₹0 | Send receipt, Return/exchange only (Collect payment hidden) |

"View transactions" only appearing on #1005 (partial) and not #1002 (unpaid, image 1 was pre-payment)
confirms the link should be conditional on `shop_document_payments` having ≥1 row for that document —
not a fixed UI element. Build this as one query returning the document + its payment rows + computed
status, and let the frontend branch on the result rather than four separate command paths.

---

## 2. Customer credit line + prior dues on the billing screen

Real gap worth building — not in the current spec. When billing a customer who has a credit account
(`shop_customers.credit_limit > 0`), the POS screen should surface:
- Credit limit
- Current credit used
- Whether this new sale would push them over limit
- Outstanding amount from *other* unpaid/partial invoices (not just the cached `credit_used` figure)

**Command needed:** `get_customer_billing_context(customer_id)` returning:
```
credit_limit, credit_used, available_credit, is_over_limit,
outstanding_invoices: [{ document_id, doc_number, amount_due, doc_date }]
```
The `outstanding_invoices` list comes from `shop_documents WHERE customer_id = ? AND status IN
('confirmed','partial')` — live query, not the cached `credit_used` field, since `credit_used` is a
snapshot that could drift if a payment posts to a different code path. Treat `credit_used` as the fast
summary number and the live query as the detail behind "show more," same pattern as the order screen
itself (Total/Paid/Outstanding fast, "Show more" for line items).

**Display rule:** only show this block when `credit_limit > 0`. A walk-in cash customer with no
credit account shouldn't see an empty credit panel — same instinct as not showing GST Rating for a
vendor nobody's tracking.

No schema change — `shop_customers.credit_limit`/`credit_used` and `shop_documents.amount_due`
already have everything needed. This is a command + UI build.

---

## 3. No edit icon on confirmed invoices — this is correct, not a gap

Draft has an edit affordance because nothing's been confirmed yet — no journal entry, no legal
document number issued. Once confirmed (unpaid/partial/paid), Shopify shows no edit option, only
"Return or exchange" — which creates a *new* document referencing the original, rather than mutating
it.

This matches what's already documented in your own schema comments on `shop_document_lines`:
"Immutable price snapshot at transaction time... Changing item price tomorrow never affects past
invoices." Editing a confirmed invoice directly would desync it from the journal entry already
posted against the original amounts, and GST invoices are legally required to be immutable once
issued — corrections go through a credit note or debit note, not a direct edit.

**No action needed here** — confirming the UI pattern you're looking at already matches the
architecture decision you made earlier in this thread. Worth exposing "Return or exchange" as the
correction path if it isn't already wired to create a `credit_note`/`debit_note` doc_type against
`shop_documents`.

---

## 4. Collect payment later, from the order list — needs one reusability check

"Collect payment ₹X outstanding" (Images 1 & 3) is recording a payment against an *existing*
confirmed document, from the order list — not from an active POS cart session.

Structurally this already works: `shop_document_payments` just needs a new row with the existing
`document_id`, same as any other payment. **The one thing to verify**, not build new: that
`record_manual_payment` / `record_gateway_payment` (built in Phase 4B) accept an arbitrary
`document_id` as a parameter, rather than being implicitly scoped to "whatever document is active in
the current checkout session." If they were written assuming a live cart context, "Collect payment"
from the order list needs the same command to work standalone — check this before assuming it's
already covered, since it's an easy thing to accidentally couple to session state during
implementation.

After recording: recompute `amount_paid`/`amount_due`, update `status` (confirmed → partial → paid),
and post the incremental journal entry (DR Cash/Bank, CR Accounts Receivable) — the original invoice
already posted DR Receivable/CR Sales at confirm time, so this payment only clears the receivable,
it doesn't re-post revenue.
