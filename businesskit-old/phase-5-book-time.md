# Phase 5 — Book Time

> Goal: anything booked by time instead of bought outright — a salon
> appointment, a hotel room, a restaurant table, an event ticket, a
> rental. No double-booking, ever.

---

## What We're Building

Everything from Phase 1-4 was about things you can count and hand
over immediately — a product, a bag of rice, a pair of shoes. This
phase is a different kind of business entirely: things you reserve
for a slot of time. A shop owner should now be able to:

1. Set up rooms/tables/chairs/counters as bookable locations
2. Let a customer book a time slot without double-booking it
3. Book a hotel room for a date range and check the guest in/out
4. Run a restaurant table with a kitchen order ticket
5. Book a salon/clinic appointment with a specific staff member
6. Sell event tickets with limited capacity
7. Rent out equipment for a period of days
8. Cook/produce something from a recipe and track ingredient usage

---

## Tables Used in This Phase

| Table | What it's for here |
|---|---|
| `shop_locations` | Physical spots: Room 101, Table 4, Chair 2, Counter A |
| `shop_reservations` | The actual booked time slot — the anti-double-booking table |
| `shop_booking_guests` | Guest details for hotel bookings (ID proof, nationality) |
| `shop_folios` | Hotel running tab — accumulates charges during a stay |
| `shop_bom_headers` | Recipe/formula for something made from ingredients |
| `shop_bom_lines` | The actual ingredients in that recipe |
| `shop_production_orders` | "Make 50 of this today" |
| `shop_production_logs` | What was actually used and produced |

Also: `shop_items` now gets real use of `item_type` values that were
sitting unused since Phase 1 — `service`, `event`, `stay`, `rental`.

---

## The Most Important Idea in This Phase

**`shop_reservations` is a diary for time, the same way
`shop_stock_ledger` (Phase 2) is a diary for quantity.**

You can't sell the same can of beans to two people at once — Phase 2
solved that by adding up the ledger. You can't book Room 101 to two
guests on the same night either — this phase solves that the same
way: before confirming any booking, check if another confirmed
reservation already exists for that location and that time. If yes,
block it. If no, allow it.

---

## Order of Work

### Step 1 — Locations
Add a screen to create bookable locations: name, type (room / table
/ chair / counter / bay), capacity, base rate. This is the physical
map of the business — a restaurant sets up 10 tables, a hotel sets
up 20 rooms, a salon sets up 3 chairs.

### Step 2 — Turn a product into a bookable item
Back on the Phase 1 "Add Product" screen: the `item_type` dropdown
(previously always "physical") now offers Service / Event / Stay /
Rental. Picking one of these swaps the form to ask time-relevant
questions instead of stock questions — e.g. "how long is one
appointment?" instead of "how many in stock?"

### Step 3 — The booking screen (core of this phase)
Pick an item (a haircut, a hotel room, a table) → pick a date/time
→ system checks `shop_reservations` for a conflict → if free, hold
the slot → confirm → writes a row with `status = 'confirmed'`.

### Step 4 — Staff-linked bookings
If the business uses staff (from Phase 3's people work, extended
here), a booking can be tied to a specific person — "salon
appointment with Priya," "consult with Dr. Sharma." This uses the
`staff_id` already on `shop_reservations` — just needs a picker in
the UI.

