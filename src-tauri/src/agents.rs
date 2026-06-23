// File-defined agents living in `.superconsole/agents/<name>/agent.md`.
//
// An agent is a reusable *definition*: instructions plus the skills, connectors,
// and context it should use. It does NOT pick a harness or model — that's chosen
// when a job runs it. Running, scheduling, and results are handled by the jobs
// table + inbox; agents add no new tables.

use crate::cloud;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub connectors: Vec<String>,
    #[serde(default)]
    pub context: Vec<String>,
    pub instructions: String,
    #[serde(default)]
    pub folder_path: String,
    #[serde(default)]
    pub readme: Option<String>,
}

fn agents_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(".superconsole").join("agents")
}

fn safe_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.starts_with('.')
    {
        return Err(format!("invalid agent name '{}'", name));
    }
    Ok(())
}

fn parse_list(val: &str) -> Vec<String> {
    val.trim()
        .trim_matches(['[', ']'])
        .split(',')
        .map(|t| t.trim().trim_matches(['"', '\'']).to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn parse_agent_md(content: &str) -> Option<Agent> {
    let trimmed = content.trim_start();
    let rest = trimmed.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let fm = &rest[..end];
    let body = rest[end + 4..].trim_start_matches('\n');

    let mut name = String::new();
    let mut description = String::new();
    let mut skills = Vec::new();
    let mut connectors = Vec::new();
    let mut context = Vec::new();

    for line in fm.lines() {
        let line = line.trim();
        let Some((key, val)) = line.split_once(':') else {
            continue;
        };
        let val = val.trim();
        match key.trim() {
            "name" => name = val.trim_matches(['"', '\'']).to_string(),
            "description" => description = val.trim_matches(['"', '\'']).to_string(),
            "skills" => skills = parse_list(val),
            "connectors" => connectors = parse_list(val),
            "context" => context = parse_list(val),
            _ => {}
        }
    }

    if name.is_empty() {
        return None;
    }

    Some(Agent {
        name,
        description,
        skills,
        connectors,
        context,
        instructions: body.trim_end().to_string(),
        folder_path: String::new(),
        readme: None,
    })
}

fn build_agent_md(agent: &Agent) -> String {
    let mut fm = String::from("---\n");
    fm.push_str(&format!("name: {}\n", agent.name));
    fm.push_str(&format!("description: {}\n", agent.description));
    fm.push_str(&format!("skills: [{}]\n", agent.skills.join(", ")));
    fm.push_str(&format!("connectors: [{}]\n", agent.connectors.join(", ")));
    fm.push_str(&format!("context: [{}]\n", agent.context.join(", ")));
    fm.push_str("---\n\n");
    fm.push_str(agent.instructions.trim());
    fm.push('\n');
    fm
}

// --- base-dir core (shared by project + global catalogs) ---

fn list_agents_in(dir: &Path) -> Vec<Agent> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let folder = entry.path();
        let md = folder.join("agent.md");
        let Ok(content) = std::fs::read_to_string(&md) else {
            continue;
        };
        let Some(mut agent) = parse_agent_md(&content) else {
            continue;
        };
        agent.folder_path = folder.to_string_lossy().to_string();
        agent.readme = std::fs::read_to_string(folder.join("README.md")).ok();
        out.push(agent);
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

fn read_agent_in(dir: &Path, name: &str) -> Result<Agent, String> {
    safe_name(name)?;
    let folder = dir.join(name);
    let content = std::fs::read_to_string(folder.join("agent.md"))
        .map_err(|_| format!("agent '{}' not found", name))?;
    let mut agent = parse_agent_md(&content).ok_or("malformed agent.md")?;
    agent.folder_path = folder.to_string_lossy().to_string();
    agent.readme = std::fs::read_to_string(folder.join("README.md")).ok();
    Ok(agent)
}

fn write_agent_in(dir: &Path, agent: &Agent) -> Result<(), String> {
    safe_name(&agent.name)?;
    let folder = dir.join(&agent.name);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("agent.md"), build_agent_md(agent)).map_err(|e| e.to_string())?;
    match &agent.readme {
        Some(r) if !r.trim().is_empty() => {
            std::fs::write(folder.join("README.md"), r).map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

fn delete_agent_in(dir: &Path, name: &str) -> Result<(), String> {
    safe_name(name)?;
    let folder = dir.join(name);
    if folder.is_dir() {
        std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- project catalog (`.superconsole/agents/`) ---

pub fn list_agents(ws_path: &str) -> Vec<Agent> {
    list_agents_in(&agents_dir(ws_path))
}

pub fn read_agent(ws_path: &str, name: &str) -> Result<Agent, String> {
    read_agent_in(&agents_dir(ws_path), name)
}

pub fn write_agent(ws_path: &str, agent: &Agent) -> Result<(), String> {
    write_agent_in(&agents_dir(ws_path), agent)
}

pub fn delete_agent(ws_path: &str, name: &str) -> Result<(), String> {
    delete_agent_in(&agents_dir(ws_path), name)
}

// --- agent catalog (SuperConsole-owned, main Turso DB; files on GitHub) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub image_url: String,
    pub skills: Vec<String>,
    pub connectors: Vec<String>,
    pub tags: Vec<String>,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAgentInput {
    pub name: String,
    pub description: String,
    pub category: String,
    pub image_url: String,
    pub skills: Vec<String>,
    pub connectors: Vec<String>,
    pub tags: Vec<String>,
    pub repo: String,
    pub git_ref: String,
    pub base_path: String,
    pub files: Vec<String>,
}

fn parse_json_list(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

pub async fn ensure_agent_catalog_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS agent_catalog (\
            id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT, \
            category TEXT, skills TEXT, connectors TEXT, tags TEXT, repo TEXT NOT NULL, \
            git_ref TEXT NOT NULL DEFAULT 'main', base_path TEXT NOT NULL, \
            files TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    // Fallback for an already-created table missing columns (ignored if present).
    for stmt in [
        "ALTER TABLE agent_catalog ADD COLUMN category TEXT",
        "ALTER TABLE agent_catalog ADD COLUMN image_url TEXT",
    ] {
        let _ = cloud::turso_execute(client, cfg, stmt, vec![]).await;
    }
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS agent_catalog_name_unq ON agent_catalog (name)",
        vec![],
    )
    .await?;
    Ok(())
}

pub async fn list_catalog_agents() -> Result<Vec<CatalogAgent>, String> {
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_agent_catalog_table(&client, &cfg).await?;
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, category, image_url, skills, connectors, tags, version \
         FROM agent_catalog ORDER BY name",
        vec![],
    )
    .await?;
    Ok(cloud::rows(&result)
        .iter()
        .map(|r| CatalogAgent {
            id: cloud::cell_text(r, 0),
            name: cloud::cell_text(r, 1),
            description: cloud::cell_text(r, 2),
            category: cloud::cell_text(r, 3),
            image_url: cloud::cell_text(r, 4),
            skills: parse_json_list(&cloud::cell_text(r, 5)),
            connectors: parse_json_list(&cloud::cell_text(r, 6)),
            tags: parse_json_list(&cloud::cell_text(r, 7)),
            version: cloud::cell_text(r, 8).parse().unwrap_or(1),
        })
        .collect())
}

/// TEMP admin helper: insert/update a catalog row so we can seed agents from
/// the app while the publish GitHub Action does not exist yet. Remove later.
pub async fn upsert_catalog_agent(input: CatalogAgentInput) -> Result<(), String> {
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_agent_catalog_table(&client, &cfg).await?;
    upsert_catalog_row(&client, &cfg, input).await
}

pub async fn delete_catalog_agent(id: String) -> Result<(), String> {
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_agent_catalog_table(&client, &cfg).await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM agent_catalog WHERE id = ?",
        vec![Some(id)],
    )
    .await?;
    Ok(())
}

async fn upsert_catalog_row(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    input: CatalogAgentInput,
) -> Result<(), String> {
    let json = |v: &[String]| serde_json::to_string(v).unwrap_or_else(|_| "[]".into());
    let git_ref = if input.git_ref.trim().is_empty() {
        "main".to_string()
    } else {
        input.git_ref.clone()
    };
    cloud::turso_execute(
        client,
        cfg,
        "INSERT INTO agent_catalog \
            (id, name, description, category, image_url, skills, connectors, tags, repo, git_ref, base_path, files, version) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) \
         ON CONFLICT(name) DO UPDATE SET \
            description = excluded.description, category = excluded.category, \
            image_url = excluded.image_url, skills = excluded.skills, \
            connectors = excluded.connectors, tags = excluded.tags, repo = excluded.repo, \
            git_ref = excluded.git_ref, base_path = excluded.base_path, files = excluded.files, \
            version = agent_catalog.version + 1, \
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        vec![
            Some(Ulid::new().to_string()),
            Some(input.name),
            Some(input.description),
            Some(input.category),
            Some(input.image_url),
            Some(json(&input.skills)),
            Some(json(&input.connectors)),
            Some(json(&input.tags)),
            Some(input.repo),
            Some(git_ref),
            Some(input.base_path),
            Some(json(&input.files)),
        ],
    )
    .await?;
    Ok(())
}

// --- repo import: turn any GitHub repo into a catalog agent ---

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    image: String,
    #[serde(default)]
    connectors: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    base_path: String,
    #[serde(default)]
    instructions: String,
    #[serde(default)]
    skills: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginMarketplace {
    #[serde(default)]
    agents: Vec<PluginManifest>,
    // Claude-style marketplaces list entries under "plugins".
    #[serde(default)]
    plugins: Vec<PluginManifest>,
}

/// Accept `owner/name` or a GitHub URL (https, ssh, with optional
/// `/tree/<ref>` or `/blob/<ref>`); returns `(owner/name, ref_from_url)`.
fn parse_repo_input(input: &str) -> Result<(String, Option<String>), String> {
    let mut s = input.trim().to_string();
    for p in ["https://", "http://", "git+https://", "ssh://"] {
        if let Some(rest) = s.strip_prefix(p) {
            s = rest.to_string();
        }
    }
    s = s.replace("git@github.com:", "github.com/");
    if let Some(idx) = s.find("github.com/") {
        s = s[idx + "github.com/".len()..].to_string();
    }
    s = s.trim_matches('/').to_string();
    if let Some(stripped) = s.strip_suffix(".git") {
        s = stripped.to_string();
    }
    let parts: Vec<&str> = s.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 {
        return Err("expected repo as 'owner/name' or a GitHub URL".to_string());
    }
    let name = parts[1].strip_suffix(".git").unwrap_or(parts[1]);
    let git_ref = if parts.len() >= 4 && (parts[2] == "tree" || parts[2] == "blob") {
        Some(parts[3].to_string())
    } else {
        None
    };
    Ok((format!("{}/{}", parts[0], name), git_ref))
}

fn sanitize_agent_name(raw: &str) -> String {
    let mut out = String::new();
    for ch in raw.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if ch == '-' || ch == '_' || ch == ' ' {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "agent".to_string()
    } else {
        trimmed
    }
}

/// `skills/foo/SKILL.md` -> `foo`; otherwise the file stem.
fn skill_display_name(path: &str) -> String {
    if let Some(idx) = path.to_lowercase().rfind("/skill.md") {
        let prefix = &path[..idx];
        return prefix.rsplit('/').next().unwrap_or(prefix).to_string();
    }
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

/// Keep only the first sentence and a sane length — manifest descriptions can
/// be paragraphs of caveats/telemetry notes.
fn clean_description(d: &str) -> String {
    let d = d.trim().replace(['\n', '\r'], " ");
    let first = d.split(". ").next().unwrap_or(&d).trim().to_string();
    let mut s = first.trim_end_matches('.').to_string();
    if s.chars().count() > 140 {
        s = s.chars().take(140).collect::<String>().trim_end().to_string();
    }
    s
}

fn dedup_strings(items: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for s in items {
        let s = s.trim().to_string();
        if !s.is_empty() && seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out
}

fn skill_display_names(paths: &[String]) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for p in paths {
        let n = skill_display_name(p);
        if seen.insert(n.clone()) {
            out.push(n);
        }
    }
    out
}

async fn fetch_repo_file(
    client: &reqwest::Client,
    repo: &str,
    git_ref: &str,
    path: &str,
) -> Option<String> {
    let url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}",
        repo.trim_matches('/'),
        git_ref,
        path
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "SuperConsole")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.text().await.ok()
}

async fn github_tree(
    client: &reqwest::Client,
    repo: &str,
    git_ref: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "https://api.github.com/repos/{}/git/trees/{}?recursive=1",
        repo.trim_matches('/'),
        git_ref
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "SuperConsole")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub tree fetch failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "GitHub tree fetch failed ({}); is the repo public and the ref correct?",
            resp.status()
        ));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = v.get("tree").and_then(|t| t.as_array()) {
        for item in arr {
            if item.get("type").and_then(|t| t.as_str()) == Some("blob") {
                if let Some(p) = item.get("path").and_then(|p| p.as_str()) {
                    out.push(p.to_string());
                }
            }
        }
    }
    Ok(out)
}

