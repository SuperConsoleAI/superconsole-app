# SuperConsole — Loop System + Credential Encryption
## Two features, one file. Both critical for launch.

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, `DESIGN_PRINCIPLES.md` before touching anything.
`cargo check` and `npm run build` must pass clean before done.

---

## PART 1 — CREDENTIAL ENCRYPTION FIX

### The Problem

Current encryption uses `WORKOS_COOKIE_PASSWORD` only as the key.
This means all users' credentials decrypt with the same key.
A team project where Alice adds a connector — Bob can't decrypt it.

### The Fix — Scope-based key derivation

```rust
// crypto.rs — replace existing key derivation

pub fn derive_key_for_scope(scope: &str, scope_id: &str) -> Result<[u8; 32], String> {
    let password = env!("WORKOS_COOKIE_PASSWORD"); // compiled in at build time
    
    // scope_id = project_id | org_id | user_id
    // scope    = "project"  | "org"  | "account"
    
    let input = format!("{}:{}", scope, scope_id);
    // e.g. "project:01KVX172PF6D8EXZVDWYV6W6KX"
    
    // HKDF-SHA256
    let prk = hkdf::Hkdf::<sha2::Sha256>::new(
        Some(b"superconsole-connector-keys-v1"),
        format!("{}{}", password, input).as_bytes(),
    );
    
    let mut key = [0u8; 32];
    prk.expand(b"aes-256-gcm", &mut key)
        .map_err(|e| e.to_string())?;
    
    Ok(key)
}
```

### Scope rules — which ID to use:

```
connector scope → key input
─────────────────────────────────────────────────────
project         → HKDF(WORKOS_COOKIE_PASSWORD + project_id)
org             → HKDF(WORKOS_COOKIE_PASSWORD + org_id)
account         → HKDF(WORKOS_COOKIE_PASSWORD + user_id)
```

**Why this works for teams:**
```
Alice adds Shopify to acme-dental project (project_id = 01KVX...)
  → encrypted with HKDF(PASSWORD + "01KVX...")
  → stored in Turso

Bob opens acme-dental project (same project_id = 01KVX...)
  → derives HKDF(PASSWORD + "01KVX...")
  → same key → decrypts ✅

Carol joins later
  → same project_id → same key → decrypts ✅

Eve from another project (different project_id)
  → different key → can't decrypt ✅
```

### Build-time injection of WORKOS_COOKIE_PASSWORD

The secret is compiled into the binary — NOT shipped in .env.
Set it in CI/CD environment before building.

```rust
// crypto.rs
const COOKIE_PASSWORD: &str = env!("WORKOS_COOKIE_PASSWORD");
// Fails to compile if env var not set at build time
// Never hardcoded in source — set in build environment only
```

```toml
# In CI/CD (GitHub Actions, etc.):
# export WORKOS_COOKIE_PASSWORD=your-secret-here
# cargo tauri build
```

### Local cache — decrypted or encrypted?

```
Turso DB:
  credentials_encrypted TEXT  ← AES-256-GCM blob (always encrypted)

Local SQLite (*_cache tables):
  credentials_encrypted TEXT  ← also encrypted (same blob from Turso)
  
At session start (PTY/chat):
  1. Read encrypted blob from local cache (fast, offline)
  2. Decrypt using scope key (project_id/org_id/user_id)
  3. Inject decrypted values into session env vars
  4. Decrypted values NEVER written to disk
  5. Live in memory only for that session
```

**Never store decrypted credentials anywhere on disk.**

### Update `connectors.rs` — `encrypt_credentials` + `decrypt_credentials`

```rust
pub fn encrypt_credentials(
    fields: &serde_json::Value,
    scope: &str,
    scope_id: &str,
) -> Result<String, String> {
    let key = derive_key_for_scope(scope, scope_id)?;
    let json = serde_json::to_string(fields).map_err(|e| e.to_string())?;
    encrypt_aes_gcm(&key, json.as_bytes())
}

pub fn decrypt_credentials(
    encrypted: &str,
    scope: &str,
    scope_id: &str,
) -> Result<serde_json::Value, String> {
    let key = derive_key_for_scope(scope, scope_id)?;
    let bytes = decrypt_aes_gcm(&key, encrypted)?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
```

Update all `set_connector` / `get_connector` calls to pass scope + scope_id.
The scope_id comes from the connector's existing `project_id` / `org_id` / `user_id` field.

---

## PART 2 — LOOP SYSTEM

### What a Loop Is