### Step 5 — Hotel check-in / check-out
For `item_type = 'stay'` bookings: a front desk screen shows today's
arrivals. Checking in collects guest details (`shop_booking_guests`)
and opens a folio (`shop_folios`, `status = 'open'`). Every extra
charge during the stay (room service, restaurant bill) gets added to
the folio. Checking out totals the folio into one final invoice
(reusing Phase 1's `shop_documents` + `shop_document_lines`).

### Step 6 — Restaurant tables and KOT
For `item_type = 'service'` used as a table booking: seat a walk-in
or reserved guest at a table, take their order, send it to the
kitchen as a KOT (`shop_documents` with `doc_type = 'kot'`). Kitchen
display screen shows pending KOTs and lets staff mark them ready.

### Step 7 — Events with capacity
For `item_type = 'event'`: set total seats available. As people
book, `shop_reservations` rows accumulate. Seats remaining = total
seats minus confirmed reservations — same "add it up, don't store a
separate counter" pattern used everywhere else.

### Step 8 — Rentals
For `item_type = 'rental'`: same booking flow as a hotel room, but
for equipment/vehicles instead of a room. Date range picked, item
blocked for that range, returned at the end.

### Step 9 — Recipes and production (for restaurants/kitchens)
Build a recipe: pick a finished dish, list the ingredients and how
much of each is needed. When making a batch, log what was actually
used — this connects back to Phase 2's stock ledger, reducing raw
ingredient stock and adding finished dish stock automatically.

---

## Routes Used in This Phase

### Dashboard — Restaurant
```
/dashboard/shop/restaurant               today's overview: open tables, pending KOTs
/dashboard/shop/restaurant/menu          menu items + slideout
/dashboard/shop/restaurant/tables        table layout + status
/dashboard/shop/restaurant/kitchen       KOT queue for kitchen display
/dashboard/shop/restaurant/recipes       recipe/BOM manager
```

### Dashboard — Stays
```
/dashboard/shop/stays                    room list + status grid
/dashboard/shop/stays/reservations       all bookings
/dashboard/shop/stays/calendar           master calendar: all rooms × dates
/dashboard/shop/stays/checkin            today's arrivals
/dashboard/shop/stays/checkout           today's departures + folio settlement
/dashboard/shop/stays/folios             open running tabs
```

### Dashboard — Services (salon/clinic)
```
/dashboard/shop/services                 service list + slideout
/dashboard/shop/services/appointments    all bookings
/dashboard/shop/services/schedule        staff availability calendar
```

### Dashboard — Events
```
/dashboard/shop/events                   events list + slideout
/dashboard/shop/events/attendees         attendee list + check-in
```

### Dashboard — Rentals
```
/dashboard/shop/rentals                  rental items list + slideout
/dashboard/shop/rentals/bookings         active + upcoming + overdue rentals
```

### Shared
```
/dashboard/shop/settings/locations       rooms/tables/chairs/counters — built once, used by every type above
```

### Tauri Desktop
```
/pos/restaurant           table select, KOT send, split bill
/pos/hotel/checkin        pick reservation, assign room, collect ID
/pos/hotel/checkout       folio review, collect payment, print bill
/pos/kitchen              KOT display + print queue
/pos/events/gate          scan QR, mark attendee checked-in
```

### Not Used Yet
```
/[username]/shop/stays          → Phase 6 (public storefront booking)
/[username]/shop/book           → Phase 6
/[username]/shop/events          → Phase 6
```

---

## Commands to Build (`src-tauri/src/commands/`)

| Command file | What it does |
|---|---|
| `shop_locations_commands.rs` | create_location, list_locations, update_location_status |
| `shop_reservations_commands.rs` | check_availability, create_reservation, confirm_reservation, cancel_reservation |
| `shop_booking_guests_commands.rs` | add_guest_to_booking, list_guests_for_booking |
| `shop_folios_commands.rs` | open_folio, add_folio_charge, settle_folio |
| `shop_bom_commands.rs` | create_recipe, list_recipe_ingredients |
| `shop_production_commands.rs` | create_production_order, log_production, complete_production_order |
| `shop_kot_commands.rs` | send_kot, mark_kot_ready, list_pending_kots |

`check_availability` is the single most important function in this
phase — every booking flow calls it before confirming anything.

---

## What "Done" Looks Like

A person can:
1. Set up 5 tables in a restaurant
2. Book Table 3 for 7pm tonight — try booking it again for the same
   time and get blocked
3. Send a KOT to the kitchen, mark it ready
4. Set up 3 hotel rooms, book Room 101 for 2 nights
5. Check in a guest, add a room service charge to their folio
6. Check them out — see one final invoice with room + room service combined
7. Book a salon appointment with a specific stylist at a specific time
8. Create an event with 50 seats, sell 10 tickets, see 40 remaining
9. Create a recipe, produce 20 units, see raw ingredient stock drop

If all 9 steps work without errors, Phase 5 is complete.

---

## What We Are Deliberately Skipping in Phase 5

| Skipped | Comes in |
|---|---|
| Customers booking these themselves online | Phase 6 |
| Assigned seating for events (specific seat numbers) | Later — flagged as low priority |
| Deposit/advance payment collection at booking time | Later — flagged for a future pass |
| Salesman routes for distribution businesses | Phase 7 |
