# SuperConsole — Composio + Chat Compaction + Memory Improvements
## Three small additions, one file.

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, `DESIGN_PRINCIPLES.md` before touching anything.
`cargo check` and `npm run build` must pass clean before done.

---

## PART 1 — Composio as a Connector

### What it is

Composio = 1000+ tools via a single API key + MCP server.
User connects once → all Composio tools available to agents.
Project-scoped (stored as project connector) — same moat preserved.

### Connector registry (all 3 files)

Add to `connectors.rs`, `api.ts`, `connector-registry.ts`:

```rust
// connectors.rs — add to REGISTRY
ConnectorDef {
    service: "composio",
    label: "Composio",
    description: "1000+ tools via one connection — Gmail, GitHub, Slack, Notion, HubSpot and more",
    category: "integrations",
    scopes: &["project", "org", "account"],
    fields: &[
        Field {
            key: "api_key",
            label: "Composio API Key",
            secret: true,
            description: "From composio.dev → Settings → API Keys",
            required: true,
        }
    ],
    env_mapping: &[("api_key", "COMPOSIO_API_KEY")],
    docs_url: Some("https://docs.composio.dev"),
    icon_url: None,
    test_endpoint: Some("https://backend.composio.dev/api/v1/client/auth/client_info"),
}
```

Mirror identically in `api.ts` and `connector-registry.ts`.

### Connector test (`connectors.rs::test_connector`)

Add to the match block:

```rust
"composio" => {
    if api_key.is_empty() { return err_result("API key is required"); }
    let resp = reqwest::Client::new()
        .get("https://backend.composio.dev/api/v1/client/auth/client_info")
        .header("x-api-key", &api_key)
        .send().await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let email = body["client"]["userEmail"].as_str().unwrap_or("unknown");
            ok_result_with("Connected to Composio", &format!("Account: {}", email))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Composio error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}
```

### Composio MCP server

Add to `plugin-registry.ts` (or `mcp_catalog`):

```typescript
{
  id: "composio-mcp",
  name: "Composio MCP",
  description: "1000+ tools via Composio — use alongside the Composio connector",
  type: "stdio",
  command: "npx",
  args: ["@composio/mcp@latest"],
  env: { "COMPOSIO_API_KEY": "" },
  requiredConnector: "composio"  // auto-fill env from connector
}
```

When user installs Composio MCP:
- Reads `COMPOSIO_API_KEY` from connected Composio connector
- Injects into MCP server env automatically
- Same credential, two surfaces (HTTP + MCP)

### Session env injection (`connectors.rs::session_env`)

Composio API key injected as `COMPOSIO_API_KEY` env var into every
PTY session where Composio is connected. Same pattern as all other connectors.
Agent CLI tools pick it up automatically.

---

## PART 2 — Chat Compaction: 3-Layer with Session Flush

### Current state

`CHAT_COMPACTION.md` was built with one layer:
- Summarize oldest 50% → replace with system message

### Corrected 3-layer approach

```
Layer 1: identify messages to prune (oldest 50% of chat history)
         user + assistant + tool messages only
         NEVER touch the system prompt (that's the harness — owned by SuperConsole)

Layer 2: LLM summarizes the pruned messages
         Write structured summary to:
           .superconsole/sessions/<session-id>.md
         NOT a raw dump — a real summary:
           - What was being worked on
           - Key decisions made
           - Current state/outcome
         Searchable later via /session:name token
         Nothing truly lost

Layer 3: Replace pruned messages with ONE user message
         role: "user" (NOT "system" — system prompt is the harness, don't touch it)
         content: "[Context from earlier in this conversation]\n<summary>"
         → agent sees it as conversation context
         → agent stays oriented without full history

Why user message, not system message:
  system message = our harness (build_system_prompt output)
                   SuperConsole owns this, never overwrite it
  user message   = conversation history
                   safe to insert a summary here

Why sessions, not memory:
  Memory   = narrow learned patterns ("user prefers short sentences")
             injected into EVERY session automatically
  Sessions = event log of what happened in a specific conversation
             fetched ON DEMAND via /session:name
             "on June 24 we drafted newsletter, user rejected first draft"
```

### Update `chat.rs::compact_messages`

