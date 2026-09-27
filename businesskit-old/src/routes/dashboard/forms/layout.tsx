// src/routes/dashboard/forms/layout.tsx
//
// WHAT:  Context provider for all /dashboard/forms/* routes.
//        Loads all forms once, exposes via FormsContext.
//
// HOW:   useVisibleTask$ fetches listFormsIPC().
//        Child routes (index, [id]/edit, [id]/submissions) consume FormsContext.
//        refresh() re-fetches — called after create/delete/toggle.
//
// NOTE:  FormsBuilderCtx is provided at the ROOT layout (routes/layout.tsx)
//        so AppTopbar (also in the root layout) can read it. The [id]/edit page
//        syncs its local signals into that root context via useVisibleTask$.

import {
  component$, Slot, useContextProvider, createContextId,
  useStore, useVisibleTask$, $, type QRL,
} from "@builder.io/qwik";
import {
  listFormsIPC,
} from "~/lib/ipc";
import type { FormRow } from "~/lib/types";

export interface FormsState {
  forms: FormRow[];
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;
}

export const FormsContext = createContextId<FormsState>("forms_context");

export default component$(() => {
  const state = useStore<FormsState>({
    forms: [],
    loading: true,
    error: "",
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    state.loading = true;
    state.error = "";
    try {
      const formsRes = await listFormsIPC();
      state.forms = formsRes || [];
    } catch (e: any) {
      console.error("Failed to load forms data:", e);
      state.error = e.message || "An error occurred";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  useContextProvider(FormsContext, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return (
    <>
      <Slot />
    </>
  );
});
