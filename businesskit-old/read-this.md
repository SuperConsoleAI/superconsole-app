Proceed with A and C. Hold B.

**A — CRM identity + join:** proceed as written, with `accepts_whatsapp_marketing INTEGER NOT NULL DEFAULT 0` added to the same migration batch alongside `accepts_email_marketing`/`accepts_sms_marketing`. Also add `shop_customers.loyalty_pts_expiring_at INTEGER` to this batch — denormalized next-expiry lookup derived from `shop_loyalty_ledger.expires_at`, same rule as every other denormalized total on that table: never written directly, only recalculated as a side effect of a ledger insert or expiry sweep.

**C — wallet:** proceed, but scope it to `shop_customer_credit_ledger` only — that table's currency, already built, don't touch `shop_loyalty_ledger` for any of this. Add `shop_customers.wallet_balance REAL NOT NULL DEFAULT 0`, entry types `topup | redeem | refund | adjust`, and wire `wallet` into `shop_document_payments.payment_mode` — redeeming rejects if `amount > wallet_balance`.

Also add, separately from wallet — points redemption at checkout, one new command, no new tables: `shop_redeem_loyalty_points(customer_id, document_id, points_to_redeem)`. Validates against `loyalty_pts`, looks up the conversion rate from `shop_configs`, writes one `shop_loyalty_ledger` row (`entry_type: redeem`, `document_id` set), and applies the value to the document's existing `discount_amt` field — points are a checkout discount, not a payment method, so they never touch `shop_customer_credit_ledger` or `payment_mode`. Keep this fully separate from the wallet commands; the two ledgers don't talk to each other.

**B — still hold.** Don't touch `email_templates`/`email_campaigns` until you answer: is `crm_templates.type` (email/sms/whatsapp/dm/proposal) doing one-off personalized sends while `email_campaigns` does bulk-send-with-tracking — two different jobs — or is there real overlap? If `crm_templates` already owns "what channel," bulk campaigns should reference `crm_templates.id` rather than growing a second channel concept on `email_templates`. Answer that first, then I'll greenlight B.

___

B — hold. Before touching email_templates/email_campaigns, explain how crm_templates.type (email/sms/whatsapp/dm/proposal) is actually used today versus email_campaigns. Is crm_templates for one-off personalized messages (proposals, follow-ups sent by a person) while email_campaigns is bulk-send infrastructure with tracking/stats — two different jobs that happen to both reference "channel"? Or is there real overlap? Don't add a channel column to email_templates until that's answered — if crm_templates already owns "what channel is this message," bulk campaigns should probably reference crm_templates.id rather than growing a second, competing channel concept on email_templates.
____________

Good question to catch — that's a real doc-vs-code mismatch, not something to guess past.

`DOMAINS.md` (which is what I've been working from) lists `email_campaigns`, `email_templates`, `email_tracking_events`, `email_tracking_stats` as living in `email.rs`. But Claude Code's own report just now uses different names — `email_events` / `campaign_events` — not `email_tracking_events`. That's either doc drift (DOMAINS.md wasn't regenerated after a rename) or Claude Code is describing something that doesn't match what's actually in the file. Either way, I shouldn't keep reasoning about B against a table I haven't confirmed exists in its current form — that's exactly how you end up building against a stale docs mirror instead of the real schema.

**Before deciding B at all**, ask Claude Code to literally paste the current contents of `src-tauri/src/db/schema/email.rs` — every table name, exact columns. Don't let it summarize or paraphrase; you need the real DDL to settle whether `email_campaigns` (newsletter) exists as its own table, whether it's already been renamed to something else, and whether an SMS/WhatsApp campaign mechanism already exists elsewhere that you've forgotten about.

Separately, one real bug worth flagging from what just came back on **C**: the walkthrough diagram shows `WAL_LEDG --> WAL_BAL[shop_customers.wallet_balance & store_credit]` — that reads like there are *two* columns being updated together, `wallet_balance` and `store_credit`. We explicitly killed `store_credit` as a name earlier because it collides with `credit_used`/`credit_limit` (opposite direction — udhar vs prepaid). If `store_credit` is a leftover column from before this conversation that's still being written to alongside the new `wallet_balance`, that's duplicate state that will drift out of sync. Ask Claude Code directly: **does `shop_customers.store_credit` still exist as a real column, and if so, is anything other than `wallet_balance` supposed to be the source of truth?** Get that answered before calling C done — the loyalty half (earn/redeem/expiry) looks correct against spec, but the wallet half needs this cleared up first.

Thought for 11s

