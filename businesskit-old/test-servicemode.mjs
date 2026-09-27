import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

db.exec(`
CREATE TABLE shop_documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'invoice',
  doc_number TEXT NOT NULL,
  doc_date INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  status TEXT NOT NULL DEFAULT 'confirmed',
  channel TEXT NOT NULL DEFAULT 'pos',
  service_mode TEXT NOT NULL DEFAULT 'dine_in',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amt REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE shop_daily_analytics (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  snapshot_date INTEGER NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'all',
  service_mode TEXT NOT NULL DEFAULT 'all',
  orders_count INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  gross_margin REAL NOT NULL DEFAULT 0,
  gross_margin_pct REAL NOT NULL DEFAULT 0,
  discount_given REAL NOT NULL DEFAULT 0,
  tax_collected REAL NOT NULL DEFAULT 0,
  refunds REAL NOT NULL DEFAULT 0,
  net_revenue REAL NOT NULL DEFAULT 0,
  new_customers INTEGER NOT NULL DEFAULT 0,
  repeat_customers INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE UNIQUE INDEX idx_shop_daily_analytics_segment
 ON shop_daily_analytics (profile_id, snapshot_date, item_type, service_mode);

CREATE TABLE shop_monthly_analytics (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  snapshot_month INTEGER NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'all',
  service_mode TEXT NOT NULL DEFAULT 'all',
  orders_count INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  gross_margin REAL NOT NULL DEFAULT 0,
  gross_margin_pct REAL NOT NULL DEFAULT 0,
  discount_given REAL NOT NULL DEFAULT 0,
  tax_collected REAL NOT NULL DEFAULT 0,
  refunds REAL NOT NULL DEFAULT 0,
  net_revenue REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE UNIQUE INDEX idx_shop_monthly_analytics_segment
 ON shop_monthly_analytics (profile_id, snapshot_month, item_type, service_mode);
`);

const profile_id = 'prof_blr_dining';
const now = Math.floor(Date.now() / 1000);
const todayMidnight = Math.floor(now / 86400) * 86400;

// Start of current month (1st of month UTC)
const d = new Date(todayMidnight * 1000);
const monthStartUtc = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
const nextMonthStartUtc = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);

function aggregateDailyAnalytics(snapshotDate) {
  const startOfDay = snapshotDate;
  const endOfDay = startOfDay + 86400;

  // 1. Clean up existing rows for this date to ensure no stale segments linger after cancellation
  db.prepare("DELETE FROM shop_daily_analytics WHERE profile_id = ? AND snapshot_date = ?")
    .run(profile_id, startOfDay);

  // 2. Query active non-cancelled invoices
  const rows = db.prepare(`
    SELECT service_mode, COUNT(*) as cnt, COALESCE(SUM(grand_total), 0.0) as rev,
           COALESCE(SUM(discount_amt), 0.0) as disc, COALESCE(SUM(tax_amount), 0.0) as tax,
           COALESCE(SUM(profit), 0.0) as prf
    FROM shop_documents
    WHERE profile_id = ? AND doc_type = 'invoice' AND status NOT IN ('cancelled', 'draft')
      AND doc_date >= ? AND doc_date < ?
    GROUP BY service_mode
  `).all(profile_id, startOfDay, endOfDay);

  let totalOrders = 0;
  let totalRevenue = 0;
  let totalDisc = 0;
  let totalTax = 0;
  let totalProfit = 0;

  for (const row of rows) {
    const smode = row.service_mode || 'dine_in';
    const cnt = row.cnt;
    const rev = row.rev;
    const disc = row.disc;
    const tax = row.tax;
    const prf = row.prf;

    totalOrders += cnt;
    totalRevenue += rev;
    totalDisc += disc;
    totalTax += tax;
    totalProfit += prf;

    const sid = `sda-${profile_id}-${startOfDay}-all-${smode}`;
    db.prepare(`
      INSERT INTO shop_daily_analytics
      (id, profile_id, snapshot_date, item_type, service_mode, orders_count, revenue, gross_margin, discount_given, tax_collected, net_revenue, updated_at)
      VALUES (?, ?, ?, 'all', ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT (profile_id, snapshot_date, item_type, service_mode) DO UPDATE SET
      orders_count = excluded.orders_count, revenue = excluded.revenue, gross_margin = excluded.gross_margin,
      discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, net_revenue = excluded.net_revenue, updated_at = strftime('%s','now')
    `).run(sid, profile_id, startOfDay, smode, cnt, rev, prf, disc, tax, rev - disc);
  }

  // 3. Insert grand total row ('all', 'all')
  const totalId = `sda-${profile_id}-${startOfDay}-all-all`;
  db.prepare(`
    INSERT INTO shop_daily_analytics
    (id, profile_id, snapshot_date, item_type, service_mode, orders_count, revenue, gross_margin, discount_given, tax_collected, net_revenue, updated_at)
    VALUES (?, ?, ?, 'all', 'all', ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT (profile_id, snapshot_date, item_type, service_mode) DO UPDATE SET
    orders_count = excluded.orders_count, revenue = excluded.revenue, gross_margin = excluded.gross_margin,
    discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, net_revenue = excluded.net_revenue, updated_at = strftime('%s','now')
  `).run(totalId, profile_id, startOfDay, totalOrders, totalRevenue, totalProfit, totalDisc, totalTax, totalRevenue - totalDisc);
}

