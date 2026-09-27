// src/lib/app-context.tsx
//
// WHAT:  Global app context — holds license, org, profiles, active profile.
//
// HOW:   Created once in layout.tsx on mount via invoke().
//        All child routes read from this context — zero re-fetching.
//        Mutations update signals in-place; Qwik reactivity handles re-renders.
//
// FLOW:
//   layout.tsx boots → invoke(get_license_status + get_organization + get_projects)
//     → stores in AppContext signals → all children read via useAppContext()

import { createContextId, type Signal, useContext } from "@builder.io/qwik";
import type { LicenseStatus, Organization, Profile } from "./types";

export interface AppContextState {
  license: Signal<LicenseStatus | null>;
  org: Signal<Organization | null>;
  organizations: Signal<Organization[]>;
  profiles: Signal<Profile[]>;
  activeProfileId: Signal<string | null>;
  installedApps: Signal<string[] | null>;
  theme: Signal<"light" | "dark">;
  loading: Signal<boolean>;
  viewMode: Signal<"grid" | "list">;
  sidebarMode: Signal<"expanded" | "collapsed" | "hidden">;
  agentChatOpen: Signal<boolean>;
  agentChatWidth: Signal<number>;
  sqlRunnerOpen: Signal<boolean>;
  sqlRunnerInitialQuery: Signal<string>;
  appsSearchQuery: Signal<string>;
  mobileSidebarOpen: Signal<boolean>;
}

export const AppContext = createContextId<AppContextState>("bk.app-context");

export function useAppContext() {
  return useContext(AppContext);
}
