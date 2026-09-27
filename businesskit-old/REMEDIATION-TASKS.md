# BusinessKit Security Remediation — Claude Code Task List

Source: audit-report.md (5-check audit, Sept 17 2026). Run tasks in order — P0 blocks launch, not just app store submission.

---

## P0 — Launch Blockers (fix before anything else)

### TASK 1: Rotate ENCRYPTION_SECRET and kill the hardcoded fallback

```
In src-tauri/src/commands/auth.rs (lines ~63, ~83) and src-tauri/src/commands/settings.rs (line ~218),
find every instance of:

  option_env!("ENCRYPTION_SECRET").unwrap_or("<hardcoded fallback string>")

Remove the .unwrap_or(...) fallback entirely. Replace with a hard failure:

  option_env!("ENCRYPTION_SECRET")
      .ok_or_else(|| anyhow::anyhow!("ENCRYPTION_SECRET not set at build time"))?

Then in src-tauri/build.rs, add a compile-time check: if ENCRYPTION_SECRET is not present in the
environment during a release build, panic!() with a clear message. Debug builds may warn instead of
panic, but release must never compile without it.

After this: I will generate a brand new ENCRYPTION_SECRET value myself and rotate it in every build
environment (CI, local .env). Do NOT generate the new secret yourself — tell me where every
build environment currently reads it from (CI config, .env, Xcode/Gradle build settings) so I can
update all of them.

Report every file changed and every place the old secret needs to be replaced.
```

**Manual step after this task runs**: generate a new secret, update it everywhere Claude Code lists, and treat the old value as permanently compromised — anything encrypted with it needs re-encryption on next credential refresh.

---

### TASK 2: Purge git-tracked secrets and rotate the signing key

```
1. Remove these from git tracking (but keep locally if needed):
   - src-tauri/tauri.key
   - src-tauri/tauri.key.pub
   - src-tauri/centraldb.sqlite
   - src-tauri/user_db.sqlite
   - src-tauri/gen/apple/assets/user_db.sqlite

   Use: git rm --cached <path> for each, then commit the removal.

2. Add to .gitignore (root and src-tauri/.gitignore as appropriate):
   *.key
   *.sqlite
   centraldb.sqlite
   user_db.sqlite

3. Create .env.example in the project root listing every required env var
   (ENCRYPTION_SECRET, TURSO_CENTRAL_URL, TURSO_CENTRAL_TOKEN, WorkOS client ID/secret, etc.)
   with placeholder values only — no real secrets.

4. Do NOT rewrite git history (rewriting history on a shared repo causes more damage than it
   fixes) unless I explicitly ask for that separately. For now just stop tracking these files
   going forward.

Report exactly which files were untracked and confirm the new .gitignore entries.
```

**Manual step after this task runs**: generate a new Tauri updater mini-sign key pair (`tauri signer generate`), store the private key only in CI secrets, and treat the old key as compromised — any release signed with it should not be trusted going forward.

---

### TASK 3: Fix cross-tenant authorization bypass in switch_project

```
In src-tauri/src/commands/organization.rs, switch_project(profile_id) (around line 1126) and
connect_from_keychain() currently fetch and decrypt credentials for ANY profile_id passed in,
without checking that the authenticated caller owns or has team access to that profile.

Fix: before fetching credentials from Central DB, add an ownership check:

1. Get the current authenticated user_id from state.auth_session (or wherever the session lives).
2. Query Central DB: does this user_id own the organization that profile_id belongs to, OR does
   a team_members-style table show this user_id has access to profile_id?
3. If neither check passes, return Err("not authorized for this profile") immediately —
   do not proceed to fetch or decrypt any credentials.

Apply the same check to every other IPC command that accepts a profile_id or organization_id
directly from the frontend and uses it to fetch data — not just switch_project. Grep for
profile_id: String and organization_id: String across src-tauri/src/commands/ and list every
command that takes one as a parameter, then tell me which ones already have an ownership check
and which don't.

This is the most severe finding in the audit — do not skip verification. After the fix, show me
the exact diff for switch_project so I can confirm the check is correct before moving on.
```

**Manual step**: review this diff yourself before merging — this is the finding with the highest blast radius (full cross-tenant DB access), worth reading line by line rather than trusting the fix blind.

---

## P1 — High Severity (fix before public app store submission)

### TASK 4: Lock down CSP and asset protocol scope

```
In src-tauri/tauri.conf.json:

1. Replace "csp": null with:
   "csp": "default-src 'self' tauri: asset:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' asset: https: data: blob:; connect-src 'self' ipc: https:;"

2. Change assetProtocol.scope from ["**"] to a specific list of directories the app actually
   needs to read assets from (e.g. app data dir, bundled resources) — not a wildcard covering
   the whole filesystem.

Test the app after this change — CSP violations can silently break things like inline styles
or font loading. Report anything that broke and needed a CSP adjustment.
```