function aggregateMonthlyAnalytics(snapshotMonth) {
  // 1. Clean up existing rows for this month
  db.prepare("DELETE FROM shop_monthly_analytics WHERE profile_id = ? AND snapshot_month = ?")
    .run(profile_id, snapshotMonth);

  // 2. Aggregate directly from shop_daily_analytics
  const rows = db.prepare(`
    SELECT item_type, service_mode,
           SUM(orders_count) as cnt,
           SUM(revenue) as rev,
           SUM(cost) as cst,
           SUM(gross_margin) as gm,
           SUM(discount_given) as disc,
           SUM(tax_collected) as tax,
           SUM(refunds) as ref,
           SUM(net_revenue) as net_rev
    FROM shop_daily_analytics
    WHERE profile_id = ? AND snapshot_date >= ? AND snapshot_date < ?
    GROUP BY item_type, service_mode
  `).all(profile_id, snapshotMonth, nextMonthStartUtc);

  for (const r of rows) {
    const mid = `sma-${profile_id}-${snapshotMonth}-${r.item_type}-${r.service_mode}`;
    db.prepare(`
      INSERT INTO shop_monthly_analytics
      (id, profile_id, snapshot_month, item_type, service_mode, orders_count, revenue, cost, gross_margin, discount_given, tax_collected, refunds, net_revenue, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT (profile_id, snapshot_month, item_type, service_mode) DO UPDATE SET
      orders_count = excluded.orders_count, revenue = excluded.revenue, cost = excluded.cost, gross_margin = excluded.gross_margin,
      discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, refunds = excluded.refunds, net_revenue = excluded.net_revenue, updated_at = strftime('%s','now')
    `).run(mid, profile_id, snapshotMonth, r.item_type, r.service_mode, r.cnt, r.rev, r.cst, r.gm, r.disc, r.tax, r.ref, r.net_rev);
  }
}

function getServiceModeAnalytics(snapshotDate) {
  const rows = db.prepare(`
    SELECT service_mode, orders_count, revenue
    FROM shop_daily_analytics
    WHERE profile_id = ? AND snapshot_date = ? AND item_type = 'all' AND service_mode != 'all'
    ORDER BY orders_count DESC
  `).all(profile_id, snapshotDate);

  const totalRow = db.prepare(`
    SELECT orders_count, revenue
    FROM shop_daily_analytics
    WHERE profile_id = ? AND snapshot_date = ? AND item_type = 'all' AND service_mode = 'all'
  `).get(profile_id, snapshotDate);

  const totalOrders = totalRow ? totalRow.orders_count : 0;
  const totalRevenue = totalRow ? totalRow.revenue : 0;

  const segments = rows.map(r => ({
    service_mode: r.service_mode,
    orders_count: r.orders_count,
    revenue: r.revenue,
    percentage: totalOrders > 0 ? Math.round((r.orders_count / totalOrders) * 1000) / 10 : 0
  }));

  return {
    snapshot_date: snapshotDate,
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    segments
  };
}

console.log('================================================================');
console.log('SHOP_DAILY_ANALYTICS & SHOP_MONTHLY_ANALYTICS — VERIFICATION');
console.log('================================================================\n');

