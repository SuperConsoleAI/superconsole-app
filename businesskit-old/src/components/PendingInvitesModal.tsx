import { component$, $, useStylesScoped$, useSignal, type PropFunction } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuCheck, LuX } from "@qwikest/icons/lucide";

const STYLES = `
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  }
  .modal-content {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    width: 400px; max-width: 90vw;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  }
  .modal-title { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; }
  .invite-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1rem;
    margin-bottom: 0.75rem;
  }
  .team-name { font-weight: 600; color: var(--text-primary); font-size: 1rem; }
  .role-text { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; text-transform: capitalize; }
  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .btn {
    flex: 1; padding: 0.5rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.25rem; border: none;
  }
  .btn-accept { background: var(--button-primary-bg); color: var(--button-primary-text); }
  .btn-decline { background: var(--surface-3); color: var(--text-primary); border: 1px solid var(--border); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const PendingInvitesModal = component$((props: {
  invites: any[];
  onComplete$: PropFunction<() => void>;
}) => {
  useStylesScoped$(STYLES);
  
  const loadingId = useSignal<string | null>(null);

  const accept = $(async (id: string) => {
    loadingId.value = id;
    try {
      await invoke("accept_my_invite", { inviteId: id });
      await props.onComplete$();
    } catch (e) {
      console.error(e);
      alert("Failed to accept invite: " + String(e));
    } finally {
      loadingId.value = null;
    }
  });

  const decline = $(async (id: string) => {
    loadingId.value = id;
    await props.onComplete$();
  });

  if (!props.invites || props.invites.length === 0) return null;

  return (
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-title">You've been invited!</div>
        {props.invites.map((inv) => (
          <div key={inv.id} class="invite-card">
            <div class="team-name">{inv.team_name}</div>
            <div class="role-text">Invited as {inv.role}</div>
            <div class="actions">
              <button class="btn btn-decline" onClick$={() => decline(inv.id)} disabled={loadingId.value !== null}>
                <LuX /> Decline
              </button>
              <button class="btn btn-accept" onClick$={() => accept(inv.id)} disabled={loadingId.value !== null}>
                <LuCheck /> {loadingId.value === inv.id ? "Accepting..." : "Accept"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
