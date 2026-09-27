// src/lib/forms-builder-context.ts
//
// WHAT:  Thin context that lets the forms edit page share its Save/Publish state
//        with AppTopbar — so the topbar can render the form name input, Save button,
//        and Publish button without the edit page needing its own inline topbar.
//
// HOW:   Edit page calls useContextProvider(FormsBuilderCtx, { ... }) with signals.
//        AppTopbar reads useFormsBuilderCtx() and renders the right slot when
//        the path matches /dashboard/forms/[id]/edit.
//
//        Signals are intentionally typed as `any` in the context value so the
//        import stays lightweight (no circular deps through edit/index.tsx).

import { createContextId, useContext } from "@builder.io/qwik";

export interface FormsBuilderState {
  formTitle: { value: string };
  dirty:     { value: boolean };
  saving:    { value: boolean };
  published: { value: boolean };
  publishing:{ value: boolean };
  doSave:    () => Promise<void>;
  togglePublish: () => Promise<void>;
  // Writable QRL slots — set by the edit page, called by the root-level wrappers
  _doSaveSlot?:    { value: any };
  _togglePubSlot?: { value: any };
}

export const FormsBuilderCtx = createContextId<FormsBuilderState>("forms-builder-ctx");

export const useFormsBuilderCtx = () => useContext(FormsBuilderCtx);
