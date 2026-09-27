//! payroll.rs — Payroll & HR schema
//! Path: src-tauri/src/db/schema/payroll.rs
//!
//! What lives here: employees, salary structure, monthly payroll runs,
//! attendance, and payslips. India-first (PF, ESI, PT, TDS on salary)
//! but column names are universal — non-India businesses use the same
//! tables and leave India-specific fields null.
//!
//! How payroll flows:
//!   1. Add employees (shop_employees)
//!   2. Set salary structure (shop_salary_components per employee)
//!   3. Mark attendance (shop_attendance)
//!   4. Run monthly payroll (shop_payroll_runs)
//!   5. System generates payslips (shop_payslips) — one per employee per run
//!   6. Pay salaries → posts to shop_journal_entries (DR Salary Expense, CR Bank)
//!
//! Tables (5):
//!   shop_employees          — employee master (linked to shop_staff)
//!   shop_salary_components  — named earnings + deductions per employee
//!   shop_attendance         — daily attendance log
//!   shop_payroll_runs       — monthly payroll batch
//!   shop_payslips           — individual payslip per employee per run

pub const PAYROLL_SCHEMA: &[&str] = &[
    // ── shop_employees ───────────────────────────────────────────────────────
    // Employee master. Links to shop_staff for role/commission data.
    // shop_staff = operational (who served this table, who handled this job)
    // shop_employees = HR (who gets paid, PF, ESI, documents)
    //
    // employment_type: full_time | part_time | contract | intern | daily_wage
    // pay_frequency:   monthly | weekly | daily | hourly
    //
    // India compliance fields:
    //   pan        = PAN card (for TDS on salary, Form 16)
    //   aadhaar    = Aadhaar number
    //   uan        = Universal Account Number (PF portal)
    //   esic_no    = Employee State Insurance Corporation number
    //   pf_account = Provident Fund account number
    //
    // bank_details JSON: { bank, account_no, ifsc, upi }
    // emergency_contact JSON: { name, phone, relation }
    r#"CREATE TABLE IF NOT EXISTS shop_employees (
    id                TEXT PRIMARY KEY,
    profile_id        TEXT NOT NULL,
    staff_id          TEXT,
    name              TEXT NOT NULL,
    phone             TEXT,
    email             TEXT,
    designation       TEXT,
    department        TEXT,
    employment_type   TEXT NOT NULL DEFAULT 'full_time',
    pay_frequency     TEXT NOT NULL DEFAULT 'monthly',
    joined_at         INTEGER,
    resigned_at       INTEGER,
    pan               TEXT,
    aadhaar           TEXT,
    uan               TEXT,
    esic_no           TEXT,
    pf_account        TEXT,
    bank_details      TEXT NOT NULL DEFAULT '{}',
    emergency_contact TEXT NOT NULL DEFAULT '{}',
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_employees_profile
     ON shop_employees (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_employees_staff
     ON shop_employees (staff_id)"#,
    // ── shop_salary_components ───────────────────────────────────────────────
    // Salary structure per employee. One row per component.
    // An employee can have multiple rows (Basic + HRA + TA - PF - ESI - TDS).
    //
    // component_type:
    //   earning    → adds to gross pay (Basic, HRA, Special Allowance, Bonus)
    //   deduction  → reduces take-home (PF, ESI, Professional Tax, TDS, Loan EMI)
    //
    // calc_type:
    //   fixed      → flat amount each month (Basic = ₹20,000)
    //   percent    → % of a base component (HRA = 40% of Basic)
    //   formula    → expression stored in formula_expr (advanced)
    //
    // base_component = component name this % applies to (for percent calc_type)
    // is_taxable = 1 means included in taxable income for TDS calculation
    r#"CREATE TABLE IF NOT EXISTS shop_salary_components (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    employee_id     TEXT NOT NULL,
    name            TEXT NOT NULL,
    component_type  TEXT NOT NULL DEFAULT 'earning',
    calc_type       TEXT NOT NULL DEFAULT 'fixed',
    amount          REAL NOT NULL DEFAULT 0,
    percent         REAL NOT NULL DEFAULT 0,
    base_component  TEXT,
    formula_expr    TEXT,
    is_taxable      INTEGER NOT NULL DEFAULT 1,
    is_active       INTEGER NOT NULL DEFAULT 1,
    effective_from  INTEGER,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_salary_components_employee
     ON shop_salary_components (employee_id)"#,
    // ── shop_attendance ──────────────────────────────────────────────────────
    // Daily attendance per employee. Drives pay calculation for daily-wage
    // workers and leave deductions for salaried employees.
    //
    // status:
    //   present    → full working day
    //   absent     → unpaid absence
    //   half_day   → half day (0.5 counted)
    //   leave_paid → approved paid leave
    //   leave_unpaid → unpaid leave
    //   holiday    → public holiday (paid)
    //   weekly_off → Sunday / weekly rest day
    //
    // check_in / check_out = Unix timestamps (Tauri can capture from device clock)
    // overtime_hrs = hours worked beyond standard shift
    r#"CREATE TABLE IF NOT EXISTS shop_attendance (
    id            TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL,
    employee_id   TEXT NOT NULL,
    work_date     INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'present',
    check_in      INTEGER,
    check_out     INTEGER,
    overtime_hrs  REAL NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_attendance_date
     ON shop_attendance (employee_id, work_date)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_attendance_profile
     ON shop_attendance (profile_id, work_date)"#,
    // ── shop_payroll_runs ────────────────────────────────────────────────────
    // Monthly (or weekly) payroll batch. One row per pay period.
    // All payslips for that period belong to this run.
    //
    // period = 'MM-YYYY' e.g. '03-2025'
    // status: draft | processed | approved | paid | cancelled
    //
    // After status = paid:
    //   → posts journal entry: DR Salary Expense, CR Bank Account
    //   → TDS payable posted: DR TDS Payable, CR Tax Payable
    //   → PF/ESI posted: DR PF Expense, CR PF Payable
    //
    // total_gross    = sum of all earnings across all employees
    // total_deductions = sum of PF + ESI + PT + TDS + other deductions
    // total_net      = total_gross - total_deductions (what employees take home)
    // total_employer_contribution = employer share of PF + ESI (your cost on top)
    r#"CREATE TABLE IF NOT EXISTS shop_payroll_runs (
    id                          TEXT PRIMARY KEY,
    profile_id                  TEXT NOT NULL,
    period                      TEXT NOT NULL,
    pay_date                    INTEGER,
    status                      TEXT NOT NULL DEFAULT 'draft',
    employee_count              INTEGER NOT NULL DEFAULT 0,
    total_gross                 REAL NOT NULL DEFAULT 0,
    total_deductions            REAL NOT NULL DEFAULT 0,
    total_net                   REAL NOT NULL DEFAULT 0,
    total_employer_contribution REAL NOT NULL DEFAULT 0,
    journal_entry_id            TEXT,
    notes                       TEXT,
    created_at                  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at                  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_payroll_runs_period
     ON shop_payroll_runs (profile_id, period)"#,
    // ── shop_payslips ────────────────────────────────────────────────────────
    // Individual payslip per employee per payroll run.
    // One payroll_run → many payslips (one per employee).
    //
    // earnings_breakdown JSON = itemised earnings:
    //   { "Basic": 20000, "HRA": 8000, "Special Allowance": 5000, "Overtime": 1500 }
    //
    // deductions_breakdown JSON = itemised deductions:
    //   { "PF Employee": 1800, "ESI Employee": 325, "Professional Tax": 200, "TDS": 1500 }
    //
    // employer_breakdown JSON = employer contributions (not in take-home):
    //   { "PF Employer": 1800, "ESI Employer": 568 }
    //
    // working_days  = total working days in period
    // present_days  = days employee was present (affects proration)
    // gross_pay     = sum of all earnings
    // total_deductions = sum of all deductions
    // net_pay       = gross_pay - total_deductions (actual transfer amount)
    r#"CREATE TABLE IF NOT EXISTS shop_payslips (
    id                   TEXT PRIMARY KEY,
    profile_id           TEXT NOT NULL,
    payroll_run_id       TEXT NOT NULL,
    employee_id          TEXT NOT NULL,
    period               TEXT NOT NULL,
    working_days         INTEGER NOT NULL DEFAULT 0,
    present_days         INTEGER NOT NULL DEFAULT 0,
    overtime_hrs         REAL NOT NULL DEFAULT 0,
    gross_pay            REAL NOT NULL DEFAULT 0,
    total_deductions     REAL NOT NULL DEFAULT 0,
    net_pay              REAL NOT NULL DEFAULT 0,
    employer_contrib     REAL NOT NULL DEFAULT 0,
    earnings_breakdown   TEXT NOT NULL DEFAULT '{}',
    deductions_breakdown TEXT NOT NULL DEFAULT '{}',
    employer_breakdown   TEXT NOT NULL DEFAULT '{}',
    tds_deducted         REAL NOT NULL DEFAULT 0,
    pf_employee          REAL NOT NULL DEFAULT 0,
    pf_employer          REAL NOT NULL DEFAULT 0,
    esi_employee         REAL NOT NULL DEFAULT 0,
    esi_employer         REAL NOT NULL DEFAULT 0,
    professional_tax     REAL NOT NULL DEFAULT 0,
    is_paid              INTEGER NOT NULL DEFAULT 0,
    paid_at              INTEGER,
    payment_mode         TEXT,
    payment_reference    TEXT,
    created_at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_payslips_run_employee
     ON shop_payslips (payroll_run_id, employee_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_payslips_profile
     ON shop_payslips (profile_id, period)"#,
];