### TASK 5: Fix Cloudflare Worker plaintext secret bindings

```
In src-tauri/src/deploy/cloudflare.rs (around line 414-419), change the binding type for
TURSO_TOKEN and ENCRYPTION_SECRET from "plain_text" to "secret_text" in the Cloudflare Workers
deployment payload. Confirm PROFILE_ID and DEPLOY_MODE can safely stay as plain_text (they're
not credentials) but TURSO_URL should also be reviewed — if it's a full connection string with
embedded auth, it needs secret_text too; if it's just a hostname, plain_text is fine.

Report the final binding list with types.
```

### TASK 6: Complete logout cleanup

```
In src-tauri/src/commands/auth.rs, sign_out() (around line 475), add:

1. Delete every cached userdb_{profile_id}.dat file for all profiles this session touched
   (not just the active one) from every credential cache directory.
2. Clear state.ready_profiles.write().await.clear()
3. Set *state.user_db.write().await = None
4. Set *state.active_profile_id.write().await = None (if not already done)

Confirm the existing session file deletion (workos_session.dat) still happens, and that all of
this runs even if one step fails (don't let a missing file cause the whole logout to error out —
log and continue).

Report the updated sign_out() function.
```

### TASK 7: Validate file paths in bank statement import

```
In src-tauri/src/commands/fin/bank.rs, fin_import_bank_statement_from_path (around line 164),
the file_path parameter from IPC is passed directly to std::fs::read_to_string without validation.

Fix: use the Tauri dialog plugin's file picker on the frontend so the path comes from a native
file dialog (which returns a path the user explicitly selected) rather than an arbitrary string
typed or constructed by JS. As defense in depth, also canonicalize the path server-side and
reject anything that resolves outside expected document/download directories, and reject any
path containing ".." segments before canonicalization.

Report the updated command and confirm the frontend caller uses the file dialog.
```

---

## P2 — Medium/Low (hardening, not blockers)

### TASK 8: Replace blind process kill on port 4666

```
In src-tauri/src/commands/auth.rs (around line 380-396), remove the lsof + kill -9 logic that
terminates any process on port 4666. Instead: try binding to port 4666 first; if that fails
(port in use), bind to port 0 (OS picks a free port), read back the actual bound port, and use
that port when constructing the OAuth redirect URI passed to WorkOS.

Confirm WorkOS's redirect URI allowlist supports this (may need a wildcard port pattern or a
fixed small set of fallback ports registered in the WorkOS dashboard — tell me which if so).
```

### TASK 9: Add retry/backoff to TursoConn

```
In src-tauri/src/db/turso.rs, TursoConn::query, execute, and execute_statements: add retry logic
for HTTP 429 and transient 502/503 responses. 3 attempts, exponential backoff with jitter
(e.g. 200ms, 800ms, 2000ms +/- random jitter). Do not retry on 4xx errors other than 429
(those are real client errors, not transient).

Report the updated retry wrapper.
```

### TASK 10: Replace window.location.reload() calls

```
Find and replace window.location.reload() in:
- src/routes/layout.tsx:648
- src/routes/dashboard/tax/index.tsx:81
- src/routes/dashboard/crm/deals/index.tsx:251

Replace each with the Qwik-appropriate reactive alternative — re-fetching the relevant signal's
data via useVisibleTask$ re-trigger, or nav(loc.url.pathname) if a full route re-entry is truly
needed. Check what each call site was trying to accomplish (likely refreshing stale state after
a mutation) and use the least disruptive fix — don't add a full navigation if a signal refetch
solves it.

Report each call site's old vs new code.
```

### TASK 11: Clean up debug logging

```
Replace println!/eprintln! with log::debug! or log::trace! in:
- commands/social.rs
- commands/zernio_integration.rs
- commands/jobs.rs
- commands/shop/shop_analytics.rs
- commands/shop/variants.rs
- commands/agents/chat.rs

Also redact PII from existing log::info! calls in auth.rs (lines ~222, ~270) — replace
log::info!("WorkOS auth OK: {} ({})", email, workos_id) with a version that logs only
workos_id, not email.

Remove console.log statements from src/routes/layout.tsx and src/components/JobsForm.tsx
that exist only for development debugging (keep any that are genuinely user-facing feedback
mechanisms, if any — flag those instead of removing).

Report the full list of changed files.
```

### TASK 12: Restrict credential cache to standard app data directory

