import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

// Setup full schema with all migrations
db.exec(`
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  service TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE fin_accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_code TEXT,
  account_type TEXT NOT NULL,
  account_subtype TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE fin_journal_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  entry_date INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  narration TEXT NOT NULL,
  document_id TEXT,
  entry_type TEXT NOT NULL DEFAULT 'manual',
  is_reconciled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE fin_journal_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE fin_expenses (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  expense_date INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  category TEXT NOT NULL,
  account_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  paid_by TEXT,
  vendor_id TEXT,
  receipt_media_id TEXT,
  description TEXT,
  document_id TEXT,
  is_reimbursable INTEGER NOT NULL DEFAULT 0,
  journal_entry_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE shop_documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  doc_date INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  status TEXT NOT NULL DEFAULT 'draft',
  channel TEXT NOT NULL DEFAULT 'dashboard',
  service_mode TEXT NOT NULL DEFAULT 'dine_in',
  customer_id TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amt REAL NOT NULL DEFAULT 0,
  taxable_amt REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  tax_breakdown TEXT NOT NULL DEFAULT '{}',
  round_off REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  amount_due REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE shop_document_lines (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE shop_customers (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent REAL NOT NULL DEFAULT 0,
  loyalty_pts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE shop_loyalty_ledger (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  document_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE shop_stock_ledger (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL DEFAULT 'wh_default',
  movement_type TEXT NOT NULL,
  qty_in REAL NOT NULL DEFAULT 0,
  qty_out REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL DEFAULT 0,
  document_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE shop_items (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  track_inventory INTEGER NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0
);

CREATE TABLE fin_tax_configs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  regime TEXT NOT NULL DEFAULT 'GST',
  currency TEXT NOT NULL DEFAULT 'INR'
);
`);

const profile_id = 'prof_restaurant_blr';

// Seed starter accounts
db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, account_subtype, is_system) VALUES ('acc_rev_4001', ?, 'Sales Revenue', '4001', 'income', 'revenue', 1)").run(profile_id);
db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, account_subtype, is_system) VALUES ('acc_ar_1100', ?, 'Accounts Receivable', '1100', 'asset', 'receivable', 1)").run(profile_id);
db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, account_subtype, is_system) VALUES ('acc_cogs_5001', ?, 'Cost of Goods Sold', '5001', 'expense', 'cogs', 1)").run(profile_id);
db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, account_subtype, is_system) VALUES ('acc_exp_5350', ?, 'Aggregator Commission Expense', '5350', 'expense', 'operating', 1)").run(profile_id);
db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, account_subtype, is_system) VALUES ('acc_ar_1250', ?, 'Accounts Receivable — Aggregator', '1250', 'asset', 'receivable', 1)").run(profile_id);

// Seed aggregator connections with distinct commission rates
db.prepare("INSERT INTO connections (id, profile_id, name, service, extra) VALUES ('conn_zomato', ?, 'Zomato Merchant', 'zomato_api', '{\"commission_pct\": 22}')").run(profile_id);
db.prepare("INSERT INTO connections (id, profile_id, name, service, extra) VALUES ('conn_swiggy', ?, 'Swiggy Partner', 'swiggy_api', '{\"commission_pct\": 25}')").run(profile_id);

function resolveAccountId(code, fallbackType) {
  const row = db.prepare("SELECT id FROM fin_accounts WHERE profile_id = ? AND account_code = ? LIMIT 1").get(profile_id, code);
  if (row) return row.id;
  const id = `acc_${profile_id}_${code}`;
  db.prepare("INSERT INTO fin_accounts (id, profile_id, name, account_code, account_type, is_system) VALUES (?, ?, ?, ?, ?, 1)")
    .run(id, profile_id, `Account ${code}`, code, fallbackType);
  return id;
}

