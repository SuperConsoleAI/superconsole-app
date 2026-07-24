use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub is_dirty: bool,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
    pub ahead: u32,
    pub behind: u32,
    pub has_remote: bool,
    pub has_commits: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub summary: String,
    pub files_changed: Vec<FileDiff>,
    pub insertions: u32,
    pub deletions: u32,
    pub total_files: usize, // actual total before capping
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: String,
    pub insertions: u32,
    pub deletions: u32,
}

/// Get full git status for a workspace.
/// Returns Err("not a git repo") if workspace is not a git repo — frontend hides button.
pub fn git_status(workspace_path: &str) -> Result<GitStatus, String> {
    if run_git(workspace_path, &["rev-parse", "--git-dir"]).is_err() {
        return Err("not a git repo".to_string());
    }

    let has_commits = run_git(workspace_path, &["rev-parse", "HEAD"]).is_ok();

    let branch = if has_commits {
        run_git(workspace_path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "main".to_string())
            .trim()
            .to_string()
    } else {
        run_git(workspace_path, &["symbolic-ref", "--short", "HEAD"])
            .unwrap_or_else(|_| "main".to_string())
            .trim()
            .to_string()
    };

    let status_output = run_git(workspace_path, &["status", "--porcelain"]).unwrap_or_default();

    let mut staged: Vec<String> = vec![];
    let mut unstaged: Vec<String> = vec![];
    let mut untracked: Vec<String> = vec![];

    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }
        let x = line.chars().nth(0).unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let file = line[3..].trim().to_string();

        if x == '?' && y == '?' {
            untracked.push(file);
        } else {
            if x != ' ' {
                staged.push(file.clone());
            }
            if y != ' ' && y != '?' {
                unstaged.push(file);
            }
        }
    }

    let is_dirty = !staged.is_empty() || !unstaged.is_empty() || !untracked.is_empty();

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
        has_commits,
    })
}

/// Get diff summary for commit message generation and file list display.
pub fn git_diff(workspace_path: &str) -> Result<GitDiff, String> {
    const MAX_FILES: usize = 200;

    let has_commits = run_git(workspace_path, &["rev-parse", "HEAD"]).is_ok();

    let (stat, name_status) = if has_commits {
        let s = run_git(workspace_path, &["diff", "--stat", "HEAD"]).unwrap_or_default();
        let ns = run_git(workspace_path, &["diff", "--name-status", "HEAD"]).unwrap_or_default();
        (s, ns)
    } else {
        (String::new(), String::new())
    };

    // Use --directory to collapse large dirs (e.g. node_modules/) into a single entry
    // instead of listing every file inside. Also use --exclude-standard to respect .gitignore.
    let untracked = run_git(
        workspace_path,
        &["ls-files", "--others", "--exclude-standard", "--directory"],
    )
    .unwrap_or_default();

    let mut files_changed: Vec<FileDiff> = vec![];

    for line in name_status.lines() {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            files_changed.push(FileDiff {
                path: parts[1].to_string(),
                status: parts[0].chars().next().unwrap_or('M').to_string(),
                insertions: 0,
                deletions: 0,
            });
        }
    }

    for file in untracked.lines() {
        let file = file.trim();
        if !file.is_empty() && !files_changed.iter().any(|f| f.path == file) {
            files_changed.push(FileDiff {
                path: file.to_string(),
                status: "A".to_string(),
                insertions: 0,
                deletions: 0,
            });
        }
    }

    let total_files = files_changed.len();

    // Cap what we send over IPC — avoids serializing tens of thousands of files
    if files_changed.len() > MAX_FILES {
        files_changed.truncate(MAX_FILES);
    }

    let (insertions, deletions) = parse_stat(&stat);

    Ok(GitDiff {
        summary: stat,
        files_changed,
        insertions,
        deletions,
        total_files,
    })
}

/// Stage everything and commit. Works for first commit too.
pub fn git_commit(workspace_path: &str, message: &str) -> Result<(), String> {
    // Clear stale index.lock if present (left by a crashed git process or editor).
    // Git itself says "remove the file manually" — we do it automatically since
    // we know no other git operation is running when the user clicks Commit.
    let lock = std::path::Path::new(workspace_path).join(".git/index.lock");
    if lock.exists() {
        let _ = std::fs::remove_file(&lock);
    }
    run_git(workspace_path, &["add", "-A"])?;
    run_git(workspace_path, &["commit", "-m", message])?;
    Ok(())
}

/// Initialize a new git repo in the workspace path.
pub fn git_init(workspace_path: &str) -> Result<(), String> {
    run_git(workspace_path, &["init"])?;
    Ok(())
}

/// Push to remote (uses existing tracking config).
pub fn git_push(workspace_path: &str) -> Result<String, String> {
    run_git(workspace_path, &["push"])
}

/// Push and return a GitHub PR URL if the remote is GitHub.
pub fn git_push_and_get_pr_url(
    workspace_path: &str,
    branch: &str,
    title: &str,
    body: &str,
) -> Result<Option<String>, String> {
    git_push(workspace_path)?;

    let remote_url = run_git(workspace_path, &["remote", "get-url", "origin"]).unwrap_or_default();

    let pr_url = if remote_url.contains("github.com") {
        extract_github_repo(&remote_url).map(|repo| {
            let encoded_title = url_encode(title);
            let encoded_body = url_encode(body);
            format!(
                "https://github.com/{}/compare/main...{}?quick_pull=1&title={}&body={}",
                repo, branch, encoded_title, encoded_body
            )
        })
    } else {
        None
    };

    Ok(pr_url)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
        &["rev-list", "--count", "--left-right", "HEAD...@{upstream}"],
    )
    .unwrap_or_default();
    let parts: Vec<&str> = output.trim().split('\t').collect();
    let ahead = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn extract_github_repo(remote_url: &str) -> Option<String> {
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
        for part in line.split(',') {
            let p = part.trim();
            if p.contains("insertion") {
                if let Some(n) = p.split_whitespace().next().and_then(|s| s.parse().ok()) {
                    insertions = n;
                }
            }
            if p.contains("deletion") {
                if let Some(n) = p.split_whitespace().next().and_then(|s| s.parse().ok()) {
                    deletions = n;
                }
            }
        }
    }
    (insertions, deletions)
}

/// Minimal percent-encoding for URL query params (no external crate needed).
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
