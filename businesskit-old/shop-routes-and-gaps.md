# Shop — Route Map + Marg Coverage Gap List

---

## Part 1 — Businesses We Support vs Marg's Full Menu

### Marg's Complete Business List (from their nav)

**Retail:**
Pharmacy Shop, Kirana/Grocery, POS, Jewellery, Restaurant, Garment, Retail (general), Salon, Chemist

**Distribution:**
Pharma Distribution, FMCG Distribution, Mandi (AADHAT/grain market), Warehouse Management, Wholesale Distribution, Automobile, Supply Chain, DMSXpert/Multi-location

**Manufacturing:**
ERP (general), Pharmaceutical Manufacturing, Ayurvedic & Homeopathic, Automobile Industry, Textile, Assembling Industry, Process Manufacturing, Food & Beverage

**Other Products:**
CA Community, ECOD Secure (data security), Payroll, Sales Force Automation, Billing, GST, Inventory, Invoice, Accounting, e-Invoicing, GST Accounting, Solution for CA/Tax Practitioners, Digital Healthcare, Retail Chain Management, Pharma ERP, Manufacturing Management

---

### What We Support Right Now

| # | Business Type | Status | Notes |
|---|---|---|---|
| 1 | Retail / general shop | ✅ Full | items + stock + billing + POS via Tauri |
| 2 | Grocery / Kirana | ✅ Full | batches for perishables, expiry alerts, reorder |
| 3 | Pharmacy / Chemist | ✅ Full | batch tracking, expiry, HSN, GST compliance |
| 4 | Restaurant / Café | ✅ Full | KOT, tables, staff, recipes/BOM, happy hours |
| 5 | Hotel / Stay / Homestay | ✅ Full | rooms, reservations, folios, guests, check-in/out |
| 6 | Salon / Spa / Boutique | ✅ Full | staff, slots, appointments, service billing |
| 7 | Clinic / Doctor / Dentist | ✅ Full | appointments, slots, staff, invoicing |
| 8 | Service provider (remote) | ✅ Full | web dev, lawyer, tutor — service items, invoicing |
| 9 | Event organiser | ✅ Full | events, tickets, online checkout, attendees |
| 10 | Rental business | ✅ Full | cars, equipment — date-range reservations |
| 11 | Wholesale / Distributor | ✅ Full | salesman routes, consignment, multi-warehouse |
| 12 | FMCG Distribution | ✅ Full | salesman beats, route visits, retailer orders |
| 13 | Pharma Distribution | ✅ Full | batch/expiry + distribution routes |

---

### What We Do NOT Support Yet

