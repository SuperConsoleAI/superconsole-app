/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead, useLocation } from "@builder.io/qwik-city";
import { getCommunity, getCommunityLeaderboard, getCommunityMembers } from "~/lib/ipc";
import { CommunityCtx } from "~/lib/community-context";
import { AppContext } from "~/lib/app-context";
import { useContext } from "@builder.io/qwik";
import { CommunityLeaderboards } from "~/components/community/CommunityLeaderboards";
import { CommunityAbout as CommunityAboutCard } from "~/components/community/CommunityAbout";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

const STYLES = `
  .lb-main {
    flex: 1;  
     
    min-width: 0; box-sizing: border-box;
  }
  @media (max-width: 768px) {
    .lb-main {     }
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
  .comm-tabs {
    display: flex; gap: 0.25rem; margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border); flex-wrap: wrap;
  }
  .comm-tab {
     font-size: 0.83rem; font-weight: 600;
    color: var(--text-secondary); text-decoration: none; border-radius: 0.5rem 0.5rem 0 0;
    border-bottom: 2px solid transparent;
  }
  .comm-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .comm-tab:hover { color: var(--text-primary); }
  .period-tabs {
    display: flex; gap: 0.35rem; margin-bottom: 1.25rem;
  }
  .period-btn {
     border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text-secondary); cursor: pointer; text-decoration: none;
    transition: background 0.15s;
  }
  .period-btn:hover, .period-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  /* Leaderboard table */
  .lb-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .lb-row {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.75rem; 
    display: flex; align-items: center; gap: 1rem;
    transition: border-color 0.2s;
  }
  .lb-row:hover { border-color: var(--accent); }
  .lb-row.top1 { background: linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%); border-color: #f59e0b; }
  .lb-row.top2 { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-color: #94a3b8; }
  .lb-row.top3 { background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border-color: #fb923c; }
  .lb-rank {
    font-size: 1.1rem; font-weight: 700; color: var(--text-secondary);
    width: 36px; text-align: center; flex-shrink: 0;
  }
  .lb-rank.gold { color: #d97706; }
  .lb-rank.silver { color: #64748b; }
  .lb-rank.bronze { color: #ea580c; }
  .lb-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--surface); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem; font-weight: 700; flex-shrink: 0; overflow: hidden;
  }
  .lb-name { font-size: 0.92rem; font-weight: 700; color: var(--text-primary); }
  .lb-meta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.1rem; }
  .lb-info { flex: 1; min-width: 0; }
  .lb-points {
    font-size: 1.1rem; font-weight: 700; color: var(--accent);
    flex-shrink: 0;
  }
  .lb-level {
    font-size: 0.7rem; font-weight: 600; 
    border-radius: 9999px; background: var(--accent); color: #fff;
    flex-shrink: 0;
  }
  .empty {  text-align: center; color: var(--text-secondary);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.85rem; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const loc = useLocation();
  const commCtx = useContext(CommunityCtx);
  const appCtx = useContext(AppContext);
  const communityId = loc.params.communityId;

  const communitySig = useSignal<any>(null);
  const leaderboardSig = useSignal<any[]>([]);
  const membersSig = useSignal<any[]>([]);
  const loading = useSignal(true);

  useVisibleTask$(async () => {
    try {
      const [c, lb, mems] = await Promise.all([
        getCommunity(communityId),
        getCommunityLeaderboard(communityId, 50),
        getCommunityMembers(communityId)
      ]);
      communitySig.value = c;
      if (c) commCtx.communityTitle = c.name;
      leaderboardSig.value = lb;
      membersSig.value = mems;
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const c = communitySig.value;
  const leaderboard = leaderboardSig.value;
  const recentMembers = membersSig.value;
  const cid = c?.id ?? "";

  let quickLinks: any[] = [];
  try { quickLinks = JSON.parse(c?.links || "[]"); } catch { /* empty */ }

  const topMembers = (recentMembers || []).slice(0, 8).map((m: any) => ({
    id: m.id,
    firstName: m.display_name,
    profilePictureUrl: m.avatar_url,
  }));
  
  if (loading.value) {
     return <div class="lb-main">Loading...</div>;
  }

  const LEVELS = [
    { level: 1, name: "AI Explorer 🛠️", pointsReq: 0, percentage: "90% of members", isLocked: false },
    { level: 2, name: "Automation Novice 🛠️", pointsReq: 5, percentage: "3% of members", unlocks: "Chat with members, Post to feed", isLocked: false },
    { level: 3, name: "AI Operator 🛠️", pointsReq: 20, percentage: "1% of members", isLocked: false },
    { level: 4, name: "Agent Builder 🤖", pointsReq: 65, percentage: "1% of members", isLocked: false },
    { level: 5, name: "Agent Orchestrator 🤖", pointsReq: 155, percentage: "1% of members", isLocked: true },
    { level: 6, name: "AI Engineer 🤖", pointsReq: 515, percentage: "1% of members", isLocked: true },
    { level: 7, name: "AI Visionary 💎", pointsReq: 2015, percentage: "1% of members", isLocked: true },
    { level: 8, name: "AI Mastermind ✨", pointsReq: 8015, percentage: "1% of members", isLocked: true },
    { level: 9, name: "AI Grandmaster 🚀", pointsReq: 33015, percentage: "1% of members", isLocked: true },
  ];

  const mapUser = (r: any) => ({
    id: r.id || r.memberId || Math.random().toString(),
    name: r.name || r.display_name || "User",
    avatarUrl: r.avatarUrl || r.avatar_url,
    points: r.points || r.pointsTotal || 0
  });

  // Mock boards using the current leaderboard data for all
  const b7d = leaderboard.map((r: any) => mapUser(r));
  const b30d = leaderboard.map((r: any) => mapUser(r));
  const bAllTime = leaderboard.map((r: any) => mapUser(r));

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" });
  const lastUpdated = formatter.format(new Date());

  const currentLevelObj = LEVELS[0];
  const pointsToNext = LEVELS[1].pointsReq;

  const currentProfile = appCtx.profiles.value.find(p => p.id === appCtx.activeProfileId.value);
  const me = membersSig.value.find((m: any) => m.profile_id === appCtx.activeProfileId.value);
  const myName = me?.display_name || currentProfile?.title || currentProfile?.slug || "User";

  const currentMemberMock = {
    name: myName,
    avatarUrl: me?.avatar_url || currentProfile?.avatarUrl,
    level: 1,
    levelName: currentLevelObj.name,
    pointsToNext
  };

  return (
    <div class="lb-main">
        
        <div class="lb-about-grid">
          <div>

            <CommunityLeaderboards
              currentMember={currentMemberMock}
              levels={LEVELS}
              board7d={b7d}
              board30d={b30d}
              boardAllTime={bAllTime}
              lastUpdated={lastUpdated}
            />
          </div>
          <div class="lb-about-sidebar">
            <CommunityAboutCard
              title={c?.name ?? "Community"}
              slug={c?.slug ?? ""}
              coverUrl={c?.cover_image || c?.icon}
              description={c?.description}
              memberCount={c?.member_count || 0}
              onlineCount={0}
              adminCount={1}
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

export const head: DocumentHead = { title: "Leaderboard — Community Dashboard" };