Thought for 11s
That kills the whole B premise cleanly — good thing we held it. There's no email_campaigns/email_templates to generalize because they never existed; DOMAINS.md was stale docs, not the real schema. Nothing to migrate, nothing to rename.
What the real architecture actually is:
email_events = pure tracking log, polymorphic via "exactly one of newsletter_id/purchase_id/proposal_id/invoice_id is set"
Newsletters are CMS content (cat_20), not a dedicated campaign table
Templates already live in crm_templates with type covering all channels
The actual gap this reveals: newsletters get to piggyback on CMS content-as-object. SMS/WhatsApp blasts have no equivalent object — there's no "campaign" row anywhere that says this template, to this audience, via this channel, sent/scheduled/status. That's the one thing genuinely missing, and it's smaller than what B originally proposed.
Minimal fix, following the pattern that's already there:
One new table, crm_campaigns — header record: template_id (→crm_templates.id), channel, audience_filter (JSON, matches shop_get_campaign_audience's filter shape), status, scheduled_at, sent_at.
Extend email_events's existing "exactly one of" polymorphic pattern with a fifth nullable column: campaign_id TEXT. Same tracking table, same triggers, no new tracking infrastructure — it already does dedup, event types, and stats aggregation.
Newsletter sends optionally get a crm_campaigns row too (channel: email, template pointing at the CMS content) so "how many people did this newsletter reach" and "how many people did this SMS blast reach" are the same query shape, not two.
Net: 1 new table, 1 new column on an existing table, 0 renames. Smaller footprint than the original B instruction, and it doesn't touch anything that's currently working.
Want this written up as the instruction file to send Claude Code, or do you want to sit with it first given how much B moved from what we started with?

______

Approve #1, hold part of #2.

**POS switcher — proceed as written.** No notes, straightforward.

**Review linking — approve `document_id`/`reservation_id` on `review_requests`, reject touching `testimonials`.**

Here's the mismatch: none of the three review tables actually store *a submitted review* (rating + text, tied to a transaction). Each one does something else:

- `review_requests` — tracks the *ask* ("we sent a review request to this contact via SMS"). Adding `document_id`/`reservation_id` here is correct — a request naturally originates from a completed order/stay, you need to know which one to ask about.
- `testimonials` — has `media_id`/`slider_id`, which reads as a *curated marketing display* table (handpicked quotes for the website), not a raw review store.
- `reviews_synced` — external platform ingestion (Google etc.), read-only mirror of things said elsewhere.

Bolting `document_id`, `reservation_id`, and `direction` onto `testimonials` conflates two different jobs: "a review that happened" and "a review we chose to feature on the site." Worse, `direction: host_to_guest` (business rates the guest) has no business ever appearing on a public testimonials page — you'd never showcase "we gave our guest 3 stars" as marketing copy. Adding that field there is structurally wrong, not just messy.

**Ask Claude Code directly before proceeding:** when a customer actually submits a review in-app after receiving a `review_requests` prompt, where does that submission get stored today? If the honest answer is "nowhere — there's no native review-capture table, only the outbound request and the external sync," that's the real gap, and it's a small one: one table (or a `reviews` addition, whatever naming avoids collision with `reviews_synced`) with `document_id`/`reservation_id`/`contact_id`/`direction`/`rating`/`review_text`/`is_published`. `testimonials` can later reference one of those rows via `source_review_id` if you want to promote a good review to featured status — that keeps "review" and "marketing highlight" as two different things instead of one overloaded table.

Get that answer before touching `testimonials` at all.

______________

Approve — this is exactly right and matches what was asked. One addition before it ships, and one thing to keep an eye on.

**Add the FK to `contact_id` explicitly if it's not already implied** — `reviews.contact_id` should point at `crm_contacts.id`, same identity spine as `shop_customers.contact_id`. Worth a quick confirm from Claude Code that it's using the same contact reference pattern rather than inventing a parallel one, since this table sits right next to the CRM live-join work from earlier — a review needs to be queryable by the same audience filters (`shop_get_campaign_audience`-style) eventually, e.g. "customers who left a 5-star review."

**One structural note, not a blocker:** `rating INTEGER NOT NULL` on a table that also serves `host_to_guest` — does a business rating a guest actually need a star rating, or is that direction more likely to be freeform notes (a "flag this guest" style note, not a public 5-star score)? If `host_to_guest` entries will always have `is_published = 0` anyway (you'd never publish a rating of a guest), then `rating NOT NULL` is fine as-is since it's an internal field regardless. Not asking to change anything — just confirm that's the intended use before it's live, since retrofitting a nullable rating later means a migration.

Otherwise: proceed with provisioning `reviews` and the `review_requests` columns.

Same table, one more nullable link — this is the third leg of the same polymorphic pattern, not a new system.

**Extend `reviews` with `item_id`:**

```sql
item_id TEXT,        -- shop_items.id — storefront product review
variant_id TEXT,      -- optional: review of a specific size/color, not just the item
```

Now `reviews` links to exactly one of `document_id | reservation_id | item_id` — same "exactly one of" discipline `email_events` already uses for its polymorphic FKs. `direction` stays meaningful for the hospitality case (`guest_to_host`/`host_to_guest`); for a product review it's just always the customer reviewing the product, so the field is present but only one direction is ever used there — no need to invent a new enum value for it.

**Two things product reviews specifically need that the hospitality/restaurant case didn't:**

1. **`is_verified_purchase INTEGER NOT NULL DEFAULT 0`** — set at write time by checking whether `contact_id` actually has a `shop_document_lines`/`shop_order_lines` row for that `item_id`. This is the single biggest trust signal on any storefront review section (Amazon-style "Verified Purchase" badge) — worth the column rather than leaving it to be computed live every render.

2. **Denormalized `avg_rating`/`review_count` on `shop_items`** — a product listing grid needs to show stars on 20+ items at once without 20 separate `AVG()` queries. Same rule as every other denormalized field already in this schema (`wallet_balance`, `loyalty_pts_expiring_at`): two new columns on `shop_items`, updated only as a side effect of a `reviews` insert/publish, never written directly.

```sql
-- shop_items
ALTER TABLE shop_items ADD COLUMN avg_rating REAL NOT NULL DEFAULT 0;
ALTER TABLE shop_items ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
```

Net addition to what's already being provisioned: 2 columns on `reviews`, 2 columns on `shop_items`. No new table — this was the right moment to catch it, since `reviews` is being created fresh right now rather than needing a second migration pass later.

Want this folded into the same instruction/go-ahead you just sent Claude Code, or should I write it as its own short follow-up so the two conversations don't blur together?

___

All three resolved correctly on the mechanics that matter. Two follow-ups before calling this fully closed — one's a weak test, not a bug; the other's a real business-logic question worth raising even though it's not blocking.

1. The loyalty/stats reversal test happened to use a first-time customer — that's a weak proof. Vikram Seth went from total_orders: 1 → 0, total_spent: 189 → 0, loyalty_pts: 10 → 0 — every field landing exactly at zero is what you'd see whether the logic does correct subtraction or incorrectly resets the customer to a blank slate. Those look identical when it's someone's only order. Ask for the same cancellation test on a customer with prior history — say, 3 previous orders totaling ₹2000 and 40 existing loyalty points, then cancel one aggregator order worth ₹189/10pts on top of that. Confirm the result is total_orders: 3, total_spent: 2000, loyalty_pts: 40 — not zero, and not still counting the cancelled order.
Related edge case in the same area: if a customer earned 10 points from this order and then redeemed those same 10 points on a completely different order before the aggregator's cancellation webhook arrived, does the reversal entry drive loyalty_pts negative, or is there a floor guard like the MAX(0, ...) already used for total_orders/total_spent? The report didn't mention one for points specifically. This is a real sequencing gap — cancellation webhooks from aggregators can arrive hours after the order, more than enough time for points to already be spent elsewhere.
2. Not a bug, but worth flagging for whoever owns tax/compliance next: the SALESTAX regime path stores a lump sales_tax figure rather than a jurisdiction breakdown, which is fine for now — but in a lot of US states, DoorDash/Uber Eats are legally the ones collecting and remitting sales tax under marketplace facilitator laws, not the restaurant. If that lump sales_tax figure ever feeds into fin_tax_nexus/fin_tax_returns as though the restaurant owes it, you'd double-count tax liability that the aggregator already handled. Nothing to fix in Phase 9 — just don't let this tax_breakdown get pulled into a filing calculation later without checking who actually owes it.
Get the repeat-customer decrement test and the points-floor answer back, and Phase 9 is genuinely done.

____

Both tests are clean, and the important part — no reset-to-zero, real subtraction, real floor guard — holds up under a customer with actual history. Phase 9 is close, but one thing in the floor-guard result needs resolving before it's "done," and one new architectural claim in the report needs a sanity check.

**The floor guard fixes the crash but likely breaks the ledger invariant.**

`shop_loyalty_ledger` is append-only and exists specifically so `SUM(ledger entries for a customer) == shop_customers.loyalty_pts` always holds — that's the whole design rationale, same as `shop_stock_ledger`'s `balance_after`. In the test: customer earned 20, spent down to 5, then the reversal fired for -20.

Ask directly: **did the `refund` ledger row get written as `-20` (matching the original earn) or `-5` (the actual amount the floor allowed to be deducted)?** If it's `-20`, the ledger now says the customer should be at `5 - 20 = -5`, but the actual column reads `0` — the audit trail and the balance permanently disagree by 5 points, and no one auditing "why doesn't this customer's ledger sum match their balance" will have an easy answer six months from now. If it's `-5` (clamped to match what was actually deducted), that's correct — the ledger stays truthful even though the customer effectively "kept" 5 points they shouldn't have because they spent them before cancellation. Get this confirmed; if it's writing `-20`, that's a real fix needed, not just a note.

**The analytics table boundary in point 3 is a new claim, not something previously established** — worth verifying before accepting it. `DOMAINS.md` describes `shop_analytics`/`shop_item_analytics` as generic daily snapshots with an `item_type` filter, no channel/source restriction, and `shop_billing_analytics`/`shop_item_billing_analytics` as separate lifetime-aggregate tables (also channel-agnostic in their original description). The "POS vs online+aggregator" split in this report reads like it could be Claude Code's own explanation constructed to justify where aggregator order revenue landed, rather than an actual pre-existing convention. Ask directly: **is this boundary something that was already true in the code before Phase 9, or is it a new distinction being introduced right now as part of this work?** If it's new, that's a real schema-adjacent decision (which analytics table aggregator revenue rolls into) that should get its own explicit instruction file rather than being asserted as settled fact in a test report — it affects every future revenue report you pull.

Resolve those two and Phase 9 is genuinely, fully done.
