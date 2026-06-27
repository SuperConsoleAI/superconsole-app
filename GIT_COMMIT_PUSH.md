# SuperConsole — Git Commit & Push (TopBar)

## One button to commit, push, and open a PR

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md` before touching anything.
`cargo check` and `npm run build` must pass clean before done.

Key files:

- Backend: `src-tauri/src/lib.rs`, `src-tauri/src/files.rs` (or new `git.rs`)
- Frontend: `src/components/TopBar.tsx`, `src/lib/api.ts`

---

## What It Does

```
TopBar shows: [branch-name ●] ← dirty indicator when uncommitted changes

Click →
  Dialog opens:
    [Generated commit message — editable]
    [Diff summary — file list]
    [Commit & Push ⌘↵]
    [Commit only]
    [Create PR →] (after push)
```

Agent makes changes → user sees dirty indicator → one click to ship.
No terminal. No git commands. Works for any agent output.

---

## Part 1 — Backend (`src-tauri/src/git.rs`, new file)

Simple git operations via `std::process::Command`.
No git2 crate — just shell out to the `git` binary.
Always use `pty::enriched_path()` so git resolves correctly.

```rust
use std::process::Command;
use std::collections::HashMap;

pub struct GitStatus {
    pub branch: String,
    pub is_dirty: bool,              // uncommitted changes exist
    pub staged: Vec<String>,         // staged files
    pub unstaged: Vec<String>,       // modified but not staged
    pub untracked: Vec<String>,      // new files
    pub ahead: u32,                  // commits ahead of remote
    pub behind: u32,                 // commits behind remote
    pub has_remote: bool,
}

pub struct GitDiff {
    pub summary: String,             // short diff summary for commit message gen
    pub files_changed: Vec<FileDiff>,
    pub insertions: u32,
    pub deletions: u32,
}

pub struct FileDiff {
    pub path: String,
    pub status: String,              // "M" modified, "A" added, "D" deleted, "?" untracked
    pub insertions: u32,
    pub deletions: u32,
}

/// Get current git status for a workspace
pub fn git_status(workspace_path: &str) -> Result<GitStatus, String> {
    // git rev-parse --abbrev-ref HEAD → branch name
    let branch = run_git(workspace_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "main".to_string())
        .trim()
        .to_string();

    // git status --porcelain → dirty files
    let status_output = run_git(workspace_path, &["status", "--porcelain"])
        .unwrap_or_default();

    let mut staged = vec![];
    let mut unstaged = vec![];
    let mut untracked = vec![];

    for line in status_output.lines() {
        if line.len() < 3 { continue; }
        let xy = &line[..2];
        let file = line[3..].trim().to_string();
        
        match (xy.chars().nth(0), xy.chars().nth(1)) {
            (Some('?'), Some('?')) => untracked.push(file),
            (Some(x), _) if x != ' ' => staged.push(file.clone()),
            (_, Some(y)) if y != ' ' => unstaged.push(file),
            _ => {}
        }
    }

    let is_dirty = !staged.is_empty() || !unstaged.is_empty() || !untracked.is_empty();

    // git rev-list --count HEAD...@{upstream} → ahead/behind
    let (ahead, behind) = git_ahead_behind(workspace_path);

    // Check if remote exists
    let has_remote = run_git(workspace_path, &["remote"]).map(|r| !r.trim().is_empty()).unwrap_or(false);

    Ok(GitStatus { branch, is_dirty, staged, unstaged, untracked, ahead, behind, has_remote })
}

/// Get diff for commit message generation
pub fn git_diff(workspace_path: &str) -> Result<GitDiff, String> {
    // git diff --stat HEAD → summary of changes
    let stat = run_git(workspace_path, &["diff", "--stat", "HEAD"])
        .unwrap_or_default();

    // git diff --name-status HEAD → file list
    let name_status = run_git(workspace_path, &["diff", "--name-status", "HEAD"])
        .unwrap_or_default();

    // Also include untracked files
    let untracked = run_git(workspace_path, &["ls-files", "--others", "--exclude-standard"])
        .unwrap_or_default();

    let mut files_changed = vec![];
    for line in name_status.lines() {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            files_changed.push(FileDiff {
                path: parts[1].to_string(),
                status: parts[0].to_string(),
                insertions: 0,
                deletions: 0,
            });
        }
    }
    for file in untracked.lines() {
        if !file.is_empty() {
            files_changed.push(FileDiff {
                path: file.to_string(),
                status: "A".to_string(),
                insertions: 0,
                deletions: 0,
            });
        }
    }

    // Parse insertions/deletions from stat
    let (insertions, deletions) = parse_stat(&stat);

    Ok(GitDiff {
        summary: stat,
        files_changed,
        insertions,
        deletions,
    })
}

