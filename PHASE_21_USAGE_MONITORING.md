# SuperConsole — Phase 21: Usage Monitoring
## Date: 2026-06-16

---

## Goal

Full visibility into token usage and cost.
Per session → project → org → account.
Per model, per provider, per CLI.
GitHub-style heatmap. Shareable. Invoiceable.

Nobody else shows this with project-level granularity.
Agency running 20 clients can see exactly what each client costs.
Client provided their own API key → they see their own spend.

---

## What Gets Tracked Per Session

```
session_id         → links to conversation/PTY session
project_id         → which project (ULID)
model              → "claude-sonnet-4-6", "gpt-4o", "gemini-2.0-flash"
provider           → "anthropic", "openai", "google", "openrouter", "local"
cli                → "claude", "droid", "antigravity", "chat", "shell"

tokens_prompt      → input tokens (uncached)
tokens_prompt_cached → cached input tokens (cheaper)
tokens_completion  → output tokens
tokens_reasoning   → reasoning tokens (where applicable, e.g. o1)
cost_usd           → calculated from provider pricing table

started_at
ended_at
```

Provider AND model both tracked because:
same model can run on multiple providers (e.g. claude-sonnet via Anthropic or Bedrock)
cost differs per provider — must track both for accurate billing.

---

## Token Breakdown (OpenRouter-style)

```
Prompt tokens:
  Uncached     → full price
  Cached       → reduced price (Anthropic prompt caching)
  Cache hit rate = cached / (uncached + cached)

Completion tokens:
  Completion   → standard output
  Reasoning    → chain-of-thought (o1, claude-extended-thinking)

Cost = (prompt_uncached × prompt_price)
     + (prompt_cached × cached_price)
     + (completion × completion_price)
     + (reasoning × reasoning_price)
```

---

## Three-Level Aggregate Tables (Turso)

All three follow same schema pattern. Aggregated from usage_events.
One row per entity. Upserted on session end.

### project_usage (one row per project)

