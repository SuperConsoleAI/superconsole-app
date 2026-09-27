import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$, $, QRL } from "@builder.io/qwik";
import { listCommunities } from "~/lib/ipc";

export interface CommunityState {
  communities: any[];
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;
}

export const CommunityStateContext = createContextId<CommunityState>("community_state_context");

export default component$(() => {
  const state = useStore<CommunityState>({
    communities: [],
    loading: true,
    error: "",
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    state.loading = true;
    try {
      const res = await listCommunities();
      state.communities = res || [];
    } catch (e: any) {
      state.error = e.message;
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    fetchData();
  });

  useContextProvider(CommunityStateContext, state);

  return <Slot />;
});