/// Stage all changes and commit
pub fn git_commit(workspace_path: &str, message: &str) -> Result<(), String> {
    // git add -A (stage everything including untracked)
    run_git(workspace_path, &["add", "-A"])?;
    
    // git commit -m "message"
    run_git(workspace_path, &["commit", "-m", message])?;
    
    Ok(())
}

/// Push to remote
pub fn git_push(workspace_path: &str) -> Result<String, String> {
    // git push (respects existing remote/branch tracking)
    let output = run_git(workspace_path, &["push"])?;
    Ok(output)
}

/// Push and return PR URL if GitHub remote detected
pub fn git_push_and_get_pr_url(
    workspace_path: &str,
    branch: &str,
    title: &str,
    body: &str,
) -> Result<Option<String>, String> {
    // Push first
    git_push(workspace_path)?;

    // Get remote URL to determine if GitHub
    let remote_url = run_git(workspace_path, &["remote", "get-url", "origin"])
        .unwrap_or_default();

    // Build GitHub PR URL
    let pr_url = if remote_url.contains("github.com") {
        // Extract owner/repo from remote URL
        // https://github.com/owner/repo.git → owner/repo
        // git@github.com:owner/repo.git → owner/repo
        let repo = extract_github_repo(&remote_url);
        if let Some(repo) = repo {
            let encoded_title = urlencoding::encode(title);
            let encoded_body = urlencoding::encode(body);
            Some(format!(
                "https://github.com/{}/compare/main...{}?quick_pull=1&title={}&body={}",
                repo, branch, encoded_title, encoded_body
            ))
        } else {
            None
        }
    } else {
        None
    };

    Ok(pr_url)
}

