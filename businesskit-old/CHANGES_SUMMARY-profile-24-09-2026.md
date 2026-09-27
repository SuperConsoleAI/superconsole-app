# Session Changelog & Summary of Changes

This document provides a complete chronological and technical record of all changes made across this development session from the very start.

---

## 1. Authentication & Onboarding UI Improvements

### `src/global.css`
- **Flexbox Centering for Auth Screen**:
  - Updated `.auth-screen` to `display: flex; align-items: center; justify-content: center; min-height: 100vh; min-height: 100dvh;`.
  - Fixes previous issue where login/onboarding card was stuck at the top of the viewport.
- **Card Padding Reductions**:
  - Decreased desktop `.auth-card` padding from `3rem` to `2rem`.
  - Added a responsive media query (`@media (max-width: 640px)`) setting `.auth-card` padding to `1rem` on mobile devices.

### `src/routes/login/index.tsx`
- **Center-Aligned Header**: Centered the welcome header and subtitle text inside `.auth-card`.
- **Branded Logo**: Replaced placeholder SVG icon with the official `src/assets/businesskit-icon.svg`.
- **Post-Auth Profile Routing**:
  - Updated initial auth check and `auth-changed` event listener to query `getProjects()`.
  - If no projects exist (`projects.length === 0`), navigates directly to `/onboarding`.
  - If projects exist, navigates to `/dashboard`.

### `src/routes/onboarding/index.tsx`
- **Vertical Alignment**: Removed top-offset inline styles (`align-items:flex-start;padding-top:40px`) to align with the centered layout.
- **Logo Update**: Replaced placeholder icon with `src/assets/businesskit-icon.svg`.
- **Subdomain Slug UI**:
  - Changed URL slug input from prefix format (`businesskit.io/my-business`) to subdomain suffix format (`my-business` + `.businesskit.io` on the right).

### `src/routes/create-org/index.tsx`
- **Alignment & Logo**: Removed top-offset inline styles and switched to `src/assets/businesskit-icon.svg`.

### `src/routes/index.tsx`
- **Root Route Guard**:
  - After confirming active license and session, queries `getProjects()`.
  - Routes users with 0 profiles to `/onboarding`, and users with existing profiles to `/dashboard`.

---

## 2. Dashboard No-Profile Modal

### `src/components/NoProfileModal.tsx` *(New Component)*
- Created a popup modal dialog that automatically triggers on the dashboard when a user is logged in but has not yet created any profile (`profiles.length === 0`).
- Features:
  - Clear message: *"No project profile found"*
  - Primary button: *"Create Project Now"* navigating to `/onboarding`.
  - Secondary button: *"Explore Dashboard"* allowing dismiss.

### `src/routes/dashboard/index.tsx`
- Integrated `<NoProfileModal />` conditioned on `!ctx.loading.value && ctx.profiles.value.length === 0`.

---

## 3. Article Preview Modal & Content Table Enhancements

### `src/components/ArticleModal.tsx` *(New Component)*
- Backdrop-blurred modal dialog to preview articles / content rows (cover image, title, read time, date, excerpt, rich HTML body, and CTA button).
- Supports direct actions to close, edit via `ArticleForm`, or open published link.

### `src/components/ProductTable.tsx`
- Added optional `onView$` prop with a view eye button (`LuEye`) in table row actions.

### `src/routes/dashboard/content/[cms-slug]/index.tsx`
- Connected `ArticleModal` with `onView$` and row click handler (`onRowClick$`).

---

## 4. Profile Persistence & Reload Fixes (Tauri Rust Backend + Frontend)

### The Problem
When a user created a profile (and created a blog post), reloading the app redirected them back to `/onboarding`, and `AppSidebar.tsx` showed no profile.

### Root Causes
1. **Rust Fallback Skip in `get_projects`**:
   `get_projects` in `src-tauri/src/commands/organization.rs` only fell back to `db.get_profiles_for_user(&users_id)` if `profiles.is_empty() && org_id.is_empty()`. Since `org_id` was auto-assigned (e.g., `"Personal"`), `org_id.is_empty()` was `false`. When the active org differed from the profile's org, `get_projects` returned an empty list (`[]`).
2. **Profile Creator ID in `create_project`**:
   `create_project` passed `&org.owner_user_id` instead of the authenticated user's ID (`creator_id`).
3. **Database Query Constraints in `src-tauri/src/db/central.rs`**:
   `get_profiles_for_org_and_invites` and `get_profiles_for_user` did not check `p.user_id = ?1` directly across organizations.
4. **Signal Desync in `src/routes/layout.tsx`**:
   During boot, when `switchProject` resolved fresh profiles (`syncedProfiles`), `finalProfiles` was not updated, causing the end-of-boot guard to trigger a redirect to `/onboarding`.

