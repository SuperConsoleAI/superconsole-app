/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, useTask$, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, useLocation , routeAction$, routeLoader$, zod$, z } from "@builder.io/qwik-city";
import { CommunityCalendar } from "~/components/community/CommunityCalendar";
import { AddCommunityEvent } from "~/components/community/AddCommunityEvent";
import { CommunityAbout as CommunityAboutCard } from "~/components/community/CommunityAbout";
import { getCommunityMembers, listCommunityEvents } from "~/lib/ipc";
import { CommunityCtx } from "~/lib/community-context";
import { useContext } from "@builder.io/qwik";
import { CommunityStateContext } from "../../layout";

const STYLES = `
  .events-main {
    flex: 1;  
     
    min-width: 0; box-sizing: border-box;
  }
  .events-grid {
    display: grid; grid-template-columns: 1fr 300px; gap: 2rem; align-items: start;
  }
  @media (max-width: 860px) {
    .events-main {     }
    .events-grid { grid-template-columns: 1fr; }
    .events-sidebar { display: none; }
  }
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap;
  }
  .page-title { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
  .error-banner { background: #fee2e2; color: #991b1b; border-radius: 0.6rem;
     font-size: 0.82rem; border: 1px solid #fca5a5; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const loc = useLocation();
  const commCtx = useContext(CommunityCtx);
  const globalStore = useContext(CommunityStateContext);
  const communityId = loc.params.communityId;

  const eventsSig = useSignal<any[]>([]);
  const membersSig = useSignal<any[]>([]);
  const loading = useSignal(true);
  
  const showAddEvent = useSignal(false);

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
      const [evs, mems] = await Promise.all([
        listCommunityEvents(communityId, true),
        getCommunityMembers(communityId)
      ]);
      eventsSig.value = evs;
      membersSig.value = mems;
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const c = globalStore.communities.find((c: any) => c.id === communityId);
  const events = eventsSig.value;
  const recentMembers = membersSig.value;
  const cid = c?.id ?? "";

  let quickLinks: any[] = [];
  try { quickLinks = JSON.parse(c?.links || "[]"); } catch { /* empty */ }

  const topMembers = (recentMembers || []).slice(0, 8).map((m: any) => ({
    id: m.id,
    firstName: m.display_name,
    profilePictureUrl: m.avatar_url,
  }));
  


  return (
    <>
      <div class="events-main">
        
        <div class="events-grid">
          <div>

            <CommunityCalendar 
              events={events} 
              onAddEvent$={() => showAddEvent.value = true} 
            />
          </div>
          <div class="events-sidebar">
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
      {showAddEvent.value && (
        <AddCommunityEvent 
          onClose$={() => showAddEvent.value = false} 
          onAdd$={$((details: any) => {
            console.log("Add event details:", details);
            showAddEvent.value = false;
          })}
        />
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Events — Community Dashboard" };
