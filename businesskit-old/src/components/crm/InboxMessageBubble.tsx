import { component$ } from "@builder.io/qwik";
import type { ActivityRow } from "~/lib/types";

// Colour per direction × type
const TYPE_LABEL: Record<string, string> = {
  note: "Note", in_person: "In Person", email: "Email",
  call: "Call", meeting: "Meeting", task_done: "Task Done",
  dm: "DM", purchase: "Purchase", form_submission: "Form", agent_action: "Agent",
  dm_sent: "DM Sent", email_sent: "Email Sent"
};

export const InboxMessageBubble = component$((props: { activity: ActivityRow; contactName?: string; profileName?: string | null }) => {
  const act = props.activity;
  
  let meta: any = {};
  try { meta = JSON.parse(act.metadata as string || "{}"); } catch { /* */ }

  const isInbound = act.direction === "inbound";
  // It's an agent if the type is explicitly agent_action, OR if metadata tags it as actor: agent
  const isAgent   = act.activity_type === "agent_action" || meta.actor === "agent";
  
  const actorText = isAgent ? "AI Agent" : (isInbound ? (props.contactName || "Them") : (props.profileName || "You"));
  
  // Format Date: "17 Mar 1:14 am", year if not current
  const d = new Date(((act.occurred_at as number) ?? 0) * 1000);
  const isCurrentYear = d.getFullYear() === new Date().getFullYear();
  let dateStr = d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(isCurrentYear ? {} : { year: 'numeric' })
  }) + " " + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  dateStr = dateStr.replace('AM', 'am').replace('PM', 'pm');
  
  const typeName = TYPE_LABEL[act.activity_type] ?? act.activity_type;

  return (
    <div style={`
      display: flex;
      flex-direction: column;
      align-items: ${isInbound ? "flex-start" : "flex-end"};
      margin-bottom: 1rem;
    `}>
      {/* label row */}
      <div style={`
        display: flex; align-items: center; gap: 0.375rem;
        margin-bottom: 0.25rem; font-size: 0.6875rem; color: var(--text-secondary);
        font-weight: 400;
      `}>
        {typeName} • {actorText} • {dateStr}
      </div>

      {/* bubble */}
      <div style={`
        max-width: 75%;
        padding: 0.625rem 0.875rem;
        border-radius: ${isInbound ? "0.125rem 0.875rem 0.875rem 0.875rem" : "0.875rem 0.125rem 0.875rem 0.875rem"};
        background: ${isAgent ? "var(--text-primary)" : (isInbound ? "var(--surface-3)" : "transparent")};
        border: 1px solid ${isAgent ? "transparent" : (isInbound ? "transparent" : "var(--border)")};
        font-size: 0.875rem;
        font-weight: 400;
        line-height: 1.5;
        color: ${isAgent ? "var(--surface-1)" : "var(--text-primary)"};
        word-break: break-word;
      `}>
        {act.subject && (
          <div style="font-weight:600;margin-bottom:0.25rem;font-size:0.8125rem;">{act.subject}</div>
        )}
        {act.body || <em style="color:var(--text-secondary);">No content</em>}
        {act.outcome && (
          <div style="margin-top:0.375rem;font-size:0.75rem;color:var(--text-secondary);">
            Outcome: <strong>{act.outcome}</strong>
          </div>
        )}
      </div>
    </div>
  );
});
