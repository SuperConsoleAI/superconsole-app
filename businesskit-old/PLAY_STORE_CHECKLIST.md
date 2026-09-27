# BusinessKit — Play Store Submission Checklist

Use this before every Play Store submission (initial + updates). Check items off in order — each section gates the next.

---

## 1. Build & Config

- [ ] `tauri.android.conf.json` package name matches Play Console listing exactly (cannot be changed after first upload)
- [ ] `versionCode` incremented from last published build; `versionName` bumped (semver)
- [ ] Release keystore is the **same one** used for all prior uploads (Play App Signing enrolled or not — confirm which)
- [ ] `targetSdkVersion` meets Google's current minimum requirement (check Play Console warnings — this changes yearly)
- [ ] Release build run via `npm run android:build:aab` (AAB, not APK) — confirm this is the actual submission command
- [ ] `ENCRYPTION_SECRET` is set in the release build environment — `build.rs` should hard-fail if missing; confirm it actually failed a build with it unset (don't just trust the check exists)
- [ ] No `.env` file or secrets bundled into the APK/AAB — spot check the unpacked bundle if unsure

## 2. Android-Specific Runtime Correctness

- [ ] PTY/terminal features (`start_terminal_session`, xterm.js tabs) are hidden or disabled on Android — these are desktop-only (`cfg(not(any(target_os = "android", target_os = "ios")))`) and calling them on mobile should never be reachable from UI
- [ ] `TursoConn` (`webpki-roots`) TLS actually verified working on a **real Android device**, not just emulator — mobile CA sandbox issues are the whole reason this client exists
- [ ] No `adb reverse tcp:5175` or any dev-tunnel dependency baked into the release build — confirm the app points at production Turso URLs, not localhost
- [ ] `assetProtocol.scope` in `tauri.android.conf.json` restricted to app data paths only
- [ ] Fresh install on a device with no prior app data: profile switch → provisioning gate → schema `run_all()` completes without hanging
- [ ] `sign_out()` on Android actually purges cached `userdb_*.dat` files (test: sign out, check app's data dir is empty of `.dat` files)
- [ ] App survives backgrounding/foregrounding without losing `active_profile_id` or crashing (Android kills backgrounded webviews more aggressively than iOS/desktop)

## 3. Security Review (Google will flag these if wrong)

- [ ] `tauri.conf.json` / android conf permissions are minimal — no `shell:all`, no unused plugin capabilities declared
- [ ] CSP is intentionally `null` for Qwik chunk hydration — be ready to justify this if Google's automated review flags it (rare but happens)
- [ ] No hardcoded API keys, tokens, or fallback encryption keys anywhere in the Rust or TS source going into this build
- [ ] OS Keychain bypass (RAM + `.dat` fallback) doesn't leave decrypted credentials in a world-readable location on Android (should be scoped app-private storage only)

## 4. Play Console Policy Requirements

- [ ] **Data Safety form** filled out — given BYODB model, be precise: BusinessKit itself doesn't hold most business data (it lives in the user's own Turso instance), but Central DB does hold org/profile/license/auth-token data. Declare accordingly — don't under- or over-declare.
- [ ] **Privacy Policy URL** live and accessible (required even for B2B apps)
- [ ] **Permissions declared in manifest match permissions actually used** — Play Console will reject mismatches
- [ ] **Content rating questionnaire** completed (should be low-risk for a business/productivity app, but must be done)
- [ ] **Target audience & content** section — confirm "Business" category, not accidentally flagged as finance/lending app given the accounting features (this can trigger extra scrutiny)
- [ ] If any payment gateway integration (Razorpay/Stripe/UPI) is user-facing on Android, confirm it doesn't route through Google Play Billing in a way that violates Play's billing policy for physical/service goods vs digital goods

## 5. Pre-Submission Smoke Test (do this on a real device, last)

- [ ] Fresh install → sign in (WorkOS) → create/select profile → provisioning completes
- [ ] Create one record in each active vertical (e.g. one shop item, one invoice, one CRM contact) and confirm it persists after force-closing and reopening the app
- [ ] Switch profiles (if multi-profile applies to this account) and confirm no data bleed between UserDBs
- [ ] Sign out → sign back in → confirm `.dat` re-caches correctly and no stale state remains
- [ ] Airplane mode test: app doesn't crash on network loss, shows a sane error instead of a blank screen

## 6. Store Listing Assets

- [ ] App icon — adaptive icon format (foreground + background layers), not just a flat PNG
- [ ] Feature graphic (1024×500)
- [ ] Screenshots — at least 2, ideally showing the dashboard, one vertical (shop/restaurant/stays), and the agent/chat feature as a differentiator
- [ ] Short description (80 chars) and full description finalized, punchy per your usual copy voice — no corporate language
- [ ] Category set to Business (not Finance, unless deliberately chosen for discoverability reasons)

---

**Before hitting submit:** re-run through Section 2 one more time — the Android-specific gotchas (PTY guard, TLS on-device, `.dat` purge) are the ones most likely to pass on desktop/iOS testing but silently break on Android.