| # | Marg Business Type | Why Not Supported | Effort to Add |
|---|---|---|---|
| 1 | **Jewellery** | Needs daily metal rates (gold/silver per gram), making charges per gram, hallmark/cert tracking, weight-based pricing. Our price system is flat-rate. | Medium — 2 new tables: `shop_metal_rates`, `shop_making_charges`. Add weight fields to items. |
| 2 | **Garment / Textile** | Fabric roll tracking, dye lot management, shade variation. We intentionally skipped. | High — deliberately deferred |
| 3 | **Automobile (retail/service)** | Vehicle-linked service history, VIN/chassis tracking, spare parts with fitment data (which part fits which car model), insurance claim handling | Medium — `shop_vehicle_profiles`, fitment data on items |
| 4 | **Automobile (manufacturing/distribution)** | Same as above + production routing complexity | High |
| 5 | **Mandi / AADHAT (grain market)** | Commission-based trading (you buy on behalf of farmer, sell to buyer, charge % commission). Not buy-low-sell-high. Completely different P&L model. | High — different revenue model |
| 6 | **Pharmaceutical Manufacturing** | Batch manufacturing records (BMR), Schedule M compliance (India drug law), stability testing, batch release sign-off. Regulatory, not just operational. | High — pharma-specific compliance |
| 7 | **Ayurvedic / Homeopathic** | Same as pharma manufacturing + ingredient sourcing compliance | High |
| 8 | **Assembling Industry** | Multi-stage BOM, work-in-progress tracking per station. Our BOM is flat (one level). | Medium — add process routing to BOM |
| 9 | **Process Manufacturing** | Continuous production (oil, chemicals, food factory). Yield varies per batch, not fixed. Co-products and by-products. | High — different production model |
| 10 | **Food & Beverage (manufacturing)** | FSSAI compliance, batch recall tracking, shelf-life management at manufacturing scale | High — regulatory layer |
| 11 | **CA / Tax Practitioners** | ITR filing, TDS returns, Form 16, client-wise tax computation. Pure accounting software, not operations ERP. | Very High — different product entirely |
| 12 | **Payroll** | Employee salary, PF, ESI, TDS on salary, payslips, Form 16. Not in our scope. | Medium — `shop_employees`, `shop_payroll_runs`, `shop_payslips` |
| 13 | **Retail Chain / Multi-location** | Central dashboard across multiple owned outlets. Our model = each outlet is a separate profile. Consolidated reporting across profiles = future. | Medium — cross-profile analytics layer |
| 14 | **ECOD Secure** | Data security / encryption product. Not our domain. | N/A |
| 15 | **Sales Force Automation (SFA)** | GPS tracking of field staff, live location, daily reporting to manager. We have route visits but no GPS tracking. | Medium — GPS columns on route_visits, Tauri location API |
| 16 | **Digital Healthcare** | Patient records, prescription management, ABDM (Ayushman Bharat) integration. Regulated healthcare data. | Very High — HIPAA/ABDM compliance |
| 17 | **Warehouse Management (WMS)** | Bin/rack/aisle level location inside a warehouse. We track warehouse-level only. | Medium — add bin locations to warehouses |

**Summary: 13 supported, 17 not yet (or never — some are out of scope)**

---

## Part 2 — Route Map

### Route Conventions
- All dashboard routes: `/dashboard/shop/...`
- All public storefront routes: `/[username]/shop/...`
- All API: `/api/shop/...`
- Slideout for all detail views — no `/[id]` routes in dashboard
- Top bar per section, child tabs within pages
- Accounts + Tax = shared across ALL business types at bottom of dashboard nav

---

### Dashboard Routes — Per Business Type

#### Retail / Pharmacy / Grocery / Kirana
Top bar: **Products | Orders | Inventory | Analytics**
```
/dashboard/shop/products                    list + slideout (add/edit item)
/dashboard/shop/products/orders             all orders for physical goods
/dashboard/shop/products/inventory          stock position per warehouse
/dashboard/shop/products/analytics          revenue, margin, top sellers, expiry alerts

/dashboard/shop/products/vendors            vendor list + slideout
/dashboard/shop/products/purchase           purchase orders + GRNs
/dashboard/shop/products/reorder            reorder alerts dashboard
```

#### Restaurant / Café / Cloud Kitchen
Top bar: **Menu | Tables | Orders | Kitchen | Analytics**
```
/dashboard/shop/restaurant                  today's overview: open tables, pending KOTs, revenue
/dashboard/shop/restaurant/menu             menu items list + slideout (add dish, set happy hours)
/dashboard/shop/restaurant/tables           table layout + status (available/occupied/reserved)
/dashboard/shop/restaurant/orders           all orders (dine-in/takeaway/delivery)
/dashboard/shop/restaurant/kitchen          KOT queue — for kitchen display screen (Tauri)
/dashboard/shop/restaurant/staff            waiter list + waiter-wise sales report
/dashboard/shop/restaurant/recipes          BOM/recipe manager + food cost
/dashboard/shop/restaurant/analytics        covers, revenue, top dishes, waste report
```

#### Hotel / Stay / Homestay / Villa
Top bar: **Rooms | Reservations | Calendar | Analytics**
```
/dashboard/shop/stays                       room list + status grid
/dashboard/shop/stays/reservations          all bookings (upcoming + in-house + checked-out)
/dashboard/shop/stays/calendar              master calendar: all rooms × all dates
/dashboard/shop/stays/checkin               today's arrivals (Tauri front desk view)
/dashboard/shop/stays/checkout              today's departures + folio settlement
/dashboard/shop/stays/folios                open folios (running tabs)
/dashboard/shop/stays/guests                guest list + CRM link
/dashboard/shop/stays/analytics             occupancy rate, RevPAR, avg stay length, revenue
```

