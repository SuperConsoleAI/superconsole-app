// src/routes/dashboard/shop/restaurant/staff/index.tsx
//
// Redirect to unified Shop Staff Management (/dashboard/shop/staff)

import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  const nav = useNavigate();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    nav("/dashboard/shop/staff");
  });

  return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
      Redirecting to Shop Staff Management...
    </div>
  );
});

export const head: DocumentHead = {
  title: "Staff Management | BusinessKit",
};

