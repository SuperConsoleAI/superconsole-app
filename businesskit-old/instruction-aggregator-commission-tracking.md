# Instruction: Aggregator Commission Tracking

> `shop_documents.profit` currently ignores the 20-30% cut Zomato/Swiggy/
> DoorDash take before payout. This makes that visible without distorting
> `profit`'s existing meaning (item-level margin).

---

## Part 1 — Checks (report back before building)

1. Does the `connections` row for each aggregator (`service: "zomato_api"`
   etc.) already store a commission rate in its `extra` JSON, or is
   nothing configured yet?
2. Does `shop_ingest_aggregator_order` currently do anything with fees —
   read the full function, confirm commission is genuinely untouched
   right now, not partially handled somewhere unexpected.
3. Is `shop_documents.profit` read anywhere in an existing report/UI
   screen today? If a P&L or dashboard already surfaces this field for
   aggregator orders, that's the exact place currently showing an
   inflated number — worth knowing which screen before fixing the data.

---

## Part 2 — Build

**Don't touch `shop_documents.profit`'s definition** — it's item margin,
used the same way for every order type, and other reports may already
depend on that meaning. Commission is a separate cost, so it gets a
separate, explicit representation:

1. `connections.extra` JSON gets a `commission_pct` field per aggregator
   (e.g. `{ "commission_pct": 22 }` for Zomato, `25` for Swiggy) — no
   schema change, just a documented convention for that JSON shape.

2. Add one column for fast per-invoice display:

   ```sql
   ALTER TABLE shop_documents ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0;
   ```

   Calculated at ingestion: `commission_amount = subtotal * commission_pct / 100`
   (commission on the pre-tax amount, not the tax — aggregators don't take
   a cut of GST/VAT collected on the government's behalf; confirm this
   assumption is actually how the aggregator calculates it before
   shipping, don't guess).

3. **Real accounting entry, not just a display number** — post a
   `fin_expenses` row at ingestion: `category: "Aggregator Commission"`,
   `amount: commission_amount`, `document_id` linked, so it flows into
   the existing P&L/Trial Balance reports correctly rather than needing a
   special case in every report query.

4. **Cancellation must reverse this too** — when
   `shop_cancel_aggregator_order` fires, void or reverse the linked
   `fin_expenses` row the same way it already reverses stock/loyalty/
   customer stats. One open question to resolve before building this
   part: does the aggregator actually waive commission on a
   customer-cancelled order, or do some platforms still charge it? If
   uncertain, keep the reversal but flag it as an assumption in the code
   comment — don't silently assume zero-commission-on-cancel without
   confirming.

---

## Part 3 — Self-check

1. Ingest a Zomato order with `subtotal: 1000`, confirm `commission_pct:
   22` from `connections.extra` produces `commission_amount: 220`, and a
   `fin_expenses` row exists with that amount and correct `document_id`.
2. Ingest a Swiggy order, confirm the different configured rate (25%)
   applies — not a hardcoded 22% leaking from the Zomato path.
3. Run a P&L report (or whatever `fin_reports_commands.rs` exposes) that
   spans both orders — confirm net profit reflects commission deducted,
   compare manually against `profit - commission_amount` for both.
4. Cancel the Zomato order. Confirm the `fin_expenses` row is
   voided/reversed alongside the existing stock/loyalty/customer-stat
   reversals — print before/after state.
5. Ingest a POS (non-aggregator) order. Confirm `commission_amount`
   stays `0` and no `fin_expenses` row is created — this fix shouldn't
   touch non-aggregator orders at all.

Hold before building — check 3 surfaced something that needs resolving first, and there's a real accounting-correctness issue in step 5 of your plan.

**1. `fin_expenses.document_id` isn't conditional — it doesn't exist.** Per the schema (`accounts.rs`), `fin_expenses` has no `document_id` column today. Drop the "if needed" — this migration is required, not optional. Confirm before running it that nothing else already links expenses to documents under a different column name.

**2. The journal entry this auto-posts is probably wrong on the credit side — this is the real issue.** `fin_expenses` auto-posts `DR Expense Account, CR Bank/Cash` per its own design comment — that's correct when someone physically pays cash for rent or petrol. But aggregator commission isn't paid that way: no money leaves your bank account at order time. Zomato/Swiggy *net the commission out before paying you*, so the actual cash event happens later, in a batch, when the payout lands (which `fin_bank_transactions` would reconcile against). If this fires `CR Bank/Cash` on every single aggregator order, your books will show cash leaving your account for money that was never actually deposited at all — a real double-entry error, not a cosmetic one. This should post `CR Aggregator Commission Payable` (a new liability account, or `CR Accounts Receivable — Aggregator` reducing what the aggregator owes you) instead, cleared out later when the actual payout is reconciled. Confirm which of those two shapes fits your reconciliation flow before this goes in — don't let it default to crediting Bank/Cash.

**3. Which `fin_accounts` row does this expense post against?** Nothing today auto-creates an "Aggregator Commission Expense" account. Either check-and-create it on first aggregator order (same pattern the Phase 4 doc used for seeding starter accounts), or confirm one already exists — don't let `account_id` end up null.

**4. Reversal on cancellation should never be a delete.** Everything else in this schema — `shop_stock_ledger`, `shop_loyalty_ledger`, `shop_customer_credit_ledger` — is append-only specifically so nothing gets silently erased from the audit trail. Voiding/deleting a posted `fin_expenses` row (and whatever journal entry it triggered) breaks that pattern and is also just bad bookkeeping practice — once a financial entry is posted, you reverse it with an equal-and-opposite entry, you don't delete it. Change step 5 to: insert a reversing `fin_expenses` row (negative amount, same category, `document_id` linked, note explaining it's a cancellation reversal) rather than voiding/deleting the original.

