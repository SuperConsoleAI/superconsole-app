# Instruction: Service-Mode Analytics Grouping

> `shop_documents.service_mode` (dine_in/takeaway/delivery/drive_thru)
> writes correctly from the POS switcher. Nothing confirmed to read it
> back yet. This is the "does the data actually reach a report" check.

---

## Part 1 — Checks (report back before building)

1. Find whatever job/command populates `shop_analytics` daily snapshot
   rows (likely something in `commands/analytics.rs` or a scheduled
   aggregation function). Read its query — does it group by anything
   beyond `item_type`? Confirm `service_mode` is not already grouped by
   anywhere, so this isn't duplicate work.
2. Does any existing dashboard screen have a chart/card designed for a
   dine-in/delivery/takeaway split that's just sitting empty because the
   data was never grouped this way — or does the UI not exist at all
   either? This determines whether Part 2 is backend-only or needs a
   small frontend card too.
3. Confirm `shop_analytics`'s current unique index
   (`profile_id, snapshot_date, item_type`) — adding a new grouping
   dimension needs to extend this, not conflict with it.

---

## Part 2 — Build

1. Add `service_mode` as a second segment dimension on `shop_analytics`,
   same pattern as `item_type` (which already supports `'all'` as a
   catch-all row):

   ```sql
   ALTER TABLE shop_analytics ADD COLUMN service_mode TEXT NOT NULL DEFAULT 'all';
   ```

   Update the unique index to `(profile_id, snapshot_date, item_type,
   service_mode)`.

2. Update the daily aggregation job to write one row per
   `(item_type, service_mode)` combination actually present that day —
   don't pre-generate empty rows for combinations with zero orders, same
   sparse-row approach the table already uses for `item_type`.

3. Keep the existing `item_type = 'all', service_mode = 'all'` row as the
   grand total — nothing downstream that already reads the un-split
   total should break.

4. Small dashboard card: today's order split by `service_mode` as a
   percentage breakdown (dine-in X%, delivery Y%, takeaway Z%) — this is
   the Petpooja-style chart flagged as the reason this field exists.
   Confirm from Check 2 whether this slots into an existing empty chart
   or needs a new one.

---

## Part 3 — Self-check

1. Create 3 dine-in orders, 2 delivery orders, 1 takeaway order on the
   same day. Run the daily aggregation job. Print the resulting
   `shop_analytics` rows — confirm 3 segmented rows (plus the `'all'`
   total row) with correct counts/revenue per `service_mode`.
2. Confirm the `'all'` row's totals equal the sum of the 3 segmented
   rows — no double-counting, no dropped orders.
3. Run an aggregator order through (from Phase 9) with `service_mode:
   'delivery'` alongside a POS dine-in order — confirm both land in the
   same `service_mode` bucket correctly regardless of `channel`
   (aggregator vs POS are different channels but both can be delivery or
   dine-in respectively) — this is the actual proof that `channel` and
   `service_mode` are properly independent dimensions, not conflated.
4. Cancel one of the delivery orders (via `shop_cancel_aggregator_order`
   or the equivalent POS void). Confirm the next day's aggregation run
   doesn't count it, and if same-day aggregation already ran before the
   cancellation, confirm whether a re-run corrects the snapshot or if
   it's a permanent overcount — state which happens, don't assume.
5. Print the dashboard card (if built in Part 2) with this test data —
   confirm the percentage breakdown adds to 100% and matches the raw
   counts.

Bigger finding than expected — worth pausing on before approving, since this isn't the "near-free" wiring task it looked like from outside.

**The real gap isn't "service_mode missing from aggregation" — it's that `shop_analytics` has never been populated at all.** That's a materially different scope than what was asked. Building `shop_aggregate_daily_analytics` from scratch is the right call, but three things need deciding before it ships, because getting them wrong now means redoing this later alongside every other report that eventually reads this table:

**1. What triggers the aggregation — and does it match the pattern already established elsewhere?** `shop_billing_analytics` already solved "how do we keep a rollup fresh" with an on-demand, incremental approach (`last_aggregated_at`, re-windowed on each visit, aggregated since last visit rather than a true background cron) — per its own design comment, this mirrors `cms_analytics`. A Tauri desktop app has no persistent server-side scheduler anyway, so a genuine cron-style "daily job" may not even be architecturally honest here — it can only really run when the app is open. **Ask directly: is `shop_aggregate_daily_analytics` going to follow the same on-demand/last-aggregated-at pattern as `shop_billing_analytics`, or is it a different aggregation paradigm?** If it's different, that's two separate mental models for "how does BusinessKit keep summary tables fresh" living side by side — worth a real reason, not just because this instruction file happened to say "daily snapshot."

**2. Idempotency on re-run — this was flagged in Part 2 of my instruction but not actually detailed in the check report.** If the aggregation runs, someone cancels an order, and it runs again for the same `snapshot_date`, does it `UPDATE`/replace the existing row for that date, or does re-running duplicate/increment on top of stale numbers? Given no unique-index conflict handling was mentioned beyond the new composite unique index, confirm the write path is `INSERT ... ON CONFLICT DO UPDATE` (upsert) against that index, not a naive insert that would just fail or a blind increment that would double-count on a second run.