```sql
CREATE TABLE project_usage (
  project_id           TEXT PRIMARY KEY,

  -- Lifetime counters
  tokens_prompt_lifetime        INTEGER DEFAULT 0,
  tokens_prompt_cached_lifetime INTEGER DEFAULT 0,
  tokens_completion_lifetime    INTEGER DEFAULT 0,
  tokens_reasoning_lifetime     INTEGER DEFAULT 0,
  cost_lifetime_usd             REAL DEFAULT 0,
  sessions_lifetime             INTEGER DEFAULT 0,
  cache_hits_lifetime           INTEGER DEFAULT 0,

  -- Year-keyed lifetime (grows forever, one key per year)
  -- {"2025":{"tokens_prompt":1200000,"tokens_completion":800000,
  --           "cost_usd":24.50,"sessions":145,"cache_hits":234},
  --  "2026":{"tokens_prompt":3400000,...}}
  analytics_lifetime   TEXT DEFAULT '{}',

  -- Rolling windows (JSON arrays of daily/hourly buckets)
  -- Each bucket: {date, tokens_prompt, tokens_completion, cost_usd, sessions}
  usage_24h            TEXT DEFAULT '[]',  -- hourly buckets
  usage_7d             TEXT DEFAULT '[]',  -- daily buckets
  usage_30d            TEXT DEFAULT '[]',  -- daily buckets
  usage_12m            TEXT DEFAULT '[]',  -- monthly buckets

  -- Breakdowns (JSON — for charts)
  by_model    TEXT DEFAULT '{}',
  -- {"claude-sonnet-4-6":{"tokens_prompt":500000,"tokens_completion":300000,
  --                        "cost_usd":12.50,"sessions":45,"provider":"anthropic"}}
  -- provider kept inside model entry (same model, different providers = different entries)
  -- key = "model:provider" e.g. "claude-sonnet-4-6:anthropic" vs "claude-sonnet-4-6:bedrock"

  by_provider TEXT DEFAULT '{}',
  -- {"anthropic":{"cost_usd":18.50,"sessions":60,"tokens":800000},
  --  "openrouter":{"cost_usd":6.20,"sessions":20}}

  by_cli      TEXT DEFAULT '{}',
  -- {"claude":{"sessions":45,"cost_usd":12.50},
  --  "droid":{"sessions":15,"cost_usd":6.00},
  --  "chat":{"sessions":20,"cost_usd":6.20}}

  by_member   TEXT DEFAULT '{}',
  -- {"user_ulid":{"sessions":8,"cost_usd":5.20,"tokens":200000}}

  -- Heatmap data (daily activity for GitHub-style grid)
  -- {"2026-06-01":{"cost_usd":2.50,"sessions":3,"tokens":45000},
  --  "2026-06-02":{"cost_usd":0,"sessions":0,"tokens":0}, ...}
  heatmap_365d TEXT DEFAULT '{}',

  last_synced_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### org_usage (one row per org, rolled up from projects)

```sql
CREATE TABLE org_usage (
  org_id               TEXT PRIMARY KEY,
  tokens_prompt_lifetime        INTEGER DEFAULT 0,
  tokens_completion_lifetime    INTEGER DEFAULT 0,
  cost_lifetime_usd             REAL DEFAULT 0,
  sessions_lifetime             INTEGER DEFAULT 0,
  analytics_lifetime   TEXT DEFAULT '{}',  -- same year-keyed pattern
  usage_30d            TEXT DEFAULT '[]',
  usage_12m            TEXT DEFAULT '[]',
  by_project  TEXT DEFAULT '{}',
  -- {"project_id":{"name":"acme-dental","cost_usd":24.50,
  --                "sessions":145,"tokens":2000000}}
  by_model    TEXT DEFAULT '{}',
  by_provider TEXT DEFAULT '{}',
  heatmap_365d TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### account_usage (one row per user, rolled up from orgs)

```sql
CREATE TABLE account_usage (
  user_id              TEXT PRIMARY KEY,
  cost_lifetime_usd    REAL DEFAULT 0,
  sessions_lifetime    INTEGER DEFAULT 0,
  analytics_lifetime   TEXT DEFAULT '{}',
  usage_12m            TEXT DEFAULT '[]',
  by_org      TEXT DEFAULT '{}',
  by_model    TEXT DEFAULT '{}',
  by_provider TEXT DEFAULT '{}',
  heatmap_365d TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Local SQLite (Raw Events — Never Synced to Turso)

```sql
CREATE TABLE usage_events (
  id                     TEXT PRIMARY KEY,  -- ULID
  project_id             TEXT NOT NULL,
  session_id             TEXT,
  model                  TEXT,
  provider               TEXT,
  cli                    TEXT,
  tokens_prompt          INTEGER DEFAULT 0,
  tokens_prompt_cached   INTEGER DEFAULT 0,
  tokens_completion      INTEGER DEFAULT 0,
  tokens_reasoning       INTEGER DEFAULT 0,
  cost_usd               REAL DEFAULT 0,
  cache_hit_rate         REAL DEFAULT 0,    -- cached/(uncached+cached)
  started_at             TEXT,
  ended_at               TEXT,
  created_at             TEXT DEFAULT (datetime('now'))
);
```

Raw events = private. Never leave the device.
Only aggregates go to Turso (no individual session data in cloud).

---

## Local Sync (Same Pattern as Connectors/LLM Keys)

Local cache of Turso aggregates for fast display:
```
usage_cache (project_id, org_id, cached_json, synced_at)
```

App opens → pull latest project_usage from Turso → cache locally.
Usage display reads local cache. Never queries Turso per page load.
On session end → upsert Turso → update local cache immediately.

---

## Aggregation Flow

```
Session ends / tab closed:
  1. Write raw event to local usage_events
  2. Calculate current year key (e.g. "2026")
  3. Read existing project_usage from Turso (or local cache)
  4. Upsert project_usage:
       - increment lifetime counters
       - merge this session into analytics_lifetime["2026"]
       - update rolling windows (drop expired buckets, add new)
       - update by_model, by_provider, by_cli, by_member
       - update heatmap_365d for today's date
  5. Roll up to org_usage (same pattern)
  6. Roll up to account_usage (same pattern)
  7. Update local cache
```

Year-keyed merge example:
```rust
let year = "2026";
let existing = parse_json(row.analytics_lifetime);
let year_data = existing.entry(year).or_insert_with(zero_bucket);
year_data.tokens_prompt += session.tokens_prompt;
year_data.tokens_completion += session.tokens_completion;
year_data.cost_usd += session.cost_usd;
year_data.sessions += 1;
year_data.cache_hits += session.cache_hits;
// write back as JSON
```

---

## GitHub-Style Heatmap

```
heatmap_365d: {
  "2026-06-01": { "cost_usd": 2.50, "sessions": 3, "tokens": 45000 },
  "2026-06-02": { "cost_usd": 0, "sessions": 0, "tokens": 0 },
  "2026-06-16": { "cost_usd": 18.20, "sessions": 12, "tokens": 438000 },
  ...365 days rolling...
}
```

UI renders as GitHub contribution grid:
- Each square = one day
- Color intensity = tokens used OR cost (user can toggle)
- Multiple color channels for different models (like different contribution types)
- Hover: "June 16 — 438K tokens — $18.20 — 12 sessions"
- Shareable as image (screenshot to post on X)

Per model color coding:
- Claude = purple
- GPT = green
- Gemini = blue
- OpenRouter = orange
- Local = grey

---

## Usage Display Screens

### Project → Usage tab
```
[This month] [This year] [All time]    Year: [2026 ▾]

Spend: $67.20    Sessions: 412    Tokens: 5.4M    Cache hit: 34%

Token breakdown:
  Prompt (uncached): 3.2M    Completion: 1.8M    Reasoning: 400K
  Prompt (cached): 1.6M      Cache savings: ~$8.40

[GitHub heatmap — 365 days]

Usage by model:
  claude-sonnet-4-6 (anthropic)  $42.10  312 sessions  ████████
  gpt-4o (openrouter)            $18.20   80 sessions  ████
  gemini-flash (google)           $6.90   20 sessions  █

Usage by CLI:
  Claude Code    312 sessions  $42.10
  Native Chat     80 sessions  $18.20
  Droid           20 sessions   $6.90

Request volume by model [line chart — daily]

[Export Cost Report]  → PDF/markdown for client billing
```

### Org → Usage tab
```
Total: $340.50    5 projects    2,060 sessions

By project:
  acme-dental       $120.40    412 sessions    ████████
  acme-restaurant    $98.20    340 sessions    ██████
  acme-gym           $72.10    280 sessions    █████
  my-saas-app        $50.40    ...

[GitHub heatmap — org combined]
```

---

## How Token Counts Are Captured

### Native chat (chat.rs)
API response includes usage block:
```json
{ "usage": { "input_tokens": 1234, "output_tokens": 567,
             "cache_read_input_tokens": 890 } }
```
Parse directly. Accurate to the token.

### PTY sessions (Claude Code, Droid)
Claude Code prints usage at session end:
```
Tokens: 45,231 input, 12,847 output ($0.142)
```
Parse this output. Regex match on known formats.
Different CLIs have different formats — maintain format registry.

### Fallback (unknown CLI output)
Best estimate from context length + response length.
Mark as "estimated" in UI.

---

## Provider Pricing Table (Hardcoded, Updatable)

```rust
struct ModelPricing {
    model: &str,
    provider: &str,
    prompt_per_1m_usd: f64,
    cached_per_1m_usd: f64,
    completion_per_1m_usd: f64,
    reasoning_per_1m_usd: f64,
}

// Updated when prices change (app update or remote config)
// Shown as "estimated cost" — not a billing guarantee
```

---

## Cost Report Export

Project → Usage → [Export Cost Report]

```markdown
# AI Usage Report — Acme Dental
Period: June 2026
Generated: 2026-06-16

## Summary
Total tokens: 5,400,000
Estimated cost: $67.20
Sessions: 412
Cache hit rate: 34% (saved ~$8.40)

## By Model
| Model | Provider | Sessions | Tokens | Cost |
|-------|----------|---------|--------|------|
| claude-sonnet-4-6 | Anthropic | 312 | 3.8M | $42.10 |
| gpt-4o | OpenRouter | 80 | 1.2M | $18.20 |
| gemini-flash | Google | 20 | 400K | $6.90 |

## Daily Activity
[heatmap as text representation]

Note: Costs are estimates based on published pricing.
Actual charges may vary. Check provider dashboard for exact billing.
```

---

## Build Order

1. usage_events table in local SQLite
2. Token capture: native chat (parse API response) + PTY (parse output)
3. project_usage upsert to Turso on session end
4. org_usage + account_usage rollup
5. analytics_lifetime year-keyed aggregation
6. Rolling windows (24h, 7d, 30d, 12m)
7. heatmap_365d maintenance
8. Local cache sync (same pattern as connectors)
9. Usage tab UI: project level (spend, breakdown, heatmap, by_model, by_provider)
10. Org + account level aggregation views
11. Cost report export (PDF/markdown)
12. Provider pricing table + cost estimation
13. Shareable heatmap screenshot