// 1. Seed 3 Dine-In, 2 Delivery, 1 Takeaway on today
console.log('--- TEST 1: Seed Orders and Aggregate Daily ---');
const orders = [
  { id: 'doc_1', number: 'INV-101', mode: 'dine_in', channel: 'pos', total: 600 },
  { id: 'doc_2', number: 'INV-102', mode: 'dine_in', channel: 'pos', total: 450 },
  { id: 'doc_3', number: 'INV-103', mode: 'dine_in', channel: 'pos', total: 800 },
  { id: 'doc_4', number: 'INV-104', mode: 'delivery', channel: 'pos', total: 350 },
  { id: 'doc_5', number: 'INV-105', mode: 'delivery', channel: 'zomato', total: 550 },
  { id: 'doc_6', number: 'INV-106', mode: 'takeaway', channel: 'pos', total: 250 },
];

for (const o of orders) {
  db.prepare(`
    INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, doc_date, status, channel, service_mode, grand_total, profit)
    VALUES (?, ?, 'invoice', ?, ?, 'confirmed', ?, ?, ?, ?)
  `).run(o.id, profile_id, o.number, todayMidnight + 3600, o.channel, o.mode, o.total, o.total * 0.5);
}

// Run daily aggregation
aggregateDailyAnalytics(todayMidnight);

const dailyRows = db.prepare("SELECT item_type, service_mode, orders_count, revenue FROM shop_daily_analytics WHERE profile_id = ? AND snapshot_date = ?").all(profile_id, todayMidnight);
console.log('Generated shop_daily_analytics rows:');
console.table(dailyRows);

// 2. Aggregate Monthly from Daily
console.log('\n--- TEST 2: Multi-Tier Rollup (shop_daily_analytics → shop_monthly_analytics) ---');
aggregateMonthlyAnalytics(monthStartUtc);

const monthlyRows = db.prepare("SELECT item_type, service_mode, orders_count, revenue FROM shop_monthly_analytics WHERE profile_id = ? AND snapshot_month = ?").all(profile_id, monthStartUtc);
console.log('Generated shop_monthly_analytics rows:');
console.table(monthlyRows);

const monthlyGrandTotal = monthlyRows.find(r => r.service_mode === 'all');
console.log(`Monthly Grand Total: Orders = ${monthlyGrandTotal.orders_count}, Revenue = ₹${monthlyGrandTotal.revenue}`);
console.log('Monthly totals match daily rollup?:', monthlyGrandTotal.orders_count === 6 && monthlyGrandTotal.revenue === 3000);

// 3. Cancel ONLY Takeaway Order & Re-Aggregate Both Tiers
console.log('\n--- TEST 3: Cancel Takeaway Order & Re-run Multi-Tier Aggregation ---');
db.prepare("UPDATE shop_documents SET status = 'cancelled' WHERE id = 'doc_6'").run();

aggregateDailyAnalytics(todayMidnight);
aggregateMonthlyAnalytics(monthStartUtc);

const postDailyRows = db.prepare("SELECT item_type, service_mode, orders_count, revenue FROM shop_daily_analytics WHERE profile_id = ? AND snapshot_date = ?").all(profile_id, todayMidnight);
const postMonthlyRows = db.prepare("SELECT item_type, service_mode, orders_count, revenue FROM shop_monthly_analytics WHERE profile_id = ? AND snapshot_month = ?").all(profile_id, monthStartUtc);

console.log('Post-cancellation shop_daily_analytics:');
console.table(postDailyRows);
console.log('Post-cancellation shop_monthly_analytics:');
console.table(postMonthlyRows);

console.log('Are takeaway rows removed from both daily and monthly tables?:',
  !postDailyRows.some(r => r.service_mode === 'takeaway') && !postMonthlyRows.some(r => r.service_mode === 'takeaway'));
console.log('Post-cancellation total orders in both tables is 5?:',
  postDailyRows.find(r => r.service_mode === 'all').orders_count === 5 && postMonthlyRows.find(r => r.service_mode === 'all').orders_count === 5);

// 4. Dashboard Card Output
console.log('\n--- TEST 4: Service Mode Breakdown Percentages ---');
const cardData = getServiceModeAnalytics(todayMidnight);
console.log(JSON.stringify(cardData, null, 2));
const pctSum = cardData.segments.reduce((a, b) => a + b.percentage, 0);
console.log(`Percentages Sum to 100%?: ${pctSum === 100}`);
