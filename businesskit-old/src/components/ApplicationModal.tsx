import { component$, useSignal, $, type Signal, type QRL } from "@builder.io/qwik";
import { SlideOver } from "~/components/SlideOver";
import { updateJobApplicationStatusIPC } from "~/lib/ipc";
import type { JobApplicationRow } from "~/lib/types";

export interface ApplicationModalProps {
  open: Signal<boolean>;
  application: Signal<JobApplicationRow | null>;
  onUpdated$: QRL<() => void>;
}

export const ApplicationModal = component$<ApplicationModalProps>(({ open, application, onUpdated$ }) => {
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);

  const updateDecision = $(async (decision: string) => {
    if (!application.value) return;
    saving.value = true;
    error.value = null;
    try {
      const updated = await updateJobApplicationStatusIPC(
        application.value.id,
        decision === "none" ? null : decision,
        null // Keep current stage for now
      );
      application.value = updated;
      onUpdated$();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const app = application.value;

  return (
    <SlideOver
      open={open}
      title={app ? `Application: ${app.full_name}` : "Application Details"}
      subtitle={app ? `Applied on ${new Date(app.created_at).toLocaleDateString()}` : ""}
      width="50vw"
    >
      {app ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* Decision Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", background: "var(--surface-2)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-secondary)" }}>Decision:</span>
            <select
              value={app.decision || "none"}
              onChange$={(e) => updateDecision((e.target as HTMLSelectElement).value)}
              disabled={saving.value}
              style={{
                height: "2.5rem",
                padding: "0 1rem",
                background: "var(--field-fill)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                cursor: "pointer",
                flex: 1
              }}
            >
              <option value="none">Pending / None</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>

          {/* Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div>
              <h4 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Contact</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
                <div><strong>Email:</strong> {app.email}</div>
                {app.phone && <div><strong>Phone:</strong> {app.phone}</div>}
                {app.city && <div><strong>Location:</strong> {app.city}{app.country ? `, ${app.country}` : ""}</div>}
              </div>
            </div>
            
            <div>
              <h4 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Links</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
                {app.resume_url && <a href={app.resume_url} target="_blank" style={{ color: "var(--accent)" }}>View Resume</a>}
                {app.linkedin && <a href={app.linkedin} target="_blank" style={{ color: "var(--accent)" }}>LinkedIn</a>}
                {app.github && <a href={app.github} target="_blank" style={{ color: "var(--accent)" }}>GitHub</a>}
                {app.portfolio && <a href={app.portfolio} target="_blank" style={{ color: "var(--accent)" }}>Portfolio</a>}
              </div>
            </div>
          </div>

          <div>
             <h4 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Summary / Cover Letter</h4>
             <div style={{ padding: "1rem", background: "var(--surface-2)", borderRadius: "0.5rem", fontSize: "0.875rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
               {app.summary || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>No summary provided.</span>}
             </div>
          </div>
          
        </div>
      ) : (
        <div>Loading...</div>
      )}
    </SlideOver>
  );
});
