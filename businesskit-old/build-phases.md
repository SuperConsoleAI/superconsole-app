# Shop — Build Phases (Simple Overview)

> How we go from schema to a working app, step by step.
> Explained simply — just enough to know what happens when.

---

## The Big Picture

```
Phase 0   Foundation      Get the database tables ready
Phase 1   Sell Things     Add products, sell them, print bill
Phase 2   Know Your Stock Track what's coming in and going out
Phase 3   Know Your People Customers and vendors
Phase 4   Money Matters   Tax, accounts, GST
Phase 5   Book Time       Salons, hotels, restaurants, events
Phase 6   Go Online       Public storefront on the web
Phase 7   Run People      Staff, routes, payroll
Phase 8   Talk To It      Agent chat can do everything above
```

Each phase = something a real shop owner can actually use.
We don't build all 62 tables and then start testing — we build a
thin vertical slice, test it, then widen it.

---

## Phase 0 — Foundation

**What we do:** Wire up all 5 schema files so the Tauri app can create
these tables on the user's Turso database the first time it connects.

**Why first:** Nothing works without tables existing.

**Done when:** App opens, connects to a fresh Turso DB, all 62 tables
appear. Nothing crashes.

---

## Phase 1 — Sell Things (Physical Goods Core)

**What we do:** Add a product, put a price on it, sell it, print/share
a bill. The smallest complete loop.

**Tables touched:** `shop_items`, `shop_units`, `shop_categories`,
`shop_documents`, `shop_document_lines`, `shop_document_payments`

**Why now:** This is the smallest useful thing a shop owner can do.
Everything else builds on top of this loop.

**Done when:** Add a product in the app → sell it → invoice appears
with correct total → payment recorded.

---

## Phase 2 — Know Your Stock

**What we do:** Track how much of each item you have, where it is,
and get warned when you're running low.

**Tables touched:** `shop_warehouses`, `shop_stock_ledger`,
`shop_stock_adjustments`, `shop_reorder_rules`, `shop_stock_transfers`,
`shop_item_variants`, `shop_item_batches`, `shop_barcodes`

**Why now:** Once you can sell (Phase 1), you need to know what's left.
This phase connects every sale to a stock deduction automatically.

**Done when:** Selling an item reduces stock. Buying adds stock.
Low stock shows an alert. Scanning a barcode finds the item.

---

## Phase 3 — Know Your People

**What we do:** Proper customer and vendor records instead of typing
a name every time. Track who owes you money and who you owe.

**Tables touched:** `shop_customers`, `shop_vendors`,
`shop_vendor_items`, `shop_price_lists`

**Why now:** Once stock (Phase 2) is working, purchases from vendors
and repeat customer sales need real records, not one-off names.

**Done when:** Pick a customer from a list when billing. Pick a
vendor when creating a purchase order. Credit/outstanding shows correctly.

---

## Phase 4 — Money Matters

**What we do:** Proper tax calculation (GST/VAT), accounting books,
and government filing trackers.

**Tables touched:** `shop_tax_configs`, `shop_tax_rates`,
`shop_hsn_sac_codes`, `shop_gst_returns`, `shop_einvoice_log`,
`shop_eway_bill_log`, `shop_tds_tcs_entries`, `shop_currency_rates`,
`shop_accounts`, `shop_journal_entries`, `shop_journal_lines`,
`shop_bank_accounts`, `shop_bank_transactions`, `shop_expenses`

**Why now:** By this point real invoices are flowing (Phase 1-3).
Now we make sure the tax is calculated right and books balance.

**Done when:** Every invoice shows correct tax breakdown. P&L report
works. Bank reconciliation matches. GST return numbers are correct.

---

## Phase 5 — Book Time

**What we do:** Anything booked by time instead of bought outright —
salon appointment, hotel room, restaurant table, event ticket, rental.

**Tables touched:** `shop_locations`, `shop_reservations`,
`shop_booking_guests`, `shop_folios`, `shop_bom_headers`,
`shop_bom_lines`, `shop_production_orders`, `shop_production_logs`

**Why now:** This is a separate mental model from Phase 1-4 (buying
goods). We build it as its own vertical once the money/stock/people
layer is solid, so bookings can still generate correct invoices and tax.

**Done when:** Book a hotel room for 2 nights → no double booking
allowed. Book a salon slot with a specific stylist. Restaurant KOT
prints for the kitchen. Hotel checkout settles the folio into one bill.

---

## Phase 6 — Go Online

**What we do:** Public storefront where customers order without
calling or walking in. Cart, checkout, order tracking.

**Tables touched:** `shop_collections`, `shop_orders`,
`shop_order_lines`, `shop_order_fulfillments`, `shop_cart_sessions`,
`shop_discount_codes`, `shop_shipping_rates`

**Why now:** Everything before this (products, stock, tax, bookings)
must work correctly on the back office first. Now we expose a safe
slice of it to the public internet.

**Done when:** A stranger can visit `username.businesskit.io`,
browse products/events/rooms, pay online, and the order appears
correctly in the dashboard — stock decreases, tax is applied.

---

## Phase 7 — Run People

**What we do:** Staff accounts, salesman routes for distributors,
and full payroll (salary, attendance, payslips).

**Tables touched:** `shop_staff`, `shop_sales_routes`,
`shop_route_visits`, `shop_employees`, `shop_salary_components`,
`shop_attendance`, `shop_payroll_runs`, `shop_payslips`,
`shop_metal_rates`, `shop_making_charges`, `shop_vehicles`,
`shop_service_jobs`

**Why now:** This is business-specific depth (jewellery, automobile,
distribution, payroll) added once the universal core (Phase 1-6)
is proven and stable across all business types.

**Done when:** Waiter-wise sales report works. Salesman route +
visit log works. Monthly payroll run generates correct payslips.
Jewellery pricing calculates metal rate + making charge correctly.

---

## Phase 8 — Talk To It

**What we do:** Connect the AI agent so the user can say
"add a new product" or "show me today's bookings" in chat, and it
actually reads/writes the same tables the app uses.

**Why last:** The agent is only as good as the app underneath it.
Every phase before this must work through the UI first — the agent
just becomes another way to trigger the same actions.

**Done when:** User types a request in chat → agent creates/updates/
deletes the right row → same data shows up instantly in the Tauri
app and the web dashboard.

---

## One Rule Across All Phases

Each phase must end in something a real shop owner can use —
not just tables existing, not just code compiling.
If a phase is "done" but nobody could actually use it that day,
it's not done.

---

## What Comes Next

After this file, we create **one file per phase** — same simple style,
but zoomed into that phase: what commands (`/commands/*.rs`) get built,
what the Tauri UI needs, what order things happen in.

We start writing those only once you say go on a specific phase.
