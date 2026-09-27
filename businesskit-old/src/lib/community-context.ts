import { createContextId, type Signal } from "@builder.io/qwik";

export interface CommunityContextState {
  communityTitle: Signal<string>;
}

export const CommunityCtx = createContextId<CommunityContextState>("CommunityCtx");
