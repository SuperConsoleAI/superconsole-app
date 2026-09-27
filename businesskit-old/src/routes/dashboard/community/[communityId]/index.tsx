/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, $ } from "@builder.io/qwik";
import { type DocumentHead, useLocation } from "@builder.io/qwik-city";
import { CommunityCtx } from "~/lib/community-context";
import { useContext, useTask$ } from "@builder.io/qwik";
import { CommunityStateContext } from "../layout";
import { CommunitySettings } from "~/components/community/CommunitySettings";
import { LuExternalLink } from "@qwikest/icons/lucide";
const STYLES = `
  .comm-main {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
  }
  
  .comm-header {
    display: flex; align-items: flex-start; gap: 1.25rem; margin-bottom: 1.75rem; flex-wrap: wrap;
  }
  .comm-avatar {
    width: 64px; height: 64px; border-radius: 1rem; object-fit: cover;
    background: linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%);
    display: flex; align-items: center; justify-content: center; font-size: 2rem;
    flex-shrink: 0; border: 1px solid var(--border);
  }
  .comm-info { flex: 1; }
  .comm-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); }
  .comm-slug { font-size: 0.8rem; color: var(--text-secondary); }
  .comm-desc { font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.4rem; max-width: 600px; }
  .header-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .btn {
     border-radius: 0.55rem; font-size: 0.82rem; font-weight: 600;
    border: none; cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; gap: 0.35rem; transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: var(--button-primary-background, var(--accent)); color: var(--button-primary-text, #fff); }
  .btn-ghost { background: var(--surface-2); color: var(--text-primary); border: 1px solid var(--border); }

  /* Nav tabs */
  .comm-tabs {
    display: flex; gap: 0.25rem; margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border); padding-bottom: 0;
    flex-wrap: wrap;
  }
  .comm-tab {
     font-size: 0.83rem; font-weight: 600;
    color: var(--text-secondary); text-decoration: none; border-radius: 0.5rem 0.5rem 0 0;
    border-bottom: 2px solid transparent; transition: color 0.15s;
  }
  .comm-tab:hover { color: var(--text-primary); }
  .comm-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* Stats */
  .stats-grid {
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: 0.75rem; margin-bottom: 1.5rem;
  }
  @media (max-width: 900px) {
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 600px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .stat-card {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.75rem; 
  }
  .stat-value { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
  .stat-label { font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.2rem;
    text-transform: uppercase; letter-spacing: 0.05em; }

  /* Two-column */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

  /* Section */
  .section {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.85rem; overflow: hidden;
  }
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
     border-bottom: 1px solid var(--border);
  }
  .section-title { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); }
  .section-link { font-size: 0.78rem; color: var(--accent); text-decoration: none; }
  .section-link:hover { text-decoration: underline; }

  /* Member row */
  .member-row {
    display: flex; align-items: center; gap: 0.75rem;
     border-bottom: 1px solid var(--border);
  }
  .member-row:last-child { border-bottom: none; }
  .member-avatar {
    width: 32px; height: 32px; border-radius: 50%; object-fit: cover;
    background: var(--surface); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-size: 0.85rem;
    flex-shrink: 0;
  }
  .member-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); flex: 1; }
  .member-email { font-size: 0.75rem; color: var(--text-secondary); }
  .role-badge {
    font-size: 0.68rem; font-weight: 600; 
    border-radius: 9999px; text-transform: capitalize;
  }
  .role-owner { background: #fef3c7; color: #92400e; }
  .role-admin { background: #e0e7ff; color: #3730a3; }
  .role-moderator { background: #dcfce7; color: #166534; }
  .role-member { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }

  /* Post row */
  .post-row {
     border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .post-row:last-child { border-bottom: none; }
  .post-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
  .post-meta { font-size: 0.73rem; color: var(--text-secondary); display: flex; gap: 0.75rem; }

  /* Event row */
  .event-row {
    display: flex; align-items: center; gap: 0.75rem;
     border-bottom: 1px solid var(--border);
  }
  .event-row:last-child { border-bottom: none; }
  .event-date {
    min-width: 48px; text-align: center;
    border-radius: 0.5rem; background: var(--accent);
    color: #fff; 
  }
  .event-date-day { font-size: 1.1rem; font-weight: 700; line-height: 1; }
  .event-date-mon { font-size: 0.65rem; text-transform: uppercase; }
  .event-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
  .event-time { font-size: 0.73rem; color: var(--text-secondary); }

  /* Empty mini */
  .mini-empty {  text-align: center; color: var(--text-secondary); font-size: 0.82rem; }

  /* Status badge */
  .badge {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.72rem; font-weight: 600; 
    border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .badge-live { background: #d1fae5; color: #065f46; }
  .badge-draft { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
`;



export default component$(() => {
  useStylesScoped$(STYLES);
  const loc = useLocation();
  const commCtx = useContext(CommunityCtx);
  const globalStore = useContext(CommunityStateContext);
  const communityId = loc.params.communityId;
  
  const settingsOpen = useSignal(false);

  // Sync title from global store
  useTask$(({ track }) => {
    track(() => communityId);
    track(() => globalStore.communities);
    const existing = globalStore.communities.find((c: any) => c.id === communityId);
    if (existing && commCtx) {
      commCtx.communityTitle = existing.name;
    }
  });

  const c = globalStore.communities.find((c: any) => c.id === communityId);

  if (!c) {
    return (
      <div class="comm-main">
        <div style="text-align:center;color:var(--text-secondary);">Community not found.</div>
      </div>
    );
  }

  return (
    <div class="comm-main">
        
        {/* Header */}
        <div class="comm-header">
          <div class="comm-avatar">
            {c.icon ? <img src={c.icon} alt="" width={64} height={64} style="width:64px;height:64px;border-radius:1rem;object-fit:cover;" /> : "🏘️"}
          </div>
          <div class="comm-info">
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <span class="comm-title">{c.name}</span>
              <span class={`badge ${c.published ? "badge-live" : "badge-draft"}`}>
                {c.published ? "● Live" : "Draft"}
              </span>
            </div>
            <div class="comm-slug">{c.description || ""} · {c.is_private ? "Private" : "Public"}</div>
          </div>
          <div class="header-actions">
            <button onClick$={() => { settingsOpen.value = true; }} class="btn btn-ghost" style="display:flex;align-items:center;gap:0.4rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Settings
            </button>
            <a href={`/community/${c.slug}`} target="_blank" rel="noopener" class="btn btn-ghost">View →</a>
          </div>
        </div>
      
      <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; color: var(--text-secondary); text-align: center; min-height: 300px;">
        <LuExternalLink style="width: 2.5rem; height: 2.5rem; color: var(--border-strong);" />
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">Community Overview</h3>
          <p style="max-width: 400px; font-size: 0.9rem; margin: 0 auto;">Manage your community settings, view your members, and organize events from the tabs above.</p>
        </div>
      </div>

      <CommunitySettings 
        open={settingsOpen} 
        onClose$={() => settingsOpen.value = false} 
        initialCommunity={c}
      />
    </div>
  );
});

export const head: DocumentHead = { title: "Community Dashboard" };
