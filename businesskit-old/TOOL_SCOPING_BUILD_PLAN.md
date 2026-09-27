# BusinessKit Tool Scoping — Session Domain + Command-Level Scoping

Two independent additions on top of what already exists and works well
(`registry_for_domain`, `tools_for_slash_command`, `system_get_capabilities`).
Neither replaces domain scoping — freeform chat still needs it, since
intent isn't known until the user types something. These add the layer
above it for the cases where intent *is* already known.

---

## 1. Persist `domain` on the session

Today `selectedDomain` is frontend-only state, defaulting to `"all"` in
three different components, never saved. Every reopened session pays the
full 10-tool tax unless the user manually re-selects a tab.

- Add `domain` (text, nullable) to `agent_chat_sessions`.
- Set it once, at session creation, from *where the chat was opened*,
  not from a UI toggle the user has to remember to set: opening chat
  from the Shop page sets `domain = "shop"` automatically; from a
  genuinely domain-less entry point (if one exists), leave it null.
- `create_chat_session` accepts and stores this; `send_chat_message`
  reads the session's stored `domain` instead of trusting a per-message
  frontend signal that can silently drift back to `"all"`.
- Reserve `"all"`/null for the one real domain-less entry point, not as
  a default every session falls into.

**Done when:** reopening any session that started from a specific domain
sends that domain's scoped tools without the user re-selecting anything,
and a fresh session opened from a domain-specific screen never defaults
to `"all"`.

---

## 2. Command-level tool scoping — the actual fix for heavy tools

### Schema addition

Extend `agent_commands` (from the commands plan) with:

```
required_tools   text   -- JSON array of exact tool names, e.g. ["inventory_receive_purchase_invoice"]
```

This is separate from `domain_tags`. `domain_tags` decides where a
command is *filed and discoverable*; `required_tools` decides what gets
*sent to the model* when that specific command runs. A cross-domain
command can be filed under `["shop","crm"]` while `required_tools` names
only the two or three tools it actually needs — never "give me
everything in both domains."

Built-in commands get `required_tools` populated at seed time — "Add
Inventory from Invoice" gets exactly `["inventory_receive_purchase_invoice"]`,
not the full Shop domain. Custom commands should let the user pick from
the domain's tool list when creating a command (a simple multi-select
against the tools available in the tab(s) they tagged), defaulting to
"all tools in the tagged domain(s)" if they skip it — don't force every
user to understand tool-level scoping to create a basic command.

### New registry accessor

Add `registry_for_tools(names: &[&str]) -> Vec<ToolSpec>` in
`tools/mod.rs`, alongside the existing `registry_for_domain` — filters
the flat `registry()` by exact name match rather than domain field.
Reuses the existing `ToolSpec` list; no changes to individual tool
definitions.

### Wiring it into dispatch

The hard part isn't the registry function, it's knowing *at send time*
that a message originated from a command click rather than freeform
typing — because per the existing v1 design, clicking a command
pre-fills the composer and the user can edit before sending, so the
message text alone doesn't carry that signal by the time it's sent.

- `send_chat_message` needs an additional optional parameter,
  `source_command_id`, set by the frontend when the composer's content
  came from a command click and hasn't been cleared since.
- If the user clears the composer entirely after clicking a command
  (not just edits the text), drop the association — treat the next send
  as freeform. Editing the pre-filled text (adding a specific SKU,
  say) should *not* clear the association; only a full clear should.
- In `send_chat_message`: if `source_command_id` is present, look up
  that command's `required_tools` and call `registry_for_tools`
  instead of `registry_for_domain` for that turn. If absent, existing
  domain-scoping behavior is unchanged.

**Done when:** clicking "Add Inventory from Invoice," editing the
pre-filled prompt to add a real SKU, and sending it results in only
`inventory_receive_purchase_invoice`'s schema being sent to the model —
verified by checking the actual request payload, not just that the
command "worked." Freeform typing in the Shop tab (no command clicked)
continues to send the full Shop domain scope, unchanged.

---

## What this does and doesn't fix

- Freeform Shop-domain chat still costs ~1,865 tokens per turn — that's
  correct and unavoidable, since the model needs to know all Shop tools
  exist when it doesn't yet know what the user wants.
- Command-triggered dispatch of the heavy tool drops to just that one
  tool's cost (~1,103 tokens) instead of the full Shop set (~1,865) —
  roughly 40% off specifically for the flows that are actually the
  common case for that tool (a user clicking "Add Inventory from
  Invoice" rather than free-typing a goods-receipt request from
  scratch).
- This does not trim `inventory_receive_purchase_invoice`'s schema
  itself, and shouldn't — the fields are real business requirements, not
  bloat.

---

## Definition of done

- `agent_chat_sessions.domain` persists and is set automatically from
  where a session was opened, not left to a frontend default.
- `agent_commands.required_tools` exists, is populated for all built-in
  commands, and is settable (with a sensible default) when a user
  creates a custom command.
- `registry_for_tools` exists and is used exactly when a message
  traces back to a command click that hasn't been cleared.
- A real before/after token comparison exists for at least one heavy
  command ("Add Inventory from Invoice") showing the actual reduction —
  not an estimate.

____

Two things worth confirming before calling this fully closed, not because anything looks wrong, but because the report doesn't explicitly state either:

1. Does Tier 3 actually read domain server-side from the stored session record, or does send_chat_message still accept it as a per-message parameter from frontend state? This is the one thing that actually matters here — the whole reason to persist domain on the session was to stop trusting client state as the source of truth (that's literally how it silently drifted to "all" before). If send_chat_message still takes domain as an argument the frontend computes and passes fresh each call, you've made drift less likely (frontend now restores it from the session on reopen) but not impossible — a stale signal or a bug in restoration logic could still quietly slip back to "all". The more robust version: send_chat_message looks up domain from agent_chat_sessions by session_id itself, ignoring whatever the frontend claims. Worth asking directly which one was built.

2. The custom-command-creation UI (user-picks-tools-when-creating-a-command) — is that tracked as separate, still-pending work, or was it intentionally left out of this pass? The backend Tauri commands (create_agent_command/delete_agent_command) exist, and all 10 built-in commands got real required_tools. But this plan was scoped to the scoping mechanism itself, not the full "user creates their own command" flow from the earlier commands plan — that one specifically called for a creation form with a tool multi-select. Not a gap in this delivery, just want to confirm it hasn't quietly fallen off the list rather than being explicitly next.
Everything else — the 3-tier hierarchy reusing the existing tools_for_slash_command as a middle fast-path rather than duplicating it, the real before/after numbers per command, 29 passing tests including two that target the exact new logic — looks like a clean, complete implementation of what was asked.
