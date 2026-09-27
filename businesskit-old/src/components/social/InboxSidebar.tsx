import { component$, PropFunction, useStylesScoped$ } from "@builder.io/qwik";
import { LuSearch } from "@qwikest/icons/lucide";
import { svg as xFormerlyTwitterSvg } from "thesvg/x-formerly-twitter";
import { svg as instagramSvg } from "thesvg/instagram";
import { svg as facebookSvg } from "thesvg/facebook";
import { svg as linkedinSvg } from "thesvg/linkedin";
import { svg as tiktokSvg } from "thesvg/tiktok";
import { svg as youtubeSvg } from "thesvg/youtube";
import { svg as pinterestSvg } from "thesvg/pinterest";
import { svg as redditSvg } from "thesvg/reddit";

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');
const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg),
  x: wrapIcon(xFormerlyTwitterSvg),
  instagram: wrapIcon(instagramSvg),
  facebook: wrapIcon(facebookSvg),
  googlebusiness: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
  linkedin: wrapIcon(linkedinSvg),
  tiktok: wrapIcon(tiktokSvg),
  youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg),
  reddit: wrapIcon(redditSvg),
  default: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`
};

export interface SocialConversation {
  id: string;
  platform: string;
  accountId: string;
  accountUsername: string;
  participantId: string;
  participantName: string;
  participantPicture: string | null;
  lastMessage: string;
  updatedTime: string;
  status: string;
  unreadCount: number | null;
  connectionName?: string;
  connectionIcon?: string;
  crmContactId?: string;
}

interface Props {
  conversations: SocialConversation[];
  selectedId: string | null;
  onSelect$: PropFunction<(id: string) => void>;
}

export const SocialInboxSidebar = component$<Props>(({ conversations, selectedId, onSelect$ }) => {
  useStylesScoped$(`
    .sidebar { display:flex; flex-direction:column; height:100%; border:1px solid var(--border); border-radius:0.75rem; background:var(--surface-2); overflow:hidden; }
    .header { padding:1rem; border-bottom:1px solid var(--border); }
    .title { font-size:1.125rem; font-weight:700; color:var(--text-primary); margin-bottom:0.75rem; }
    .search-wrap { position:relative; }
    .search-icon { position:absolute; left:0.75rem; top:50%; transform:translateY(-50%); color:var(--text-secondary); width:1rem; height:1rem; }
    .search-input { width:100%; padding:0.5rem 0.5rem 0.5rem 2.25rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--surface); color:var(--text-primary); font-size:0.875rem; box-sizing:border-box; }
    
    .list { flex:1; overflow-y:auto; padding:0.5rem; }
    .item { display:flex; padding:0.75rem; gap:0.75rem; border-radius:0.5rem; cursor:pointer; transition:all 0.15s; border:1px solid transparent; align-items:center; }
    .item:hover { background:var(--surface-3); }
    .item.active { background:color-mix(in srgb, var(--accent) 10%, var(--surface-2)); border-color:color-mix(in srgb, var(--accent) 20%, transparent); }
    
    .avatar-wrap { position:relative; width:2.5rem; height:2.5rem; flex-shrink:0; }
    .avatar { width:100%; height:100%; border-radius:50%; background:var(--surface); object-fit:cover; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-weight:600; box-shadow: 0 0 0 2px var(--border); }
    .platform-badge { position:absolute; bottom:-2px; right:-2px; width:1.15rem; height:1.15rem; border-radius:50%; background:var(--surface-2); display:flex; align-items:center; justify-content:center; box-shadow: 0 0 0 2px var(--surface-2); border:1px solid var(--border); font-size:0.65rem; overflow:hidden; }
    .platform-badge > div { width: 65%; height: 65%; display: flex; align-items: center; justify-content: center; }
    
    .content { flex:1; min-width:0; display:flex; flex-direction:column; gap:0.25rem; }
    .top-row { display:flex; justify-content:space-between; align-items:baseline; }
    .name { font-size:0.875rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .time { font-size:0.7rem; color:var(--text-secondary); white-space:nowrap; }
    
    .bottom-row { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
    .preview { font-size:0.8rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .unread { background:var(--button-primary-bg); color:var(--button-primary-text); font-size:0.65rem; font-weight:700; padding:0.1rem 0.35rem; border-radius:1rem; }
    
    .empty { padding:2rem 1rem; text-align:center; color:var(--text-secondary); font-size:0.875rem; }
  `);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  };

  const getPlatformIcon = (platform: string) => {
    return PLATFORM_ICONS[platform.toLowerCase()] || PLATFORM_ICONS.default;
  };

  return (
    <div class="sidebar">
      <div class="header">
        <div class="search-wrap">
          <LuSearch class="search-icon" />
          <input type="text" placeholder="Search conversations..." class="search-input" />
        </div>
      </div>
      
      <div class="list">
        {conversations.length === 0 ? (
          <div class="empty">No conversations found</div>
        ) : (
          conversations.map(conv => (
            <div 
              key={conv.id} 
              class={["item", selectedId === conv.id ? "active" : ""]}
              onClick$={() => onSelect$(conv.id)}
            >
              <div class="avatar-wrap">
                {conv.participantPicture ? (
                  <img src={conv.participantPicture} class="avatar" width={40} height={40} alt="Avatar" />
                ) : (
                  <div class="avatar">{conv.participantName.charAt(0).toUpperCase()}</div>
                )}
                <div class="platform-badge" title={conv.platform}>
                  <div dangerouslySetInnerHTML={getPlatformIcon(conv.platform)} />
                </div>
              </div>
              <div class="content">
                <div class="top-row">
                  <div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;">
                    <span class="name">{conv.participantName}</span>
                    {conv.connectionName && (
                      <span style="display:inline-flex; align-items:center; gap:0.25rem; background:var(--surface-3); padding:0.15rem 0.35rem; border-radius:0.25rem; font-size:0.55rem; font-weight:600; color:var(--text-primary); flex-shrink:0;">
                        {conv.connectionIcon && <div style="width:0.6rem; height:0.6rem; display:flex; align-items:center; opacity:0.8;" dangerouslySetInnerHTML={conv.connectionIcon} />}
                        {conv.connectionName}
                      </span>
                    )}
                  </div>
                  <span class="time">{formatTime(conv.updatedTime)}</span>
                </div>
                <div class="bottom-row">
                  <span class="preview">{conv.lastMessage}</span>
                  {(conv.unreadCount && conv.unreadCount > 0) ? (
                    <span class="unread">{conv.unreadCount}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