/// Import a GitHub repo as one or more catalog agents. Prefers an explicit
/// `.superconsole-plugin` (or `.claude-plugin`) manifest; otherwise builds a
/// single agent from the repo by auto-detecting an instructions file
/// (AGENTS.md / CLAUDE.md / README.md) and any `skills/**` files. Returns the
/// number of agents written.
pub async fn import_repo_agents(repo: String, git_ref: String) -> Result<u32, String> {
    let inputs = detect_repo_agents(repo, git_ref).await?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_agent_catalog_table(&client, &cfg).await?;
    let mut count = 0u32;
    for input in inputs {
        upsert_catalog_row(&client, &cfg, input).await?;
        count += 1;
    }
    Ok(count)
}

/// Same detection as `import_repo_agents` but returns the catalog rows without
/// writing them — used to prefill the review form.
pub async fn detect_repo_agents(
    repo: String,
    git_ref: String,
) -> Result<Vec<CatalogAgentInput>, String> {
    let git_ref = if git_ref.trim().is_empty() {
        "main".to_string()
    } else {
        git_ref.trim().to_string()
    };
    let (repo, ref_from_url) = parse_repo_input(&repo)?;
    let git_ref = ref_from_url.unwrap_or(git_ref);
    let client = reqwest::Client::new();
    let tree = github_tree(&client, &repo, &git_ref).await?;

    // Explicit manifests (ours first, then Claude's) — marketplace, then single.
    let mut manifests: Vec<PluginManifest> = Vec::new();
    for path in [
        ".superconsole-plugin/marketplace.json",
        ".claude-plugin/marketplace.json",
    ] {
        if let Some(txt) = fetch_repo_file(&client, &repo, &git_ref, path).await {
            if let Ok(mp) = serde_json::from_str::<PluginMarketplace>(&txt) {
                let mut a = mp.agents;
                a.extend(mp.plugins);
                if !a.is_empty() {
                    manifests = a;
                    break;
                }
            }
        }
    }
    if manifests.is_empty() {
        for path in [
            ".superconsole-plugin/plugin.json",
            ".claude-plugin/plugin.json",
        ] {
            if let Some(txt) = fetch_repo_file(&client, &repo, &git_ref, path).await {
                if let Ok(one) = serde_json::from_str::<PluginManifest>(&txt) {
                    if !one.name.is_empty() {
                        manifests.push(one);
                        break;
                    }
                }
            }
        }
    }

    // Auto-detected fallbacks from the file tree.
    // A "skill" is a directory under `skills/` that contains a SKILL.md — not
    // every file (repos can carry .d.ts, docs, build artifacts, etc.).
    let skill_md_paths: Vec<String> = tree
        .iter()
        .filter(|p| {
            let lp = p.to_lowercase();
            lp.starts_with("skills/") && lp.ends_with("/skill.md")
        })
        .cloned()
        .collect();
    let skill_dirs: Vec<String> = skill_md_paths
        .iter()
        .filter_map(|p| p.rfind('/').map(|i| p[..i].to_string()))
        .collect();
    // Files to actually fetch on install: everything inside real skill dirs,
    // or a flat `skills/*.md` fallback when there are no SKILL.md folders.
    let skill_files: Vec<String> = if !skill_dirs.is_empty() {
        tree.iter()
            .filter(|p| skill_dirs.iter().any(|d| p.starts_with(&format!("{}/", d))))
            .cloned()
            .collect()
    } else {
        tree.iter()
            .filter(|p| {
                let lp = p.to_lowercase();
                p.starts_with("skills/") && lp.ends_with(".md") && p["skills/".len()..].find('/').is_none()
            })
            .cloned()
            .collect()
    };
    // Names for display/search (one per skill, not per file).
    let skill_name_paths = if !skill_md_paths.is_empty() {
        skill_md_paths.clone()
    } else {
        skill_files.clone()
    };
    let instructions_src = [
        ".superconsole-plugin/agent.md",
        "AGENTS.md",
        "CLAUDE.md",
        "agent.md",
        "README.md",
    ]
    .into_iter()
    .find(|f| tree.iter().any(|p| p == f))
    .map(|s| s.to_string());
    let repo_name = repo.rsplit('/').next().unwrap_or("agent").to_string();
    let owner = repo.split('/').next().unwrap_or("").to_string();
    // Use the GitHub owner avatar as the agent logo by default.
    let owner_avatar = if owner.is_empty() {
        String::new()
    } else {
        format!("https://github.com/{}.png?size=128", owner)
    };
    let manifest_count = manifests.len();

    let inputs: Vec<CatalogAgentInput> = if !manifests.is_empty() {
        manifests
            .into_iter()
            .map(|m| {
                let mut tags = m.tags.clone();
                tags.extend(m.keywords.clone());
                tags = dedup_strings(tags);
                tags.truncate(3); // max 3 tags per agent
                let instr = if m.instructions.is_empty() {
                    instructions_src.clone().unwrap_or_default()
                } else {
                    m.instructions.clone()
                };
                // Files to fetch + names to display, from the manifest or auto.
                let (install_skills, display_skills) = if m.skills.is_empty() {
                    (skill_files.clone(), skill_name_paths.clone())
                } else {
                    (m.skills.clone(), m.skills.clone())
                };
                let mut files = Vec::new();
                if !instr.is_empty() {
                    files.push(format!("{}>agent.md", instr));
                }
                files.extend(install_skills.iter().cloned());
                files.extend(m.files.iter().cloned());
                files.truncate(10); // max 10 files
                // Name must match the repo (single agent); multiple agents are
                // namespaced under the repo name.
                let agent_name = if manifest_count <= 1 || m.name.is_empty() {
                    repo_name.clone()
                } else {
                    format!("{}-{}", repo_name, m.name)
                };
                let mut skills = skill_display_names(&display_skills);
                skills.truncate(20); // store at most 20 skill names in the catalog
                CatalogAgentInput {
                    name: sanitize_agent_name(&agent_name),
                    description: clean_description(&m.description),
                    category: m.category,
                    image_url: if m.image.is_empty() {
                        owner_avatar.clone()
                    } else {
                        m.image
                    },
                    skills,
                    connectors: m.connectors,
                    tags,
                    repo: repo.clone(),
                    git_ref: git_ref.clone(),
                    base_path: m.base_path,
                    files,
                }
            })
            .collect()
    } else {
        let instr = instructions_src.clone().ok_or_else(|| {
            "no manifest and no AGENTS.md / CLAUDE.md / README.md found to use as instructions"
                .to_string()
        })?;
        let mut files = vec![format!("{}>agent.md", instr)];
        files.extend(skill_files.iter().cloned());
        files.truncate(10);
        let mut skills = skill_display_names(&skill_name_paths);
        skills.truncate(20);
        vec![CatalogAgentInput {
            name: sanitize_agent_name(&repo_name),
            description: String::new(),
            category: String::new(),
            image_url: owner_avatar.clone(),
            skills,
            connectors: Vec::new(),
            tags: Vec::new(),
            repo: repo.clone(),
            git_ref: git_ref.clone(),
            base_path: String::new(),
            files,
        }]
    };

    Ok(inputs)
}

