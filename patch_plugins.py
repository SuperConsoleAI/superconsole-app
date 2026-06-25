import sys

def patch():
    with open('src-tauri/src/plugins.rs', 'r') as f:
        content = f.read()
    
    old_record = "db.record_installed_plugin(scope, scope_id, &entry.id, &entry.version)?;"
    new_record = "db.record_installed_plugin(scope, scope_id, entry)?;"
    content = content.replace(old_record, new_record)

    rules_install_block = """
    // ── 5. Install Rules ───────────────────────────────────────────────────────
    let rules: Vec<String> = serde_json::from_str(&entry.rules_url).unwrap_or_default();
    for rule_url in rules {
        if let Ok(resp) = client.get(&rule_url).send().await {
            if let Ok(rule_content) = resp.text().await {
                // name from URL
                let slug = rule_url.split('/').last().unwrap_or("rule.mdc").replace(".mdc", "");
                let _ = crate::rules::write_rule(&base_path, &slug, &rule_content);
            }
        }
    }
"""
    if "5. Install Rules" not in content:
        content = content.replace(
            "// ── 5. Record installation",
            rules_install_block + "\n    // ── 6. Record installation"
        )
    
    with open('src-tauri/src/plugins.rs', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    patch()