### Changes Applied

#### `src-tauri/src/commands/organization.rs`
- **Fallback across all user profiles**: Removed `org_id.is_empty()` condition in `get_projects`. If the active organization query returns 0 profiles, it now queries `db.get_profiles_for_user(&users_id)` and auto-syncs `state.organization` to that profile's organization.
- **Cached Profile Verification**: Added a check for `cached_pid` (`state.active_profile_id` or `license::load_cached_profile_id()`). If found in Central DB and missing from the list, it is automatically included in the returned profiles.
- **User Ownership in `create_project`**: Set profile `user_id` to `state.get_current_user_id().await` rather than `org.owner_user_id`.

#### `src-tauri/src/db/central.rs`
- **`get_profiles_for_user`**: Expanded SQL to `WHERE p.user_id = ?1 OR o.owner_user_id = ?1 OR (tm.user_id = ?1 AND tm.status = 'accepted')`.
- **`get_profiles_for_org_and_invites`**: Included `p.user_id = ?2` directly in the query to ensure profiles created by the user are always returned.

#### `src/routes/layout.tsx`
- In `runBoot`: When `switchProject` finishes, `finalProfiles` and `profiles.value` are both updated with `syncedProfiles`.
- If profile refetch occurs at the end of boot, `profiles.value` and `activeProfileId.value` are updated immediately to prevent redirecting to `/onboarding`.

#### `src/components/app/AppSidebar.tsx`
- Added fallback: `const activeProfile = ctx.profiles.value.find(pr => pr.id === ctx.activeProfileId.value) || ctx.profiles.value[0];` to ensure that profile name, initials, and avatar are displayed as soon as profiles exist in memory.

---

## 5. Settings Plan Tab: FREE Unlocking & Upgrade Availability

### Requirements
- Profiles on the `FREE` plan should **never** be locked. The 30-day cooldown lock only applies to downgrading paid plans (`PRO`, `BUSINESS`, etc.) to `FREE`.
- Profiles on `FREE` should be able to upgrade to `PRO` (or current subscription tier) at any time as long as premium slots are available.
- Organization admins and owners should be able to manage plan allocations across all workspace profiles.

### Changes Applied

#### `src/routes/dashboard/settings/index.tsx`
- **Locking Rule**: Updated `locked` check so only paid plans can be locked:
  ```typescript
  const isProfPaid = (p.allocated_plan || "FREE").toUpperCase() !== "FREE";
  const locked = isProfPaid && Boolean(p.plan_allocated_at && (now - p.plan_allocated_at < 2592000));
  ```
- **Action Buttons**:
  - Paid profiles: Displays `Locked ({daysLeft}d)` if within 30 days of allocation, or `Downgrade to FREE` if cooldown has passed.
  - Free profiles: Displays `Upgrade to {targetPlan}`. Button is styled with the target plan's accent color and clickable when `hasAvailableSlots > 0`, and disabled if 0 slots remain.
- **Admin Management**: Removed the artificial restriction requiring users to switch active workspace before managing its plan; organization owners/admins can allocate or adjust plans for any profile directly.

---

## 6. Auto-Allocation of PRO Tier on First Profile Creation & Trial Auto-Healing

### Requirements & Issue
- When a user creates an account, a 7-day trial of PRO is activated for the organization and subscription.
- When creating their first profile (or subsequent profiles while slots remain), if the trial or paid subscription is valid, that profile must **automatically get PRO**, not `FREE`.
- Previously, `create_project` read from un-hydrated in-memory `state.license` (which defaulted to `free`), causing the first profile to be created with `allocated_plan = "FREE"`.

### Changes Applied

#### `src-tauri/src/commands/organization.rs`
1. **Unified Plan Resolution (`resolve_effective_plan`)**:
   - Queries Central DB license status for `org.owner_user_id`.
   - Checks active 7-day trial status (`lic.status == "trial"` or `org.subscription_expires_at > now`).
   - If trial is active, evaluates effective tier as **`PRO`** (2 premium slots).
   - If paid plan exists (`BUSINESS`, `PRO`, etc.), evaluates to that tier.
   - If trial has expired and no paid plan exists, falls back to **`FREE`** (0 premium slots).
2. **`get_max_premium_slots`**:
   - `BUSINESS` => 10 slots
   - `PRO` => 2 slots
   - `BASIC` => 1 slot
   - `FREE` / other => 0 slots
3. **`create_project`**:
   - Fetches fresh license status from Central DB via `cdb.get_license_status(&org.owner_user_id)`.
   - Updates `state.license` in memory.
   - Resolves effective tier and available slots.
   - If `effective_tier != "FREE"` and `used_premium_slots < max_premium_slots`, automatically assigns `effective_tier` (`PRO`) with `plan_alloc_ts = now`.
   - Sets in-memory `state.license` to active with the allocated tier immediately upon profile creation.