**3. Given this table has apparently been dead code until now — is anything else silently depending on it being populated that this check should have also surfaced?** `shop_item_analytics`'s own design comment says "Agents read this — never scan documents," implying the CEO/CBO agent features assume this data exists. Worth one more check: does any existing agent/reporting command already query `shop_analytics` expecting data and just silently returning empty results right now? If so, this fix quietly fixes more than the service-mode task — worth knowing what else lights up.

Get 1–3 answered, then proceed with the build as scoped in steps 1–5.

All three answers are correctly reasoned and, importantly, answer 3 is a genuinely valuable finding — confirming `shop_analytics` was fully dead code with zero readers means this build can't accidentally break anything else, which de-risks it completely. Good instinct running the actual codebase search rather than assuming.

One real gap in answer 2 worth catching before it ships, though — the write query only recalculates `(item_type, service_mode)` combinations that **still have at least one non-cancelled order**. If a delivery order gets cancelled and it was the *only* delivery order that day, the re-aggregation query won't produce a `service_mode = 'delivery'` row at all on re-run — but the earlier run already wrote one with `orders_count: 1`. The upsert only fixes rows the new query actually emits; it does nothing to a row from a prior run that no longer has any matching source data. That's a stale row silently left behind, not a duplicate — the opposite failure mode from what was tested, so it wouldn't show up as an obvious problem.

**Ask directly: does the aggregation delete existing rows for that `(profile_id, snapshot_date)` before inserting the current run's segments, or does it only ever upsert what the current query returns?** If it's upsert-only with no cleanup step, that's a real bug for exactly the scenario in test 4 (cancel the only order of a given mode) and needs a `DELETE FROM shop_analytics WHERE profile_id = ? AND snapshot_date = ? AND ...` (rows not touched by this run) before or alongside the upsert.

Proceed with the build, but make sure the self-check suite's test 4 specifically covers **cancelling the only order of a given service_mode** (not just one of several), since that's the exact case that would expose this if it's unhandled.

____

Test 4 confirmed the exact fix asked for — `DELETE` before insert killed the stale-row bug correctly, and the monthly rollup cascading that same correction through is the right multi-tier behavior. That's genuinely closed.

The rename is a good instinct and the daily→monthly hierarchy is sound — but before this gets called done, one real naming conflict needs to be resolved, not just noted.

**`shop_billing_analytics` already exists, has a different granularity (lifetime cumulative + rolling JSON windows), and the new naming scheme doesn't obviously nest with it.** Read literally, "daily/monthly/billing" doesn't read as a clean three-tier hierarchy the way "daily/monthly/yearly" or "daily/monthly/lifetime" would — a future engineer (or Claude Code six months from now) looking at three tables named `shop_daily_analytics`, `shop_monthly_analytics`, `shop_billing_analytics` has no naming signal that the third one is the lifetime/cumulative tier sitting above the other two. It reads like an unrelated fourth thing.

**Ask directly before moving on: should `shop_billing_analytics` also get renamed for consistency (e.g. `shop_lifetime_analytics`), or is it staying as-is because "billing" means something specific and distinct from "analytics rollup" that shouldn't be folded into this naming scheme?** If the answer is "billing_analytics is a different concept, not part of this hierarchy" — fine, but that's worth stating explicitly in a schema comment so it's not mistaken for an inconsistency later. If it's genuinely the same kind of thing under a stale name, this is the moment to fix it, since `shop_item_billing_analytics` (the per-item twin) would need the same rename and it's far cheaper to do both now than after more code references it.

One more small thing worth confirming, not blocking: **`shop_get_service_mode_analytics` — does it query `shop_daily_analytics` for short ranges and `shop_monthly_analytics` for long ranges, or does it always hit the daily table regardless of range?** If a dashboard ever asks "service mode split over the last year," querying 365 daily rows per profile isn't the disaster querying raw documents would have been, but it also isn't using the monthly table's whole reason for existing. Not a bug, just check whether the command is actually range-aware or whether `shop_monthly_analytics` currently has zero readers, same blind spot `shop_analytics` had before this whole thread started.

Get those two answered, and this one's fully closed too.

Both answers are correct and complete — the distinction between time-series rollups and O(1) header caches is a real architectural difference, not an inconsistency, and documenting it in a schema header is exactly the right way to preempt future confusion rather than relying on someone remembering this conversation. Range-aware routing to `shop_monthly_analytics` for 12m/yearly means it now has an actual reader, closing the same "dead table" risk that started this whole task.

**Service-mode analytics grouping is fully closed.**

Last item from your original "all 3" list: hotel booking rate/rules UI. This one's a bigger build than the other two — `rate_overrides`/`booking_rules` exist as columns, but nothing confirmed yet whether the reservation-pricing logic actually reads them (vs. still silently using flat `base_rate`), which is the real risk given how service-mode analytics just turned out to be sitting on a completely unpopulated table. Want that instruction file now?