```
In src-tauri/src/commands/organization.rs, get_cred_cache_dirs() currently writes to 4 fallback
locations including std::env::temp_dir() (/tmp). Remove the temp directory fallback — restrict
writes to dirs::data_local_dir() only, falling back to dirs::data_dir() if that's unavailable,
and $HOME/.businesskit/creds only as a last resort on systems where neither standard dir exists.
Never write credentials to /tmp.

Report the updated directory list and confirm no credential files remain in temp directories
after this change (check if cleanup of previously-written temp files is needed).
```

### TASK 13: Parameterize the one dynamic SQL string

```
In src-tauri/src/commands/team.rs (around line 98), the query:

  format!("SELECT COUNT(DISTINCT email) FROM team_invites WHERE team_id IN ({}) AND status = 'pending'", profile_ids_str)

builds the IN clause via string formatting. Replace with individual placeholders (?1, ?2, ...)
built dynamically to match the number of profile_ids, passed via turso_params![] instead of
string-interpolated into the SQL text — even though the current source is trusted, this
establishes the wrong pattern for future copy-paste.

Report the updated query.
```

---

## Run Order

1. TASK 1 → 2 → 3 (P0, in order — don't parallelize, each may touch overlapping auth code)
2. TASK 4 → 5 → 6 → 7 (P1, can run in any order)
3. TASK 8 → 13 (P2, can run in any order, lowest urgency)

After P0 is done: re-run Check 4 and Check 5 from SECURITY-AUDIT.md to confirm the fixes hold and nothing new opened up.

___________________

Good progress, but three things from earlier are unconfirmed — worth checking before you call this closed:

**1. Port number changed without explanation.** The original audit found the blind kill on port **4666**; this report says Task 8 removed a kill on port **1420** (Tauri's default dev port). Either that's a typo in the report, or Claude Code found and fixed a different/additional instance than the one originally flagged. Ask which — if it's genuinely two separate blind-kill spots, confirm both are gone, not just one.

**2. The `create_project` call-site trace is missing.** I asked Claude Code to trace every internal caller of `switch_project`/`connect_from_keychain` — specifically whether profile creation calls into it before the ownership row (owner_user_id / team_members) actually exists yet. The report doesn't mention checking this at all, only the solo-owner exemption and the pre-cache ordering. This is the scenario most likely to silently break "create a new profile" for every user on next launch. Ask directly:

```
Did you trace every internal caller of switch_project/connect_from_keychain, including 
create_project? Confirm the owner/team row is written before switch_project is invoked internally 
during profile creation — show me that code path specifically.
```

**3. The `gen/apple/assets/user_db.sqlite` question was never answered.** I flagged that this specific file might be a required iOS build asset, not a dev leftover, and asked Claude Code to confirm before untracking it. The Task 2 summary just says "untracked sensitive keys/databases" without addressing that file by name. Ask:

```
For src-tauri/gen/apple/assets/user_db.sqlite specifically — is this referenced as a bundled 
resource in the iOS build (tauri.ios.conf.json or Xcode build phase)? If yes, did untracking it 
break anything for a fresh clone/CI iOS build, or did you keep it tracked?
```

**On "verified"**: `cargo check` and `npm run build` only prove the code compiles — they don't exercise the ownership check at runtime. Before trusting Task 3 is actually correct, manually run the three flows that matter most: sign in and switch between your own existing profiles, create a brand-new profile end-to-end, and (if you have a second test account) try switching to a profile you don't own and confirm it's rejected. That last one is the actual regression test for the vulnerability — nothing in the report shows it was tried.

__________________________

Good — all three answers are specific and traceable, not hand-waved. Quick take on each, plus one more gap worth closing before you call this done.

**Port 4666, create_project flow, and the sqlite asset** — all three check out. The ownership row provably exists before `switch_project` can ever run (profile creation and credential connection happen in Central DB before any switch), so no launch-day regression there. The `.gitkeep` fix for the iOS assets folder is the right minimal move — preserves the directory Xcode needs without keeping the binary tracked.

**One thing to pin down before trusting this fully**: `connect_from_keychain` has two callers — one goes through `switch_project` (which runs `verify_profile_access` first), the other is `connect_from_keychain_pub` called directly from `lib.rs` at app boot to reconnect the last-active profile. Ask directly:

```
Is verify_profile_access enforced INSIDE connect_from_keychain itself, or only in the wrapper 
code inside switch_project before it calls connect_from_keychain? If the check lives in 
switch_project's caller code rather than inside connect_from_keychain, then the boot-time path 
via connect_from_keychain_pub in lib.rs bypasses the ownership check entirely — it would reconnect 
whatever active_profile_id was last cached with zero verification. Confirm which is true and, if 
it's the caller-side version, move the check inside connect_from_keychain so every path through it 
is protected, not just the switch_project path.
```

This matters because boot-time reconnect is exactly the kind of code path that's easy to forget when a fix gets added at the "obvious" call site — and if `active_profile_id` were ever persisted or restored in a way an attacker could influence (even just by tampering with local state), that path skipping the check would silently reopen the original vulnerability.

**Still outstanding from before**: everything verified so far is `cargo check` + `npm run build` — compile success, not a runtime test of the actual security behavior. Before considering Task 3 closed, actually run the negative test: two accounts, try switching account A into account B's profile_id, confirm it's rejected with an error rather than connecting. That's the one test that directly proves the CRITICAL finding is fixed rather than just type-checking.

___________________

The architecture is now correct — one check, one location (`Step 0` inside `connect_from_keychain`), and both callers (`switch_project` and the boot-time path) funnel through it. That closes the gap cleanly; no separate check needed at each call site.

One thing left before calling this closed: the matrix rows for "Cross-Account Switch" and "Tampered Boot Cache" are described as expected outcomes, not confirmed test runs — nothing shows those two scenarios were actually exercised. The 14 passing tests could easily be pre-existing tests unrelated to this fix. Ask directly:

```
Were the "Cross-Account Switch" and "Tampered Boot Cache" rows in the test matrix actually run, or 
are they the expected behavior based on reading the code? If they weren't run: write two new 
integration tests — one calling switch_project with a profile_id owned by a different account and 
asserting it returns Err("Access denied"), and one that seeds ready_profiles/active state as if 
Account B's profile was cached, then calls connect_from_keychain_pub as Account A and asserts it 
also fails. Add both to the test suite, run cargo test again, and show me the new pass count and 
the actual assertion output for those two tests specifically.
```

This is the difference between "the code looks right" and "the vulnerability is provably closed." Everything else in this response is solid — worth landing this last piece before treating Task 3 as done.

_________

This closes the gap well — the 4 new tests directly assert the exact two negative scenarios I asked for, and they pass. The Task 3 fix is now provably correct at the decision-logic level.

One layer still untested, worth naming clearly (not necessarily blocking, but you should know it exists): these tests call `evaluate_profile_access` directly with hand-constructed arguments — synthetic user IDs, org owner IDs, a hardcoded `false`/`true` for team membership. That proves the *logic* is correct: given "these are the facts," it correctly allows or denies. It does **not** test the part that actually matters in production — whether `verify_profile_access` correctly **fetches** those facts from Central DB in the first place. A bug in the SQL query, a wrong column name, a join that silently returns the wrong `owner_user_id` — none of that would be caught by these tests, because the tests never touch the database.

Worth one more ask if you want this fully closed rather than 95% closed:

```
The 5 new tests call evaluate_profile_access directly with hand-built arguments — they test the 
decision logic, not the data-fetching wrapper verify_profile_access that queries Central DB. Is 
there an integration test that actually calls verify_profile_access (not the pure function) against 
a real or test Central DB instance, seeded with two distinct accounts/profiles, and confirms it 
fetches the correct owner_user_id/team_members and produces the right Ok/Err? If not, that's the 
one remaining gap — the query itself has never been exercised end-to-end.
```

If that's more than you want to chase right now, it's a reasonable place to stop — the highest-risk logic is unit-tested and the manual "sign in as two different accounts and try to cross over" test you can just run yourself in five minutes covers the DB-fetch path informally. That manual check is still worth doing before shipping, even with all this automated coverage in place.

______

That closes it. The query breakdown confirms `verify_profile_access` actually fetches from `profiles`, `organizations`, and `team_members` — not hardcoded stand-ins — so the earlier concern about the unit tests being disconnected from real data-fetching is addressed by explanation, even though no new integration test was added against a live DB. That's a reasonable trade-off given the manual test steps now fill that gap directly.

Test 3 in the manual flow is the one that actually matters — running `switch_project` from the browser console with Account B's real profile ID while logged in as Account A. That's the actual proof the CRITICAL finding is fixed, not a simulation of it. Do that one yourself before you consider this shipped. Tests 1 and 2 are good sanity checks that nothing regressed for normal use, but they don't test the vulnerability — only Test 3 does.

If Test 3 rejects cleanly with `Access denied`, all 13 tasks are genuinely done — not just "code compiles," but the one that mattered most is proven end-to-end. If it somehow doesn't reject, stop and report back rather than pushing further, since that would mean the fix has a gap the automated tests didn't catch (e.g. a frontend cache serving stale data before the IPC call even fires).
