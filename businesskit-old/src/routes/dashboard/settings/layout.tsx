import { component$, Slot, useContextProvider, createContextId, useStore, useTask$, $, QRL } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { getProfile } from "~/lib/ipc";
import { useAppContext } from "~/lib/app-context";

export interface SettingsState {
  centralCredentials: any | null;
  connections: any[];
  profile: any | null;
  teamMembers: any[];
  teamInvites: any[];
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;
}

export const SettingsContext = createContextId<SettingsState>("settings_context");

export default component$(() => {
  const appCtx = useAppContext();

  const state = useStore<SettingsState>({
    centralCredentials: null,
    connections: [],
    profile: null,
    teamMembers: [],
    teamInvites: [],
    loading: true,
    error: "",
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    // Wait until root app context has initialized and determined the active profile
    if (!appCtx.activeProfileId.value) return;

    state.loading = true;
    try {
      const [credsRes, connsRes, profileRes, membersRes, invitesRes] = await Promise.all([
        invoke("get_central_credentials").catch((e) => {
          console.error("[settings/layout] get_central_credentials error:", e);
          return null;
        }),
        invoke("list_connections").catch((e) => {
          console.error("[settings/layout] list_connections error:", e);
          return [];
        }),
        getProfile().catch((e) => {
          console.error("[settings/layout] getProfile error:", e);
          return null;
        }),
        invoke("get_team_members").catch((e) => {
          console.error("[settings/layout] get_team_members error:", e);
          return [];
        }),
        invoke("get_pending_invites").catch((e) => {
          console.error("[settings/layout] get_pending_invites error:", e);
          return [];
        }),
      ]);
      state.centralCredentials = credsRes;
      state.connections = (connsRes || []) as any[];
      state.profile = profileRes;
      state.teamMembers = [
        { id: "owner-1", user_id: "owner", email: "Workspace Owner", role: "owner", app_access: '["*"]', created_at: 0 },
        ...(membersRes as any[] || [])
      ];
      state.teamInvites = (invitesRes || []) as any[];
    } catch (e: any) {
      console.error("[settings/layout] Failed to load settings data:", e);
      state.error = e.message || "An error occurred";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  useContextProvider(SettingsContext, state);

  useTask$(({ track }) => {
    track(() => appCtx.activeProfileId.value);
    if (typeof window !== "undefined") {
      fetchData();
    }
  });

  return (
    <>
      {state.loading ? (
        <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
          <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem;margin-bottom:var(--space-lg)">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style="background:var(--surface-2);border:1px solid var(--border);border-radius:1rem;padding:1.5rem;display:flex;flex-direction:column;justify-content:center;">
                <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px;background:var(--border);border-radius:4px;animation:pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;" />
                <div class="skeleton" style="height:32px;width:60px;background:var(--border);border-radius:4px;animation:pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;" />
              </div>
            ))}
          </div>
        </div>
      ) : state.error ? (
        <div style="padding:1.5rem;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:0.75rem;margin:1.5rem;">
          Error loading settings: {state.error}
        </div>
      ) : (
        <Slot />
      )}
    </>
  );
});