```
A loop = trigger + action + stop condition

Without stop condition = runs once (current behavior)
With stop condition    = runs until done or max_attempts reached

Key insight from the video:
  "A loop is only as good as its done check"
  Make the stop condition as OBJECTIVE as possible
  
  Good:  "npm test exits 0"  ← objective, binary
  Good:  "inbox approved"    ← human gate
  OK:    "LLM scores ≥ 4/5" ← semi-objective
  Bad:   "until satisfied"   ← vague, expensive
```

### Schema — add to jobs table (`db.rs`)

```sql
-- Idempotent ALTER TABLE guards in Db::init

ALTER TABLE jobs ADD COLUMN exit_condition TEXT;
-- NULL = run once (default, existing behavior unchanged)
-- JSON: see exit condition types below

ALTER TABLE jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;
-- 1 = current behavior (one shot)
-- 2-10 = loop with hard cap
-- NEVER infinite — always enforced

ALTER TABLE jobs ADD COLUMN current_attempt INTEGER NOT NULL DEFAULT 0;
-- tracks current attempt number
-- reset to 0 after successful completion or max_attempts reached
```

### Exit condition types

```json
// Run a shell command, check exit code
{ "type": "command", "command": "npm test" }
{ "type": "command", "command": "npm run build" }
{ "type": "command", "command": "pytest tests/" }
{ "type": "command", "command": "cargo check" }

// Human approves in inbox (maker + checker pattern)
{ "type": "inbox_approved" }

// LLM rates the output (semi-objective)
{ "type": "llm_score", "threshold": 4, "max": 5,
  "prompt": "Rate this newsletter draft 1-5 for quality and brand voice." }

// Output contains a specific string
{ "type": "contains", "text": "DONE" }
{ "type": "contains", "text": "✓ Complete" }

// File was created by the agent
{ "type": "file_exists", "path": "output/report.md" }
```

### `check_exit_condition` function (`scheduler.rs`)

```rust
pub async fn check_exit_condition(
    condition: &serde_json::Value,
    output: &str,
    workspace_path: &str,
    inbox_item_id: Option<i64>,
    db: &Db,
) -> Result<bool, String> {
    match condition["type"].as_str().unwrap_or("") {
        
        "command" => {
            // Run the command in workspace, check exit code
            let cmd = condition["command"].as_str().unwrap_or("true");
            let status = std::process::Command::new("bash")
                .arg("-c")
                .arg(cmd)
                .current_dir(workspace_path)
                .env("PATH", crate::pty::enriched_path())
                .status()
                .map_err(|e| e.to_string())?;
            Ok(status.success())
        }
        
        "inbox_approved" => {
            // Check if the inbox item was approved
            if let Some(id) = inbox_item_id {
                let status = db.get_inbox_status(id)?;
                Ok(status == "approved")
            } else {
                Ok(false)
            }
        }
        
        "llm_score" => {
            // Ask LLM to score the output
            let threshold = condition["threshold"].as_f64().unwrap_or(4.0);
            let max_score = condition["max"].as_f64().unwrap_or(5.0);
            let prompt = condition["prompt"].as_str()
                .unwrap_or("Rate this output 1-5 for quality.");
            
            // Use one_shot_completion (already built in llm.rs)
            // Cheap model for scoring — just a number
            let score_prompt = format!(
                "{}\n\nOutput to rate:\n{}\n\nReply with ONLY a number from 1 to {}.",
                prompt, &output[..output.len().min(2000)], max_score as i64
            );
            
            // Use workspace's configured LLM
            // ... get llm_config from workspace ...
            let score_str = llm::one_shot_completion(
                &llm_config.provider, &llm_config.model, &llm_config.api_key,
                "You are a quality scorer. Reply with only a number.",
                &score_prompt,
            ).await?;
            
            let score: f64 = score_str.trim().parse().unwrap_or(0.0);
            Ok(score >= threshold)
        }
        
        "contains" => {
            let text = condition["text"].as_str().unwrap_or("");
            Ok(output.contains(text))
        }
        
        "file_exists" => {
            let path = condition["path"].as_str().unwrap_or("");
            let full_path = format!("{}/{}", workspace_path, path);
            Ok(std::path::Path::new(&full_path).exists())
        }
        
        _ => Ok(true) // unknown condition = always pass (safe default)
    }
}
```

### Loop execution in `scheduler.rs::exec_in_workspace`

Add AFTER existing execution logic:

