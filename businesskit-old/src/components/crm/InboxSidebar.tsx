import { component$, type PropFunction, useStylesScoped$ } from "@builder.io/qwik";
import type { ContactRow } from "~/lib/types";

export const InboxSidebar = component$((props: {
  contacts: ContactRow[];
  selectedId: string | null;
  onSelect$: PropFunction<(id: string) => void>;
}) => {
  useStylesScoped$(`
    .sidebar-container {
      width: 100%; flex: 1; display: flex; flex-direction: column; height: 100%;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.75rem;
      padding: 0.5rem; gap: 0.25rem; overflow-y: auto; box-sizing: border-box;
    }
    .contact-card {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem;
      text-align: left; border: none; cursor: pointer; width: 100%;
      border-radius: 0.5rem; transition: background 0.1s, box-shadow 0.1s;
      background: transparent;
    }
    .contact-card:hover {
      background: var(--surface-3);
    }
    .contact-card.selected {
      background: var(--surface-3);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  `);

  return (
    <div class="sidebar-container">
      {props.contacts.length === 0 && (
        <div style="padding:2rem;text-align:center;color:var(--text-secondary);font-size:0.875rem;">No contacts yet.</div>
      )}
      {props.contacts.map((c: ContactRow) => {
        const isSelected = c.id === props.selectedId;
        const initial = (c.first_name || "?").charAt(0).toUpperCase();
        const hasUnread = ((c as any).unread_count ?? 0) > 0;

        return (
          <button
            key={c.id}
            type="button"
            class={["contact-card", isSelected ? "selected" : ""]}
            onClick$={() => props.onSelect$(c.id)}
          >
            {/* Avatar */}
            {c.avatar_url ? (
              <img src={c.avatar_url} alt="" width={36} height={36} style="border-radius:50%;object-fit:cover;flex-shrink:0;" />
            ) : (
              <div style="width:36px;height:36px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:0.875rem;font-weight:600;color:var(--text-secondary);border:1px solid var(--border);flex-shrink:0;">
                {initial}
              </div>
            )}

            {/* Info */}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:0.25rem;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize;">
                  {c.first_name} {c.last_name || ""}
                </span>
                {hasUnread && (
                  <span style="min-width:1.125rem;height:1.125rem;background:var(--accent);color:var(--surface-1);border-radius:1rem;font-size:0.625rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 0.25rem;flex-shrink:0;">
                    {(c as any).unread_count}
                  </span>
                )}
              </div>
              <div style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize;">
                {c.platform
                  ? `${c.outreach_status || "new"} · ${c.platform}`
                  : (c.outreach_status || "new")}
              </div>
              {(c as any).conversation_thread && (() => {
                try {
                  const thread = JSON.parse((c as any).conversation_thread as string);
                  const last = Array.isArray(thread) ? thread[thread.length - 1] : null;
                  if (last?.body) return (
                    <div style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.125rem;">
                      {last.body.slice(0, 60)}
                    </div>
                  );
                } catch { /* ignore */ }
                return null;
              })()}
            </div>
          </button>
        );
      })}
    </div>
  );
});
