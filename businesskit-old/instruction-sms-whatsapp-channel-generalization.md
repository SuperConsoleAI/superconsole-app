# Instruction: Generalize `email_*` → Multi-Channel Campaigns (SMS/WhatsApp)

> Same move already made on `fin_gst_returns` → `fin_tax_returns`: rename +
> generalize one table family instead of building a parallel one per
> channel. Zero new tables.

---

## Part A — Add `channel` column to each `email_*` table

```rust
Migration {
    id: "20260901_email_templates_channel",
    table: "email_templates",
    sql: "ALTER TABLE email_templates ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';"
},
Migration {
    id: "20260901_email_campaigns_channel",
    table: "email_campaigns",
    sql: "ALTER TABLE email_campaigns ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';"
},
Migration {
    id: "20260901_email_tracking_events_channel",
    table: "email_tracking_events",
    sql: "ALTER TABLE email_tracking_events ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';"
},
Migration {
    id: "20260901_email_tracking_stats_channel",
    table: "email_tracking_stats",
    sql: "ALTER TABLE email_tracking_stats ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';"
}
```

`channel` values: `email | sms | whatsapp`. Default `'email'` on existing
rows costs nothing — all current data really is email.

**Do not rename the tables.** `email_templates`/`email_campaigns` etc.
stay as-is; renaming touches every existing command and frontend call site
for zero functional gain. The `fin_gst_returns` rename was justified
because the table name itself was India-specific (GST). `email_*` isn't
wrong, just incomplete — a column fixes that without a rename.

---

## Part B — Channel-specific config lives in existing JSON/meta fields

Don't add `sms_provider_config` or `whatsapp_template_id` as new columns.
If `email_templates`/`email_campaigns` already has a `meta`/config JSON
column, channel-specific settings (SMS sender ID, WhatsApp approved
template name, character-count warnings) go there:

```json
{ "sms_sender_id": "BIZKIT", "whatsapp_template_name": "order_update_v2" }
```

If no such JSON column exists yet on these tables, that's the one real
gap worth a single `meta TEXT NOT NULL DEFAULT '{}'` column addition —
check before assuming it's missing.

---

## Part C — Campaign audience queries

Campaign audience-building commands must use the live-join pattern from
`instruction-crm-identity-and-join-fix.md` Part B — an SMS campaign
audience is the same query as an email campaign audience, just filtered
differently by contact preference (some customers may opt into SMS but
not email, or vice versa — that's a per-contact preference field, likely
belongs on `crm_contacts` alongside the DOB/anniversary fields, flag to
Kumar if not already present rather than assuming).

---

## Part D — New commands

Reuse existing `email_*` command file structure, don't create a parallel
`sms_commands.rs`:

- `send_campaign(campaign_id)` — already exists for email; extend to
  branch on `channel` internally (call an SMS gateway vs SMTP vs
  WhatsApp Business API depending on the value)
- Provider integration (Twilio/MSG91/Gupshup for SMS,
  WhatsApp Business API) goes through the existing `connections` table
  (confirmed generic per Check 3) — one `connections` row per channel
  provider, `service: "sms_provider"` or `service: "whatsapp_provider"`

---

## Acceptance check

Creating a campaign with `channel: 'sms'` and a template stored via the
same `email_templates` table (misnomer now, functionally a
"message_templates" table) should send through whichever provider is
configured in `connections` for that channel, and log delivery events
into the same `email_tracking_events` table with `channel: 'sms'` set.
