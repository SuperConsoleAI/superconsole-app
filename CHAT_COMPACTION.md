# SuperConsole — Native Chat Context Management
## Auto-compaction + /compact command

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md` before touching anything.
`cargo check` and `npm run build` must pass clean before done.

Key files:
- Backend: `src-tauri/src/chat.rs`, `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`
- Frontend: `src/components/ChatView.tsx`, `src/lib/api.ts`

---

## The Problem

Native chat sends full `chat_messages` history every turn.
Long sessions = massive context = expensive.
No compaction = token burn compounds across every message.

---

## Model Context Limits

Hardcode these in `chat.rs` (or `llm.rs`):

```rust
fn context_limit_for_model(model: &str) -> u64 {
    if model.contains("claude-opus-4") || model.contains("claude-sonnet-4") {
        200_000
    } else if model.contains("claude-haiku") {
        200_000
    } else if model.contains("gpt-4o") {
        128_000
    } else if model.contains("gpt-4o-mini") {
        128_000
    } else if model.contains("gemini-2") {
        1_000_000
    } else {
        128_000 // safe fallback
    }
}
```

---

## Part 1 — Auto-Compaction (Backend)

### Trigger

Before sending messages to LLM in `chat.rs::chat_send`:

```rust
// Estimate token count of current history
let history_tokens: u64 = messages.iter()
    .map(|m| estimate_tokens(&m.content))
    .sum();

let limit = context_limit_for_model(&model);
let usage_pct = (history_tokens as f64 / limit as f64) * 100.0;

// Auto-compact when >70% full
if usage_pct > 70.0 {
    messages = compact_messages(messages, &provider, &model, &api_key).await?;
    // Emit event so frontend shows the compaction banner
    app.emit_all("chat-compacted", CompactedPayload {
        request_id: request_id.clone(),
        messages_before: original_count,
        messages_after: messages.len(),
    }).ok();
}
```

### Token estimation

Simple estimate — no exact tokenizer needed:

```rust
fn estimate_tokens(text: &str) -> u64 {
    // ~4 chars per token is a safe estimate for English
    (text.len() as u64) / 4
}
```

### `compact_messages` function

```rust
async fn compact_messages(
    messages: Vec<ChatMessage>,
    provider: &str,
    model: &str,
    api_key: &str,
) -> Result<Vec<ChatMessage>, String> {
    if messages.len() < 4 {
        return Ok(messages); // nothing to compact
    }

    // Split: summarize oldest 50%, keep newest 50%
    let split_at = messages.len() / 2;
    let to_summarize = &messages[..split_at];
    let to_keep = &messages[split_at..];

    // Build summary prompt
    let history_text = to_summarize.iter()
        .map(|m| format!("{}: {}", m.role, &m.content[..m.content.len().min(500)]))
        .collect::<Vec<_>>()
        .join("\n");

    let summary_prompt = format!(
        "Summarize this conversation history concisely in 3-5 bullet points. \
         Preserve key decisions, facts, code snippets, and context needed for continuation. \
         Be specific, not generic:\n\n{}",
        history_text
    );

    // One-shot completion (reuse existing llm::one_shot_completion)
    let summary = llm::one_shot_completion(
        provider, model, api_key,
        "You are a conversation summarizer. Be concise and specific.",
        &summary_prompt,
    ).await?;

    // Build compacted history:
    // [summary message] + [recent messages]
    let mut compacted = vec![
        ChatMessage {
            role: "system".to_string(),
            content: format!("## Earlier conversation summary\n{}", summary),
        }
    ];
    compacted.extend_from_slice(to_keep);

    Ok(compacted)
}
```

### Persist compacted messages to DB

After compaction, update `chat_messages` table:
```rust
// Delete the old messages that were summarized
db.delete_chat_messages_before(session_id, split_at_message_id)?;

// Insert the summary as a system message
db.add_chat_message(project_id, session_id, "system", &summary_content, provider, model)?;
```

New DB function:
```rust
pub fn delete_chat_messages_before(
    &self,
    session_id: &str,
    before_id: i64,
) -> Result<(), String>
// Deletes chat_messages WHERE session_id = ? AND id < ?
```

---

## Part 2 — /compact Command

User can trigger manually at any time by typing `/compact` in the chat input.

### Frontend (`ChatView.tsx` or `ChatComposer.tsx`)

Detect `/compact` as a special command before sending:

```typescript
if (message.trim() === '/compact') {
  await api.compactChatSession(workspaceId, sessionId)
  // Don't send to LLM — just compact and refresh
  return
}
```

### Backend — new Tauri command

```rust
#[tauri::command]
async fn compact_chat_session(
    workspace_id: String,
    session_id: String,
    db: State<Db>,
    app: AppHandle,
) -> Result<CompactResult, String> {
    // Load all messages for this session
    let messages = db.list_chat_messages(&session_id)?;
    
    // Get workspace LLM config
    let workspace = db.get_workspace_by_id(&workspace_id)?;
    let llm_config = llm::session_env(&workspace, &db)?;
    
    // Run compaction
    let compacted = compact_messages(
        messages, 
        &llm_config.provider,
        &llm_config.model,
        &llm_config.api_key,
    ).await?;
    
    // Persist: delete old, insert summary
    db.replace_chat_messages_with_compacted(&session_id, &compacted)?;
    
    Ok(CompactResult {
        messages_before: messages.len(),
        messages_after: compacted.len(),
    })
}

pub struct CompactResult {
    pub messages_before: usize,
    pub messages_after: usize,
}
```

Register in `generate_handler!`.

---

## Part 3 — Frontend

### `api.ts`

```typescript
export interface CompactResult {
  messagesBefore: number
  messagesAfter: number
}

export const compactChatSession = (workspaceId: string, sessionId: string) =>
  invoke<CompactResult>('compact_chat_session', { workspaceId, sessionId })
```

### `ChatView.tsx` — compaction banner

Listen for `chat-compacted` event:

```typescript
const unlisten = await listen<CompactedPayload>('chat-compacted', (event) => {
  if (event.payload.requestId === currentRequestId) {
    setCompacted(true)
  }
})
```

Show muted banner above the message list when compacted:

```tsx
{compacted && (
  <div className="text-xs text-muted-foreground text-center py-1 border-b border-border/50">
    Earlier messages summarized to save context
    <button
      className="ml-2 underline"
      onClick={() => setCompacted(false)}
    >
      dismiss
    </button>
  </div>
)}
```

### Context usage indicator in `StatusFooter`

Add to the chat footer (right side, muted):

```tsx
// Show when tokens are known
{tokensUsed > 0 && contextLimit > 0 && (
  <span className={cn(
    "text-xs tabular-nums",
    usagePct > 70 ? "text-amber-500" : "text-muted-foreground"
  )}>
    {Math.round(usagePct)}% ctx
  </span>
)}
```

Colors:
```
< 40%  → muted (invisible, no distraction)
40-70% → muted-foreground (subtle)
> 70%  → amber (warning, auto-compact about to fire)
```

### `/compact` in slash autocomplete

Add to `slash-items.ts`:
```typescript
{
  value: '/compact',
  label: '/compact',
  description: 'Summarize earlier messages to free up context',
  group: 'Commands',
  source: 'builtin',
}
```

---

## Scope Rules

- Auto-compact fires BEFORE sending to LLM — never mid-stream
- Always keep newest 50% of messages intact — never compact recent context
- Summary is a system message — not user or assistant
- If compaction fails → log error → send full history (never fail the chat)
- `/compact` works even when under 70% threshold (manual override)
- Show banner after compaction — user knows what happened
- `cargo check` and `npm run build` must pass clean