```rust
pub async fn compact_messages(
    messages: Vec<ChatMessage>,
    session_id: &str,
    workspace_path: &str,
    provider: &str,
    model: &str,
    api_key: &str,
) -> Result<Vec<ChatMessage>, String> {
    if messages.len() < 4 {
        return Ok(messages);
    }

    let split_at = messages.len() / 2;
    let to_prune = &messages[..split_at];
    let to_keep = &messages[split_at..];

    // ── Layer 2: LLM summarizes pruned messages ────────────────────
    // One summary used for both: session log file + conversation replacement
    // NOT a raw dump — a real structured summary
    let history_text = to_prune.iter()
        .filter(|m| m.role != "system") // skip system/harness messages
        .map(|m| format!("{}: {}", m.role, &m.content[..m.content.len().min(300)]))
        .collect::<Vec<_>>()
        .join("\n");

    let summary_prompt = format!(
        "Summarize this conversation in structured markdown. Include:\n\
         - What was being worked on (1-2 sentences)\n\
         - Key decisions made (bullet list)\n\
         - Current state / outcome\n\
         Be specific. Use real names, file paths, values from the conversation.\n\n\
         Conversation:\n{}",
        history_text
    );

    let summary = llm::one_shot_completion(
        provider, model, api_key,
        "You summarize conversations into structured markdown. Be specific, not generic.",
        &summary_prompt,
    ).await.unwrap_or_else(|_| "Earlier conversation context omitted.".to_string());

    // Write structured summary to session log file
    // (same summary — not a raw dump)
    let session_log_path = format!(
        "{}/.superconsole/sessions/{}.md",
        workspace_path, session_id
    );
    std::fs::create_dir_all(
        format!("{}/.superconsole/sessions", workspace_path)
    ).ok();

    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC");
    let existing = std::fs::read_to_string(&session_log_path).unwrap_or_default();
    let header = if existing.is_empty() {
        format!(
            "# Session Log\n\nSession: `{}`  \nStarted: {}\n\n---\n",
            session_id,
            chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")
        )
    } else {
        String::new()
    };

    // Append the structured summary (not raw messages)
    let log_entry = format!(
        "\n\n## Compacted at {}\n\n{}\n\n---",
        timestamp, summary
    );

    std::fs::write(
        &session_log_path,
        format!("{}{}{}", existing, header, log_entry)
    ).ok(); // Never fail compaction because of log write failure

    // ── Layer 3: replace pruned messages with summary ───────────────
    // Insert as USER message — NOT system message
    // system message = harness (build_system_prompt) — never touch it
    // user message   = conversation history — safe to insert summary here
    let mut compacted = vec![
        ChatMessage {
            role: "user".to_string(),   // ← user, NOT system
            content: format!(
                "[Context from earlier in this conversation]\n\n{}\n\n\
                 [Full log: .superconsole/sessions/{}.md]",
                summary, session_id
            ),
        }
    ];
    compacted.extend_from_slice(to_keep);

    Ok(compacted)
}
```

### Update `compact_chat_session` command (`lib.rs` / `chat.rs`)

Pass `workspace_path` to `compact_messages` so it can write the session log:

```rust
#[tauri::command]
async fn compact_chat_session(
    workspace_id: String,
    session_id: String,
    db: State<Db>,
    app: AppHandle,
) -> Result<CompactResult, String> {
    let messages = db.list_chat_messages(&session_id)?;
    let workspace = db.get_workspace_by_id(&workspace_id)?;
    let llm_config = llm::session_env(&workspace, &db)?;
    
    let compacted = compact_messages(
        messages,
        &session_id,
        &workspace.path,      // ← pass workspace path for session log
        &llm_config.provider,
        &llm_config.model,
        &llm_config.api_key,
    ).await?;
    
    db.replace_chat_messages_with_compacted(&session_id, &compacted)?;
    
    Ok(CompactResult {
        messages_before: messages.len(),
        messages_after: compacted.len(),
    })
}
```

### Session log in SessionsView

Session logs created by compaction are already accessible via:
- SessionsView → CLI tab → session file browser
- `/session:name` token in chat + CommandInput autocomplete
- `context_read("session-id")` MCP tool call

No new UI needed — the sessions infrastructure already handles this.

### Session log metadata in SQLite

After writing a session log, upsert into `session_logs` table
(if it exists — write-if-missing pattern):

```rust
// After writing session log file:
db.upsert_session_log(
    &session_id,
    workspace_id,
    &session_log_path,
    &format!("Chat compaction at {}", timestamp),
)?;
```

This makes session logs discoverable in SessionsView + autocomplete.

---

## PART 3 — Rowboat Borrowings

