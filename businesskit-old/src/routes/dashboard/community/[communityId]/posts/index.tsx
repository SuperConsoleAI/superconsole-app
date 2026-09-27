/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, useVisibleTask$, useTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, useLocation } from "@builder.io/qwik-city";
import { listCommunityPosts, listCommunityCategories, createCommunityPost, getCommunityMembers, deleteCommunityPost, pinCommunityPost } from "~/lib/ipc";
import { invoke } from "@tauri-apps/api/core";
import { CommunityCtx } from "~/lib/community-context";
import { useContext } from "@builder.io/qwik";
import { CommunityStateContext } from "../../layout";
import { CommunityAbout } from "~/components/community/CommunityAbout";
import { CreateCommunityPost } from "~/components/community/CreateCommunityPost";
import { CommunityPostLists } from "~/components/community/CommunityPostLists";
import { AppContext } from "~/lib/app-context";

const STYLES = `
  .posts-main {
    flex: 1;  
     
    min-width: 0; box-sizing: border-box;
  }
  .posts-grid {
    display: grid; grid-template-columns: 1fr 300px; gap: 2rem; align-items: start;
  }
  @media (max-width: 860px) {
    .posts-main {     }
    .posts-grid { grid-template-columns: 1fr; }
    .posts-sidebar { display: none; }
  }
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
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap;
  }
  .page-title { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
  .btn {
     border-radius: 0.55rem; font-size: 0.82rem; font-weight: 600;
    border: none; cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; gap: 0.35rem; transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-ghost { background: var(--surface-2); color: var(--text-primary); border: 1px solid var(--border); }
  .btn-sm {  font-size: 0.75rem; }

  /* Create form */
  .create-form {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.85rem;  margin-bottom: 1.5rem;
    display: flex; flex-direction: column; gap: 0.85rem;
  }
  .form-row { display: flex; flex-direction: column; gap: 0.3rem; }
  label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
  .form-input {
     border-radius: 0.5rem;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text-primary); font-size: 0.88rem; width: 100%; box-sizing: border-box;
  }
  .form-input:focus { outline: none; border-color: var(--accent); }
  .form-textarea { min-height: 120px; resize: vertical; }
  .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
  @media (max-width: 500px) { .form-row-2 { grid-template-columns: 1fr; } }

  /* Posts list */
  .posts-list { display: flex; flex-direction: column; gap: 0.85rem; }
  .post-card {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.85rem; 
    display: flex; flex-direction: column; gap: 0.4rem;
    transition: border-color 0.2s;
  }
  .post-card:hover { border-color: var(--accent); }
  .post-card.pinned { border-color: #f59e0b; }
  .post-top { display: flex; align-items: flex-start; gap: 0.75rem; }
  .post-body { flex: 1; min-width: 0; }
  .post-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
  .post-preview { font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.2rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 500px; }
  .post-meta { display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-secondary);
    margin-top: 0.35rem; flex-wrap: wrap; align-items: center; }
  .post-actions { display: flex; gap: 0.35rem; margin-left: auto; flex-shrink: 0; align-items: center; }
  .pin-badge {
    font-size: 0.68rem; font-weight: 600; 
    border-radius: 9999px; background: #fef3c7; color: #92400e;
  }
  .type-badge {
    font-size: 0.68rem; font-weight: 600; 
    border-radius: 9999px; background: var(--surface); color: var(--text-secondary);
    border: 1px solid var(--border); text-transform: capitalize;
  }
  .empty {  text-align: center; color: var(--text-secondary);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.85rem; }
  .error-banner { background: #fee2e2; color: #991b1b; border-radius: 0.6rem;
     font-size: 0.82rem; border: 1px solid #fca5a5; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const loc = useLocation();
  const commCtx = useContext(CommunityCtx);
  const globalStore = useContext(CommunityStateContext);
  const appCtx = useContext(AppContext);
  const communityId = loc.params.communityId;

  const postsSig = useSignal<any[]>([]);
  const categoriesSig = useSignal<any[]>([]);
  const recentMembersSig = useSignal<any[]>([]);
  const isCreating = useSignal(false);
  const loading = useSignal(true);
  const activeCategorySig = useSignal<string>("");

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
      const [p, cats, mems] = await Promise.all([
        listCommunityPosts(communityId, undefined, undefined, 300),
        listCommunityCategories(communityId),
        getCommunityMembers(communityId)
      ]);

      const currentProfileId = appCtx.activeProfileId.value;
      const activeProfile = appCtx.profiles.value.find(p => p.id === currentProfileId);
      const me = (mems as any[]).find((m: any) => m.profile_id === currentProfileId);
      
      if (me && me.display_name === "Member" && activeProfile) {
        const myRealName = activeProfile.title || "Member";
        const myAvatar = activeProfile.avatar_url || "";
        if (myRealName !== "Member") {
          try {
            await invoke("update_community_member_profile", {
              memberId: me.id,
              displayName: myRealName,
              avatarUrl: myAvatar
            });
            me.display_name = myRealName;
            me.avatar_url = myAvatar;
          } catch (e) {
            console.error("Failed to auto-update member profile:", e);
          }
        }
      }

      postsSig.value = p;
      categoriesSig.value = cats;
      recentMembersSig.value = mems;
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const c = globalStore.communities.find((c: any) => c.id === communityId);
  const posts = postsSig.value;
  const catData = categoriesSig.value;
  const recentMembers = recentMembersSig.value;

  const categories = catData.map(c => ({ id: c.id, name: c.name, icon: c.icon }));
  
  const topMembers = (recentMembers || []).slice(0, 8).map((m: any) => ({
    id: m.id,
    firstName: m.display_name,
    profilePictureUrl: m.avatar_url,
  }));

  let quickLinks: any[] = [];
  // try { quickLinks = JSON.parse(c?.links || "[]"); } catch { /* empty */ }

  const handleCreate$ = $(async (payload: { title: string; body: string; categoryId: string }) => {
    isCreating.value = true;
    try {
      const currentProfileId = appCtx.activeProfileId.value;
      const me = recentMembersSig.value.find((m: any) => m.profile_id === currentProfileId);
      const myMemberId = me?.id || "unknown";

      await createCommunityPost({
        community_id: communityId,
        member_id: myMemberId,
        title: payload.title,
        body: payload.body,
        category_id: payload.categoryId,
        post_type: "post"
      });
      // Refresh posts
      postsSig.value = await listCommunityPosts(communityId, undefined, undefined, 300);
    } catch (e) {
      console.error(e);
      alert("Failed to create post");
    } finally {
      isCreating.value = false;
    }
  });


  const handleFilterChange = $((catId: string) => {
    activeCategorySig.value = catId;
  });

  return (
    <div class="posts-main">
        
        <div class="posts-grid">
          <div style="min-width: 0;">
            <CreateCommunityPost 
              communityName={c?.name || ""}
              userAvatar={undefined}
              userName={"Admin"}
              categories={categories}
              onCreate$={handleCreate$}
              isCreating={isCreating.value}
            />

            <CommunityPostLists 
              posts={postsSig.value} 
              categories={categoriesSig.value} 
              activeCategoryId={activeCategorySig.value}
              onFilterChange$={handleFilterChange}
              baseHref={`/dashboard/community/${communityId}`}
              currentUserProfileId={appCtx.activeProfileId.value || undefined}
              currentUserName={appCtx.profiles.value.find(p => p.id === appCtx.activeProfileId.value)?.title}
              currentUserAvatar={appCtx.profiles.value.find(p => p.id === appCtx.activeProfileId.value)?.avatar_url || undefined}
            />
          </div>

          <div class="posts-sidebar">
            <CommunityAbout 
              title={c?.name || "Community"}
              slug={c?.slug || "community"}
              coverUrl={c?.cover_image || c?.icon}
              description={c?.description}
              memberCount={c?.member_count || 1}
              onlineCount={0}
              adminCount={1}
              quickLinks={quickLinks}
              topMembers={topMembers}
              isMember={true}
              showInvite={true}
            />
          </div>
        </div>
        </div>
  );
});

export const head: DocumentHead = { title: "Posts — Community Dashboard" };
