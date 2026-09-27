# Instruction: Wallet Balance on Top of Existing `shop_loyalty_ledger`

> `shop_loyalty_ledger` already ships with `earn | redeem | expire | adjust`.
> This adds the wallet/store-credit half — real money, not reward points —
> onto the same ledger rather than building a parallel table.

---

## Part A — Add `wallet_balance` to `shop_customers`

Migration, same pattern as existing `shop.rs` / `payroll.rs` files:

```rust
Migration {
    id: "20260901_shop_customers_wallet_balance",
    table: "shop_customers",
    sql: "ALTER TABLE shop_customers ADD COLUMN wallet_balance REAL NOT NULL DEFAULT 0;"
}
```

This is a denormalized running total — same relationship
`shop_stock_ledger` has to on-hand stock, or `loyalty_pts` has to the
ledger's `earn/redeem/expire/adjust` rows. Never write to it directly from
UI code; only ever update it as a side effect of inserting a
`shop_loyalty_ledger` row (see Part C).

---

## Part B — Extend `shop_loyalty_ledger.entry_type` to cover wallet

No new column needed if `entry_type` is already a free-text field (check
current implementation). Add two new values to whatever validation/enum
exists in Rust:

```
wallet_topup   — customer adds real money (cash/card/UPI) to wallet
wallet_redeem  — customer spends wallet balance against a document
```

If `shop_loyalty_ledger` currently has a single `points_delta` column, add
one more:

```rust
Migration {
    id: "20260901_shop_loyalty_ledger_wallet_delta",
    table: "shop_loyalty_ledger",
    sql: "ALTER TABLE shop_loyalty_ledger ADD COLUMN wallet_delta REAL NOT NULL DEFAULT 0;"
}
```

Keep points and wallet on the same table/row shape (`entry_type` decides
which delta column is meaningful for that row) rather than splitting into
`shop_wallet_ledger` — this is the same "one ledger, `entry_type`
differentiates" pattern already used for the points side, don't fork it.

---

## Part C — New commands

Mirror the existing loyalty commands already shipped
(`shop_adjust_customer_loyalty`, `shop_get_customer_loyalty_ledger`):

- `shop_topup_customer_wallet(customer_id, amount, payment_mode, document_id?)`
  → inserts `shop_loyalty_ledger` row with `entry_type: wallet_topup`,
  `wallet_delta: +amount`, updates `shop_customers.wallet_balance`
- `shop_redeem_customer_wallet(customer_id, amount, document_id)`
  → same, `entry_type: wallet_redeem`, `wallet_delta: -amount`. Reject if
  `amount > wallet_balance` (no negative wallet, unlike credit_limit which
  intentionally allows going negative up to a limit)
- Reuse `shop_get_customer_loyalty_ledger` for wallet history too — same
  table, just filter/display by `entry_type` in the UI, don't build a
  second query command

---

## Where this plugs into billing

At the payment step (`shop_document_payments`), wallet becomes another
`payment_mode` option alongside cash/card/upi/bank_transfer — add
`wallet` to that enum. Paying by wallet calls
`shop_redeem_customer_wallet` internally rather than the customer handing
over cash, same document, same invoice total, different funding source.

## Acceptance check

Topping up ₹500 via UPI → `wallet_balance` becomes 500, one
`wallet_topup` ledger row. Paying a ₹300 bill by wallet → `wallet_balance`
becomes 200, one `wallet_redeem` ledger row linked to that `document_id`,
rejected outright if wallet_balance was already below 300.
