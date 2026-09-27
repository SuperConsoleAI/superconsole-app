import { component$, useStylesScoped$, useSignal, useContext, type PropFunction, useTask$ } from "@builder.io/qwik";
import { LuExternalLink, LuPencil, LuTrash2, LuBarChart2 } from "@qwikest/icons/lucide";
import { SocialContext } from "~/routes/dashboard/social/layout";
import { SlideOver } from "~/components/SlideOver";
import { SocialPostAnalytics } from "~/components/social/analytics/SocialPostAnalytics";
import { invoke } from "@tauri-apps/api/core";

export const STYLES = `
  .media-preview-container { width:100%; height:160px; border-radius:0.75rem 0.75rem 0 0; overflow:hidden; background:var(--surface-3); display:flex; align-items:center; justify-content:center; position:relative; }
  .media-preview-img { width:100%; height:100%; object-fit:cover; }
  .media-preview-count { position:absolute; bottom:0.5rem; right:0.5rem; background:rgba(0,0,0,0.6); color:white; font-size:0.7rem; padding:0.2rem 0.4rem; border-radius:0.25rem; font-weight:600; }

  .post-card { background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; cursor:pointer; transition:border-color 0.15s; display:flex; flex-direction:column; overflow:hidden; position:relative; }
  .post-card:hover { border-color:var(--accent); }
  .post-card.editing {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .post-card-body { padding:0.75rem; display:flex; flex-direction:column; flex:1; gap:0.5rem; }
  .post-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem; }
  .post-status-pill { padding:0.15rem 0.5rem; border-radius:1rem; border:1px solid var(--border); font-size:0.65rem; font-weight:600; text-transform:capitalize; background:var(--surface-3); color:var(--text-secondary); width:fit-content; }
  .post-status-pill-absolute { position:absolute; top:0.5rem; left:0.5rem; z-index:10; background:rgba(0,0,0,0.6); color:white; border:none; }
  .post-content { font-size:0.875rem; color:var(--text-primary); line-height:1.5; margin-bottom:0.25rem; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; flex:1; word-break:break-word; white-space:pre-wrap; }
  .post-meta { font-size:0.75rem; color:var(--text-secondary); display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:auto; align-items:center; }
  .platform-chip { padding:0.25rem 0.5rem; border-radius:0.5rem; background:var(--surface); border:1px solid var(--border); font-size:0.7rem; color:var(--text-secondary); text-transform:capitalize; display:flex; align-items:center; gap:0.25rem; transition:background 0.15s; }
  a.platform-chip:hover { background:var(--surface-3); }

  .post-card-menu-wrap { position:absolute; top:0.5rem; right:0.5rem; z-index:20; }
  .post-card-menu-btn { background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:white; opacity:0; transition:opacity 0.2s; }
  .post-card-menu-btn.no-media { background:var(--surface-3); border-color:var(--border); color:var(--text-primary); }
  .post-card:hover .post-card-menu-btn { opacity:1; }
  .post-card-menu-btn:hover { background:rgba(0,0,0,0.8); }
  .post-card-menu-btn.no-media:hover { background:var(--surface); }
  .post-card-menu-dropdown { position:absolute; top:110%; right:0; background:var(--surface-2); border:1px solid var(--border); border-radius:0.5rem; box-shadow:0 4px 12px rgba(0,0,0,0.5); display:flex; flex-direction:column; min-width:150px; overflow:hidden; z-index:30; }
  .post-card-menu-item { padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--text-primary); cursor:pointer; border:none; background:transparent; text-align:left; display:flex; align-items:center; gap:0.4rem; width:100%; transition:background 0.15s; }
  .post-card-menu-item:hover { background:var(--surface-2); }
  .post-card-menu-item.danger { color:#dc2626; }
  .post-card-menu-item:disabled { opacity:0.5; cursor:not-allowed; }
`;

export const getMediaPreview = (post: any) => {
  if (!post.mediaItems) return null;
  try {
    const items = JSON.parse(post.mediaItems);
    if (Array.isArray(items) && items.length > 0) {
      return { url: items[0].url || items[0], count: items.length };
    }
  } catch {
    // Ignore
  }
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = post.content.match(urlRegex);
  if (match && match.length > 0) {
     if (match[0].match(/\.(jpeg|jpg|gif|png|webp|mp4|webm)$/i)) {
        return { url: match[0], count: 1 };
     }
  }
  return null;
};

export const formatDate = (timestampMs: number) => {
  const date = new Date(timestampMs);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: isCurrentYear ? undefined : "numeric"
  });
};

export const getViaBadge = (post: any, socialStore: any, ZERNIO_LOGO_WRAPPED: string, PLATFORM_ICONS: any) => {
  if (!post.accountId && !post.account_id) return null;
  const accId = post.accountId || post.account_id;
  const acc = socialStore.accounts.find((a: any) => String(a.id) === String(accId));
  if (!acc) return null;
  
  const connId = acc.connectionId || acc.connection_id;
  if (!connId) return null;
  
  const conn = socialStore.connections.find((c: any) => String(c.id) === String(connId));
  if (!conn) return null;
  
  const isZernio = conn.service?.toLowerCase().includes("zernio") || false;
  const icon = isZernio ? ZERNIO_LOGO_WRAPPED : (PLATFORM_ICONS[conn.service?.toLowerCase()] || null);
  
  const providerName = isZernio ? "Zernio" : (conn.service?.charAt(0).toUpperCase() + conn.service?.slice(1));
  const name = conn.name || conn.label || providerName;

  return (
    <span style="display:inline-flex; align-items:center; gap:0.25rem; background:var(--surface-3); padding:0.15rem 0.4rem; border-radius:0.25rem; font-size:0.6rem; font-weight:600; color:var(--text-primary); margin-right:0.4rem;">
      {icon && <div style="width:0.7rem; height:0.7rem; display:flex; align-items:center; opacity:0.8;" dangerouslySetInnerHTML={icon} />}
      {name}
    </span>
  );
};

