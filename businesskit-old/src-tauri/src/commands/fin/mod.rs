// src-tauri/src/commands/fin/mod.rs
//
// Phase 4 — Money Matters: Financial module commands
// Prefix: fin_ — used by any profession, not just shops.
//
// Submodules:
//   tax.rs       — fin_get_tax_config, fin_set_tax_regime, tax rates, assign to item
//   accounts.rs  — fin_seed_default_accounts, fin_list_accounts, fin_create_account
//   journal.rs   — fin_list_journal_entries (read-only; post_journal_entry is internal)
//   bank.rs      — fin_create_bank_account, fin_import_bank_statement, fin_match_transaction
//   expenses.rs  — fin_create_expense, fin_list_expenses
//   reports.rs   — fin_get_profit_and_loss, fin_get_balance_sheet, fin_get_trial_balance
//   gst.rs       — fin_get_gst_return_summary, fin_mark_return_filed
//   einvoice.rs  — fin_generate_einvoice, fin_get_einvoice_status
//   eway.rs      — fin_generate_eway_bill
//   tds.rs       — fin_log_tds_entry, fin_log_tcs_entry

pub mod accounts;
pub mod bank;
pub mod currency;
pub mod einvoice;
pub mod eway;
pub mod expenses;
pub mod gateway;
pub mod gst;
pub mod journal;
pub mod reports;
pub mod tax;
pub mod tds;
