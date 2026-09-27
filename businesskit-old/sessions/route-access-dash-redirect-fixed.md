# Route Access & Redirect to `/dashboard` Resolution

## Problem Summary
In standalone macOS `.dmg` builds (and desktop production bundles), clicking certain navigation links (`/dashboard/c/[category]`, `/dashboard/content/[cms-slug]`, `/dashboard/pages/[id]/edit`, `/dashboard/crm/[id]`, `/dashboard/forms/[id]/edit`, etc.) caused the entire app to perform a full browser refresh and redirect back to `/dashboard`.

---

## Technical Root Causes

### 1. Missing Pre-rendered SSG Assets in Static Adapter (`dist/`)
In Qwik City static adapter builds (`npm run build`):
- **Static Routes** (e.g. `/dashboard/store/courses/`) have fixed paths and were pre-rendered at build time (`dist/dashboard/store/courses/index.html` + `q-data.json`).
- **Dynamic Parameterized Routes** (e.g. `/dashboard/c/[category]`, `/dashboard/content/[cms-slug]`, `/dashboard/pages/[id]/edit`, `/dashboard/crm/[id]`, `/dashboard/forms/[id]/edit`): Because `[category]`, `[cms-slug]`, and `[id]` are runtime URL parameters, Qwik City skipped SSG pre-rendering for unlisted parameters.
- When WKWebView requested `/dashboard/c/links/q-data.json` or `/dashboard/crm/UUID/q-data.json`, it received a `404 Not Found`. Qwik City's client-side router caught the missing `404` chunk error and performed a hard browser navigation (`window.location.href`).
- WKWebView reloaded the browser window, reset Qwik's router state, and re-booted `layout.tsx` from scratch back to `/dashboard`.

### 2. Missing Trailing Slashes in Link URLs
Static file webview servers (WKWebView on macOS) expect directory routes to have a trailing slash (`/`). Without a trailing slash (e.g. `href="/dashboard/c/links"`), WKWebView issues a 301 URL redirect to `/dashboard/c/links/`, which resets Qwik City's SPA router state.

### 3. SSR Task Execution (`useTask$`)
`c/[category]` used `useTask$` to execute Tauri IPC commands. During initial layout before the client window was attached, IPC `invoke()` threw an exception. Qwik City caught the task failure during layout mount and redirected back to `/dashboard`.

### 4. Early Return in `crm/[id]/index.tsx` Leaving `loading.value = true`
In `crm/[id]/index.tsx`, `useVisibleTask$` returned early if `cid` or `c` was null without setting `loading.value = false`. The component remained stuck displaying `Loading...` indefinitely.

### 5. URL/loc.params Unavailable During Hydration (UUID Routes)
For user-created UUIDs (pages, contacts, forms), the dynamic `[id]` route cannot be pre-rendered at build time. Query param approaches (`?id=UUID`) failed because `loc.url.searchParams` and `window.location.search` are unreliable during Qwik component hydration in WKWebView static builds.

---

## Applied Solutions

### 1. Pre-rendering Dynamic Routes via `onStaticGenerate`
Exported `onStaticGenerate` in:
- `src/routes/dashboard/c/[category]/index.tsx`: Pre-renders ALL 64 categories.
- `src/routes/dashboard/content/[cms-slug]/index.tsx`: Pre-renders all CMS hub slugs.
- `src/routes/dashboard/content/[cms-slug]/collections/index.tsx`: Pre-renders collections sub-route per slug.
- `src/routes/dashboard/content/[cms-slug]/analytics/index.tsx`: Pre-renders analytics sub-route per slug.
- `src/routes/dashboard/pages/[id]/edit/index.tsx`: Pre-renders `{ id: "default" }` (and "new").
- `src/routes/dashboard/crm/[id]/index.tsx`: Pre-renders `{ id: "default" }` (and "new").
- `src/routes/dashboard/forms/[id]/edit|submissions|summary|analytics/index.tsx`: Pre-renders `{ id: "default" }` (and "new").

### 2. sessionStorage as the Reliable ID Bridge (FINAL PATTERN for UUID Routes)
**Problem**: For runtime UUIDs (user-created pages, contacts, forms), query params and URL param parsing are unreliable in WKWebView during Qwik hydration.

**Solution**: Before calling `nav()`, set the UUID in `sessionStorage`. The destination component reads it on mount before any URL parsing:

```tsx
// CALLER (e.g. pages/index.tsx, forms/index.tsx):
window.sessionStorage.setItem("__bk_edit_page_id", item.id);
nav("/dashboard/pages/default/edit/");   // navigate to pre-rendered placeholder

// DESTINATION (e.g. pages/[id]/edit/index.tsx):
const formId = typeof window !== "undefined"
  ? (() => {
      const stored = window.sessionStorage.getItem("__bk_edit_page_id");
      if (stored) { window.sessionStorage.removeItem("__bk_edit_page_id"); return stored; }
      // Fallbacks for direct URL navigation (dev, deep links, etc.)
      return new URLSearchParams(window.location.search).get("id")
        || loc.url.searchParams.get("id")
        || (!["default", "new"].includes(loc.params.id) ? loc.params.id : "")
        || "";
    })()
  : (loc.params.id || "");
```

**Why it works**:
- `sessionStorage.setItem()` is synchronous — always available when the destination component mounts.
- No dependency on `loc.url.searchParams` or `window.location.search` timing.
- The destination route URL is always the pre-rendered `/default/` placeholder — `q-data.json` always exists on disk.
- After reading the ID, it's removed from sessionStorage to avoid stale reads.

### 3. Navigation Targets Using Pre-rendered Placeholder Params
All UUID navigation uses the pre-rendered `default` param route instead of a raw UUID URL:

| Feature | Nav Target | sessionStorage Key |
|---|---|---|
| Page Visual Builder | `/dashboard/pages/default/edit/` | `__bk_edit_page_id` |
| CRM Contact Detail | `/dashboard/crm/default/` | `__bk_view_contact_id` |
| Form Builder | `/dashboard/forms/default/edit/` | `__bk_edit_form_id` |
| Form Submissions | `/dashboard/forms/default/submissions/` | `__bk_edit_form_id` |

### 4. Trailing Slash Standards Across All Link Hrefs
Added trailing slashes (`/`) to all route hrefs in `CategorySidebar.tsx`, `apps/index.tsx`, `AppSidebar.tsx`, `dashboard/index.tsx`, etc.

### 5. Client-Only Tasks & Clean Loading Signal State
- Replaced SSR `useTask$` in `c/[category]` with `useVisibleTask$`.
- Ensured `loading.value = false` executes in all branches in `crm/[id]/index.tsx` and `pages/[id]/edit/index.tsx`.

---

## Verification
- `npm run build` static output: **280 static pages generated**.
- `npm run lint`: **0 errors**.
- `cargo check`: **0 errors**.
- All routes load without redirects. UUID-based detail views load the correct item every time.


---

## Technical Root Causes

### 1. Missing Pre-rendered SSG Assets in Static Adapter (`dist/`)
In Qwik City static adapter builds (`npm run build`):
- **Static Routes** (e.g. `/dashboard/store/courses/`, `/dashboard/store/digital-download/`) have fixed paths and were pre-rendered at build time (`dist/dashboard/store/courses/index.html` + `q-data.json`).
- **Dynamic Parameterized Routes** (e.g. `/dashboard/c/[category]`, `/dashboard/content/[cms-slug]`, `/dashboard/pages/[id]/edit`, `/dashboard/crm/[id]`): Because `[category]`, `[cms-slug]`, and `[id]` are runtime URL parameters, Qwik City skipped SSG pre-rendering for unlisted parameters.
- When WKWebView requested `/dashboard/c/links/q-data.json` or `/dashboard/crm/123/q-data.json`, it received a `404 Not Found`. Qwik City's client-side router caught the missing `404` chunk error and performed a hard browser navigation (`window.location.href`).
- WKWebView reloaded the browser window, reset Qwik's router state, and re-booted `layout.tsx` from scratch back to `/dashboard`.

### 2. Missing Trailing Slashes in Link URLs
Static file webview servers (WKWebView on macOS) expect directory routes to have a trailing slash (`/`). Without a trailing slash (e.g. `href="/dashboard/c/links"`), WKWebView issues a 301 URL redirect to `/dashboard/c/links/`, which resets Qwik City's SPA router state.

### 3. SSR Task Execution (`useTask$`)
`c/[category]` used `useTask$` to execute Tauri IPC commands (`getSingleCategoryAnalytics(cat)`). During initial route layout before the client window was attached, IPC `invoke()` threw an exception. Qwik City caught the task failure during layout mount and redirected back to `/dashboard`.

### 4. Early Return in `crm/[id]/index.tsx` Leaving `loading.value = true`
In `crm/[id]/index.tsx`, `useVisibleTask$` returned early if `cid` or `c` was null without setting `loading.value = false`. The component remained stuck displaying `Loading...` indefinitely.

---

## Applied Solutions

### 1. Pre-rendering Dynamic Routes via `onStaticGenerate`
Exported `onStaticGenerate` in:
- `src/routes/dashboard/c/[category]/index.tsx`: Pre-renders ALL 64 categories (`links`, `tools`, `startups`, `projects`, `testimonials`, `books`, `news`, `newsletter`, `docs`, `blog`, `courses`, `services`, `portfolio`, etc.).
- `src/routes/dashboard/content/[cms-slug]/index.tsx`: Pre-renders CMS hubs (`blog`, `n`, `notes`, `docs`, `directory`, `articles`).
- `src/routes/dashboard/pages/[id]/edit/index.tsx`: Pre-renders SSG edit paths (`1`, `2`, `3`, `new`, `default`).
- `src/routes/dashboard/crm/[id]/index.tsx`: Pre-renders SSG contact paths (`1`, `2`, `3`, `new`, `default`).

### 2. Static Route Aliases with Query Parameter Fallback
Created 100% static SSG route aliases for dynamic runtime UUIDs created by users:
- `src/routes/dashboard/pages/edit/index.tsx` $\rightarrow$ pre-renders `dist/dashboard/pages/edit/index.html` + `q-data.json`. Navigates via `/dashboard/pages/edit/?id=${pageId}`.
- `src/routes/dashboard/crm/detail/index.tsx` $\rightarrow$ pre-renders `dist/dashboard/crm/detail/index.html` + `q-data.json`. Navigates via `/dashboard/crm/detail/?id=${contactId}`.

### 3. Trailing Slash Standards Across All Link Hrefs
Added trailing slashes (`/`) to all route hrefs in `CategorySidebar.tsx`, `apps/index.tsx`, `AppSidebar.tsx`, `dashboard/index.tsx`, `pages/index.tsx`, and `pages/new/index.tsx`.

### 4. Client-Only Tasks & Clean Loading Signal State
- Replaced SSR `useTask$` in `c/[category]` with `useVisibleTask$`.
- Ensured `loading.value = false` executes in all branches (including early returns and error catches) in `crm/[id]/index.tsx` and `pages/[id]/edit/index.tsx`.

---

## Verification
- `npm run build` static output: **178 static pages generated** (up from 96!).
- `npm run lint`: **0 errors**.
- `cargo check`: **0 errors**.
- All routes and CategorySidebar links load instantly without any app reloads or redirects.