Three specific things worth adding. All small. All high value.

### 3A. Better phrasing throughout the app

Rowboat's phrasing: **"memory that compounds"**

Replace in:
- `MemoryDialog.tsx` description text
- `AgentsDialog.tsx` description
- Empty states in Memory/Skills/Sessions pages
- Onboarding scaffold confirmation toast

```
Before: "What this project's agent remembers"
After:  "Memory that compounds — agents get smarter every run"

Before: "Project initialized with SuperConsole defaults"
After:  "Project initialized. Memory starts compounding from your first session."
```

### 3B. "Open in Obsidian" note in Memory + Context dialogs

Rowboat markets its Obsidian compatibility prominently.
SuperConsole's files ARE plain Markdown — same benefit, not marketed.

Add a small muted note to `MemoryDialog.tsx` and `ContextDialog.tsx` footers:

```tsx
<p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
  Plain Markdown files in <code className="font-mono">.superconsole/</code> — 
  open in Obsidian, VS Code, or any editor. Committed to git automatically.
</p>
```

Add to `WikiDialog.tsx` footer too:
```tsx
<p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
  Wiki pages are plain Markdown — edit in any editor, committed to git.
</p>
```

### 3C. Email event trigger

Rowboat has "new email → agent runs" as a background agent trigger.
SuperConsole currently has: cron / manual / API / GitHub / Telegram.

Add `email` as a new trigger type to the jobs table:

```sql
-- trigger_type can now also be 'email'
-- trigger_config: {"connector": "gmail", "filter": "from:client@acme.com"}
```

**Frontend `JobsDialog.tsx` — add Email tab to trigger picker:**

```
Trigger type:
  [Schedule]  [API]  [GitHub]  [Telegram]  [Email]  ← new tab

Email tab:
  Connector: [Gmail ▾]  (shows connected email connectors)
  Filter:    [from:client@acme.com  ] (optional Gmail search filter)
             Leave empty = any new email triggers the job
  
  Note: "Requires Gmail connector to be connected for this project."
```

**Backend — email polling in `remote.rs`:**

```rust
// Add to the remote polling loop (alongside Telegram long-poll)
// Runs on the 30s tick — checks for new emails matching filter

pub async fn check_email_triggers(app: &AppHandle, db: &Db) {
    // Get all jobs with trigger_type = 'email'
    let email_jobs = db.get_jobs_by_trigger_type("email");
    
    for job in email_jobs {
        let config: serde_json::Value = serde_json::from_str(&job.trigger_config)
            .unwrap_or_default();
        
        let connector_id = config["connector"].as_str().unwrap_or("gmail");
        let filter = config["filter"].as_str().unwrap_or("is:unread");
        let last_checked = config["last_checked"].as_str().unwrap_or("1d");
        
        // Check Gmail via connector_request
        // GET /gmail/v1/users/me/messages?q=filter+after:timestamp
        // If new messages found → exec_in_workspace for this job
        // Update last_checked timestamp in trigger_config
        
        if let Some(new_emails) = check_gmail_for_new_emails(
            job.workspace_id, connector_id, filter, last_checked, db
        ).await {
            if !new_emails.is_empty() {
                // Inject email subject/sender as context
                let email_context = format!(
                    "New email from: {}\nSubject: {}\nTrigger: email",
                    new_emails[0].sender,
                    new_emails[0].subject
                );
                exec_in_workspace(
                    job.workspace_id,
                    &format!("{}\n\n{}", job.command, email_context),
                    &app, db
                ).await.ok();
                
                // Update last_checked to now
                db.update_job_trigger_config(
                    job.id,
                    &serde_json::json!({
                        "connector": connector_id,
                        "filter": filter,
                        "last_checked": chrono::Utc::now().to_rfc3339()
                    }).to_string()
                ).ok();
            }
        }
    }
}
```

Call `check_email_triggers` from the 30s scheduler tick (same place as Telegram polling).

---

## SCOPE RULES

- Composio connector = same encryption as all other connectors (scope-based HKDF)
- Session logs = append-only, never overwrite, plain Markdown
- Session log write failure = never fails compaction (silently skips)
- "Open in Obsidian" note = UI text only, no new functionality
- Email trigger = polling only (no Gmail webhook — no HTTPS server needed)
- Email polling runs on 30s tick = good enough latency for this use case
- All file ops through `files.rs::resolve`
- `cargo check` and `npm run build` must pass clean