/// Helper: run git command in workspace, return stdout
fn run_git(workspace_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(workspace_path)
        .env("PATH", crate::pty::enriched_path())
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn git_ahead_behind(workspace_path: &str) -> (u32, u32) {
    let output = run_git(
        workspace_path,
        &["rev-list", "--count", "--left-right", "HEAD...@{upstream}"]
    ).unwrap_or_default();
    
    let parts: Vec<&str> = output.trim().split('\t').collect();
    let ahead = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn extract_github_repo(remote_url: &str) -> Option<String> {
    // Handle https://github.com/owner/repo.git
    // Handle git@github.com:owner/repo.git
    let url = remote_url.trim().trim_end_matches(".git");
    if let Some(pos) = url.find("github.com") {
        let rest = &url[pos + "github.com".len()..];
        let repo = rest.trim_start_matches('/').trim_start_matches(':');
        if !repo.is_empty() {
            return Some(repo.to_string());
        }
    }
    None
}

fn parse_stat(stat: &str) -> (u32, u32) {
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    for line in stat.lines() {
        if line.contains("insertion") {
            if let Some(n) = line.split_whitespace().next().and_then(|s| s.parse().ok()) {
                insertions = n;
            }
        }
        if line.contains("deletion") {
            for word in line.split_whitespace() {
                if let Ok(n) = word.parse() {
                    deletions = n;
                    break;
                }
            }
        }
    }
    (insertions, deletions)
}
```

Add `urlencoding` crate to `Cargo.toml`:

```toml
urlencoding = "2.1"
```

---

## Part 2 — Commit Message Generation (`lib.rs`)

Reuse `llm::one_shot_completion` to generate commit messages from diff:

```rust
async fn generate_commit_message(
    diff: &GitDiff,
    workspace: &Workspace,
    db: &Db,
) -> String {
    // Build prompt from diff
    let files = diff.files_changed.iter()
        .map(|f| format!("{} {}", f.status, f.path))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "Write a concise git commit message (max 72 chars, imperative mood) for these changes:\n\n{}\n\nSummary: {}",
        files,
        diff.summary.lines().last().unwrap_or("")
    );

    // Get LLM config for this workspace
    if let Ok(llm_config) = llm::session_env(workspace, db) {
        llm::one_shot_completion(
            &llm_config.provider,
            &llm_config.model,
            &llm_config.api_key,
            "You write concise git commit messages. Imperative mood. Under 72 chars. No quotes.",
            &prompt,
        ).await.unwrap_or_else(|_| "Update project files".to_string())
    } else {
        // Fallback: generate from file list
        format!("Update {} files", diff.files_changed.len())
    }
}
```

---

## Part 3 — Tauri Commands (`lib.rs`)

```rust
#[tauri::command]
fn git_status(workspace_id: i64, db: State<Db>) -> Result<GitStatus, String> {
    let workspace = db.get_workspace(workspace_id)?;
    git::git_status(&workspace.path)
}

#[tauri::command]
fn git_diff_summary(workspace_id: i64, db: State<Db>) -> Result<GitDiff, String> {
    let workspace = db.get_workspace(workspace_id)?;
    git::git_diff(&workspace.path)
}

#[tauri::command]
async fn git_generate_commit_message(
    workspace_id: i64,
    db: State<Db>,
) -> Result<String, String> {
    let workspace = db.get_workspace(workspace_id)?;
    let diff = git::git_diff(&workspace.path)?;
    Ok(generate_commit_message(&diff, &workspace, &db).await)
}

#[tauri::command]
fn git_commit_changes(
    workspace_id: i64,
    message: String,
    db: State<Db>,
) -> Result<(), String> {
    let workspace = db.get_workspace(workspace_id)?;
    git::git_commit(&workspace.path, &message)
}

#[tauri::command]
async fn git_push_changes(
    workspace_id: i64,
    db: State<Db>,
) -> Result<String, String> {
    let workspace = db.get_workspace(workspace_id)?;
    let status = git::git_status(&workspace.path)?;
    git::git_push(&workspace.path)
        .map(|_| status.branch)
}

#[tauri::command]
async fn git_commit_and_push(
    workspace_id: i64,
    message: String,
    create_pr: bool,
    pr_title: Option<String>,
    pr_body: Option<String>,
    db: State<Db>,
    app: AppHandle,
) -> Result<GitPushResult, String> {
    let workspace = db.get_workspace(workspace_id)?;
    let status = git::git_status(&workspace.path)?;

    // Commit
    git::git_commit(&workspace.path, &message)?;

    // Push + optional PR URL
    let pr_url = if create_pr {
        git::git_push_and_get_pr_url(
            &workspace.path,
            &status.branch,
            pr_title.as_deref().unwrap_or(&message),
            pr_body.as_deref().unwrap_or(""),
        )?
    } else {
        git::git_push(&workspace.path).ok();
        None
    };

    Ok(GitPushResult {
        branch: status.branch,
        pr_url,
    })
}

pub struct GitPushResult {
    pub branch: String,
    pub pr_url: Option<String>,
}
```

Register all in `generate_handler!`.
Add `mod git;` to `lib.rs`.

---

## Part 4 — Frontend

### `api.ts`

```typescript
export interface GitStatus {
  branch: string
  isDirty: boolean
  staged: string[]
  unstaged: string[]
  untracked: string[]
  ahead: number
  behind: number
  hasRemote: boolean
}

export interface GitDiff {
  summary: string
  filesChanged: { path: string; status: string; insertions: number; deletions: number }[]
  insertions: number
  deletions: number
}

export interface GitPushResult {
  branch: string
  prUrl?: string
}

export const gitStatus = (workspaceId: number) =>
  invoke<GitStatus>('git_status', { workspaceId })

export const gitDiffSummary = (workspaceId: number) =>
  invoke<GitDiff>('git_diff_summary', { workspaceId })

export const gitGenerateCommitMessage = (workspaceId: number) =>
  invoke<string>('git_generate_commit_message', { workspaceId })

export const gitCommitAndPush = (
  workspaceId: number,
  message: string,
  createPr: boolean,
  prTitle?: string,
  prBody?: string,
) => invoke<GitPushResult>('git_commit_and_push', { workspaceId, message, createPr, prTitle, prBody })
```

### `TopBar.tsx` — git button

Add between the files toggle and theme button.
Shows only when workspace has a git repo.

```tsx
// Poll git status every 10s for active workspace
const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
const [gitOpen, setGitOpen] = useState(false)

useEffect(() => {
  if (!activeWorkspaceId) return
  const poll = async () => {
    try {
      const status = await api.gitStatus(activeWorkspaceId)
      setGitStatus(status)
    } catch {
      setGitStatus(null) // not a git repo — hide button
    }
  }
  poll()
  const interval = setInterval(poll, 10_000)
  return () => clearInterval(interval)
}, [activeWorkspaceId])

// Render git button (only if git repo detected)
{gitStatus && (
  <button
    onClick={() => setGitOpen(true)}
    className={cn(
      "flex items-center gap-1 px-2 py-1 rounded text-xs font-mono",
      "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      "transition-colors"
    )}
    title="Commit & Push"
  >
    <GitBranch className="h-3 w-3" strokeWidth={1} />
    <span>{gitStatus.branch}</span>
    {gitStatus.isDirty && (
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
    )}
    {gitStatus.ahead > 0 && (
      <span className="text-muted-foreground">↑{gitStatus.ahead}</span>
    )}
  </button>
)}
```

**Appearance:**

```
[⎇ main ●]      ← dirty (amber dot)
[⎇ main ↑2]     ← 2 commits ahead, not yet pushed
[⎇ main]        ← clean, nothing to do
```

### `GitDialog.tsx` — new component

```tsx
// Opens when TopBar git button clicked
// Full commit + push flow

function GitDialog({ workspaceId, gitStatus, onClose }) {
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState<'commit' | 'push' | 'pr' | 'done'>('commit')
  const [prUrl, setPrUrl] = useState<string | null>(null)

  // Load diff + generate message on open
  useEffect(() => {
    const load = async () => {
      const [d, msg] = await Promise.all([
        api.gitDiffSummary(workspaceId),
        api.gitGenerateCommitMessage(workspaceId),
      ])
      setDiff(d)
      setMessage(msg)
    }
    load()
  }, [])

  const handleCommitAndPush = async (createPr: boolean) => {
    const result = await api.gitCommitAndPush(
      workspaceId, message, createPr,
      createPr ? message : undefined
    )
    if (result.prUrl) {
      setPrUrl(result.prUrl)
      setStep('pr')
    } else {
      setStep('done')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" strokeWidth={1} />
            Commit & Push
          </DialogTitle>
        </DialogHeader>

        {step === 'commit' && (
          <>
            {/* Commit message */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Commit message</label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="font-mono text-sm resize-none"
                rows={3}
                placeholder="Describe your changes..."
              />
            </div>

            {/* File list */}
            {diff && diff.filesChanged.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {diff.filesChanged.length} files changed
                  {diff.insertions > 0 && <span className="text-green-500 ml-2">+{diff.insertions}</span>}
                  {diff.deletions > 0 && <span className="text-red-500 ml-1">-{diff.deletions}</span>}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {diff.filesChanged.map(f => (
                    <div key={f.path} className="flex items-center gap-2 text-xs font-mono">
                      <span className={cn(
                        "w-4 text-center",
                        f.status === 'A' ? 'text-green-500' :
                        f.status === 'D' ? 'text-red-500' :
                        'text-amber-500'
                      )}>
                        {f.status}
                      </span>
                      <span className="text-muted-foreground truncate">{f.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No changes state */}
            {diff && diff.filesChanged.length === 0 && gitStatus.ahead === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nothing to commit. Working tree clean.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              {gitStatus.ahead > 0 && diff?.filesChanged.length === 0 ? (
                // Only push (nothing new to commit)
                <Button size="sm" onClick={() => handleCommitAndPush(false)}>
                  Push ↑{gitStatus.ahead}
                </Button>
              ) : (
                <>
                  {gitStatus.hasRemote && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCommitAndPush(true)}
                      disabled={!message.trim() || diff?.filesChanged.length === 0}
                    >
                      Commit, Push & PR
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleCommitAndPush(false)}
                    disabled={!message.trim() || diff?.filesChanged.length === 0}
                  >
                    {gitStatus.hasRemote ? 'Commit & Push' : 'Commit'}
                    <kbd className="ml-2 text-xs opacity-60">⌘↵</kbd>
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-4 space-y-2">
            <div className="text-green-500">✓ Pushed to {gitStatus.branch}</div>
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        )}

        {step === 'pr' && prUrl && (
          <div className="text-center py-4 space-y-3">
            <div className="text-green-500">✓ Pushed to {gitStatus.branch}</div>
            <Button
              size="sm"
              onClick={() => { window.open(prUrl, '_blank'); onClose(); }}
            >
              Open Pull Request ↗
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip PR
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Keyboard shortcut:** `⌘↵` triggers "Commit & Push" when dialog is open.

---

## MCP Tool (optional — agent can commit)

Add to `mcp.rs` so agents can commit their own work:

```rust
ToolSpec {
    name: "git_commit",
    description: "Commit all current changes with a message",
    schema: json!({
        "type": "object",
        "properties": {
            "message": { "type": "string", "description": "Commit message" }
        },
        "required": ["message"]
    }),
    execute: |ctx, input| {
        let message = input["message"].as_str().unwrap_or("Update files");
        git::git_commit(&ctx.workspace_path, message)
            .map(|_| json!({"success": true, "message": message}))
    }
}
```

This lets agents commit their own work via:

```
Agent: I've updated the newsletter draft. Let me commit these changes.
→ calls git_commit("Add newsletter draft for June 24")
→ files committed
→ user sees ↑1 in TopBar
→ user pushes when ready
```

---

## Scope Rules

- Git operations = shell out to `git` binary via `std::process::Command`
- Never use `git2` crate (adds 10MB+ to binary)
- Always use `pty::enriched_path()` for PATH (git may not be in default PATH)
- If workspace is not a git repo → hide button entirely (no error shown)
- If no remote configured → show "Commit" only (no Push)
- Commit message generation = best-effort (fallback to "Update files")
- PR URL = GitHub only for now (GitLab/Bitbucket later)
- `cargo check` and `npm run build` must pass clean

___

it also work for project never git or commited?

Good catch. Two cases to handle:

**Case 1 — Not a git repo at all:**

```
User adds a folder that was never git init'd
  → git status fails
  → hide the TopBar button entirely
  → no error, no noise
```

**Case 2 — Git repo but never committed (fresh init):**

```
git init was run but no commits yet
  → branch name = "main" (or empty)
  → git status --porcelain shows untracked files
  → no remote
  → `git rev-parse HEAD` fails (no commits)
  
Should show button + handle gracefully:
  → "Initial commit" as default message
  → no Push button (no remote)
  → Commit only
```

**Case 3 — Git repo, committed, no remote:**

```
git init + git commit but no git remote add
  → show button + dirty indicator
  → Commit button only (no Push, no PR)
  → after commit: "✓ Committed locally"
```

**Fix needed in `git_status`:**

```rust
pub fn git_status(workspace_path: &str) -> Result<GitStatus, String> {
    // First check if it's a git repo at all
    let is_git = run_git(workspace_path, &["rev-parse", "--git-dir"]);
    if is_git.is_err() {
        return Err("not a git repo".to_string());
        // Frontend catches this → hides button
    }

    // Check if any commits exist yet
    let has_commits = run_git(workspace_path, &["rev-parse", "HEAD"]).is_ok();

    // Branch name (empty string if no commits yet)
    let branch = if has_commits {
        run_git(workspace_path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_default()
            .trim()
            .to_string()
    } else {
        "main".to_string() // default branch name before first commit
    };

    // Status works even with no commits
    let status_output = run_git(workspace_path, &["status", "--porcelain"])
        .unwrap_or_default();

    // ... rest of parsing ...

    // Ahead/behind only makes sense with commits + remote
    let (ahead, behind) = if has_commits {
        git_ahead_behind(workspace_path)
    } else {
        (0, 0)
    };

    let has_remote = run_git(workspace_path, &["remote"])
        .map(|r| !r.trim().is_empty())
        .unwrap_or(false);

    Ok(GitStatus {
        branch,
        is_dirty,
        staged,
        unstaged,
        untracked,
        ahead,
        behind,
        has_remote,
        has_commits,  // ← add this field
    })
}
```

**Add `has_commits: bool` to `GitStatus` struct.**

**`git_commit` handles no-previous-commits case:**

```rust
pub fn git_commit(workspace_path: &str, message: &str) -> Result<(), String> {
    // Stage everything
    run_git(workspace_path, &["add", "-A"])?;
    
    // git commit works fine even for first commit
    run_git(workspace_path, &["commit", "-m", message])?;
    
    Ok(())
}
```

**Frontend `GitDialog` — adjust for no-commits + no-remote:**

```
No commits yet:
  Default message: "Initial commit"
  Show: [Commit] only (no Push, no PR)
  After: "✓ First commit created"

Has commits, no remote:
  Show: [Commit] only  
  After: "✓ Committed locally"

Has commits + remote:
  Show: [Commit & Push] + [Commit, Push & PR]
  After: "✓ Pushed to main"
```

**Also: offer to `git init` if not a repo:**

Optionally in the workspace settings or sidebar context menu:

```
[Initialize git repo]  ← runs git init
→ TopBar button appears
→ user can commit immediately
```

Tell Droid to add `has_commits` field + `git rev-parse --git-dir` check + update `GitDialog` for all three cases. One small addition to the existing instruction file.
