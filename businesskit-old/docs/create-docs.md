Analyze my entire codebase and create these 5 files in `docs/`:

1. ARCHITECTURE.md

- How the app is structured (Qwik SSG Frontend + Tauri v2 Rust Backend)
- Data flow between routes, components, `ipc.ts`, Rust commands, and `TursoConn` (Central DB & UserDB)
- Key architectural decisions (BYODB model, custom HTTP `TursoConn` with `webpki-roots` for mobile sandbox TLS, OS Keychain + encrypted file fallback, `ready_profiles` session cache, schema auto-provisioning)
- Diagram of folder structure with purpose of each folder (`src/`, `src-tauri/`, `adapters/`, `docs/`, etc.)

2. CONTEXT.md

- Qwik-specific SSG patterns used (signals, `useVisibleTask$`, tracking `activeProfileId`, prohibition of `routeLoader$` / `routeAction$` / `server$`)
- Tauri v2 bindings and constraints (cross-platform macOS/iOS/Android/Windows, scoped permissions in `tauri.conf.json`, `tauri.ios.conf.json`, `tauri.android.conf.json`, asset protocol, SPA navigation rules)
- Environment variables (`.env`, `ENCRYPTION_SECRET`, build-time injection)
- Gotchas and workarounds specific to this codebase (Qwik closure serialization code(14) error workaround, system CA store missing in mobile sandbox, `window.location.href` prohibited, provision status gate)
- How to run, build, and deploy commands across desktop and mobile

3. CODEBASE.md

- Every important file with a concise description
- Dependency graphs between Frontend IPC, Tauri commands, and DB/Turso layers
- Entry points for each major feature (Auth/OAuth, DB Provisioning & Profile switching, Analytics, Social, Media, CRM, Forms, etc.)
- What to NOT touch and why (e.g. `TursoConn` TLS setup, `businesskit-web` reference code, `schema_version.rs` runner contract, `ipc.ts` payload structure)
- Format so an AI agent can find the right file without reading everything

4. DESIGN_PRINCIPLES.md

- Coding conventions used in this project (Rust safety, TS strict types matching Rust `snake_case`, comment banners on top of files)
- Naming patterns for files, components, functions, IPC commands
- Layout and styling standards (`design-system.ts`, 2rem padding / 3rem top-left margin)
- State management approach (`AppContext`, `useSignal`, Rust `AppState` with `RwLock`)
- Error handling patterns (Rust `Result<T, String>`/`anyhow`, frontend try/catch around IPC calls)
- What patterns to avoid (`routeLoader$`, `routeAction$`, hardcoded localhost, `window.location.href`, direct closure captures in event listeners, modifying `businesskit-web`)

5. TECH_STACK.md

- Every library and why it was chosen (Tauri v2, Qwik, Rust, reqwest + webpki-roots, aes-gcm/pbkdf2, tiptap, tailwindcss v4, @qwikest/icons)
- Database & Storage services used (Turso HTTP API via custom `TursoConn`, OS Keychain via `keyring`/Data Protection Keychain, local encrypted `.dat` fallback)
- Dev tooling and config files explained (`tauri.conf.json`, `Cargo.toml`, `package.json`, `vite.config.ts`, `tsconfig.json`)
- Version constraints to be aware of (Node >=18, Rust 1.77.2+, Tauri 2.11+, Qwik 1.20+)

Rules:

- Be specific to THIS codebase (Tauri v2 + Qwik multi-platform app), not generic
- Keep each file concise to save tokens
- Use short bullet points, not long paragraphs
- Flag anything that is non-standard or surprising
