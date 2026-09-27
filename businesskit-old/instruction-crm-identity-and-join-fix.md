# Instruction: CRM Identity Fields + Live-Join Fix

> Source: claude-code-instruction-crm-sync-check.md, Checks 1 & 2.
> Both fixes touch the same root cause (write-once link, no read-back)
> so they ship together.

---

## Part A — Add DOB / anniversary to `crm_contacts`

Schema files are frozen for direct edits. Add via migration, same pattern
as `shop.rs` `MIGRATIONS_SQL`:

```rust
Migration {
    id: "20260901_crm_contacts_dob",
    table: "crm_contacts",
    sql: "ALTER TABLE crm_contacts ADD COLUMN date_of_birth TEXT;"
},
Migration {
    id: "20260901_crm_contacts_anniversary",
    table: "crm_contacts",
    sql: "ALTER TABLE crm_contacts ADD COLUMN anniversary TEXT;"
},
```

Both `TEXT`, store as `MM-DD` (no year required — most businesses don't
collect birth year, and campaigns only need month+day to trigger). If a
year is captured, store full `YYYY-MM-DD` and derive month/day in the
query — don't add a second column for it.

Add to `src-tauri/src/db/schema/crm.rs`, register in the existing
`MIGRATIONS_SQL` array for that file (create one if it doesn't exist yet,
following the `shop.rs` pattern exactly).

---

## Part B — Fix the write-once link: campaign/loyalty queries must live-join

**Do not** add a denormalized copy of CRM group/label data onto
`shop_customers` — that reintroduces the staleness problem this fix is
meant to remove. Instead, every query that builds a campaign audience or
checks group membership must join at query time:

```sql
SELECT sc.*
FROM shop_customers sc
JOIN crm_contact_groups ccg ON ccg.contact_id = sc.contact_id
WHERE ccg.group_id = ?1
  AND sc.profile_id = ?2
```

**Where this applies — audit and fix each:**
- Any command that builds an SMS/email/loyalty campaign audience list
  (new commands from Part C of the SMS instruction file, and existing
  `email_campaigns` audience logic if it currently reads only
  `shop_customers`)
- Birthday/anniversary campaign trigger (new, uses Part A columns)
- Anywhere customer "labels" or "segments" are displayed on a customer
  profile screen — pull live from `crm_contact_groups`, don't cache

**Do not fix:** `shop_create_customer`'s write-once insert into
`crm_contacts` itself is fine as-is — that's correctly creating the CRM
record once. The gap was only ever on the read side.

---

## Acceptance check

After this ships: adding a `shop_customers` row to a CRM group should make
it eligible for a campaign audience query on the next campaign build —
no re-sync, no batch job, because nothing was ever cached to begin with.