/// Strip a leading YAML frontmatter block, returning the body.
fn body_after_frontmatter(content: &str) -> String {
    let t = content.trim_start();
    if let Some(rest) = t.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            return rest[end + 4..].trim_start_matches('\n').to_string();
        }
    }
    content.to_string()
}

/// Fetch a catalog agent's files from GitHub raw and materialize them into the
/// project: a generated `.superconsole/agents/<name>/agent.md` (frontmatter from
/// the catalog row + instructions body), with `skills/**` files routed into the
/// project skill dir. Files may use `src>dest` to rename on install.
pub async fn install_catalog_agent(ws_path: &str, id: &str) -> Result<(), String> {
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_agent_catalog_table(&client, &cfg).await?;
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT name, description, skills, connectors, repo, git_ref, base_path, files \
         FROM agent_catalog WHERE id = ?",
        vec![Some(id.to_string())],
    )
    .await?;
    let row = cloud::rows(&result)
        .into_iter()
        .next()
        .ok_or_else(|| format!("agent '{}' not found in catalog", id))?;
    let input = CatalogAgentInput {
        name: cloud::cell_text(&row, 0),
        description: cloud::cell_text(&row, 1),
        category: String::new(),
        image_url: String::new(),
        skills: parse_json_list(&cloud::cell_text(&row, 2)),
        connectors: parse_json_list(&cloud::cell_text(&row, 3)),
        tags: Vec::new(),
        repo: cloud::cell_text(&row, 4),
        git_ref: cloud::cell_text(&row, 5),
        base_path: cloud::cell_text(&row, 6),
        files: parse_json_list(&cloud::cell_text(&row, 7)),
    };
    install_input(ws_path, &input).await
}

