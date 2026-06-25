const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// SKILLS
const oldSkillLoop = `        let (slug, github_url) = if let Some(url_str) = skill.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").to_string();
            (slug, url_str.to_string())
        } else if let (Some(slug), Some(url_str)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            (slug.to_string(), url_str.to_string())
        } else {
            continue;
        };`;

const newSkillLoop = `        let (slug, github_url) = if let Some(url_str) = skill.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").to_string();
            (slug, url_str.to_string())
        } else {
            continue;
        };`;

code = code.replace(oldSkillLoop, newSkillLoop);

// COMMANDS
const oldCmdLoop = `        let (slug, github_url) = if let Some(url_str) = cmd.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".md").to_string();
            (slug, Some(url_str.to_string()))
        } else if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            (slug.to_string(), cmd.get("github_url").and_then(|v| v.as_str()).map(|s| s.to_string()))
        } else {
            continue;
        };`;

const newCmdLoop = `        let (slug, github_url) = if let Some(url_str) = cmd.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".md").to_string();
            (slug, Some(url_str.to_string()))
        } else {
            continue;
        };`;

code = code.replace(oldCmdLoop, newCmdLoop);

// HOOKS
const oldHookLoop = `        let (hook_type, github_url) = if let Some(url_str) = hook.as_str() {
            let hook_type = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".sh").to_string();
            (hook_type, url_str.to_string())
        } else if let (Some(hook_type), Some(url_str)) = (hook.get("id").and_then(|v| v.as_str()), hook.get("github_url").and_then(|v| v.as_str())) {
            (hook_type.to_string(), url_str.to_string())
        } else {
            continue;
        };`;

const newHookLoop = `        let (hook_type, github_url) = if let Some(url_str) = hook.as_str() {
            let hook_type = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".sh").to_string();
            (hook_type, url_str.to_string())
        } else {
            continue;
        };`;

code = code.replace(oldHookLoop, newHookLoop);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