#### Salon / Spa / Clinic / Doctor / Dentist
Top bar: **Services | Appointments | Staff | Analytics**
```
/dashboard/shop/services                    service list + slideout (add service, set duration)
/dashboard/shop/services/appointments       all bookings (upcoming + past)
/dashboard/shop/services/schedule           staff schedule — who is free when
/dashboard/shop/services/staff              staff list, commission settings
/dashboard/shop/services/analytics          revenue per service, per staff, utilization rate
```

#### Service Provider (Remote) — Web Dev, Lawyer, Tutor, Consultant
Top bar: **Services | Projects | Invoices | Analytics**
```
/dashboard/shop/freelance                   active projects overview
/dashboard/shop/freelance/services          service/package list + slideout
/dashboard/shop/freelance/invoices          all invoices + payment status + overdue alerts
/dashboard/shop/freelance/clients           customer list (links to CRM)
/dashboard/shop/freelance/analytics         revenue, outstanding, avg project value
```
*Note: heavily overlaps with existing `/dashboard/crm` — service providers may prefer CRM route*

#### Events
Top bar: **Events | Tickets | Attendees | Analytics**
```
/dashboard/shop/events                      events list + slideout (add event)
/dashboard/shop/events/tickets              ticket types + pricing per event
/dashboard/shop/events/attendees            attendee list + check-in (QR scan via Tauri)
/dashboard/shop/events/analytics            revenue, attendance rate, channel breakdown
```

#### Rental Business
Top bar: **Items | Rentals | Calendar | Analytics**
```
/dashboard/shop/rentals                     rental items list + slideout
/dashboard/shop/rentals/bookings            active + upcoming + overdue rentals
/dashboard/shop/rentals/calendar            item availability calendar
/dashboard/shop/rentals/analytics           utilization rate, revenue per item, damage log
```

#### Distributor / Wholesale / FMCG
Top bar: **Products | Orders | Routes | Inventory | Analytics**
```
/dashboard/shop/distribution                overview: pending orders, route coverage, outstanding
/dashboard/shop/distribution/products       product catalog + vendor pricing
/dashboard/shop/distribution/orders         sales orders from retailers + purchase orders to suppliers
/dashboard/shop/distribution/routes         salesman route list + visit log
/dashboard/shop/distribution/routes/[id]    route detail: stops, today's visits, collections
/dashboard/shop/distribution/inventory      multi-warehouse stock + consignment stock
/dashboard/shop/distribution/analytics      salesman performance, retailer sales, top SKUs
```

---

### Shared Dashboard Routes — All Business Types

These appear in the nav for every business. Same routes regardless of type.

#### Customers & Vendors
```
/dashboard/shop/customers                   customer list + slideout (full profile, orders, loyalty)
/dashboard/shop/vendors                     vendor list + slideout (items supplied, PO history, performance)
```

#### Billing / Documents
```
/dashboard/shop/billing                     create new document (invoice / estimate / PO / challan)
/dashboard/shop/billing/documents           all documents with filter by doc_type + status
/dashboard/shop/billing/[slideout]          document detail — view, print, record payment, share WhatsApp
```

#### Accounts — same for all businesses
Top bar: **Ledger | Bank | Expenses | Reports**
```
/dashboard/shop/accounts                    chart of accounts tree
/dashboard/shop/accounts/journal            journal entries list
/dashboard/shop/accounts/bank               bank accounts + reconciliation
/dashboard/shop/accounts/expenses           direct expenses log
/dashboard/shop/accounts/reports            P&L, balance sheet, cash flow, trial balance
```

#### Tax — same for all businesses
Top bar: **Overview | GST Returns | E-Invoice | TDS/TCS | Settings**
```
/dashboard/shop/tax                         compliance overview (what's filed, what's due)
/dashboard/shop/tax/gst                     GST returns list (GSTR-1, GSTR-3B, GSTR-2B)
/dashboard/shop/tax/einvoice                e-invoice log + generate IRN
/dashboard/shop/tax/eway                    e-way bill log + generate
/dashboard/shop/tax/tds                     TDS/TCS entries + challans
/dashboard/shop/tax/settings                tax regime setup (GST/VAT/Sales Tax/Exempt), GSTIN, fiscal year
```