function postJournalEntry(narration, docId, lines) {
  const entryId = `je_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  db.prepare("INSERT INTO fin_journal_entries (id, profile_id, narration, document_id) VALUES (?, ?, ?, ?)")
    .run(entryId, profile_id, narration, docId);

  for (const [accId, debit, credit, desc] of lines) {
    const lineId = `jl_${Date.now()}_${Math.floor(Math.random()*100000)}`;
    db.prepare("INSERT INTO fin_journal_lines (id, entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?)")
      .run(lineId, entryId, accId, debit, credit, desc);
  }
  return entryId;
}

function ingestAggregatorOrder(data) {
  const channel = data.aggregator.toLowerCase();
  const docNumber = data.order_id.includes('-') ? data.order_id : `${channel.toUpperCase()}-${data.order_id}`;
  const invoiceId = `doc_${Date.now()}_${Math.floor(Math.random()*1000)}`;

  // Lookup commission rate
  let commissionPct = 0;
  const connRow = db.prepare("SELECT extra FROM connections WHERE profile_id = ? AND (LOWER(service) = ? OR LOWER(service) = ? OR LOWER(name) = ? OR LOWER(name) LIKE ?) LIMIT 1")
    .get(profile_id, `${channel}_api`, channel, channel, `${channel}%`);
  if (connRow) {
    try {
      const parsed = JSON.parse(connRow.extra);
      if (parsed.commission_pct) commissionPct = Number(parsed.commission_pct);
    } catch {}
  }

  const effectiveSubtotal = Math.max(0, data.subtotal - (data.discount_amt || 0));
  const commissionAmount = commissionPct > 0 ? Math.round((effectiveSubtotal * commissionPct / 100) * 100) / 100 : 0;

  // Insert shop_documents
  db.prepare(`
    INSERT INTO shop_documents
    (id, profile_id, doc_type, doc_number, doc_date, status, channel, service_mode, subtotal, discount_amt, tax_amount, grand_total, amount_paid, amount_due, commission_amount, profit, notes)
    VALUES (?, ?, 'invoice', ?, strftime('%s','now'), 'confirmed', ?, 'delivery', ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    invoiceId, profile_id, docNumber, channel, data.subtotal, data.discount_amt || 0, data.tax_amount || 0,
    data.grand_total, data.grand_total, commissionAmount, data.subtotal * 0.6, `[${channel.toUpperCase()}] Order #${docNumber}`
  );

  // 1. Post sales revenue & COGS journal:
  // DR AR (1100), CR Revenue (4001)
  // DR COGS (5001), CR Inventory (1200)
  const revAcc = resolveAccountId('4001', 'income');
  const arAcc = resolveAccountId('1100', 'asset');
  const cogsAcc = resolveAccountId('5001', 'expense');
  const invAcc = resolveAccountId('1200', 'asset');
  const itemCost = data.subtotal * 0.4; // 40% cost

  postJournalEntry(`Sales & COGS for ${docNumber}`, invoiceId, [
    [arAcc, data.grand_total, 0, 'Sales AR'],
    [revAcc, 0, effectiveSubtotal, 'Food Revenue'],
    [cogsAcc, itemCost, 0, 'Cost of Goods Sold'],
    [invAcc, 0, itemCost, 'Inventory Reduction']
  ]);

  // 2. Post commission expense & journal if commission_amount > 0:
  // DR Aggregator Commission Expense (5300), CR Accounts Receivable — Aggregator (1250)
  if (commissionAmount > 0) {
    const expId = `exp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const expAcc = resolveAccountId('5350', 'expense');
    const arAggAcc = resolveAccountId('1250', 'asset');

    const narration = `[${channel.toUpperCase()}] Commission for Order #${docNumber} (${commissionPct}%)`;
    const jId = postJournalEntry(narration, invoiceId, [
      [expAcc, commissionAmount, 0, `Aggregator commission on Order #${docNumber}`],
      [arAggAcc, 0, commissionAmount, `Commission netted from ${channel.toUpperCase()} receivable`]
    ]);

    db.prepare(`
      INSERT INTO fin_expenses
      (id, profile_id, category, account_id, amount, total_amount, payment_mode, description, document_id, journal_entry_id)
      VALUES (?, ?, 'Aggregator Commission', ?, ?, ?, 'aggregator_deduction', ?, ?, ?)
    `).run(expId, profile_id, expAcc, commissionAmount, commissionAmount, narration, invoiceId, jId);
  }

  return { invoice_id: invoiceId, doc_number: docNumber, effective_subtotal: effectiveSubtotal, commission_pct: commissionPct, commission_amount: commissionAmount };
}

