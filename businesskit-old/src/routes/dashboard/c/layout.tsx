// src/routes/dashboard/c/layout.tsx
//
// CategorySidebar lives in the ROOT layout.tsx (rendered as a fixed sibling of
// AppSidebar, OUTSIDE the app-content scroll container so position:fixed works
// correctly in WKWebView / Tauri).
//
// This layout is intentionally a pass-through — just satisfies Qwik City's
// nested layout requirement for the /dashboard/c/* route segment.

import { component$, Slot } from "@builder.io/qwik";

export default component$(() => <Slot />);
