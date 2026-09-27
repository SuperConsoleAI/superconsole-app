// src/routes/index.tsx
//
// WHAT:  App entry — redirect to /dashboard or /login based on license.
// HOW:   useVisibleTask$ checks license via invoke → navigate. Shows spinner only.

import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate, type DocumentHead } from "@builder.io/qwik-city";
import { authStatus, getLicenseStatus } from "~/lib/ipc";
import { isLicenseActive } from "~/lib/types";

export default component$(() => {
  const nav = useNavigate();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const session = await authStatus();
      if (!session) {
        nav("/login", { replaceState: true });
        return;
      }
      const lic = await getLicenseStatus();
      if (isLicenseActive(lic)) {
        const { getProjects } = await import("~/lib/ipc");
        let projects = await getProjects().catch(() => []);
        if (projects.length === 0) {
          await new Promise((r) => setTimeout(r, 200));
          projects = await getProjects().catch(() => []);
        }
        if (projects.length === 0) {
          nav("/onboarding", { replaceState: true });
        } else {
          nav("/dashboard", { replaceState: true });
        }
      } else {
        nav("/login", { replaceState: true });
      }
    } catch {
      nav("/login", { replaceState: true });
    }
  });

  return (
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--surface-1)">
      <div class="spinner" />
    </div>
  );
});

export const head: DocumentHead = {
  title: "BusinessKit",
  meta: [{ name: "description", content: "BusinessKit desktop app" }],
};
