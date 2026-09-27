# Domain Mappings & Database Schema Index

This document maps each business domain to its underlying SQLite tables, views, and triggers across the Central DB and UserDB.

> [!NOTE]
> All schema definitions (DDL statements, indexes, triggers, and migrations) are strictly located in Rust under `src-tauri/src/db/schema/*.rs`.

---

## Central Database (`src-tauri/src/db/schema/centraldb.rs`)

**Tables:**

- `organizations` — Core organization account details
- `profiles` — Profiles created under an organization
- `userdb` — Per-profile Turso DB connection parameters and `last_provisioned_at` gate
- `users` — Authenticated system users
- `license` — License state and key verification records
- `userdb_tokens` — Encrypted authentication credentials per profile

---

## E-Commerce & Item Master (`src-tauri/src/db/schema/shop.rs`)

**Tables (8):**

- `shop_categories` — Hierarchical product category tree
- `shop_brands` — Brand/manufacturer master with storefront layout sections and SEO
- `shop_units` — Units of measurement (kg, piece, hour, night, session, etc.)
- `shop_items` — Master table for all sellable goods, services, events, stays, rentals, and bundles (includes `cost_price` [PTS], `price` [PTR], `default_mrp`, `pack_size`, `conversion_factor`)
- `shop_item_variants` — Product variants (size, color, weight, pack sizes, conversion factors)
- `shop_item_batches` — Batch number, expiry date, batch-specific `mrp`, `landing_cost` (net landed cost per unit), `pack_size`, and `conversion_factor` (perishables, pharma, FMCG)
- `shop_barcodes` — Multiple barcode mappings per item/variant for POS scanners
- `shop_price_lists` — Named price tiers (retail, wholesale, staff, happy hours)

---

## Business Operations, Hospitality & Logistics (`src-tauri/src/db/schema/shop-ops.rs`)

**Tables (37):**

- **Stock (5)**: `shop_warehouses`, `shop_stock_ledger` (unit landed cost tracking), `shop_stock_adjustments`, `shop_reorder_rules`, `shop_stock_transfers`
- **People & Loyalty (7)**: `shop_customers` (credit balance, drug license no.), `shop_customer_credit_ledger`, `shop_loyalty_ledger`, `shop_configs`, `shop_vendors`, `shop_vendor_items`, `shop_staff`
- **Documents & Billing (3)**: `shop_documents` (invoices, sales orders, goods receipts, KOTs, stay check-in/out, folios), `shop_document_lines` (unit landed cost, pack sizes, conversion factors, free/scheme quantities), `shop_document_payments`
- **Storefront & Orders (7)**: `shop_collections`, `shop_orders`, `shop_order_lines`, `shop_order_fulfillments`, `shop_cart_sessions`, `shop_discount_codes`, `shop_shipping_rates`
- **Hospitality & Stays (4)**: `shop_reservations`, `shop_locations` (rooms/tables/counters), `shop_booking_guests`, `shop_folios`
- **Distribution & Routes (2)**: `shop_sales_routes`, `shop_route_visits`
- **Manufacturing & Recipes/BOM (4)**: `shop_bom_headers`, `shop_bom_lines`, `shop_production_orders`, `shop_production_logs`
- **Analytics (3)**: `shop_analytics`, `shop_item_analytics`, `shop_item_billing_analytics`
- **POS Shifts & Demo (2)**: `shop_shifts` (cash float, expected/counted cash, variance tracking), `demo_bills`
- **Specialty Verticals (4)**: `shop_metal_rates`, `shop_making_charges` (Jewellery); `shop_vehicles`, `shop_service_jobs` (Automobile)

---

## Accounts & Double-Entry Bookkeeping (`src-tauri/src/db/schema/accounts.rs`)

**Tables (7):**

- `fin_accounts` — Chart of Accounts (asset, liability, equity, income, expense tree)
- `fin_journal_entries` — Financial events auto-posted from `shop_documents` or `crm_invoices`
- `fin_journal_lines` — Balanced debit and credit lines per journal entry
- `fin_bank_accounts` — Business bank account master
- `fin_bank_transactions` — Imported bank statement rows for reconciliation
- `fin_expenses` — Direct business expenses not tied to vendor invoices
- `fin_gateway_transactions` — Staging table for payment gateway transactions (Razorpay, Stripe, UPI) and auto-reconciliation

---

## Tax & Compliance (`src-tauri/src/db/schema/tax.rs`)

**Tables (10):**

- `fin_tax_configs` — Regime configuration per profile (India GST, UK/EU VAT, US Sales Tax, Exempt)
- `fin_tax_rates` — Named tax rates with component breakdown (CGST/SGST/IGST, VAT, State/County)
- `fin_hsn_sac_codes` — HSN (goods) and SAC (services) codes mapping to default tax rates
- `fin_tax_returns` — Regime-agnostic tax return filing log (GSTR-1, GSTR-3B, VAT200, State Sales Tax)
- `fin_tax_exemptions` — B2B resale certificates, EU reverse charge, diplomatic & non-profit exemptions
- `fin_tax_nexus` — US economic & physical nexus compliance tracking per jurisdiction/state
- `fin_einvoice_log` — e-Invoice IRN & QR code generation log
- `fin_eway_bill_log` — e-Way bill records for goods movement
- `fin_tds_tcs_entries` — TDS deducted and TCS collected tracking
- `fin_currency_rates` — Daily exchange rates for multi-currency invoicing

