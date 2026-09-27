/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, useVisibleTask$, useTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, useLocation } from "@builder.io/qwik-city";
import { getCommunityMembers } from "~/lib/ipc";
import { CommunityCtx } from "~/lib/community-context";
import { useContext } from "@builder.io/qwik";
import { CommunityStateContext } from "../../layout";
import { CommunityMembers } from "~/components/community/CommunityMembers";

import { CommunityAbout as CommunityAboutCard } from "~/components/community/CommunityAbout";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

const STYLES = `
  .members-main {
    flex: 1;  
     
    min-width: 0; box-sizing: border-box;
  }
  @media (max-width: 768px) {
    .members-main {     }
  }
  .lb-about-grid {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: calc(${spacing.xl} + 0.5rem);
    align-items: start;
  }
  @media (max-width: 860px) {
    .lb-about-grid {
      grid-template-columns: 1fr;
    }
    .lb-about-sidebar { display: none; }
  }
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;
  }
  .page-title { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
  .comm-tabs {
    display: flex; gap: 0.25rem; margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border); flex-wrap: wrap;
  }
  .comm-tab {
     font-size: 0.83rem; font-weight: 600;
    color: var(--text-secondary); text-decoration: none; border-radius: 0.5rem 0.5rem 0 0;
    border-bottom: 2px solid transparent; transition: color 0.15s;
  }
  .comm-tab:hover { color: var(--text-primary); }
  .comm-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .filters {
    display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;
  }
  .filter-select {
     border-radius: 0.5rem;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text-primary); font-size: 0.82rem;
  }
  .members-table {
    width: 100%; border-collapse: collapse;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.85rem; overflow: hidden;
  }
  .members-table th {
    text-align: left; 
    font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
    text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border); background: var(--surface);
  }
  .members-table td {
     border-bottom: 1px solid var(--border);
    font-size: 0.85rem; color: var(--text-primary); vertical-align: middle;
  }
  .members-table tr:last-child td { border-bottom: none; }
  .members-table tr:hover td { background: var(--surface); }
  .member-cell { display: flex; align-items: center; gap: 0.65rem; }
  .avatar {
    width: 34px; height: 34px; border-radius: 50%; object-fit: cover;
    background: var(--surface); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.88rem; font-weight: 600; flex-shrink: 0;
  }
  .member-name-text { font-weight: 600; }
  .member-email-text { font-size: 0.75rem; color: var(--text-secondary); }
  .role-badge {
    font-size: 0.68rem; font-weight: 600; 
    border-radius: 9999px; text-transform: capitalize;
  }
  .role-owner { background: #fef3c7; color: #92400e; }
  .role-admin { background: #e0e7ff; color: #3730a3; }
  .role-moderator { background: #dcfce7; color: #166534; }
  .role-member { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .status-badge {
    font-size: 0.68rem; font-weight: 600; 
    border-radius: 9999px; text-transform: capitalize;
  }
  .status-active { background: #d1fae5; color: #065f46; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-banned { background: #fee2e2; color: #991b1b; }
  .status-cancelled { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .btn {
     border-radius: 0.45rem; font-size: 0.78rem; font-weight: 600;
    border: 1px solid var(--border); background: var(--surface); color: var(--text-primary);
    cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
    gap: 0.3rem; transition: background 0.15s;
  }
  .btn:hover { background: var(--surface-2); }
  .btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-accent:hover { opacity: 0.9; }
  .stats-row {
    display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;
  }
  .mini-stat {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.6rem; 
    font-size: 0.82rem; color: var(--text-secondary);
  }
  .mini-stat strong { color: var(--text-primary); font-size: 1rem; font-weight: 700; }
  .empty {  text-align: center; color: var(--text-secondary);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.85rem; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const loc = useLocation();
  const commCtx = useContext(CommunityCtx);
  const globalStore = useContext(CommunityStateContext);
  const communityId = loc.params.communityId;

  const membersSig = useSignal<any[]>([]);
  const loading = useSignal(true);

  // Sync title from global store
  useTask$(({ track }) => {
    track(() => communityId);
    track(() => globalStore.communities);
    const existing = globalStore.communities.find((c: any) => c.id === communityId);
    if (existing && commCtx) {
      commCtx.communityTitle = existing.name;
    }
  });

  useVisibleTask$(async () => {
    try {
      const mems = await getCommunityMembers(communityId);
      membersSig.value = mems;
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const c = globalStore.communities.find((c: any) => c.id === communityId);
  const members = membersSig.value;
  const cid = c?.id ?? "";

  const adminCount = 1;

  let quickLinks: any[] = [];
  // try { quickLinks = JSON.parse(c?.links || "[]"); } catch { /* empty */ }

  const topMembers = members.slice(0, 8).map((m: any) => ({
    id: m.id,
    firstName: m.display_name,
    profilePictureUrl: m.avatar_url,
  }));
  


  return (
    <div class="members-main">
        
        <div class="lb-about-grid">
          <div>
            {members.length === 0 ? (
              <div class="empty">No members yet. Share your community link to get started.</div>
            ) : (
              <CommunityMembers
                isDashboard={true}
                members={members}
                totalMembers={c?.member_count || 0}
                totalActive={members.filter((m: any) => m.status === "active").length}
                totalCancelling={members.filter((m: any) => m.status === "cancelled").length}
                totalChurned={members.filter((m: any) => m.status === "churned").length}
                totalBanned={members.filter((m: any) => m.status === "banned").length}
                totalAdmins={0} // Not shown on dashboard
                totalOnline={0} // Not shown on dashboard
              />
            )}
          </div>
          <div class="lb-about-sidebar">
            <CommunityAboutCard
              title={c?.name ?? "Community"}
              slug={c?.slug ?? ""}
              coverUrl={c?.cover_image || c?.icon}
              description={c?.description}
              memberCount={c?.member_count || 0}
              onlineCount={0}
              adminCount={adminCount}
              topMembers={topMembers}
              quickLinks={quickLinks}
              showInvite={true}
              isMember={true}
              accessType={c?.is_private ? "invite_only" : "free"}
              priceCents={0}
              currency={"usd"}
              creatorName={undefined}
              creatorAvatarUrl={undefined}
              creatorProfileId={undefined}
            />
          </div>
        </div>
        </div>
  );
});

export const head: DocumentHead = { title: "Members — Community Dashboard" };