#### Analytics Hub — all businesses
```
/dashboard/shop/analytics                   unified: revenue, margin, orders, top items, customer LTV
```

#### Settings — all businesses
Top bar: **General | Warehouses | Locations | Staff | Payments | Shipping**
```
/dashboard/shop/settings                    general shop settings
/dashboard/shop/settings/warehouses         warehouse list + slideout
/dashboard/shop/settings/locations          rooms/tables/counters/bays
/dashboard/shop/settings/staff              staff list + roles + commission
/dashboard/shop/settings/payment-modes      cash, card, UPI, bank, wallet
/dashboard/shop/settings/shipping           zones + rates
/dashboard/shop/settings/price-lists        price list management
```

---

### Public Storefront Routes — Per Business Type

```
/[username]/shop                            unified storefront home (sections by item_type)

── Physical goods ──
/[username]/shop/products                   product grid
/[username]/shop/products/[slug]            product page + add to cart

── Events ──
/[username]/shop/events                     upcoming events list
/[username]/shop/events/[slug]              event page + ticket selection + checkout

── Stays ──
/[username]/shop/stays                      rooms / properties list
/[username]/shop/stays/[slug]               room detail + date picker + availability + book

── Services / Appointments ──
/[username]/shop/book                       service list / booking home
/[username]/shop/book/[slug]                service page + staff picker + time slot + book

── Rentals ──
/[username]/shop/rentals                    rental items list
/[username]/shop/rentals/[slug]             rental item + date range picker + book

── Shared checkout ──
/[username]/shop/cart                       cart (all item types)
/[username]/shop/checkout                   single checkout page
/[username]/shop/order/[orderId]            order confirmation + details + tracking
/[username]/shop/account                    customer portal — order history, bookings, loyalty
```

---

### API Routes
```
/api/shop/availability          GET  check availability (stays: date range, events: seats, services: slots)
/api/shop/order                 POST create order (all types)
/api/shop/payment               POST record payment against document or order
/api/shop/document              POST generate invoice / booking confirmation
/api/shop/stock                 POST adjust stock (physical only)
/api/shop/einvoice              POST trigger e-invoice generation (India)
/api/shop/eway                  POST generate e-way bill
/api/shop/checkin               POST event attendee / hotel guest check-in (Tauri scan → same endpoint)
/api/shop/cart                  POST/GET cart session
/api/shop/discount              POST validate + apply discount code
/api/shop/analytics             POST write daily snapshot (cron / end-of-day trigger)
```

---

### Tauri Desktop Views (not web routes — Tauri window paths)
```
/pos                            POS billing: barcode scan, quick add, thermal print
/pos/restaurant                 Restaurant POS: table select, KOT send, split bill
/pos/hotel/checkin              Hotel check-in: pick reservation, assign room, collect ID
/pos/hotel/checkout             Hotel check-out: folio review, collect payment, print bill
/pos/kitchen                    Kitchen display: KOT queue, mark ready, print ticket
/pos/events/gate                Event gate: scan QR, mark attendee checked-in
/pos/distribution               Salesman: route for today, visit retail shop, take order, collect payment
/pos/inventory                  Quick stock count and adjustment
/pos/daily                      Today's summary: arrivals, events, appointments, open tables
```

---

## Summary

| | Count |
|---|---|
| Business types supported | 13 |
| Business types NOT supported yet | 17 (some never — out of scope) |
| Dashboard route groups (type-specific) | 8 |
| Shared dashboard routes | 5 (customers, billing, accounts, tax, analytics) |
| Public storefront routes | 17 |
| API routes | 11 |
| Tauri views | 9 |

Accounts and Tax are fully shared — same routes, same tables, same UI regardless of whether you run a restaurant or a pharmacy. The only difference is `shop_tax_configs.regime` which controls what's shown (GST returns for India, VAT for UK, nothing for exempt).
