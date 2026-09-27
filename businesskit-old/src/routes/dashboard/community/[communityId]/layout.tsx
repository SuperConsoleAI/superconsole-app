import { component$, Slot, useContext, useTask$, useContextProvider, useSignal } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import { CommunityCtx } from "~/lib/community-context";
import { CommunityStateContext } from "../layout";

export default component$(() => {
  const loc = useLocation();
  const globalStore = useContext(CommunityStateContext);
  const communityId = loc.params.communityId;

  const commTitleSig = useSignal("");
  useContextProvider(CommunityCtx, {
    communityTitle: commTitleSig
  });

  useTask$(({ track }) => {
    track(() => communityId);
    track(() => globalStore.communities);
    const existing = globalStore.communities.find(c => c.id === communityId);
    if (existing) {
      commTitleSig.value = existing.name;
    } else {
      commTitleSig.value = "";
    }
  });

  return <Slot />;
});
