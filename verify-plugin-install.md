Tell Droid:

> In `CustomizePage.tsx`, the plugin Install button does nothing when clicked. Debug and fix:
>
> 1. Check the `onClick` handler on the Install button — is `installPlugin` being called?
> 2. Check `api.installPlugin` — is it invoking the correct Tauri command `install_plugin`?
> 3. Check `plugins.rs::do_install_plugin` — add `eprintln!` at the top to confirm it's being reached
> 4. Check `lib.rs` — is `install_plugin` registered in `generate_handler!`?
> 5. Check browser console (DevTools) for any JS errors on click
> 6. Check Tauri logs for any Rust panics or errors
>
> Fix whatever is broken in the chain. The expected flow is:
>
> ```
> Button onClick
>   → api.installPlugin(workspaceId, pluginId)
>     → invoke("install_plugin", {workspaceId, pluginId})
>       → lib.rs::install_plugin command
>         → plugins.rs::do_install_plugin
>           → writes files to .superconsole/
>           → writes MCP to .mcp.json
>           → returns InstallResult
>   → UI shows success / connector auth step
> ```
>
> Add console.log at each frontend step and eprintln! at each Rust step to find exactly where it breaks. Fix the broken link. `cargo check` and `npm run build` must pass clean.

if org/account file goes to <app_data>/skills/, commands/, hooks/
project go to project folder files

Yes exactly. Clean and consistent:

```
Account/Org plugin install:
  skills   → <app_data>/skills/<name>/SKILL.md
  commands → <app_data>/commands/<name>.md
  hooks    → <app_data>/hooks/<name>.sh
  mcp      → <app_data>/mcp.json (global)
  connector→ account/org connectors_cache (Turso)

Project plugin install:
  skills   → <workspace>/.superconsole/skills/<name>/SKILL.md
  commands → <workspace>/.superconsole/commands/<name>.md
  hooks    → <workspace>/.superconsole/hooks/<name>.sh
  mcp      → <workspace>/.mcp.json (project)
  connector→ project connectors_cache (Turso)
```

**Precedence when agent runs (same as everything else):**

```
project → org → account → global
```

**In `do_install_plugin` — the target path decision:**

```rust
let base_path = match scope.as_str() {
    "project" => format!("{}/.superconsole", workspace.path),
    "org" | "account" => app_data_dir,  // <app_data>/
    _ => return Err("unknown scope".into())
};

// Then:
write_skill(format!("{}/skills/{}", base_path, name), content);
write_command(format!("{}/commands/{}.md", base_path, name), content);
write_hook(format!("{}/hooks/{}.sh", base_path, name), content);

// MCP:
match scope {
    "project" => write_to_project_mcp_json(workspace_path, mcp),
    "org" | "account" => write_to_global_mcp_json(app_data_dir, mcp),
}
```

One `base_path` variable drives everything. Simple.
