import { component$, useSignal, $, useStylesScoped$, useContext, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { LuMaximize, LuSquare, LuGrip, LuRefreshCw, LuLayoutGrid, LuColumns, LuList, LuFileEdit } from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { SocialContext } from "../layout";

import { svg as xFormerlyTwitterSvg } from "thesvg/x-formerly-twitter";
import { svg as instagramSvg } from "thesvg/instagram";
import { svg as facebookSvg } from "thesvg/facebook";
import { svg as linkedinSvg } from "thesvg/linkedin";
import { svg as tiktokSvg } from "thesvg/tiktok";
import { svg as youtubeSvg } from "thesvg/youtube";
import { svg as pinterestSvg } from "thesvg/pinterest";
import { svg as threadsSvg } from "thesvg/threads";
import { svg as redditSvg } from "thesvg/reddit";
import { svg as blueskySvg } from "thesvg/bluesky";
import { svg as snapchatSvg } from "thesvg/snapchat";

import zernioLogo from "~/assets/zernio.svg?raw";
import composioLogo from "~/assets/composio.svg?raw";
import { SocialPostsCard, formatDate, getMediaPreview } from "~/components/social/SocialPostsCard";
import { ComposeSocialPosts } from "~/components/social/ComposeSocialPosts";

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');
const ZERNIO_LOGO_WRAPPED = wrapIcon(zernioLogo);
const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg), x: wrapIcon(xFormerlyTwitterSvg), instagram: wrapIcon(instagramSvg), facebook: wrapIcon(facebookSvg),
  linkedin: wrapIcon(linkedinSvg), tiktok: wrapIcon(tiktokSvg), youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg), threads: wrapIcon(threadsSvg), reddit: wrapIcon(redditSvg),
  bluesky: wrapIcon(blueskySvg), snapchat: wrapIcon(snapchatSvg),
  composio: wrapIcon(composioLogo),
  default: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

