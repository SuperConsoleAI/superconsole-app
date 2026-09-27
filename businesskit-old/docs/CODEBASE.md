# Codebase Index & Complete Rust Command Reference

This document provides a comprehensive index of all Rust backend modules, database layers, and the exact `#[tauri::command]` functions exported across the codebase. Use this as an exact cheat sheet when writing IPC calls (`invoke()`) or backend handlers.

---

## 1. Core Architecture & Backend State

| File                                                                                                     | Purpose & Key Structures / Functions                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src-tauri/src/lib.rs`](file:///Users/2.o/businesskit/src-tauri/src/lib.rs)                             | Application entry point, `AppState` (`central_db`, `user_db`, `active_profile_id`, `organization`, `license`, `ready_profiles`, `schema_cache`, `auth_session`), and global `generate_handler!` registration. |
| [`src-tauri/src/db/turso.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/turso.rs)                   | `TursoConn` HTTP client using `reqwest` + bundled Mozilla `webpki-roots`. Bypasses mobile CA sandbox limits. `conn.query()`, `conn.execute()`, `turso_params![]`.                                             |
| [`src-tauri/src/db/central.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/central.rs)               | `CentralDb` client queries: `get_organization_by_owner`, `get_profiles_for_user`, `get_userdb_creds`, `stamp_provisioned_at`.                                                                                 |
| [`src-tauri/src/db/user.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/user.rs)                     | `UserDb` active profile connection wrapper over `TursoConn`.                                                                                                                                                  |
| [`src-tauri/src/db/provision.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/provision.rs)           | UserDB DDL runner: `run_all()` calling domain `provision()` functions sequentially.                                                                                                                           |
| [`src-tauri/src/db/schema_version.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/schema_version.rs) | Sequential migration runner executed on app startup.                                                                                                                                                          |
| [`src-tauri/src/vault.rs`](file:///Users/2.o/businesskit/src-tauri/src/vault.rs)                         | AES-256-GCM encryption & PBKDF2 (100k rounds) token decryption (`vault::encrypt`, `vault::decrypt`).                                                                                                          |
| [`src-tauri/src/license/mod.rs`](file:///Users/2.o/businesskit/src-tauri/src/license/mod.rs)             | Offline/online license verification, 24-hr recheck scheduler, cached user ID management.                                                                                                                      |
| [`src-tauri/src/rbac.rs`](file:///Users/2.o/businesskit/src-tauri/src/rbac.rs)                           | Role-based permission validation helpers (`admin`, `member`, `viewer`).                                                                                                                                       |

---

## 2. Shop & Operations Commands (`src-tauri/src/commands/shop/`)

### `commands/shop/items.rs` & `variants.rs`

- `shop_list_items(state, category_id?, item_type?, limit?, offset?) -> Result<Vec<ShopItem>, String>`
- `shop_get_item(state, item_id: String) -> Result<ShopItem, String>`
- `shop_create_item(state, data: CreateItemInput) -> Result<ShopItem, String>`
- `shop_update_item(state, item_id: String, data: UpdateItemInput) -> Result<ShopItem, String>`
- `shop_delete_item(state, item_id: String) -> Result<(), String>`
- `shop_list_item_batches(state, item_id: String) -> Result<Vec<ShopItemBatch>, String>`
- `shop_list_all_active_batches(state) -> Result<Vec<ShopItemBatch>, String>`
- `shop_list_variants(state, item_id: String) -> Result<Vec<ShopItemVariant>, String>`
- `shop_list_all_active_variants(state) -> Result<Vec<ShopItemVariant>, String>`
- `shop_create_variant(state, data: CreateVariantInput) -> Result<ShopItemVariant, String>`
- `shop_update_variant(state, variant_id: String, data: UpdateVariantInput) -> Result<ShopItemVariant, String>`
- `shop_delete_variant(state, variant_id: String) -> Result<(), String>`
- `shop_save_item_variants(state, item_id: String, variants: Vec<VariantPayload>) -> Result<(), String>`

### `commands/shop/categories.rs`, `brands.rs`, `units.rs`, `collections.rs`

- `shop_list_categories(state) -> Result<Vec<ShopCategory>, String>`
- `shop_seed_categories(state) -> Result<(), String>`
- `shop_create_category(state, data: CreateCategoryInput) -> Result<ShopCategory, String>`
- `shop_update_category(state, category_id: String, data: UpdateCategoryInput) -> Result<ShopCategory, String>`
- `shop_set_default_category(state, category_id: String) -> Result<(), String>`
- `shop_delete_category(state, category_id: String) -> Result<(), String>`
- `shop_list_brands(state) -> Result<Vec<ShopBrand>, String>`
- `shop_get_brand(state, brand_id: String) -> Result<ShopBrand, String>`
- `shop_create_brand(state, data: CreateBrandInput) -> Result<ShopBrand, String>`
- `shop_update_brand(state, brand_id: String, data: UpdateBrandInput) -> Result<ShopBrand, String>`
- `shop_delete_brand(state, brand_id: String) -> Result<(), String>`
- `shop_list_units(state) -> Result<Vec<ShopUnit>, String>`
- `shop_seed_units(state) -> Result<(), String>`
- `shop_create_unit(state, data: CreateUnitInput) -> Result<ShopUnit, String>`
- `shop_update_unit(state, unit_id: String, data: UpdateUnitInput) -> Result<ShopUnit, String>`
- `shop_set_default_unit(state, unit_id: String) -> Result<(), String>`
- `shop_delete_unit(state, unit_id: String) -> Result<(), String>`
- `shop_list_collections(state) -> Result<Vec<ShopCollection>, String>`
- `shop_create_collection(state, data: CreateCollectionInput) -> Result<ShopCollection, String>`
- `shop_update_collection(state, collection_id: String, data: UpdateCollectionInput) -> Result<ShopCollection, String>`
- `shop_set_default_collection(state, collection_id: String) -> Result<(), String>`
- `shop_delete_collection(state, collection_id: String) -> Result<(), String>`

### `commands/shop/price_lists.rs`, `discounts.rs`, `affiliates.rs`

- `shop_create_price_list(state, data: CreatePriceListInput) -> Result<ShopPriceList, String>`
- `shop_list_price_lists(state) -> Result<Vec<ShopPriceList>, String>`
- `shop_update_price_list(state, price_list_id: String, data: UpdatePriceListInput) -> Result<ShopPriceList, String>`
- `shop_assign_customer_price_list(state, customer_id: String, price_list_id: Option<String>) -> Result<(), String>`
- `shop_resolve_item_price(state, item_id: String, customer_id?: String) -> Result<f64, String>`
- `shop_list_discount_codes(state) -> Result<Vec<DiscountCode>, String>`
- `shop_create_discount_code(state, data: CreateDiscountCodeInput) -> Result<DiscountCode, String>`
- `shop_update_discount_code(state, code_id: String, data: UpdateDiscountCodeInput) -> Result<DiscountCode, String>`
- `shop_delete_discount_code(state, code_id: String) -> Result<(), String>`
- `shop_validate_discount_code(state, code: String, subtotal: f64) -> Result<DiscountValidationResult, String>`
- `shop_redeem_discount_code(state, code: String, order_id: String) -> Result<(), String>`
- `shop_list_affiliates(state) -> Result<Vec<ShopAffiliate>, String>`
- `shop_create_affiliate(state, data: CreateAffiliateInput) -> Result<ShopAffiliate, String>`
- `shop_update_affiliate(state, affiliate_id: String, data: UpdateAffiliateInput) -> Result<ShopAffiliate, String>`
- `shop_delete_affiliate(state, affiliate_id: String) -> Result<(), String>`

### `commands/shop/billing.rs` & `demo.rs`

- `shop_create_invoice(state, data: CreateInvoiceInput) -> Result<ShopInvoice, String>` _(Auto-posts to double-entry journal if final invoice)_
- `shop_update_invoice(state, doc_id: String, data: UpdateInvoiceInput) -> Result<ShopInvoice, String>`
- `shop_get_invoice(state, doc_id: String) -> Result<ShopInvoiceDetail, String>`
- `shop_list_invoices(state, doc_type?, status?, customer_id?, limit?, offset?) -> Result<Vec<ShopInvoice>, String>`
- `shop_list_sales_orders(state, status?, limit?, offset?) -> Result<Vec<ShopInvoice>, String>`
- `shop_convert_sales_order_to_invoice(state, order_id: String) -> Result<ShopInvoice, String>`
- `shop_reject_sales_order(state, order_id: String, reason: String) -> Result<(), String>`
- `shop_get_item_rate_history(state, item_id: String, customer_id?: String) -> Result<Vec<ItemRateHistoryRow>, String>`
- `shop_today_profit(state) -> Result<TodayProfitSummary, String>`
- `shop_delete_invoice(state, doc_id: String) -> Result<(), String>`
- `shop_open_pdf(app, path: String) -> Result<(), String>`
- `shop_download_pdf(app, path: String, default_name: String) -> Result<Option<String>, String>`
- `shop_open_url(app, url: String) -> Result<(), String>`
- `shop_save_demo_bill(state, data: SaveDemoBillInput) -> Result<DemoBill, String>`
- `shop_list_demo_bills(state, limit?, offset?) -> Result<Vec<DemoBill>, String>`

### `commands/shop/payments.rs`, `shift.rs`, `shop_analytics.rs`

- `shop_record_payment(state, data: RecordPaymentInput) -> Result<DocumentPayment, String>`
- `shop_get_payment_status(state, doc_id: String) -> Result<PaymentStatusInfo, String>`
- `shop_get_active_shift(state) -> Result<Option<ShopShift>, String>`
- `shop_open_shift(state, data: OpenShiftInput) -> Result<ShopShift, String>`
- `shop_close_shift(state, shift_id: String, data: CloseShiftInput) -> Result<ShopShift, String>`
- `shop_list_shifts(state, limit?, offset?) -> Result<Vec<ShopShift>, String>`
- `shop_get_billing_analytics(state, range?: String) -> Result<BillingAnalyticsReport, String>`
- `shop_aggregate_billing_analytics(state) -> Result<(), String>`
- `shop_get_item_billing_analytics(state, item_id: String) -> Result<ItemBillingAnalyticsRow, String>`
- `shop_aggregate_item_billing_analytics(state) -> Result<(), String>`
- `shop_aggregate_daily_analytics(state) -> Result<(), String>`
- `shop_aggregate_monthly_analytics(state) -> Result<(), String>`
- `shop_get_service_mode_analytics(state, range?: String) -> Result<ServiceModeAnalyticsReport, String>`

### `commands/shop/stock.rs`

- `shop_list_warehouses(state) -> Result<Vec<Warehouse>, String>`
- `shop_seed_warehouses(state) -> Result<(), String>`
- `shop_create_warehouse(state, data: CreateWarehouseInput) -> Result<Warehouse, String>`
- `shop_update_warehouse(state, warehouse_id: String, data: UpdateWarehouseInput) -> Result<Warehouse, String>`
- `shop_delete_warehouse(state, warehouse_id: String) -> Result<(), String>`
- `shop_get_stock_position(state, warehouse_id?, item_id?) -> Result<Vec<StockPosition>, String>`
- `shop_get_b2b_hold_stats(state) -> Result<B2BHoldStats, String>`
- `shop_receive_stock(state, data: ReceiveStockInput) -> Result<StockLedgerEntry, String>`
- `shop_list_goods_receipts(state, limit?, offset?) -> Result<Vec<GoodsReceiptHeader>, String>`
- `shop_get_goods_receipt(state, doc_id: String) -> Result<GoodsReceiptDetail, String>`
- `shop_update_receive_stock(state, doc_id: String, data: UpdateReceiveStockInput) -> Result<(), String>`
- `shop_adjust_stock(state, data: AdjustStockInput) -> Result<StockLedgerEntry, String>`
- `shop_transfer_stock(state, data: TransferStockInput) -> Result<(), String>`
- `shop_get_low_stock_items(state) -> Result<Vec<LowStockItem>, String>`
- `shop_get_all_reorder_rules(state, warehouse_id?) -> Result<Vec<ReorderRule>, String>`
- `shop_get_reorder_rule(state, item_id: String, warehouse_id: String) -> Result<Option<ReorderRule>, String>`
- `shop_delete_reorder_rule(state, rule_id: String) -> Result<(), String>`
- `shop_set_reorder_rule(state, data: ReorderRuleInput) -> Result<(), String>`
- `shop_find_item_by_barcode(state, barcode: String) -> Result<Option<ShopItem>, String>`
- `shop_get_stock_ledger(state, item_id?, warehouse_id?, limit?, offset?) -> Result<Vec<StockLedgerEntry>, String>`

### `commands/shop/customers.rs` & `vendors.rs`

- `shop_create_customer(state, data: CreateCustomerInput) -> Result<Customer, String>`
- `shop_list_customers(state) -> Result<Vec<Customer>, String>`
- `shop_search_customers(state, query: String) -> Result<Vec<Customer>, String>`
- `shop_get_customer_detail(state, customer_id: String) -> Result<CustomerDetail, String>`
- `shop_get_customer_billing_context(state, customer_id: String) -> Result<CustomerBillingContext, String>`
- `shop_update_customer(state, customer_id: String, data: UpdateCustomerInput) -> Result<(), String>`
- `shop_update_customer_preferences(state, customer_id: String, prefs: Value) -> Result<(), String>`
- `shop_adjust_customer_credit(state, data: AdjustCustomerCreditInput) -> Result<(), String>`
- `shop_get_customer_credit_ledger(state, customer_id: String) -> Result<Vec<CustomerCreditEntry>, String>`
- `shop_adjust_customer_loyalty(state, data: AdjustLoyaltyInput) -> Result<(), String>`
- `shop_get_customer_loyalty_ledger(state, customer_id: String) -> Result<Vec<LoyaltyEntry>, String>`
- `shop_redeem_loyalty_points(state, customer_id: String, points: i64) -> Result<f64, String>`
- `shop_topup_customer_wallet(state, customer_id: String, amount: f64, payment_method: String) -> Result<(), String>`
- `shop_redeem_customer_wallet(state, customer_id: String, amount: f64) -> Result<(), String>`
- `shop_get_campaign_audience(state, criteria: Value) -> Result<Vec<Customer>, String>`
- `shop_get_loyalty_config(state) -> Result<LoyaltyConfig, String>`
- `shop_update_loyalty_config(state, data: UpdateLoyaltyConfigInput) -> Result<(), String>`
- `shop_get_config(state, key: String) -> Result<Option<String>, String>`
- `shop_set_config(state, key: String, value: String) -> Result<(), String>`
- `shop_list_tags(state) -> Result<Vec<CustomerTag>, String>`
- `shop_create_tag(state, name: String, color: Option<String>) -> Result<CustomerTag, String>`
- `shop_create_vendor(state, data: CreateVendorInput) -> Result<Vendor, String>`
- `shop_list_vendors(state) -> Result<Vec<Vendor>, String>`
- `shop_get_vendor_detail(state, vendor_id: String) -> Result<VendorDetail, String>`
- `shop_update_vendor(state, vendor_id: String, data: UpdateVendorInput) -> Result<(), String>`
- `shop_link_vendor_item(state, data: LinkVendorItemInput) -> Result<(), String>`
- `shop_list_vendors_for_item(state, item_id: String) -> Result<Vec<VendorItemLink>, String>`

### `commands/shop/restaurant.rs`

- `shop_list_restaurant_tables(state, location_id?) -> Result<Vec<RestaurantTable>, String>`
- `shop_create_restaurant_table(state, data: CreateTableInput) -> Result<RestaurantTable, String>`
- `shop_update_table_status(state, table_id: String, status: String) -> Result<(), String>`
- `shop_delete_restaurant_table(state, table_id: String) -> Result<(), String>`
- `shop_check_table_availability(state, location_id: String, reservation_time: i64, covers: u32) -> Result<bool, String>`
- `shop_list_restaurant_reservations(state, date_str?) -> Result<Vec<TableReservation>, String>`
- `shop_create_table_reservation(state, data: CreateReservationInput) -> Result<TableReservation, String>`
- `shop_update_reservation_status(state, reservation_id: String, status: String) -> Result<(), String>`
- `shop_send_kot(state, data: SendKotInput) -> Result<KotHeader, String>`
- `shop_list_kots(state, status?, table_id?) -> Result<Vec<KotDetail>, String>`
- `shop_update_kot_status(state, kot_id: String, status: String) -> Result<(), String>`
- `shop_update_kot_line(state, line_id: String, status: String) -> Result<(), String>`
- `shop_delete_kot_line(state, line_id: String) -> Result<(), String>`
- `shop_list_recipes(state, item_id?) -> Result<Vec<RecipeHeader>, String>`
- `shop_save_recipe(state, data: SaveRecipeInput) -> Result<RecipeHeader, String>`
- `shop_delete_recipe(state, recipe_id: String) -> Result<(), String>`
- `shop_list_staff(state, role?) -> Result<Vec<ShopStaff>, String>`
- `shop_create_staff(state, data: CreateStaffInput) -> Result<ShopStaff, String>`
- `shop_update_staff(state, staff_id: String, data: UpdateStaffInput) -> Result<(), String>`
- `shop_delete_staff(state, staff_id: String) -> Result<(), String>`
- `shop_update_table_waiter(state, table_id: String, staff_id: Option<String>) -> Result<(), String>`
- `shop_ingest_aggregator_order(state, data: IngestAggregatorOrderInput) -> Result<ShopInvoice, String>`
- `shop_cancel_aggregator_order(state, order_id: String, reason: String) -> Result<(), String>`

### `commands/shop/stays.rs`

- `shop_list_stay_rooms(state, location_id?) -> Result<Vec<StayRoom>, String>`
- `shop_create_stay_room(state, data: CreateRoomInput) -> Result<StayRoom, String>`
- `shop_update_stay_room(state, room_id: String, data: UpdateRoomInput) -> Result<(), String>`
- `shop_update_room_status(state, room_id: String, status: String) -> Result<(), String>`
- `shop_delete_stay_room(state, room_id: String) -> Result<(), String>`
- `shop_check_room_availability(state, room_id: String, checkin_date: i64, checkout_date: i64) -> Result<bool, String>`
- `shop_list_stay_reservations(state, status?, checkin_date?, checkout_date?) -> Result<Vec<StayReservation>, String>`
- `shop_create_stay_reservation(state, data: CreateStayReservationInput) -> Result<StayReservation, String>`
- `shop_update_stay_reservation_status(state, reservation_id: String, status: String) -> Result<(), String>`
- `shop_add_booking_guest(state, data: AddBookingGuestInput) -> Result<BookingGuest, String>`
- `shop_list_booking_guests(state, reservation_id: String) -> Result<Vec<BookingGuest>, String>`
- `shop_list_all_stay_guests(state, limit?, offset?) -> Result<Vec<BookingGuest>, String>`
- `shop_check_in_guest(state, reservation_id: String, guest_ids: Vec<String>, room_id: String) -> Result<(), String>`
- `shop_list_open_folios(state) -> Result<Vec<StayFolio>, String>`
- `shop_add_folio_charge(state, data: AddFolioChargeInput) -> Result<FolioCharge, String>`
- `shop_settle_folio(state, folio_id: String, payment_mode: String, amount: f64) -> Result<(), String>`
- `shop_list_todays_arrivals(state) -> Result<Vec<StayReservation>, String>`
- `shop_list_todays_departures(state) -> Result<Vec<StayReservation>, String>`
- `shop_get_stay_analytics(state, range?: String) -> Result<StayAnalyticsReport, String>`
- `shop_sync_ota_ical(state, room_id: String, ical_url: String) -> Result<u32, String>`
- `shop_export_stay_ical(state, room_id: String) -> Result<String, String>`
- `shop_calculate_stay_pricing(state, room_id: String, checkin_date: i64, checkout_date: i64) -> Result<StayPricingBreakdown, String>`
- `shop_update_stay_rate_calendar(state, room_id: String, data: UpdateRateCalendarInput) -> Result<(), String>`
- `shop_update_stay_booking_rules(state, room_id: String, rules: Value) -> Result<(), String>`

### `commands/shop/reviews.rs`

- `shop_create_review(state, data: CreateReviewInput) -> Result<ShopReview, String>`
- `shop_list_reviews(state, item_id?, limit?, offset?) -> Result<Vec<ShopReview>, String>`
- `shop_update_review_published(state, review_id: String, is_published: bool) -> Result<(), String>`
- `shop_reply_to_review(state, review_id: String, reply_text: String) -> Result<(), String>`
- `shop_delete_review(state, review_id: String) -> Result<(), String>`

---

## 3. Finance, Bookkeeping & Tax Commands (`src-tauri/src/commands/fin/`)

### `commands/fin/accounts.rs` & `journal.rs`

- `fin_seed_default_accounts(state) -> Result<(), String>` _(Seeds 50+ standard Chart of Accounts)_
- `fin_list_accounts(state) -> Result<Vec<Account>, String>`
- `fin_create_account(state, data: CreateAccountInput) -> Result<Account, String>`
- `fin_post_document(state, doc_id: String) -> Result<JournalEntry, String>`
- `fin_get_journal_entry(state, entry_id: String) -> Result<JournalEntryDetail, String>`
- `fin_list_journal_entries(state, limit?, offset?) -> Result<Vec<JournalEntry>, String>`

### `commands/fin/bank.rs` & `expenses.rs`

- `fin_create_bank_account(state, data: CreateBankAccountInput) -> Result<BankAccount, String>`
- `fin_list_bank_accounts(state) -> Result<Vec<BankAccount>, String>`
- `fin_import_bank_statement(state, bank_account_id: String, csv_content: String) -> Result<u32, String>`
- `fin_import_bank_statement_from_path(state, bank_account_id: String, file_path: String) -> Result<u32, String>`
- `fin_list_bank_transactions(state, bank_account_id: String, unmatched_only?) -> Result<Vec<BankTransaction>, String>`
- `fin_match_transaction(state, transaction_id: String, journal_entry_id: String) -> Result<(), String>`
- `fin_unmatch_transaction(state, transaction_id: String) -> Result<(), String>`
- `fin_create_expense(state, data: CreateExpenseInput) -> Result<Expense, String>`
- `fin_list_expenses(state, limit?, offset?) -> Result<Vec<Expense>, String>`

### `commands/fin/tax.rs`, `gst.rs`, `einvoice.rs`, `eway.rs`, `tds.rs`

- `fin_get_tax_config(state) -> Result<TaxConfig, String>`
- `fin_set_tax_regime(state, data: SetTaxRegimeInput) -> Result<(), String>`
- `fin_list_tax_rates(state) -> Result<Vec<TaxRate>, String>`
- `fin_create_tax_rate(state, data: CreateTaxRateInput) -> Result<TaxRate, String>`
- `fin_delete_tax_rate(state, tax_rate_id: String) -> Result<(), String>`
- `fin_assign_tax_rate_to_item(state, item_id: String, tax_rate_id: String) -> Result<(), String>`
- `fin_get_item_tax_rate(state, item_id: String) -> Result<Option<TaxRate>, String>`
- `fin_seed_gst_rates(state) -> Result<(), String>`
- `fin_set_default_tax_rate(state, tax_rate_id: String) -> Result<(), String>`
- `fin_get_default_tax_rate(state) -> Result<Option<TaxRate>, String>`
- `fin_get_gst_return_summary(state, period: String, return_type?) -> Result<GstReturnSummary, String>`
- `fin_get_vendor_itc_summary(state, from_ts?, to_ts?) -> Result<Vec<VendorItcSummary>, String>`
- `fin_mark_return_filed(state, args: MarkReturnFiledArgs) -> Result<(), String>`
- `fin_generate_einvoice(state, doc_id: String) -> Result<EInvoiceLog, String>`
- `fin_get_einvoice_status(state, doc_id: String) -> Result<EInvoiceStatus, String>`
- `fin_list_einvoices(state, limit?) -> Result<Vec<EInvoice>, String>`
- `fin_generate_eway_bill(state, data: GenerateEWayBillInput) -> Result<EWayBillLog, String>`
- `fin_list_eway_bills(state) -> Result<Vec<EWayBillLog>, String>`
- `fin_log_tds_entry(state, data: LogTdsInput) -> Result<(), String>`
- `fin_log_tcs_entry(state, data: LogTcsInput) -> Result<(), String>`
- `fin_list_tds_entries(state, period?) -> Result<Vec<TdsEntry>, String>`

### `commands/fin/gateway.rs`

- `fin_record_gateway_transaction(state, args: RecordGatewayTxnArgs) -> Result<GatewayTransaction, String>`
- `fin_list_gateway_transactions(state, match_status?, provider?, limit?) -> Result<Vec<GatewayTransaction>, String>`
- `fin_match_gateway_transaction(state, args: ManualMatchArgs) -> Result<(), String>`
- `fin_reconcile_gateway_transactions(state) -> Result<ReconcileResult, String>`

### `commands/fin/reports.rs` & `currency.rs`

- `fin_get_profit_and_loss(state, from_date: i64, to_date: i64) -> Result<ProfitAndLossReport, String>`
- `fin_get_balance_sheet(state, as_of_date: i64) -> Result<BalanceSheetReport, String>`
- `fin_get_trial_balance(state, as_of_date: i64) -> Result<TrialBalanceReport, String>`
- `fin_list_currency_rates(state) -> Result<Vec<CurrencyRate>, String>`
- `fin_set_currency_rate(state, currency: String, rate_to_base: f64) -> Result<(), String>`
- `fin_seed_currency_rates(state) -> Result<(), String>`

---

## 4. AI Agents, Chat, CLI Subprocess & MCP Commands (`src-tauri/src/commands/agents/`)

### `commands/agents/chat.rs`

- `start_chat_session(state, profile_id, title?, model?, provider?, mode?, domain?, cli_resume_ref?) -> Result<AgentChatSessionRow, String>`
- `list_chat_sessions(state, profile_id, limit?, offset?, mode?, domain?) -> Result<Vec<AgentChatSessionRow>, String>`
- `get_chat_history(state, session_id, limit?) -> Result<Vec<AgentChatMessageRow>, String>`
- `send_chat_message(app, state, session_id, content, model?, provider?, system_prompt?, media_attachment_id?, media_attachment_url?, thinking_budget?) -> Result<(), String>` _(Streams tokens via `chat-token`, tool events via `chat-tool-call`, and completion via `chat-done`)_
- `stop_chat_session(state, session_id) -> Result<(), String>` _(Signals cooperative cooperative cancellation via `ChatCancelState`)_
- `rename_chat_session(state, session_id, title: String) -> Result<(), String>`
- `toggle_pin_chat_session(state, session_id) -> Result<bool, String>`
- `toggle_save_chat_session(state, session_id) -> Result<bool, String>`
- `delete_chat_session(state, session_id) -> Result<(), String>`
- `get_openrouter_pricing() -> Result<Value, String>`

### `commands/agents/cli.rs`

- `get_active_cli_models() -> Result<HashMap<String, CliModelStatus>, String>` _(Reads active model, effort, and source path for `cli_antigravity`, `cli_claude`, and `cli_codex`)_
- `set_cli_active_model(provider: String, model_id: String, effort?: String) -> Result<CliModelStatus, String>` _(Updates CLI configuration files on disk, e.g. `~/.gemini/antigravity-cli/settings.json`)_

### `commands/agents/pty.rs` _(Desktop builds only: `portable-pty`)_

- `start_terminal_session(app, pty_manager, profile_id, session_id, cli, rows, cols, resume_id?) -> Result<PtySessionInfo, String>` _(Spawns interactive shell, pre-trusts Antigravity workspace, auto-creates `output/` directory, streams raw ANSI via `pty-output`)_
- `write_terminal_input(app, pty_manager, session_id, data: String) -> Result<(), String>`
- `resize_terminal_session(pty_manager, session_id, rows: u16, cols: u16) -> Result<(), String>`
- `stop_terminal_session(app, pty_manager, session_id) -> Result<(), String>`
- `list_terminal_sessions(pty_manager) -> Result<Vec<String>, String>`

### `commands/agents/commands.rs` & `tools/`

- `list_agent_commands(state, profile_id) -> Result<Vec<AgentCommandRow>, String>` _(Returns custom & built-in slash commands)_
- `create_agent_command(state, profile_id, data: CreateAgentCommandInput) -> Result<AgentCommandRow, String>`
- `update_agent_command(state, command_id: String, data: UpdateAgentCommandInput) -> Result<AgentCommandRow, String>`
- `delete_agent_command(state, command_id: String) -> Result<(), String>`
- `list_agent_tools() -> Result<Vec<ToolSpecInfo>, String>` _(Lists all 13 discovery tool specifications with domain tags and JSON schemas)_

### `commands/agents/analytics.rs` & `brand.rs`

- `get_agent_analytics(state, profile_id) -> Result<AgentAnalyticsRow, String>` _(Aggregates token counts, cost models, rolling 7d/30d/12m metrics, tool breakdown, and auto-prunes chat history older than 90 days)_
- `get_brand_foundation(state, profile_id) -> Result<BrandFoundationRow, String>`
- `save_brand_foundation(state, profile_id, data: SaveBrandFoundationInput) -> Result<BrandFoundationRow, String>`

### `commands/agents/tasks.rs`

- `list_agents(state) -> Result<Vec<AgentRow>, String>`
- `create_agent(state, data: CreateAgentData) -> Result<AgentRow, String>`
- `list_agent_tasks(state, agent_id?, status?) -> Result<Vec<AgentTaskRow>, String>`
- `create_agent_task(state, data: CreateTaskData) -> Result<AgentTaskRow, String>`
- `update_task_result(state, task_id: String, status: String, output?: String, error?: String) -> Result<(), String>`
- `get_agent_memory(state, agent_id: String) -> Result<Vec<AgentMemoryRow>, String>`
- `list_agent_kb(state, agent_id: String) -> Result<Vec<AgentKbArticleRow>, String>`

### `commands/agents/mcp_server.rs`

- Binary stdio server (`run_stdio_mcp_server(args: Vec<String>)`): Launched when BusinessKit binary runs with `--mcp` or `--profile <id>`. Exposes toolbelt via Model Context Protocol JSON-RPC 2.0 over stdin/stdout.

---

## 5. Core Platform Commands (`src-tauri/src/commands/*.rs`)

| Module                                                                                    | Exported Tauri Commands                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`auth.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs)                 | `auth_status`, `sign_in` (loopback on port 4666 without blind kills), `sign_out` (clears in-memory state and purges cached `.dat` files), `get_auth_tokens`, `set_auth_tokens`, `get_current_user`                                                                                                                               |
| [`profile.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/profile.rs)           | `get_projects`, `create_project`, `switch_project`, `get_profile`, `update_profile`, `get_provision_status`, `get_userdb_status`, `provision_user_db_now`, `provision_migrations_now`                                                                                                                                            |
| [`organization.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs) | `get_organization`, `get_user_organizations`, `switch_organization`, `create_new_organization`, `get_plan_allocations`, `assign_profile_plan`, `connect_user_db`, `switch_project` (enforces `verify_profile_access` at Step 0 before cache check)                                                                               |
| [`analytics.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/analytics.rs)       | `get_profile_analytics`, `get_category_analytics`, `get_link_analytics`, `get_single_category_analytics`, `get_single_link_analytics`                                                                                                                                                                                            |
| [`social.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/social.rs)             | `list_social_accounts`, `connect_social_account`, `disconnect_social_account`, `create_social_post`, `list_social_posts`, `delete_social_post`, `publish_social_post_now`                                                                                                                                                        |
| [`crm.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/crm.rs)                   | `list_contacts`, `create_contact`, `update_contact`, `delete_contact`, `list_deals`, `create_deal`, `update_deal`, `delete_deal`                                                                                                                                                                                                 |
| [`forms.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/forms.rs)               | `list_forms`, `create_form`, `update_form`, `delete_form`, `toggle_form_published`, `list_form_questions`, `update_form_questions`, `list_submissions`, `get_form_analytics`                                                                                                                                                     |
| [`content.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/content.rs)           | `list_cms`, `update_cms`, `list_content`, `get_content`, `create_content`, `update_content`, `delete_content`, `publish_content`, `unpublish_content`, `archive_content`, `list_categories`, `list_collections`, `create_collection`                                                                                             |
| [`jobs.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/jobs.rs)                 | `get_job_listings`, `create_job_listing`, `update_job_listing`, `delete_job_listing`, `get_job_applications`, `update_job_application_status`, `get_job_analytics`, `aggregate_job_analytics`                                                                                                                                    |
| [`community.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/community.rs)       | `list_communities`, `get_community`, `create_community`, `update_community`, `delete_community`, `publish_community`, `get_community_members`, `approve_member`, `ban_member`, `list_community_posts`, `create_post`, `delete_post`, `pin_post`, `get_community_leaderboard`, `list_community_events`, `get_community_analytics` |
| [`media.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/media.rs)               | `upload_media`, `list_media`, `delete_media`, `process_image`                                                                                                                                                                                                                                                                    |
| [`deploy.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/deploy.rs)             | `connect_cloudflare`, `deploy_frontend`, `get_deployment_status`, `check_for_updates`                                                                                                                                                                                                                                            |
| [`gsc.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/gsc.rs)                   | `list_gsc_sites`, `get_gsc_analytics`, `sync_gsc_data`                                                                                                                                                                                                                                                                           |
| [`ads.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/ads.rs)                   | `list_ad_campaigns`, `get_ads_analytics`, `sync_ads_data`                                                                                                                                                                                                                                                                        |

---

## 6. Major Feature Entry Points

| Feature | Frontend Route Entry Point | Backend Handler Module | Key UI Components |
|---------|────────────────────────────|────────────────────────|───────────────────|
| **AI Agents & Terminal** | [`src/routes/dashboard/agents/`](file:///Users/2.o/businesskit/src/routes/dashboard/agents/) | [`commands/agents/`](file:///Users/2.o/businesskit/src-tauri/src/commands/agents/) | [`AgentChat.tsx`](file:///Users/2.o/businesskit/src/components/agents/AgentChat.tsx), [`AgentWorkspace.tsx`](file:///Users/2.o/businesskit/src/components/agents/AgentWorkspace.tsx), [`PtyTabBar.tsx`](file:///Users/2.o/businesskit/src/components/agents/PtyTabBar.tsx), [`CommandSelector.tsx`](file:///Users/2.o/businesskit/src/components/agents/CommandSelector.tsx), [`SlashCommandAutocomplete.tsx`](file:///Users/2.o/businesskit/src/components/agents/SlashCommandAutocomplete.tsx) |
| **Shop Products & Inventory** | [`src/routes/dashboard/shop/products/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/products/) | [`commands/shop/items.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/items.rs), [`stock.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/stock.rs) | [`AddProductModal.tsx`](file:///Users/2.o/businesskit/src/components/shop/AddProductModal.tsx), [`ShopProductTable.tsx`](file:///Users/2.o/businesskit/src/components/shop/ShopProductTable.tsx), [`ReceiveStockSlideOver.tsx`](file:///Users/2.o/businesskit/src/components/shop/ReceiveStockSlideOver.tsx) |
| **Billing & POS** | [`src/routes/dashboard/shop/products/billing/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/products/billing/) | [`commands/shop/billing.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/billing.rs), [`payments.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/payments.rs) | [`NewBillModal.tsx`](file:///Users/2.o/businesskit/src/components/shop/NewBillModal.tsx), [`BillingTable.tsx`](file:///Users/2.o/businesskit/src/components/shop/BillingTable.tsx), [`InvoicePrintModal.tsx`](file:///Users/2.o/businesskit/src/components/shop/InvoicePrintModal.tsx) |
| **Restaurant & Café** | [`src/routes/dashboard/shop/restaurant/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/restaurant/) | [`commands/shop/restaurant.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/restaurant.rs) | [`TableLayoutGrid.tsx`](file:///Users/2.o/businesskit/src/components/shop/restaurant/TableLayoutGrid.tsx), [`KOTQueueCard.tsx`](file:///Users/2.o/businesskit/src/components/shop/restaurant/KOTQueueCard.tsx), [`RecipeBuilderSlideOver.tsx`](file:///Users/2.o/businesskit/src/components/shop/restaurant/RecipeBuilderSlideOver.tsx) |
| **Hotel & Stays** | [`src/routes/dashboard/shop/stays/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/stays/) | [`commands/shop/stays.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/stays.rs) | [`RoomLayoutGrid.tsx`](file:///Users/2.o/businesskit/src/components/shop/stays/RoomLayoutGrid.tsx), [`RateCalendarModal.tsx`](file:///Users/2.o/businesskit/src/components/shop/stays/RateCalendarModal.tsx), [`FolioDetailSlideOver.tsx`](file:///Users/2.o/businesskit/src/components/shop/stays/FolioDetailSlideOver.tsx) |
| **Customers & Vendors** | [`src/routes/dashboard/shop/customers/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/customers/), [`vendors/`](file:///Users/2.o/businesskit/src/routes/dashboard/shop/vendors/) | [`commands/shop/customers.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/customers.rs), [`vendors.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/vendors.rs) | [`CustomerDetailSlideOver.tsx`](file:///Users/2.o/businesskit/src/components/shop/CustomerDetailSlideOver.tsx), [`VendorLookupSlideOver.tsx`](file:///Users/2.o/businesskit/src/components/shop/VendorLookupSlideOver.tsx) |
| **Accounts & Bookkeeping** | [`src/routes/dashboard/accounts/`](file:///Users/2.o/businesskit/src/routes/dashboard/accounts/) | [`commands/fin/accounts.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/accounts.rs), [`journal.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/journal.rs), [`bank.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/bank.rs) | `AccountTree`, `JournalTable`, `BankReconciliation`, `ExpenseForm` |
| **Tax & Compliance** | [`src/routes/dashboard/tax/`](file:///Users/2.o/businesskit/src/routes/dashboard/tax/) | [`commands/fin/tax.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/tax.rs), [`gst.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/gst.rs), [`einvoice.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/einvoice.rs), [`eway.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/eway.rs) | `TaxRegimeConfig`, `GSTRSummaryCard`, `EInvoiceLogTable`, `EWayBillModal` |
| **Auth & OAuth** | [`src/routes/index.tsx`](file:///Users/2.o/businesskit/src/routes/index.tsx) | [`commands/auth.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs) | `AuthModal`, `OAuthCallback` |
| **Profile Switch & Provision** | [`src/routes/dashboard/layout.tsx`](file:///Users/2.o/businesskit/src/routes/dashboard/layout.tsx) | [`commands/profile.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/profile.rs) | `ProfileSwitcher`, `ProvisionGate` |
| **Analytics Dashboard** | [`src/routes/dashboard/index.tsx`](file:///Users/2.o/businesskit/src/routes/dashboard/index.tsx) | [`commands/analytics.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/analytics.rs) | `AnalyticsCards`, `VisitorsGraph` |
| **Social Media Suite** | [`src/routes/dashboard/social/`](file:///Users/2.o/businesskit/src/routes/dashboard/social/) | [`commands/social.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/social.rs) | `PostComposer`, `SocialQueue` |
| **CRM & Leads** | [`src/routes/dashboard/crm/`](file:///Users/2.o/businesskit/src/routes/dashboard/crm/) | [`commands/crm.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/crm.rs) | `LeadsTable`, `ContactModal` |
| **Forms Builder** | [`src/routes/dashboard/forms/`](file:///Users/2.o/businesskit/src/routes/dashboard/forms/) | [`commands/forms.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/forms.rs) | `FormBuilder`, `SubmissionViewer` |

---

## 7. CRITICAL: What NOT to Touch & Why

1. **`businesskit-web/`**: Read-only reference web codebase used for UI/UX 1:1 parity matching. **Do not modify files here**.
2. **`src-tauri/src/db/turso.rs`**: Core HTTP client shim built specifically to bypass iOS/Android sandbox native TLS failures. Do not re-introduce native `libsql` C-bindings.
3. **`src-tauri/src/db/schema_version.rs`**: Sequential schema migration runner contract. Altering past version numbers breaks existing databases.
4. **`src/lib/ipc.ts` Command Signatures**: Frontend TS names and parameter keys must match Rust `#[tauri::command]` function signatures and `snake_case` JSON field expectations.
5. **Double-Entry Journal Invariants**: Never delete or update posted journal entries directly without posting a reversing or adjusting journal entry in `commands/fin/journal.rs`.
6. **Agent Tools UserDB Isolation**: Agent tools in `commands/agents/tools/` must strictly operate against `&TursoConn` for the active profile UserDB. Under no circumstances may an agent tool query or mutate Central DB.
7. **Headless CLI vs PTY Separation**: Headless CLI runners (`cli.rs`) write structured turns to `agent_chat_messages` and emit chat events. PTY terminal sessions (`pty.rs`) are interactive and ephemeral—never write raw PTY ANSI stdout dumps into `agent_chat_messages`.