/// User flow: clone the *entire* repo into the new project, generate an
/// `agent.md` from its detected metadata, and import every skill folder (no
/// cap). Returns the agent name.
pub async fn install_repo_agent(
    ws_path: &str,
    repo: String,
    git_ref: String,
) -> Result<String, String> {
    let (repo_slug, ref_from_url) = parse_repo_input(&repo)?;
    let git_ref = if git_ref.trim().is_empty() {
        ref_from_url.unwrap_or_else(|| "main".to_string())
    } else {
        git_ref
    };

    // Detect agent metadata (name/description/skills/connectors + which file is
    // the instructions source).
    let inputs = detect_repo_agents(repo_slug.clone(), git_ref.clone()).await?;
    let input = inputs
        .into_iter()
        .next()
        .ok_or_else(|| "no agent could be detected in that repo".to_string())?;
    let name = input.name.clone();
    safe_name(&name)?;

    // 1. Clone the whole repo into the project directory.
    clone_repo_into(&repo_slug, &git_ref, ws_path)?;

    // 2. Generate agent.md from the cloned files + detected metadata.
    let instr_rel = input
        .files
        .iter()
        .find_map(|e| e.split_once('>').filter(|(_, d)| d.trim() == "agent.md"))
        .map(|(s, _)| s.trim().to_string());
    let base = input.base_path.trim_matches('/');
    let instructions = instr_rel
        .as_ref()
        .and_then(|rel| {
            let p = if base.is_empty() {
                Path::new(ws_path).join(rel)
            } else {
                Path::new(ws_path).join(base).join(rel)
            };
            std::fs::read_to_string(p).ok()
        })
        .map(|c| body_after_frontmatter(&c))
        .unwrap_or_default();

    // 3. Import every skill folder (skills/<name>/SKILL.md) into the project
    //    skill dir — no cap.
    let skills_src = if base.is_empty() {
        Path::new(ws_path).join("skills")
    } else {
        Path::new(ws_path).join(base).join("skills")
    };
    let skills_dest = Path::new(ws_path).join(".superconsole").join("skills");
    let mut skill_names: Vec<String> = Vec::new();
    if skills_src.is_dir() {
        for entry in std::fs::read_dir(&skills_src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").exists() {
                let sn = entry.file_name().to_string_lossy().to_string();
                copy_dir_all(&path, &skills_dest.join(&sn))?;
                skill_names.push(sn);
            }
        }
    }
    skill_names.sort();

    let agent = Agent {
        name: name.clone(),
        description: input.description.clone(),
        skills: skill_names.clone(),
        connectors: input.connectors.clone(),
        context: Vec::new(),
        instructions,
        folder_path: String::new(),
        readme: None,
    };
    let agent_folder = agents_dir(ws_path).join(&name);
    std::fs::create_dir_all(&agent_folder).map_err(|e| e.to_string())?;
    std::fs::write(agent_folder.join("agent.md"), build_agent_md(&agent))
        .map_err(|e| e.to_string())?;

    // 4. Write a `.superconsole-plugin/plugin.json` so the project is itself a
    //    self-describing SuperConsole plugin (re-imports detect it directly).
    write_plugin_manifest(ws_path, &input, &skill_names, instr_rel.as_deref())?;

    Ok(name)
}

