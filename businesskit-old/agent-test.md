Confirm before we design anything further:
What does tools/mod.rs expose? Is there a single flat function that returns every tool across shop.rs, crm.rs, content.rs combined (equivalent to the old agent_tools::registry()), or is there already a per-domain accessor (e.g. shop::tools(), crm::tools() called separately)?

What does chat.rs actually send to the model on each turn? Specifically: when a chat session starts (or on every message — whichever it is), does it pass the full JSON input_schema for every tool from every domain, or is there already filtering by active domain/tab? Point to the actual line(s) where the tool list gets built and handed to the API call.

Is there currently any concept of "active domain" or "scope" tied to a chat session at all — e.g. does a session know it's a "Shop" session vs a "CRM" session, or is every chat session domain-agnostic today?

Rough token cost check, with real numbers, not estimated: dump the full JSON schema for all tools across shop.rs + crm.rs + content.rs + helpers.rs combined right now, and give an actual token count (or character count as a proxy) for that combined payload. This tells us how urgent this actually is at today's tool count — 7 tools might genuinely cost nothing, in which case this is a "design it now, matters later" problem, not a "fix it now" one.

Report back with exact file/line references, not a paraphrase — I want to design the two-tier scoping against what's actually there, not against an assumption either of us is making.