export interface SocialPostsCardProps {
  post: any;
  PLATFORM_ICONS: Record<string, string>;
  ZERNIO_LOGO_WRAPPED: string;
  isEditing?: boolean;
  onEdit$?: PropFunction<(post: any) => void>;
  onDelete$?: PropFunction<(post: any) => void>;
}

export const SocialPostsCard = component$((props: SocialPostsCardProps) => {
  useStylesScoped$(STYLES);
  const socialStore = useContext(SocialContext);
  const menuOpen = useSignal(false);
  const showAnalytics = useSignal(false);
  const analyticsData = useSignal<any[]>([]);
  
  const { post, PLATFORM_ICONS, ZERNIO_LOGO_WRAPPED } = props;
  const media = getMediaPreview(post);
  const isPublished = post.status?.toLowerCase() === "published";
  const isScheduled = post.status?.toLowerCase() === "scheduled";

  useTask$(async ({ track }) => {
    const isOpen = track(() => showAnalytics.value);
    if (isOpen) {
      try {
        const data = await invoke("get_single_post_analytics", { postId: String(post.id) });
        if (data && Object.keys(data).length > 0) {
           analyticsData.value = [data];
        } else {
           analyticsData.value = [post]; // Fallback to just the post data without metrics
        }
      } catch(e) {
        console.error("Failed to fetch post analytics", e);
        analyticsData.value = [post];
      }
    }
  });

  return (
    <>
    <div class={`post-card ${props.isEditing ? 'editing' : ''}`} onClick$={() => menuOpen.value = false}>
      <div class="post-card-menu-wrap" onClick$={(e) => { e.stopPropagation(); menuOpen.value = !menuOpen.value; }}>
        <button class={`post-card-menu-btn ${!media ? 'no-media' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
        {menuOpen.value && (
          <div class="post-card-menu-dropdown" onClick$={(e) => e.stopPropagation()}>
            {isPublished && post.platformPostUrl ? (
               <a href={post.platformPostUrl} target="_blank" rel="noopener noreferrer" class="post-card-menu-item" style="text-decoration:none;">
                 <LuExternalLink /> View on Platform
               </a>
            ) : null}
            
            <button class="post-card-menu-item" onClick$={() => { menuOpen.value = false; props.onEdit$?.(post); }} disabled={isPublished}>
              <LuPencil /> Edit
            </button>
            
            <button class="post-card-menu-item danger" onClick$={() => { menuOpen.value = false; props.onDelete$?.(post); }}>
              <LuTrash2 /> {isPublished ? 'Delete from Zernio' : isScheduled ? 'Cancel Schedule' : 'Delete'}
            </button>
          </div>
        )}
      </div>
      
      {media && (
        <div class="media-preview-container">
          <span class="post-status-pill post-status-pill-absolute">
            {post.status}
          </span>
          {media.url.match(/\\.(mp4|webm)$/i) ? (
             <video src={media.url} class="media-preview-img" muted autoplay loop playsInline />
          ) : (
             <img src={media.url} class="media-preview-img" alt="Post media" width="400" height="160" />
          )}
          {media.count > 1 && (
            <div class="media-preview-count">+{media.count - 1}</div>
          )}
        </div>
      )}
      
      <div class="post-card-body">
        {!media && (
          <div class="post-card-header">
            <span class="post-status-pill">{post.status}</span>
          </div>
        )}
        <div class="post-content">{post.content}</div>
        <div class="post-meta">
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            {post.platformPostUrl ? (
              <a href={post.platformPostUrl} target="_blank" rel="noopener noreferrer" class="platform-chip" style="text-decoration:none;" onClick$={(e) => e.stopPropagation()}>
                <div dangerouslySetInnerHTML={PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default} style="width:0.8rem;height:0.8rem;" />
                View
              </a>
            ) : (
              <div class="platform-chip">
                <div dangerouslySetInnerHTML={PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default} style="width:0.8rem;height:0.8rem;" />
                {post.platform}
              </div>
            )}
            
            {isPublished && (
              <button class="platform-chip" onClick$={(e) => { e.stopPropagation(); showAnalytics.value = true; }} style="cursor: pointer;">
                <LuBarChart2 style="width:0.8rem;height:0.8rem;" />
                Analytics
              </button>
            )}
          </div>
          {post.errorMessage && (
            <span style="color: var(--danger); max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title={post.errorMessage}>
              Error
            </span>
          )}
          <span style="display:flex; align-items:center; margin-left: auto;">
            {getViaBadge(post, socialStore, ZERNIO_LOGO_WRAPPED, PLATFORM_ICONS)}
            {formatDate((post.scheduledFor || post.publishedAt || post.createdAt as number) * 1000)}
          </span>
        </div>
      </div>
    </div>
    
    <SlideOver open={showAnalytics} title="Post Analytics" width="50%">
      <SocialPostAnalytics data={analyticsData.value} />
    </SlideOver>
    </>
  );
});