4. **`auto_heal_first_profile_plan`**:
   - If an existing user has 0 profiles using premium slots but has a valid trial or paid subscription, automatically promotes their first workspace to `PRO` in both Central DB and local User DB.
   - Invoked during `get_projects` and `get_plan_allocations` to seamlessly heal profiles created before this fix.
5. **`get_plan_allocations` & `assign_profile_plan`**:
   - Updated to use the unified `resolve_effective_plan` and `get_max_premium_slots` helpers.
   - Downgrading to `FREE` sets `plan_allocated_at` to `0` so the 30-day lock is never applied to `FREE`.

---

---

## 7. Multi-Account Isolation & Sign-Out Cache Purge

### The Issue
When logging out of one account (`greyscover@gmail.com`) and registering/signing into a brand new account (`awpoint9@gmail.com`), the previous account's workspace profile (*"Alex Hormozi"*) was appearing in the sidebar and topbar of the new account, and the new account was bypassed straight to `/dashboard` instead of showing `/onboarding`.

### Root Causes
1. **Unchecked Profile Injection in `get_projects`**:
   In `src-tauri/src/commands/organization.rs`, `get_projects` attempted to ensure active profiles were not lost by reading `load_cached_profile_id()` from disk (`profile_id.txt`) and pushing it into `profiles` **without checking if the profile belonged to the currently authenticated `users_id`**.
2. **Missing Profile & License Cache Deletion on Sign Out**:
   - `sign_out` in `src-tauri/src/commands/auth.rs` called `clear_user_id()`, but never deleted `profile_id.txt`, `org_id.txt`, or `license_cache.json`.
   - The previous account's profile ID persisted on disk.
3. **Frontend Storage Not Purged on Sign Out**:
   `handleSignOut` in `src/components/app/AppSidebar.tsx` did not purge `localStorage` (`bk-active-profile`, `bk-active-org`) or `sessionStorage` (`bk-window-profile`), nor did it clear context signals.
4. **Boot-Time Profile Restoration**:
   `src-tauri/src/lib.rs` pre-loaded `cached_pid` at boot without verifying whether the cached profile's `user_id` matched the authenticated user.

### Changes Applied

#### 1. Strict Ownership Enforcement in `get_projects` (`src-tauri/src/commands/organization.rs`)
- If `cached_pid` exists, it verifies that `prof.user_id == users_id` or that `users_id` belongs to `prof.organization_id`.
- If the cached profile belongs to a different account, it **immediately purges** `state.active_profile_id` to `None` and deletes `profile_id.txt` from disk via `clear_profile_id()`. It never injects unowned profiles.
- If `profiles.is_empty()`, `state.active_profile_id` is guaranteed `None` and `profile_id.txt` is removed.

#### 2. Complete Sign-Out & Login Sanitization (`src-tauri/src/commands/auth.rs` & `src-tauri/src/license/mod.rs`)
- Added `clear_profile_id()` and `clear_license_cache()` to `license/mod.rs`.
- `sign_out` now purges `profile_id.txt`, `user_id.txt`, `license_cache.json`, and `org_id.txt` across all app storage directories.
- `auth_callback` (sign in / sign up) immediately clears `state.active_profile_id`, `state.user_db`, and deletes any leftover `profile_id.txt` from previous sessions before attaching the new account.

#### 3. Boot-Time Verification (`src-tauri/src/lib.rs`)
- `setup_app` now checks `profile.user_id == cached_uid` before pre-loading any cached profile. If mismatched, it calls `clear_profile_id()`.

#### 4. Frontend Sign-Out & Router Isolation (`src/components/app/AppSidebar.tsx`, `src/routes/layout.tsx`, `src/routes/login/index.tsx`)
- `handleSignOut`: Clears all `bk-*` keys from `localStorage` and `sessionStorage`, and resets `profiles.value = []`, `activeProfileId.value = ""`, `org.value = null`, and `organizations.value = []`.
- `layout.tsx`: `resolvedId` is strictly restricted to IDs present in `finalProfiles`. If `finalProfiles` is empty, storage keys are cleaned up.
- `login/index.tsx`: When `projects.length === 0`, removes stale `bk-active-profile` and navigates to `/onboarding`.

---

## 8. Verification & Build Status
- **TypeScript**: `npm run build.types` passed with 0 errors.
- **Rust Backend**: `cargo check --manifest-path src-tauri/Cargo.toml` and hot rebuild in `tauri dev` succeeded cleanly with 0 errors.
- **Runtime**: `target/debug/businesskit` running and functional.


