# SuperConsole — Phase 16
## MCP Server + Tool Call Infrastructure
## Date: 2026-06-16

---

## The Core Concept (Read This First)

**The agent always calls tools directly. SuperConsole is the executor.**

Tool calling flow — always:
```
Agent (Claude/Droid/LLM)
  → reasoning: "I need to post to this client's newsletter"
  → decision: call beehiiv_publish_post(title, content)
  → API response contains tool_call block
  → executor (SuperConsole) intercepts
  → looks up THIS project's Beehiiv connector
  → decrypts credentials from local cache
  → calls Beehiiv API
  → returns result to agent
  → agent continues reasoning
```

SuperConsole is NOT a middleman the agent talks to first.
SuperConsole IS the executor that runs tool calls with project-scoped credentials.

---

## Three Ways to Call Supabase — Why Way 3 Is SuperConsole's Model

### Way 1 — Direct Supabase MCP Server
```
Agent → supabase_execute_sql(query)
     → Supabase's own MCP server
     → credentials from user's .env (SUPABASE_URL, SUPABASE_KEY)
     → result back to agent

Problem: credentials are account-level
Client A and Client B share the same .env
Wrong Supabase for the wrong client = data disaster
```

### Way 2 — Agent writes the API call itself
```
Agent → terminal: "curl https://xxx.supabase.co/rest/v1/..."
     → reads SUPABASE_URL + SUPABASE_KEY from injected env vars
     → calls Supabase directly
     → result back

Works but: agent handles auth = credentials visible in terminal output
Agent errors expose URLs and keys in logs
No abstraction, no isolation guarantee
```

### Way 3 — SuperConsole as credential-aware executor (our model)
```
Agent → supabase_query(sql)     ← just the query, no credentials
     → SuperConsole intercepts this tool call
     → looks up acme-dental project's Supabase connector
     → decrypts from connectors_cache (never Turso at runtime)
     → calls Supabase API with correct URL + key
     → returns clean result to agent

Agent never sees URL or auth token
Switch projects = different Supabase automatically
20 clients = zero extra config per client
Credentials never in terminal output or logs
```

This is the right architecture. Way 3 is what we build.

---

## SuperConsole MCP Server — What It Actually Is

NOT "SuperConsole calling Supabase MCP."
NOT a layer on top of other MCP servers.

SuperConsole MCP IS the credential-aware router that REPLACES
the need for service-specific MCP servers for connected connectors.

```
Without SuperConsole MCP:
  User needs: Supabase MCP + Gmail MCP + Shopify MCP + Beehiiv MCP
  Each: separate install, separate credentials, account-level only
  20 clients = 80+ MCP configs to manage
  No project isolation

With SuperConsole MCP:
  User connects Supabase/Gmail/Shopify/Beehiiv per project in SC UI
  SuperConsole MCP exposes ONE endpoint per workspace session
  Claude Code connects via .mcp.json (auto-generated)
  Agent calls: supabase_query, gmail_send, shopify_update, beehiiv_publish
  SuperConsole routes each call to the right project's credentials
  20 clients = 20 projects = zero extra MCP config
  Full project isolation enforced at execution layer
```

---

## How Claude Tool Calling Works (Anthropic Docs)

Per Anthropic's tool use documentation:

```
1. User sends message to Claude
2. Claude decides to use a tool
3. Claude returns response with tool_use block:
   {
     "type": "tool_use",
     "name": "gmail_send",
     "input": { "to": "client@example.com", "subject": "...", "body": "..." }
   }
4. YOUR CODE (SuperConsole) executes the tool
5. YOUR CODE returns tool_result to Claude
6. Claude continues with the result
```

Step 4 is SuperConsole. The executor. That's our job.
For PTY sessions (Claude Code, Droid): they have their own tool execution loop.
SuperConsole connects to them as an MCP server — they call our tools.
For native chat (chat.rs): SuperConsole IS the executor directly.

---

## Tool Schema — What the Agent Sees

### Option A: Direct (few tools, small context)
```
Agent receives all tool schemas upfront in system prompt.
Knows immediately what's available.
Calls directly: beehiiv_publish_post(title, content)

Use when: project has ≤ 5-8 connectors
Context cost: manageable
```

### Option B: Progressive Disclosure (many tools, Hermes pattern)
```
Agent receives only 3 bridge tool schemas:
  sc_search(query, limit?)     ← BM25 search over tool catalog
  sc_describe(name)            ← get full schema for one tool
  sc_call(name, arguments)     ← execute any tool

Agent discovers: sc_search("newsletter publishing")
  → finds: beehiiv_publish_post, convertkit_send_broadcast
Agent loads: sc_describe("beehiiv_publish_post")
  → gets full schema
Agent calls: sc_call("beehiiv_publish_post", {title, content})
  → SuperConsole executes with project credentials

Use when: project has many connectors (10+)
Context savings: ~97% on tool schema tokens (per Hermes benchmarks)
Accuracy gain: 49% → 74% on complex tasks (Hermes paper)
```

