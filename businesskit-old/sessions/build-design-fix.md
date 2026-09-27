# Build Design Fix — Confirmed Root Cause

**Date**: September 18, 2026  
**Status**: ✅ Fixed and verified

---

## What Was Broken

Design worked in `npm run tauri dev` but broken in built `.dmg` / `.app`.

---

## Root Cause (Two Issues)

### 1. Content Security Policy — `tauri.conf.json`

The security audit changed `csp: null` to a strict CSP string.
Tauri WKWebView enforces CSP in built apps (not in dev). The strict CSP blocked
Qwik's dynamic `import()` chunk loading used throughout `layout.tsx`.

**Fix**: Restored `"csp": null` and `"scope": ["**"]` — exact v0.0.16 values.

---

### 2. `(hover: none) and (pointer: coarse)` CSS — `global.css`

```css
/* BROKEN — added in v0.0.17/v0.0.18, NOT in v0.0.16: */
@media (max-width: 1024px), (hover: none) and (pointer: coarse) {
  .desktop-only, .hide-on-tablet { display: none !important; }
}
```

Tauri WKWebView on macOS reports `hover: none` + `pointer: coarse` even on
desktop. This hid all `.desktop-only` AppSidebar elements, breaking the layout.

**Fix**: Removed `(hover: none) and (pointer: coarse)`. Use `max-width` only.

---

## Rule for Future Work

> NEVER use `(hover: none) and (pointer: coarse)` for desktop layout detection.
> Tauri WKWebView reports these on ALL platforms regardless of actual input device.
> Use only `max-width` breakpoints for mobile/tablet detection.

---

## Files Changed

| File | Change |
|---|---|
| `src-tauri/tauri.conf.json` | `csp: null`, `scope: ["**"]` — v0.0.16 values |
| `src/global.css` | Removed `(hover: none)` from `.desktop-only` rule |
| `src/global.css` | Google Fonts CDN → `@fontsource/inter` (local, faster) |
| `.github/workflows/release.yml` | Removed redundant `npm run build` before Android |