function cancelAggregatorOrder(orderId, reason) {
  const doc = db.prepare("SELECT id, doc_number, grand_total, subtotal, discount_amt FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice' AND (doc_number = ? OR doc_number LIKE ?)").get(profile_id, orderId, `%-${orderId}`);
  if (!doc) throw new Error(`Order ${orderId} not found`);

  db.prepare("UPDATE shop_documents SET status = 'cancelled' WHERE id = ?").run(doc.id);

  // Reverse commission expenses append-only
  const expRows = db.prepare("SELECT id, amount, total_amount FROM fin_expenses WHERE profile_id = ? AND document_id = ? AND amount > 0 AND category = 'Aggregator Commission'").all(profile_id, doc.id);
  for (const exp of expRows) {
    const revExpId = `exp_rev_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const revNote = `Reversal of ${exp.id} on aggregator cancellation: ${reason}`;
    const expAcc = resolveAccountId('5350', 'expense');
    const arAggAcc = resolveAccountId('1250', 'asset');

    const revJId = postJournalEntry(revNote, doc.id, [
      [arAggAcc, exp.amount, 0, 'Restore receivable on commission waiver'],
      [expAcc, 0, exp.amount, 'Reverse commission expense on order cancellation']
    ]);

    db.prepare(`
      INSERT INTO fin_expenses
      (id, profile_id, category, account_id, amount, total_amount, payment_mode, description, document_id, journal_entry_id)
      VALUES (?, ?, 'Aggregator Commission', ?, ?, ?, 'aggregator_deduction', ?, ?, ?)
    `).run(revExpId, profile_id, expAcc, -exp.amount, -exp.total_amount, revNote, doc.id, revJId);
  }

  // Reverse sales and COGS journal
  const revAcc = resolveAccountId('4001', 'income');
  const arAcc = resolveAccountId('1100', 'asset');
  const cogsAcc = resolveAccountId('5001', 'expense');
  const invAcc = resolveAccountId('1200', 'asset');
  const effSub = doc.subtotal - doc.discount_amt;
  const itemCost = doc.subtotal * 0.4;

  postJournalEntry(`Cancel Sales & COGS for ${doc.doc_number}`, doc.id, [
    [revAcc, effSub, 0, 'Reverse revenue'],
    [arAcc, 0, doc.grand_total, 'Reverse AR'],
    [invAcc, itemCost, 0, 'Restore inventory'],
    [cogsAcc, 0, itemCost, 'Reverse COGS']
  ]);

  return { cancelled: true, invoice_id: doc.id };
}

function getDetailedPnL() {
  const revRow = db.prepare(`
    SELECT COALESCE(SUM(l.credit - l.debit), 0) as amount
    FROM fin_journal_lines l
    JOIN fin_accounts a ON l.account_id = a.id
    WHERE a.profile_id = ? AND a.account_code = '4001'
  `).get(profile_id);

  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) as amount
    FROM fin_journal_lines l
    JOIN fin_accounts a ON l.account_id = a.id
    WHERE a.profile_id = ? AND a.account_code = '5001'
  `).get(profile_id);

  const commRow = db.prepare(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) as amount
    FROM fin_journal_lines l
    JOIN fin_accounts a ON l.account_id = a.id
    WHERE a.profile_id = ? AND a.account_code = '5350'
  `).get(profile_id);

  const revenue = revRow.amount;
  const cogs = cogsRow.amount;
  const gross_profit = revenue - cogs;
  const commission_expense = commRow.amount;
  const net_operating_profit = gross_profit - commission_expense;

  return {
    revenue,
    cogs,
    gross_profit,
    commission_expense,
    net_operating_profit
  };
}

console.log('================================================================');
console.log('AGGREGATOR COMMISSION TRACKING — VERIFICATION REPORT');
console.log('================================================================\n');

// 1. Zomato Ingestion
console.log('--- TEST 1: Zomato Order (subtotal: 1000, rate: 22%) ---');
const resZom = ingestAggregatorOrder({
  aggregator: 'zomato',
  order_id: 'ZOM-1001',
  subtotal: 1000,
  tax_amount: 50,
  grand_total: 1050
});
console.log('Ingested Zomato Order:', resZom);

// Print actual journal lines for Zomato commission
console.log('\nActual Journal Lines for Zomato Commission Entry:');
const zomJournalLines = db.prepare(`
  SELECT a.account_code, a.name as account_name, l.debit, l.credit, l.description
  FROM fin_journal_lines l
  JOIN fin_journal_entries e ON l.entry_id = e.id
  JOIN fin_accounts a ON l.account_id = a.id
  WHERE e.document_id = ? AND e.narration LIKE '%Commission%'
`).all(resZom.invoice_id);
console.table(zomJournalLines);
console.log('Are any Bank/Cash lines present? (Account 1001/1002):',
  zomJournalLines.some(l => l.account_code === '1001' || l.account_code === '1002') ? 'YES (BUG)' : 'NO (CORRECT: 0 cash outflow)');

// 2. Swiggy Ingestion
console.log('\n--- TEST 2: Swiggy Order (subtotal: 2000, rate: 25%) ---');
const resSwiggy = ingestAggregatorOrder({
  aggregator: 'swiggy',
  order_id: 'SW-2001',
  subtotal: 2000,
  tax_amount: 100,
  grand_total: 2100
});
console.log('Ingested Swiggy Order:', resSwiggy);

console.log('\nActual Journal Lines for Swiggy Commission Entry:');
const swiggyJournalLines = db.prepare(`
  SELECT a.account_code, a.name as account_name, l.debit, l.credit, l.description
  FROM fin_journal_lines l
  JOIN fin_journal_entries e ON l.entry_id = e.id
  JOIN fin_accounts a ON l.account_id = a.id
  WHERE e.document_id = ? AND e.narration LIKE '%Commission%'
`).all(resSwiggy.invoice_id);
console.table(swiggyJournalLines);

// Check account deduplication
console.log('\n--- VERIFICATION 2: Chart of Accounts Deduplication ---');
const accountsInDB = db.prepare("SELECT id, name, account_code, account_type FROM fin_accounts WHERE account_code IN ('1250', '5350')").all();
console.table(accountsInDB);
console.log('Number of rows for 5350 (Commission Expense):', accountsInDB.filter(a => a.account_code === '5350').length);
console.log('Number of rows for 1250 (AR Aggregator):', accountsInDB.filter(a => a.account_code === '1250').length);
console.log('Are accounts deduplicated?:', accountsInDB.length === 2);

// 3. Full P&L Report Check (Revenue, COGS, Gross Profit, Commission, Net Operating Profit)
console.log('\n--- TEST 3: Detailed Financial P&L Statement (Spanning Both Orders) ---');
const pnl1 = getDetailedPnL();
console.table(pnl1);
console.log('Formula: Net Operating Profit (₹1080) = Gross Profit (₹1800) - Commission Expense (₹720)');
console.log('Verification (gross_profit - commission_expense === net_operating_profit):',
  pnl1.gross_profit - pnl1.commission_expense === pnl1.net_operating_profit);

// 4. Cancel Zomato Order
console.log('\n--- TEST 4: Cancel Zomato Order (Append-Only Reversal) ---');
cancelAggregatorOrder('ZOM-1001', 'Customer cancelled on Zomato app');
console.log('fin_expenses rows for ZOM-1001 after cancellation (Original + Reversal):');
console.table(db.prepare("SELECT id, amount, total_amount, description FROM fin_expenses WHERE document_id = ?").all(resZom.invoice_id));

const pnl2 = getDetailedPnL();
console.log('\nDetailed Financial P&L Statement Post-Zomato Cancellation:');
console.table(pnl2);
console.log('Post-Cancellation P&L Correct?:',
  pnl2.revenue === 2000 && pnl2.cogs === 800 && pnl2.gross_profit === 1200 && pnl2.commission_expense === 500 && pnl2.net_operating_profit === 700);

// 5. Test Discounted Order
console.log('\n--- TEST 5: Discounted Order (Subtotal: ₹1000, Discount: ₹200, Rate: 22%) ---');
const resDisc = ingestAggregatorOrder({
  aggregator: 'zomato',
  order_id: 'ZOM-DISC-1002',
  subtotal: 1000,
  discount_amt: 200,
  tax_amount: 40,
  grand_total: 840
});
console.log('Discounted Order Ingestion Result:', resDisc);
console.log(`Subtotal: ₹1000, Discount: ₹200 → Net Subtotal: ₹${resDisc.effective_subtotal}`);
console.log(`Commission Amount Calculated (22% of ₹800): ₹${resDisc.commission_amount}`);
console.log('Is commission ₹176 (22% on ₹800 net) rather than ₹220 (on gross subtotal)?:', resDisc.commission_amount === 176);