---

## Payroll & HR (`src-tauri/src/db/schema/payroll.rs`)

**Tables (5):**

- `shop_employees` — Employee master record (PF, ESI, PAN, bank details)
- `shop_salary_components` — Earnings and deductions per employee (Basic, HRA, PF, TDS)
- `shop_attendance` — Daily attendance and leave tracking log
- `shop_payroll_runs` — Monthly payroll batch processing
- `shop_payslips` — Generated individual payslips per payroll run

---

## Core Platform & Links (`src-tauri/src/db/schema/products.rs`, `links.rs`, `pages.rs`)

**Tables:**

- `profiles`, `users`, `settings`, `credentials`
- `categories`, `collections`, `link_pages`, `links`, `link_analytics`, `link_analytics_by_category`
- `clicks_analytics`, `profile_analytics`, `profile_data`
- `products`, `product_analytics`, `purchases`, `gateways`
- `pages`, `page_analytics`, `media`, `sliders`, `slider_items`, `sessions`, `subscribers`

**Triggers & Views (`product_triggers.rs`):**

- `trg_products_no_delete`, `trg_purchases_no_delete`, `trg_subscribers_no_hard_delete`

---

## Content & CMS (`src-tauri/src/db/schema/content.rs`)

**Tables:**

- `cms_tables` — Unified content store for blogs, documentation, notes, and articles
- `cms_analytics` — Content page view and engagement metrics

**Views & Triggers:**

- `view_cms_published`
- `after_cms_insert` / `after_cms_update` / `after_cms_delete`

---

## CRM & Sales (`src-tauri/src/db/schema/crm.rs`)

**Tables:**

- `crm_contacts`, `crm_deals`, `crm_activities`, `crm_notes`, `crm_tasks`
- `crm_groups`, `crm_contact_groups`, `crm_templates`
- `crm_proposals`, `crm_invoices`, `crm_imports`, `crm_analytics`

---

## Community (`src-tauri/src/db/schema/community.rs`, `community_triggers.rs`)

**Tables:**

- `community_profiles`, `community_spaces`, `community_members`
- `community_posts`, `community_comments`, `community_events`
- `community_leaderboard`, `community_analytics`

---

## Forms (`src-tauri/src/db/schema/forms.rs`)

**Tables:**

- `forms`, `questions`, `submissions`, `form_analytics`

---

## Jobs (`src-tauri/src/db/schema/jobs.rs`)

**Tables:**

- `job_listings`, `job_applications`

---

## Social Media (`src-tauri/src/db/schema/social.rs`)

**Tables:**

- `social_accounts`, `social_posts`, `social_queue`, `social_analytics`

---

## AI Agents & Autonomous System (`src-tauri/src/db/schema/agents.rs`)

**Tables (5):**

- `agent_analytics` — Usage & cost aggregation per profile (sessions, messages, tokens, estimated spend, rolling 7d/30d/12m arrays, provider/model/tool breakdowns)
- `agent_chat_sessions` — Conversation and terminal threads (`mode`: `hosted`, `cli`, `pty`; `domain`, `cli_resume_ref`, token/cost tallies, `is_pinned`, `is_saved`)
- `agent_chat_messages` — Ordered conversation message history (`role`, `content`, `tool_calls_json`, timestamps)
- `agent_commands` — Built-in and custom slash commands (`slash`, `prompt_template`, `domain_tags`, `required_tools`, `is_builtin`)
- `brand_foundation` — Brand identity, brand voice, working style, and strategic business goals per profile

**Autonomous Task Runner & Memory Tables (`commands/agents/tasks.rs`):**

- `agents` — Configured AI agent personas, models, and system prompts
- `agent_tasks` — Async background tasks with status (`pending`, `running`, `completed`, `failed`), inputs, outputs, token consumption
- `agent_memory` — Persistent key-value memory store per agent
- `agent_kb` — Profile knowledge base articles and references

---

## Affiliate Program (`src-tauri/src/db/schema/affiliate.rs`)

**Tables:**

- `user_affiliate_programs`, `user_affiliate_commissions`, `user_affiliate_payouts`

---

## Email & Tracking (`src-tauri/src/db/schema/email.rs`)

**Tables:**

- `email_templates`, `email_campaigns`, `email_tracking_events`, `email_tracking_stats`

---

## Feedback & Reviews (`src-tauri/src/db/schema/feedback.rs`, `review.rs`)

**Tables:**

- `feedback_boards`, `feedback_posts`, `feedback_votes`
- `reviews`, `review_analytics`

---

## Google Search Console & Ads (`src-tauri/src/db/schema/gsc.rs`, `ads.rs`)

**Tables:**

- `gsc_sites`, `gsc_analytics`
- `ads_campaigns`, `ads_analytics`

---

## Chat & Voice Assistants (`src-tauri/src/db/schema/chat_agent.rs`, `voice_calls.rs`)

**Tables:**

- `chat_conversations`, `chat_messages`
- `voice_calls`, `voice_call_analytics`