const STYLES = `
  .posts-layout { display:grid; grid-template-columns:1fr 360px; gap:0.75rem; align-items:flex-start; }
  .posts-layout.half { grid-template-columns:1fr 1fr; }
  .posts-layout.expanded { grid-template-columns:1fr; }
  @media(max-width:1024px){ .posts-layout { grid-template-columns:1fr !important; } }
  
  .filter-group-box { display:flex; gap:0.25rem; background:var(--surface-2); border:1px solid var(--border); border-radius:0.5rem; padding:0.25rem; }
  .filter-btn-icon { width:32px; height:32px; padding:0.375rem; border-radius:0.375rem; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer; color:var(--text-secondary); transition:all 0.15s; }
  .filter-btn-icon:hover { background:var(--surface-3); color:var(--text-primary); }
  .filter-btn-icon.active { background:var(--surface-3); color:var(--text-primary); }

  .post-list { display:flex; flex-direction:column; gap:0.75rem; }
  
  .grid-4 { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0.75rem; }
  .grid-3 { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:0.75rem; }
  .grid-2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0.75rem; }
  .grid-1 { display:flex; flex-direction:column; gap:0.75rem; width:100%; }

  .compose-panel { background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; padding:1.25rem; height:fit-content; position:sticky; top:0; margin-top:0; }
  .compose-title { font-size:1rem; font-weight:600; color:var(--text-primary); margin-bottom:1rem; }
  .compose-textarea { width:100%; min-height:120px; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-primary); font-size:0.875rem; padding:0.75rem; resize:vertical; font-family:inherit; line-height:1.5; box-sizing:border-box; }
  .compose-textarea:focus { outline:none; border-color:var(--accent); }
  .compose-tools { display:flex; align-items:center; justify-content:space-between; margin-top:0.5rem; }
  .tool-btn { background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.25rem; border-radius:0.25rem; display:flex; align-items:center; justify-content:center; transition:color 0.15s; }
  .tool-btn:hover { color:var(--text-primary); background:var(--surface); }
  .compose-mode-tabs { display:flex; gap:0.25rem; margin-top:0.75rem; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; padding:0.25rem; }
  .compose-mode-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:0.4rem; padding:0.375rem 0.25rem; border-radius:0.375rem; font-size:0.75rem; font-weight:500; cursor:pointer; border:none; background:transparent; color:var(--text-secondary); transition:all 0.15s; }
  .compose-mode-tab.active { background:var(--button-primary-bg); color:var(--button-primary-text); }
  .btn-full { width:100%; padding:0.625rem; border-radius:0.5rem; background:var(--button-primary-bg); color:var(--button-primary-text); font-size:0.875rem; font-weight:600; border:none; cursor:pointer; margin-top:0.75rem; transition:opacity 0.15s; }
  .btn-full:hover { opacity:0.88; }
  .btn-full:disabled { opacity:0.5; cursor:not-allowed; }

  .filters-bar { display:flex; gap:0.75rem; margin-bottom:1.25rem; align-items:center; justify-content:space-between; flex-wrap:wrap; }
  .filter-select { padding:0.4rem 1.5rem 0.4rem 0.75rem; height:36px; background:var(--surface-2); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-primary); font-size:0.8rem; outline:none; appearance:none; }
  .empty { text-align:center; padding:3rem; color:var(--text-secondary); font-size:0.875rem; grid-column: 1 / -1; }
  .char-count { font-size:0.7rem; color:var(--text-secondary); text-align:right; margin-top:0.25rem; }
  .account-checkbox-list { display:flex; flex-direction:column; gap:0.4rem; max-height:140px; overflow-y:auto; margin-top:0.5rem; }
  .account-check-item { display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-primary); cursor:pointer; }
  .section-label { font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-top:0.75rem; margin-bottom:0.35rem; }
  @keyframes spin { 100% { transform:rotate(360deg); } }
  .spin { animation:spin 1s linear infinite; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  
  const socialStore = useContext(SocialContext);
  const accounts = socialStore.accounts.filter((a) => a.isConnected);
  const connectedPlatforms = Array.from(new Set(accounts.map((a: any) => a.platform))) as string[];

  const posts = useSignal<any[]>([]);
  const loadingPosts = useSignal(true);
  const syncing = useSignal(false);
  
  const statusFilter   = useSignal("");
  const platformFilter = useSignal("");
  const viewMode       = useSignal<"table"|"grid1"|"grid2"|"grid3"|"grid4">("grid3");
  const isComposeOpen  = useSignal(true);
  const editingPost    = useSignal<any | null>(null);

  const fetchPosts = $(async () => {
    loadingPosts.value = true;
    try {
      const res = await invoke("list_social_posts", { limit: 50 });
      posts.value = res as any[];
    } catch (e) {
      console.error("Failed to list posts", e);
    } finally {
      loadingPosts.value = false;
    }
  });

  const handleDelete = $(async (post: any) => {
    if (!confirm(`Are you sure you want to delete this post?`)) return;
    try {
      await invoke("delete_social_post", { id: post.id });
      await fetchPosts();
    } catch(e) {
      console.error(e);
      alert("Failed to delete post: " + e);
    }
  });

  const handleEdit = $(async (post: any) => {
    editingPost.value = post;
    isComposeOpen.value = true;
  });

  const syncPosts = $(async () => {
    syncing.value = true;
    try {
      const updatedCount = await invoke("sync_social_posts");
      if (updatedCount && (updatedCount as number) > 0) {
        await fetchPosts();
      }
    } catch (e) {
      console.error("Failed to sync posts", e);
    } finally {
      syncing.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    fetchPosts();
    syncPosts();
  });

  const filteredPosts = posts.value.filter((p: any) => {
    if (statusFilter.value && p.status !== statusFilter.value) return false;
    if (platformFilter.value && p.platform !== platformFilter.value) return false;
    return true;
  });

  return (
    <>
      <div class={['posts-layout', !isComposeOpen.value ? 'expanded' : '', viewMode.value === 'grid1' && isComposeOpen.value ? 'half' : ''].filter(Boolean).join(' ')}>
        
        {/* Center Post List */}
        <div>
          <div class="filters-bar">
            {/* Left: Platform Icons */}
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="filter-group-box">
                <button 
                  class={`filter-btn-icon ${!platformFilter.value ? 'active' : ''}`} 
                  onClick$={() => platformFilter.value = ""}
                  title="All Platforms"
                >
                  <div style="font-weight:700;font-size:0.75rem;">ALL</div>
                </button>
                {connectedPlatforms.length > 0 && <div style="width:1px; background:var(--border); margin:0.25rem 0;" />}
                {connectedPlatforms.map((plat) => (
                   <button 
                     key={plat}
                     class={`filter-btn-icon ${platformFilter.value === plat ? 'active' : ''}`}
                     onClick$={() => platformFilter.value = plat}
                     title={plat}
                   >
                     <div dangerouslySetInnerHTML={PLATFORM_ICONS[plat] || PLATFORM_ICONS.default} style="width:1rem;height:1rem;" />
                   </button>
                ))}
              </div>
              <span style="font-size:0.8rem;color:var(--text-secondary);">{filteredPosts.length} posts</span>
            </div>
            
            {/* Right: Status Dropdown & View/Sync */}
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="position: relative; height: 36px;">
                <select class="filter-select" value={statusFilter.value} onChange$={(e) => statusFilter.value = (e.target as HTMLSelectElement).value}>
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="failed">Failed</option>
                </select>
                <div style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-secondary); font-size: 0.6rem;">▼</div>
              </div>
              
              <div class="filter-group-box">
                <button class={`filter-btn-icon ${viewMode.value === 'table' ? 'active' : ''}`} onClick$={() => viewMode.value = 'table'} title="Table View">
                  <LuList style="width:1rem;height:1rem;" />
                </button>
                <button class={`filter-btn-icon ${viewMode.value === 'grid1' ? 'active' : ''}`} onClick$={() => viewMode.value = 'grid1'} title="1 Column Grid">
                  <LuSquare style="width:1rem;height:1rem;" />
                </button>
                <button class={`filter-btn-icon ${viewMode.value === 'grid2' ? 'active' : ''}`} onClick$={() => viewMode.value = 'grid2'} title="2 Column Grid">
                  <LuColumns style="width:1rem;height:1rem;" />
                </button>
                <button class={`filter-btn-icon ${viewMode.value === 'grid3' ? 'active' : ''}`} onClick$={() => viewMode.value = 'grid3'} title="3 Column Grid">
                  <LuLayoutGrid style="width:1rem;height:1rem;" />
                </button>
                <button class={`filter-btn-icon ${viewMode.value === 'grid4' ? 'active' : ''}`} onClick$={() => viewMode.value = 'grid4'} title="4 Column Grid">
                  <LuGrip style="width:1rem;height:1rem;" />
                </button>
                <div style="width:1px; background:var(--border); margin:0.25rem 0;" />
                <button class={`filter-btn-icon ${!isComposeOpen.value ? 'active' : ''}`} onClick$={() => isComposeOpen.value = !isComposeOpen.value} title="Toggle Compose Panel">
                  <LuMaximize style="width:1rem;height:1rem;" />
                </button>
                <button 
                  class="filter-btn-icon"
                  onClick$={() => { fetchPosts(); syncPosts(); }} 
                  title="Sync with Zernio"
                >
                  <LuRefreshCw class={syncing.value ? "spin" : ""} style="width:1rem;height:1rem;" />
                </button>
              </div>
            </div>
          </div>

          {loadingPosts.value ? (
            <div class="empty">Loading posts...</div>
          ) : filteredPosts.length === 0 ? (
            <div class="empty">No posts yet. Write your first one →</div>
          ) : viewMode.value === "table" ? (
            <div style="overflow-x: auto; background: var(--surface-2); border-radius: 0.75rem;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                <thead>
                  <tr style="background: var(--surface-3); border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));">
                    <th style="padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Content</th>
                    <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Platform</th>
                    <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Status</th>
                    <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Date</th>
                    <th style="padding: 0.75rem 1rem; text-align: right; font-weight: 600; color: var(--text-secondary);">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post: any) => {
                    const media = getMediaPreview(post);
                    return (
                      <tr key={post.id} style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 0.75rem 1rem;">
                          <div style="display: flex; align-items: center; gap: 0.75rem;">
                            {media ? (
                               media.url.match(/\.(mp4|webm)$/i) ? (
                                 <video src={media.url} width={40} height={40} style="border-radius: 0.25rem; object-fit: cover;" muted />
                               ) : (
                                 <img src={media.url} alt="" width={40} height={40} style="border-radius: 0.25rem; object-fit: cover;" />
                               )
                            ) : (
                              <div style="width: 40px; height: 40px; border-radius: 0.25rem; background: var(--surface-3); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0;">
                                <LuFileEdit style="width:1rem;height:1rem;" />
                              </div>
                            )}
                            <div style="max-width:300px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title={post.content}>
                              {post.content}
                            </div>
                          </div>
                        </td>
                        <td style="padding: 0.75rem 0.5rem;">
                          {post.platformPostUrl ? (
                            <a href={post.platformPostUrl} target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; gap:0.3rem; text-decoration:none; color:var(--text-secondary); background:var(--surface); padding:0.2rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border); width:fit-content; font-size:0.75rem; font-weight:500;">
                              <div dangerouslySetInnerHTML={PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default} style="width:0.8rem;height:0.8rem;" />
                              View
                            </a>
                          ) : (
                            <div style="display:flex; align-items:center; gap:0.3rem; background:var(--surface); color:var(--text-secondary); padding:0.2rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border); width:fit-content; font-size:0.75rem; font-weight:500; text-transform:capitalize;">
                              <div dangerouslySetInnerHTML={PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default} style="width:0.8rem;height:0.8rem;" />
                              {post.platform}
                            </div>
                          )}
                        </td>
                        <td style="padding: 0.75rem 0.5rem;">
                          <span class="post-status-pill">
                            {post.status}
                          </span>
                          {post.errorMessage && (
                            <div style="color: var(--danger); font-size:0.65rem; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top:0.25rem;" title={post.errorMessage}>
                              {post.errorMessage}
                            </div>
                          )}
                        </td>
                        <td style="padding: 0.75rem 0.5rem; color:var(--text-secondary);">
                          {formatDate((post.scheduledFor || post.createdAt as number) * 1000)}
                        </td>
                        <td style="padding: 0.75rem 1rem;">
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div class={viewMode.value === "grid4" ? "grid-4" : viewMode.value === "grid3" ? "grid-3" : viewMode.value === "grid2" ? "grid-2" : "grid-1"}>
              {filteredPosts.map((post: any) => (
                <SocialPostsCard
                  key={post.id}
                  post={post}
                  PLATFORM_ICONS={PLATFORM_ICONS}
                  ZERNIO_LOGO_WRAPPED={ZERNIO_LOGO_WRAPPED}
                  isEditing={editingPost.value?.id === post.id}
                  onEdit$={handleEdit}
                  onDelete$={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Compose Panel */}
        {isComposeOpen.value && (
          <ComposeSocialPosts
            editingPost={editingPost}
            onPostCreated$={fetchPosts}
            PLATFORM_ICONS={PLATFORM_ICONS}
            ZERNIO_LOGO_WRAPPED={ZERNIO_LOGO_WRAPPED}
          />
        )}
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: "Posts — Social",
  meta: [{ name: "description", content: "Compose, schedule and manage your social media posts." }],
};