/// Emit `.superconsole-plugin/plugin.json` from the resolved agent metadata.
fn write_plugin_manifest(
    ws_path: &str,
    input: &CatalogAgentInput,
    skills: &[String],
    instructions: Option<&str>,
) -> Result<(), String> {
    let manifest = serde_json::json!({
        "name": input.name,
        "description": input.description,
        "category": input.category,
        "image": input.image_url,
        "connectors": input.connectors,
        "tags": input.tags,
        "basePath": input.base_path,
        "instructions": instructions.unwrap_or(""),
        "skills": skills,
        "files": [],
    });
    let dir = Path::new(ws_path).join(".superconsole-plugin");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let body = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("plugin.json"), body).map_err(|e| e.to_string())?;
    Ok(())
}

/// "Start from repo" project flow: clone a repo into `<parent_dir>/<repo-name>`
/// and scaffold the `.superconsole/{agents,skills,context}` structure. Returns
/// the cloned project path. (No `.superconsole-plugin` — that's only for the
/// agent-authoring import; a plain project start doesn't define an agent.)
pub fn scaffold_project_from_repo(
    parent_dir: &str,
    repo: String,
    git_ref: String,
) -> Result<String, String> {
    let (slug, ref_from_url) = parse_repo_input(&repo)?;
    let git_ref = if git_ref.trim().is_empty() {
        ref_from_url.unwrap_or_else(|| "main".to_string())
    } else {
        git_ref
    };
    let name = slug.rsplit('/').next().unwrap_or("repo").to_string();
    let dest = Path::new(parent_dir).join(&name);
    let dest_str = dest.to_string_lossy().to_string();
    clone_repo_into(&slug, &git_ref, &dest_str)?;
    for d in ["agents", "skills", "context"] {
        std::fs::create_dir_all(dest.join(".superconsole").join(d)).map_err(|e| e.to_string())?;
    }
    Ok(dest_str)
}

