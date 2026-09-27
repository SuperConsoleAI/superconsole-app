// src/routes/dashboard/layout.tsx
//
// WHAT:  Dashboard sub-layout — wraps all /dashboard/* routes.
//        Intentionally minimal — just a pass-through Slot.
//        CategorySidebar lives in dashboard/c/layout.tsx (only for /dashboard/c/* routes).

import { component$, Slot } from "@builder.io/qwik";

export default component$(() => {
  return <Slot />;
});
