// src/lib/category-context.ts
//
// WHAT:  Shared context between category pages (/dashboard/c/[slug]) and AppTopbar.
//        Allows the category page to push its state (isHidden, seoOpen, slug, profileSlug)
//        UP to the AppTopbar without prop drilling.
//
// HOW:   Provided once in src/routes/layout.tsx (root layout).
//        Category page updates signals on mount / route change.
//        AppTopbar reads signals and renders the 3 action buttons conditionally.
//
// FLOW:
//   Root layout provides context with empty signals
//   Category page useTask$ → updates context signals for current category
//   AppTopbar reads context → shows Hide/SEO/Eye when categorySlug.value is non-empty
//   SEO modal lives in AppTopbar so it's always mounted

import { createContextId, useContext, type Signal, type QRL } from "@builder.io/qwik";
import type { SettingsRow } from "./types";

export interface CategoryContextState {
  /** Current category slug — empty string = not on a category page */
  categorySlug: Signal<string>;
  /** Profile slug — for live preview URL */
  profileSlug: Signal<string>;
  /** Profile title — for SEO modal label */
  profileTitle: Signal<string>;
  /** Whether this category is hidden on the public profile */
  isHidden: Signal<boolean>;
  /** SEO modal open state — AppTopbar controls, category page reads */
  seoOpen: Signal<boolean>;
  /** SEO settings fetched by category page */
  seoSettings: Signal<import("./types").LinkPageRow | SettingsRow | null>;
  /** SEO saving in-flight flag */
  seoSaving: Signal<boolean>;
  /** Callback from category page — called when AppTopbar "Save SEO" is triggered */
  onSeoSave$: Signal<QRL<(data: any) => Promise<void>> | null>;
  /** Callback from category page — called when AppTopbar "Hide on Profile" is toggled */
  onHiddenSave$: Signal<QRL<(hidden: boolean) => Promise<void>> | null>;
  /** Sidebar collapse state */
  sidebarCollapsed: Signal<boolean>;
  /** Tab switch state (Links vs Analytics) shared with topbar */
  activeTab: Signal<"Links" | "Analytics">;
}

export const CategoryCtx = createContextId<CategoryContextState>("bk.category-ctx");

export function useCategoryCtx() {
  return useContext(CategoryCtx);
}
