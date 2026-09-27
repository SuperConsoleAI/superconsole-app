# Store Credit — One Question Before This Is "Done"

`shop_customers.store_credit` is a single mutable balance, decremented directly on redemption per
the build report ("auto-deducts... and decrements the customer's wallet balance on confirmation").

That's the same shape you rejected for stock and for money everywhere else in this build. Compare:
- `shop_stock_ledger` — append-only, current stock = SUM(qty_in) − SUM(qty_out), never a bare mutable
  column
- Every payment in this whole thread — `shop_document_payments` rows, never a bare balance field
- The refund fix from two sessions ago — negative-amount rows, specifically so there's always a
  record of *why* a balance changed, not just a number that moved

A bare `store_credit REAL` with no ledger breaks that pattern. If it's wrong six months from now,
there's no way to find out why — no issuance record, no redemption record, nothing to reconcile
against.

## Three things to confirm with Claude Code, not assume

1. **Does redeeming store credit at checkout write a `shop_document_payments` row**
   (`payment_mode = 'store_credit'`), the same way cash/card/UPI does? Or does it only touch the
   `store_credit` column and the bill total, with no payment row at all? If there's no payment row,
   `amount_paid`/`amount_due` on that invoice will be wrong, and the auto-posting engine has nothing
   to post against.

2. **Does issuing or redeeming store credit post a journal entry?** Store credit is a liability —
   money the business owes back to the customer, same category as a gift card. Issuing it should
   credit a "Store Credit Payable" account; redeeming it should debit that account and credit Sales
   (or whatever the sale posts to). If this never touches `fin_journal_entries`, then every store
   credit transaction is invisible to the P&L and balance sheet you built in Phase 4B — the exact
   thing this whole thread has been protecting against.

3. **Is there any history at all** — who issued it, when, why, how much was redeemed and against
   which invoice? If the answer is "no, just the balance," that's the fix needed: either a
   `shop_customer_credit_ledger` table (append-only, same shape as `shop_stock_ledger`), or fold it
   into `shop_document_payments` as the payment record plus a signed adjustment on issuance — not a
   new table if the payment row can carry it.

If all three are already handled and just weren't mentioned in the summary, this is a non-issue —
say so and it's closed. If not, this is the one piece of Batch 2 that needs a follow-up pass before
it's actually safe to use, since it's the only part of this session's work that touches money without
going through the payment/journal pipeline every other feature in this build was built to respect.

## Not blocking, just noting for later
`shop_tags` (new directory table) coexists with the older `shop_items.tags` JSON array without
referencing it — two different tagging mechanisms now exist side by side. Not a problem today, but
worth deciding later whether `shop_items` should eventually point at `shop_tags` too, so tag
autocomplete/management is consistent across customers and products rather than customers-only.