### Auto mode (implement both, switch automatically)
```
Session start:
  Count: how many tools are available for this project?
  Estimate: token cost of all schemas
  
  If schemas < 10% of model context window:
    → load all directly (Option A)
  
  If schemas ≥ 10% of model context window:
    → activate bridge (Option B)
    → agent discovers tools on demand
```

---

## Tool Registry (Inspired by Hermes Runtime)

Hermes key insight: tools self-register at import time.
`check_fn` determines availability. Model only sees available tools.

SuperConsole equivalent:

```rust
// In mcp_server.rs

struct ToolEntry {
    name: String,
    toolset: String,
    description: String,
    schema: serde_json::Value,     // OpenAI function-calling schema
    handler: Box<dyn ToolHandler>,
    check_fn: Box<dyn Fn(&ProjectContext) -> bool>,
    // check_fn = is this connector connected for this project?
    requires_connector: Option<String>,
}

struct ToolRegistry {
    tools: HashMap<String, ToolEntry>,
    // BM25 index rebuilt on session start from registered + available tools
    search_index: BM25Index,
}

impl ToolRegistry {
    fn get_available_tools(&self, project_id: &str) -> Vec<&ToolEntry> {
        self.tools.values()
            .filter(|t| (t.check_fn)(&self.project_context(project_id)))
            .collect()
        // Result: only tools for connectors that ARE connected for this project
        // Client A's Gmail ≠ Client B's Gmail
        // Client A sees gmail_* only if Client A connected Gmail
    }

    fn search(&self, query: &str, project_id: &str, limit: usize) -> Vec<ToolMatch> {
        // BM25 over available tools only (already filtered by project)
        // Returns: name, description, relevance score
    }

    fn execute(&self, name: &str, args: Value, project_id: &str) -> Result<Value> {
        let tool = self.tools.get(name)?;
        // Verify tool is available for this project
        // Decrypt connector credentials from connectors_cache
        // Execute handler
        // Return result (never the credentials)
    }
}
```

---

## Tools Available in SuperConsole MCP

### Always loaded (never deferred, zero check_fn required)

```
sc_list_available_tools()
  → what connectors are connected, which skills active,
    whether memory/wiki exist for this project
  → agent calls this first to understand what's available
  → 1 schema, always present

sc_add_inbox_item(content, title, requires_approval?)
  → send output to SuperConsole inbox
  → if requires_approval: agent pauses, waits for user action
  → basis for human-in-the-loop approval workflow

sc_update_heartbeat(data)
  → update project HEARTBEAT.md
  → other agents/sessions see fresh state
  → lightweight state coordination

sc_log_usage(tokens_in, tokens_out, model, provider)
  → feeds Phase 21 usage monitoring
  → called automatically by chat.rs
  → agent can also call explicitly for tracked sub-tasks
```

### Context tools (deferred, fetched on demand)

```
skill_list()                → list active skills for this project
skill_view(name)            → load full skill content on demand
skill_run(name, context?)   → inject skill into active session

memory_read(query?)         → fetch relevant memory entries (semantic search)
memory_write(content, tags?) → agent saves new knowledge to project memory
memory_list()               → all memory entries for this project

wiki_list()                 → list all wiki pages for this project
wiki_read(page)             → fetch one wiki page on demand
wiki_suggest(title, content) → agent proposes new wiki page
                               → goes to inbox for user approval
```

### Connector tools (dynamic, generated per project)

Generated at session start from project's connected connectors.
Only tools for connected services appear. Unconnected = not in catalog.

```
Gmail connected → gmail_send, gmail_read, gmail_list_labels
Shopify connected → shopify_get_products, shopify_update_product,
                    shopify_create_product, shopify_get_orders
Beehiiv connected → beehiiv_create_post, beehiiv_list_posts,
                    beehiiv_publish_post
Turso connected → turso_query, turso_execute
Supabase connected → supabase_query, supabase_rpc
Telegram connected → telegram_send, telegram_send_photo
Stripe connected → stripe_list_customers, stripe_create_invoice,
                   stripe_get_balance
Buffer connected → buffer_create_post, buffer_list_profiles
Notion connected → notion_create_page, notion_read_page,
                   notion_search
GitHub connected → github_list_issues, github_create_issue,
                   github_list_prs
Slack connected → slack_send_message, slack_list_channels
```

Executor decrypts credentials → calls API → returns result.
Agent sees: function name + parameters only. Never credentials.

---

## Project Security Scoping

SuperConsole's moat vs Hermes, Supabase MCP, and every other MCP server:

```
Hermes tool catalog: global per agent session
Supabase MCP: one credential set, account-level

SuperConsole tool catalog: scoped per project

Agent in [acme-dental]:
  sc_search("email") → finds gmail_* for sarah@acmedental.com only
  Cannot discover acme-restaurant's Gmail
  Cannot call org connectors unless explicitly granted

Agent in [acme-restaurant]:
  sc_search("email") → finds gmail_* for info@acmerestaurant.com only
  Completely separate catalog, separate credentials

sc_call validates: project_id in session token matches project_id 
                   in connector credential record
Cross-project calls: impossible at execution layer, not just policy
```

---

## .mcp.json Auto-generation

On workspace open, SuperConsole writes to workspace root:

```json
{
  "mcpServers": {
    "superconsole": {
      "command": "superconsole",
      "args": ["mcp", "--session", "{session_token}"],
      "env": {}
    }
  }
}
```

Session token encodes: user_id + project_id + workspace_id + expiry
Claude Code reads .mcp.json automatically on start.
Droid reads .mcp.json automatically on start.
Any MCP-compatible CLI reads this automatically.
File is gitignored. Regenerated fresh each session. Token expires on close.

---

## Native Chat Tool Execution (chat.rs)

For native chat sessions, no MCP needed.
SuperConsole IS the executor directly.

```rust
// In chat.rs — when API returns tool_use block:
match content_block {
    ContentBlock::ToolUse { name, input } => {
        let result = tool_registry
            .execute(&name, input, &session.project_id)
            .await?;
        
        // Append tool_result to message history
        // Continue streaming next assistant turn
    }
}
```

Same registry. Same credential lookup. Same project scoping.
Different delivery: MCP for PTY sessions, direct execution for chat.

---

## What NOT to Build in Phase 16

- Do NOT proxy to Supabase MCP or any external MCP server
  → SuperConsole IS the MCP server for connected connectors
  → User can still add external MCP servers in .mcp.json manually
  → SuperConsole's MCP is additive, not exclusive

- Do NOT require agents to talk to SuperConsole before calling tools
  → Agent calls tools. SuperConsole executes them. That's it.

- Do NOT implement complex permission graphs yet
  → Project scoping is enough for V1
  → Fine-grained tool permissions come in Phase 13 polish

---

## Build Order for Phase 16

After Phases 18-20 (Skills, Memory, Wiki) are complete, because:
- Phase 16 exposes skills/memory/wiki as MCP tools
- Need the data layer before the tool layer

```
1. mcp_server.rs — start/stop per workspace, session token auth
2. ToolRegistry — registration, check_fn, BM25 search
3. .mcp.json generation — on workspace open, gitignored
4. Connector tool generation — from connectors_cache per project
5. Connector tool execution — route + decrypt + call + return
6. Context tools — skill_view, memory_read, wiki_read (on demand)
7. Always-loaded tools — sc_list_available_tools, sc_add_inbox_item
8. Auto mode — token count → switch between direct and bridge
9. chat.rs integration — direct tool execution for native chat
10. Test: Claude Code + Droid → .mcp.json → call Gmail → email sent
    Test: Project A Gmail ≠ Project B Gmail
    Test: Bridge mode with 15+ connectors → token savings verified
```

---

## Cost / Context Efficiency (Why This Matters)

Your stated goal: "not restrict and waste no time and cost"

Scheduled job running /ceo every Monday:
```
Without tool search (all schemas loaded):
  20 connectors × 200 tokens avg = 4,000 tokens per turn
  Long session (100 turns) = 400,000 tokens wasted on schemas
  At Sonnet pricing: ~$1.20 wasted per run
  52 weeks × 20 clients = $1,248/year wasted on tool schemas alone

With tool search (bridge, on demand):
  3 bridge schemas = ~60 tokens per turn
  Agent fetches 2-3 tools per session = ~600 tokens total
  Savings: ~97% on tool schema overhead
  Same 52 weeks × 20 clients = ~$38/year
```

This is why Hermes built tool search.
This is why SuperConsole implements the same pattern.
Cost efficiency IS the moat for operator-focused products.

---

## Model Routing (Future Phase — Not Phase 16)

You mentioned Factory's model routing. Add as a separate phase later:

```
Phase 22 (future) — Auto Model Routing

Simple task (summarize, format, classify):
  → route to Gemini Flash 3, GPT-4o-mini, Claude Haiku
  → ~10x cheaper

Complex task (research, write, reason):
  → route to Claude Sonnet/Opus, GPT-4o, Gemini Pro

SuperConsole detects task complexity from:
  - skill type (content → Flash, code review → Sonnet)
  - token count of context
  - user-set quality preference

User still chooses manually (current)
Auto mode is opt-in per project
```

Not Phase 16. Build it after usage monitoring (Phase 21) so you have
real cost data to validate routing decisions.