Fix these four, then proceed — steps 1, 3, and 6 (schema column, calculation, self-check suite) are fine as written.

___

Numbers check out arithmetically, but four things need confirming before this is actually done — two of them are potential real bugs, not nitpicks.

**1. Did the original commission posting actually avoid crediting Bank/Cash, or does it double-post?** `fin_expenses`'s own schema design auto-posts `DR Expense, CR Bank/Cash` on save — that's baked into the table's existing behavior per its original comment. The report describes a custom `DR 5300, CR 1250` posting narratively, but the test output only shows `fin_expenses` row contents, never the actual `fin_journal_entries`/`fin_journal_lines` rows it produced. If the generic auto-post trigger still fired *on top of* the custom posting logic, you'd have both a correct AR-credit entry and an incorrect Bank/Cash-credit entry for the same commission — silently overstating cash outflow exactly the way this whole fix was meant to prevent. **Ask for the actual `fin_journal_lines` rows (account_id, debit, credit) for both the Zomato and Swiggy commission postings** before accepting this as correct.

**2. Are accounts 1250 and 5300 created once, or duplicated per order?** Two orders ran (Zomato, Swiggy) — did the second order reuse the same `fin_accounts` row for "Aggregator Commission Expense," or did auto-creation logic fire again and create a second row with the same code? A chart of accounts with duplicate account codes breaks every report that groups by `account_id`. **Confirm the account-creation logic checks-for-existing before inserting**, and that both test orders posted against the same two account IDs.

**3. Test 3's "Net Operating Profit" figure needs a breakdown, not just a total.** Revenue ₹3000 minus Commission ₹720 = ₹2280 — but this completely skips item cost (COGS). `shop_documents.profit` (item margin) was deliberately left untouched per the design, which is right, but that means the *real* net profit is `gross_margin - commission`, not `revenue - commission`. If the P&L report is showing `revenue - commission` as "net profit" without subtracting cost of goods sold anywhere in that number, it's a different — and wrong — calculation than what was asked for. **Get the full P&L output**: Revenue, COGS, Gross Profit, Commission Expense, Net Profit as separate lines, not a collapsed total, so it's possible to verify `Net Profit = Gross Profit - Commission`, not `Revenue - Commission`.

**4. Untested: commission on a discounted order.** Both test orders had `discount_amt = 0`. Real aggregators typically charge commission on what the customer actually paid after any platform-side discount, not the pre-discount subtotal. Run one more test with `discount_amt > 0` and confirm whether `commission_amount` is calculated against `subtotal` or `subtotal - discount_amt` — and flag which one it currently does, since this wasn't specified either way in the original instruction and could be silently wrong either direction.

Minor, not blocking: `payment_mode: "aggregator_deduction"` on the `fin_expenses` row — that field elsewhere holds actual cash-movement types (cash/card/upi/bank_transfer). Worth checking whether any bank-reconciliation report filters/groups by `payment_mode` assuming it's always a real money movement; this value isn't one and could show up oddly in that context. Not urgent, just worth a note if such a report exists.

Get 1–3 confirmed with real row output before calling commission tracking done — 4 can be a quick follow-up test.

All four came back clean and, importantly, showed actual rows rather than restating the claim — the journal lines confirm no phantom Bank/Cash credit, the account dedup query is exactly the right check-before-insert pattern, the P&L breakdown now shows the real formula (Gross Profit − Commission, not Revenue − Commission), and the discount test picked the more defensible interpretation (commission on what the customer actually paid, not pre-discount subtotal).
One thing worth a real answer, not just a note this time: is discount_amt-then-commission actually confirmed against how Zomato/Swiggy calculate it, or is max(0, subtotal - discount) the reasonable-sounding assumption the code defaulted to? This is genuinely ambiguous in the real world — some aggregators compute commission on subtotal before any platform-funded discount, since the discount is their promotion, not the restaurant's cost. If Zomato ran a "50% off" promo funded by Zomato itself, charging the restaurant commission on the discounted ₹800 instead of the full ₹1000 could mean you're actually undercollecting compared to what the payout statement will show. This won't surface as a bug — it'll surface as "why doesn't my calculated commission match what showed up in my bank deposit" a month from now, and it'll be genuinely hard to trace back to this line of code. Worth a note in the code comment flagging it as an assumption, and worth checking against one real Zomato/Swiggy payout statement when you have one, rather than treating this as settled.
Everything else: done. Aggregator commission tracking is closed.