/// Shallow-clone a GitHub repo into `dest`. If `dest` already has files we clone
/// into a temp dir and copy the contents in (keeping the project folder intact).
fn clone_repo_into(repo_slug: &str, git_ref: &str, dest: &str) -> Result<(), String> {
    let url = format!("https://github.com/{}.git", repo_slug.trim_matches('/'));
    let dest_path = Path::new(dest);
    let empty = std::fs::read_dir(dest_path)
        .map(|mut d| d.next().is_none())
        .unwrap_or(true);

    let run_clone = |target: &Path| -> Result<(), String> {
        let out = std::process::Command::new("git")
            .env("PATH", crate::pty::enriched_path())
            .args([
                "clone",
                "--depth",
                "1",
                "--branch",
                git_ref,
                &url,
                &target.to_string_lossy(),
            ])
            .output()
            .map_err(|e| format!("git clone failed to start: {}", e))?;
        if !out.status.success() {
            return Err(format!(
                "git clone failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    };

    if empty {
        std::fs::create_dir_all(dest_path).map_err(|e| e.to_string())?;
        run_clone(dest_path)?;
    } else {
        let tmp = std::env::temp_dir().join(format!("sc-import-{}", Ulid::new()));
        run_clone(&tmp)?;
        // Merge clone contents into the existing project dir (skip .git).
        for entry in std::fs::read_dir(&tmp).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_name() == ".git" {
                continue;
            }
            let target = dest_path.join(entry.file_name());
            if entry.path().is_dir() {
                copy_dir_all(&entry.path(), &target)?;
            } else {
                std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
            }
        }
        std::fs::remove_dir_all(&tmp).ok();
    }
    Ok(())
}

fn copy_dir_all(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Shared materialization for both the catalog and direct-repo installs.
async fn install_input(ws_path: &str, input: &CatalogAgentInput) -> Result<(), String> {
    let client = reqwest::Client::new();
    let name = input.name.clone();
    let repo = input.repo.clone();
    let git_ref = input.git_ref.clone();
    let files = input.files.clone();

    safe_name(&name)?;
    let agent_folder = agents_dir(ws_path).join(&name);
    let skills_dir = Path::new(ws_path).join(".superconsole").join("skills");
    let base = input.base_path.trim_matches('/');

    let mut instructions_body: Option<String> = None;
    for entry in &files {
        // Optional `src>dest` rename (e.g. `README.md>agent.md`).
        let (src, dest) = match entry.split_once('>') {
            Some((s, d)) => (s.trim().to_string(), d.trim().to_string()),
            None => (entry.trim().to_string(), entry.trim().to_string()),
        };
        for p in [&src, &dest] {
            if p.contains("..") || p.starts_with('/') {
                return Err(format!("unsafe file path in catalog: {}", p));
            }
        }
        // base_path may be empty (files at repo root); avoid a double slash.
        let prefix = if base.is_empty() {
            String::new()
        } else {
            format!("{}/", base)
        };
        let url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}{}",
            repo.trim_matches('/'),
            git_ref,
            prefix,
            src
        );
        let resp = client
            .get(&url)
            .header("User-Agent", "SuperConsole")
            .send()
            .await
            .map_err(|e| format!("fetch {} failed: {}", src, e))?;
        if !resp.status().is_success() {
            return Err(format!("fetch {} failed: {}", src, resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

        // The instructions file becomes a freshly generated agent.md (below).
        if dest == "agent.md" {
            instructions_body = Some(body_after_frontmatter(&String::from_utf8_lossy(&bytes)));
            continue;
        }
        // `skills/**` land in the project skill dir; everything else in the
        // agent folder, preserving sub-paths.
        let dest_path = match dest.strip_prefix("skills/") {
            Some(skill_rel) => skills_dir.join(skill_rel),
            None => agent_folder.join(&dest),
        };
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;
    }

    // Write a valid agent.md so the agent works in our ecosystem regardless of
    // the source repo's format.
    let agent = Agent {
        name: name.clone(),
        description: input.description.clone(),
        skills: input.skills.clone(),
        connectors: input.connectors.clone(),
        context: Vec::new(),
        instructions: instructions_body.unwrap_or_default(),
        folder_path: String::new(),
        readme: None,
    };
    std::fs::create_dir_all(&agent_folder).map_err(|e| e.to_string())?;
    std::fs::write(agent_folder.join("agent.md"), build_agent_md(&agent)).map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Turso metadata sync — project_agents
//
// Mirrors the local `agents` table to Turso so metadata (last_run, schedule,
// defaults) can be restored cross-device alongside the agent.md files from git.
// The table is keyed by (project_id, name); `id` is a ULID generated locally.
// Content (instructions) is NEVER stored here — always lives in agent.md.
// ---------------------------------------------------------------------------

pub async fn ensure_agent_index_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS project_agents (\
            id TEXT PRIMARY KEY NOT NULL, \
            project_id TEXT NOT NULL, \
            name TEXT NOT NULL, \
            description TEXT NOT NULL DEFAULT '', \
            schedule TEXT NOT NULL DEFAULT '', \
            default_run_mode TEXT NOT NULL DEFAULT 'cli', \
            default_cli TEXT NOT NULL DEFAULT 'claude', \
            default_provider TEXT NOT NULL DEFAULT 'anthropic', \
            default_model TEXT NOT NULL DEFAULT '', \
            skills TEXT NOT NULL DEFAULT '', \
            connectors TEXT NOT NULL DEFAULT '', \
            is_active INTEGER NOT NULL DEFAULT 1, \
            last_run TEXT, \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS project_agents_unq \
         ON project_agents (project_id, name)",
        vec![],
    )
    .await?;
    Ok(())
}

/// Push one agent's metadata to Turso after a local save.
/// `project_id` is the workspace's cloud ULID; silently no-ops if not linked.
#[allow(clippy::too_many_arguments)]
pub async fn push_agent_to_cloud(
    app: &tauri::AppHandle,
    project_id: Option<&str>,
    local_id: &str,
    name: &str,
    description: &str,
    schedule: &str,
    default_run_mode: &str,
    default_cli: &str,
    default_provider: &str,
    default_model: &str,
    skills: &str,
    connectors: &str,
    is_active: bool,
    last_run: Option<&str>,
) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else { return };
    let client = reqwest::Client::new();
    if ensure_agent_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO project_agents \
            (id, project_id, name, description, schedule, default_run_mode, \
             default_cli, default_provider, default_model, skills, connectors, \
             is_active, last_run, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(project_id, name) DO UPDATE SET \
            description      = excluded.description, \
            schedule         = excluded.schedule, \
            default_run_mode = excluded.default_run_mode, \
            default_cli      = excluded.default_cli, \
            default_provider = excluded.default_provider, \
            default_model    = excluded.default_model, \
            skills           = excluded.skills, \
            connectors       = excluded.connectors, \
            is_active        = excluded.is_active, \
            last_run         = COALESCE(excluded.last_run, project_agents.last_run), \
            updated_at       = excluded.updated_at",
        vec![
            Some(local_id.to_string()),
            Some(project_id.to_string()),
            Some(name.to_string()),
            Some(description.to_string()),
            Some(schedule.to_string()),
            Some(default_run_mode.to_string()),
            Some(default_cli.to_string()),
            Some(default_provider.to_string()),
            Some(default_model.to_string()),
            Some(skills.to_string()),
            Some(connectors.to_string()),
            Some(if is_active { "1" } else { "0" }.to_string()),
            last_run.map(|s| s.to_string()),
            Some(ts),
        ],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

/// Delete one agent's Turso row after a local delete.
pub async fn delete_agent_from_cloud(
    app: &tauri::AppHandle,
    project_id: Option<&str>,
    name: &str,
) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else { return };
    let client = reqwest::Client::new();
    if ensure_agent_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM project_agents WHERE project_id = ? AND name = ?",
        vec![Some(project_id.to_string()), Some(name.to_string())],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

/// Fetch all agent index rows for a project from Turso (used by the sync layer).
#[allow(dead_code)]
pub async fn fetch_cloud_agents(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    project_id: &str,
) -> Vec<(String, String, String, String, String, String, String, String, String, bool, Option<String>)> {
    // Returns: (name, description, schedule, run_mode, cli, provider, model, skills, connectors, is_active, last_run)
    if ensure_agent_index_table(client, cfg).await.is_err() {
        return Vec::new();
    }
    let Ok(result) = cloud::turso_execute(
        client,
        cfg,
        "SELECT name, description, schedule, default_run_mode, default_cli, \
                default_provider, default_model, skills, connectors, is_active, last_run \
         FROM project_agents WHERE project_id = ? ORDER BY name",
        vec![Some(project_id.to_string())],
    )
    .await
    else {
        return Vec::new();
    };
    cloud::rows(&result)
        .iter()
        .map(|row| {
            (
                cloud::cell_text(row, 0),           // name
                cloud::cell_opt(row, 1).unwrap_or_default(), // description
                cloud::cell_opt(row, 2).unwrap_or_default(), // schedule
                cloud::cell_opt(row, 3).unwrap_or_else(|| "cli".to_string()), // run_mode
                cloud::cell_opt(row, 4).unwrap_or_else(|| "claude".to_string()), // cli
                cloud::cell_opt(row, 5).unwrap_or_else(|| "anthropic".to_string()), // provider
                cloud::cell_opt(row, 6).unwrap_or_default(), // model
                cloud::cell_opt(row, 7).unwrap_or_default(), // skills
                cloud::cell_opt(row, 8).unwrap_or_default(), // connectors
                cloud::cell_text(row, 9) == "1",    // is_active
                cloud::cell_opt(row, 10),            // last_run
            )
        })
        .collect()
}
