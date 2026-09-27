import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

// Chat route — stub placeholder (full UI in later phases)
export default component$(() => (
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Chat</h1>
        <p class="page-subtitle">This section is being built phase by phase.</p>
      </div>
    </div>
    <div class="empty-state">
      <div class="empty-state-title">Coming soon</div>
      <p class="empty-state-desc">Full Chat UI will be available in an upcoming phase.</p>
    </div>
  </div>
));

export const head: DocumentHead = { title: "Chat — BusinessKit" };