```rust
// After job runs and output is collected:
let exit_condition = job.exit_condition.as_deref()
    .and_then(|s| serde_json::from_str(s).ok());

if let Some(condition) = exit_condition {
    let max = job.max_attempts.max(1);
    let attempt = job.current_attempt + 1;
    
    db.set_job_attempt(job.id, attempt)?;
    
    // For inbox_approved: send to inbox first, THEN check
    let inbox_item_id = if condition["type"] == "inbox_approved" {
        Some(db.add_inbox_item(workspace_id, job.id, &title, &output, true)?)
    } else {
        None
    };
    
    let condition_met = check_exit_condition(
        &condition, &output, &workspace.path, inbox_item_id, db
    ).await.unwrap_or(true);
    
    if condition_met {
        // Done — write to inbox (if not already written for approval)
        if inbox_item_id.is_none() {
            db.add_inbox_item(workspace_id, job.id, &title, &output, false)?;
        }
        db.reset_job_attempt(job.id)?;
        notify_telegram(&workspace, &output, db).await;
        
    } else if attempt >= max {
        // Hit max attempts — give up, write to inbox with failure note
        let failed_output = format!(
            "⚠️ Max attempts ({}) reached without meeting exit condition.\n\nLast output:\n{}",
            max, output
        );
        db.add_inbox_item(workspace_id, job.id, &title, &failed_output, false)?;
        db.reset_job_attempt(job.id)?;
        
    } else {
        // Not done yet — schedule immediate retry
        // Add a short delay to avoid hammering (30s)
        db.set_job_next_run_relative(job.id, 30)?; // retry in 30s
        // The 30s scheduler tick will pick it up automatically
        eprintln!("Loop: attempt {}/{} failed condition, retrying in 30s", attempt, max);
    }
    
} else {
    // No exit condition — existing behavior (run once, write to inbox)
    db.add_inbox_item(workspace_id, job.id, &title, &output, false)?;
    notify_telegram(&workspace, &output, db).await;
}
```

### New DB functions (`db.rs`)

```rust
pub fn set_job_attempt(&self, job_id: i64, attempt: i64) -> Result<(), String>
// UPDATE jobs SET current_attempt = ? WHERE id = ?

pub fn reset_job_attempt(&self, job_id: i64) -> Result<(), String>
// UPDATE jobs SET current_attempt = 0 WHERE id = ?

pub fn set_job_next_run_relative(&self, job_id: i64, seconds: i64) -> Result<(), String>
// UPDATE jobs SET next_run = datetime('now', '+N seconds') WHERE id = ?
```

### Frontend — `JobsDialog.tsx`

Add loop configuration below the trigger section:

```
Loop (optional)
─────────────────────────────────────────────

Exit condition:
  ● None — run once (default)
  ○ Tests pass      [npm test          ]
  ○ Build succeeds  [npm run build     ]
  ○ Inbox approved  → human reviews + approves before done
  ○ Custom command  [                  ]
  ○ LLM score ≥    [4] / 5
                   [Rate this output for quality...  ]

Max attempts:  [3 ▾]  (hard cap — never infinite)
               Note: each attempt runs when the scheduler ticks (every 30s)
```

Show when `exit_condition` is set:
```
⚠️ This job will retry up to 3 times until the condition is met.
   Estimated max duration: ~90 seconds (3 × 30s tick)
```

### `api.ts` updates

```typescript
export interface Job {
  // ... existing fields ...
  exitCondition?: {
    type: 'command' | 'inbox_approved' | 'llm_score' | 'contains' | 'file_exists'
    command?: string
    text?: string
    path?: string
    threshold?: number
    max?: number
    prompt?: string
  }
  maxAttempts: number       // default 1
  currentAttempt: number    // current retry count
}
```

---

## SCOPE RULES

- `max_attempts` hard cap — ALWAYS enforced, never infinite loops
- Failed max_attempts → writes to inbox with ⚠️ note, never silently dies
- `inbox_approved` condition → sends to inbox FIRST, waits for approval
- Rejection in inbox = retry (up to max_attempts)
- Approval in inbox = done, mark complete
- Command conditions run in workspace directory with enriched PATH
- LLM scoring uses cheapest model (not necessarily workspace default)
- Loop retry delay = 30s (one scheduler tick) — not configurable for now
- `cargo check` and `npm run build` must pass clean

---

## BUILD ORDER

1. Fix `crypto.rs` key derivation (scope-based) — critical, do first
2. Update `connectors.rs` encrypt/decrypt to pass scope + scope_id
3. Add schema columns to `jobs` table
4. Add `check_exit_condition` to `scheduler.rs`
5. Update loop execution in `exec_in_workspace`
6. Add new DB functions
7. Update `JobsDialog.tsx` + `api.ts`
