import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$, $, QRL } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";

export interface SocialState {
  accounts: any[];
  connections: any[];
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;

  // Inbox state
  inboxConversations: any[];
  inboxMessages: Record<string, any[]>;
  inboxLoading: boolean;
  inboxSyncing: boolean;
  inboxFetched: boolean;
}

export const SocialContext = createContextId<SocialState>("social_context");

export default component$(() => {
  const state = useStore<SocialState>({
    accounts: [],
    connections: [],
    loading: true,
    error: "",
    refresh: $(async () => {}),
    inboxConversations: [],
    inboxMessages: {},
    inboxLoading: false,
    inboxSyncing: false,
    inboxFetched: false,
  });

  const PLATFORMS = ["twitter", "facebook", "instagram", "tiktok", "youtube", "linkedin", "pinterest", "twitch"];

  const fetchData = $(async (showLoading: boolean = true) => {
    if (showLoading) state.loading = true;
    try {
      const [accs, conns] = await Promise.all([
        invoke("list_social_accounts").catch(e => { console.error("acc err", e); return []; }),
        invoke("list_connections").catch(e => { console.error("conn err", e); return []; })
      ]);
      state.accounts = accs as any[];
      state.connections = (conns as any[]).filter((c: any) => {
        const svc = c.service?.toLowerCase() || "";
        return svc.includes("zernio") || svc.includes("composio") || PLATFORMS.includes(svc);
      });
    } catch (err: any) {
      console.error("Social data fetch error:", err);
      state.error = err.message || "An error occurred";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = $(async () => { await fetchData(false); });

  useContextProvider(SocialContext, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData(true);
  });

  return (
    <>
      <Slot />
    </>
  );
});
