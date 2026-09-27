import { component$, useSignal, $, useStylesScoped$, useContext, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
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

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');
const ZERNIO_LOGO_WRAPPED = wrapIcon(zernioLogo);
const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg), x: wrapIcon(xFormerlyTwitterSvg), instagram: wrapIcon(instagramSvg), facebook: wrapIcon(facebookSvg),
  linkedin: wrapIcon(linkedinSvg), tiktok: wrapIcon(tiktokSvg), youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg), threads: wrapIcon(threadsSvg), reddit: wrapIcon(redditSvg),
  bluesky: wrapIcon(blueskySvg), snapchat: wrapIcon(snapchatSvg),
  default: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

const STYLES = `
  .calendar-container { padding: 0rem; margin-bottom: 2rem; width:100%; box-sizing:border-box; display: flex; flex-direction: column; background: var(--surface-2); border-radius: 0.85rem; border: 1px solid var(--border); overflow: hidden; }
  .cal-header-bar { display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); gap:1rem; }
  .cal-header-bar > :last-child { justify-self: end; }
  .cal-btn { padding:0.4rem 1rem; background:var(--surface-2); border:1px solid var(--border); border-radius:999px; color:var(--text-primary); font-size:0.85rem; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s; justify-self: start; }
  .cal-btn:hover { background:var(--surface-3); }
  .cal-nav-group { display:flex; align-items:center; gap:1.5rem; }
  .cal-nav-arrow { cursor:pointer; padding:0.2rem; display:flex; align-items:center; justify-content:center; border-radius:0.25rem; color:var(--text-secondary); }
  .cal-nav-arrow:hover { background:var(--surface-2); color:var(--text-primary); }
  .cal-month-info { text-align:center; display:flex; flex-direction:column; }
  .cal-month-title { font-size:1rem; font-weight:700; color:var(--text-primary); }
  .cal-month-sub { font-size:0.75rem; color:var(--text-secondary); }

  .calendar-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; background:var(--border); }
  .cal-dow { background:var(--surface-2); padding:1rem 0.5rem; font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary); text-align:center; }
  .cal-cell { background:var(--surface-2); min-height:120px; padding:0.5rem; display:flex; flex-direction:column; gap:0.25rem; }
  .cal-cell.other-month { background:var(--surface); opacity:0.5; }
  .cal-cell.today { background:color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
  .cal-day-num { font-size:0.8rem; font-weight:600; color:var(--text-secondary); margin-bottom:0.25rem; }
  .cal-day-num.today { background:var(--button-primary-bg); color:var(--button-primary-text); border-radius:50%; width:1.4rem; height:1.4rem; display:flex; align-items:center; justify-content:center; }

  .cal-post-chip { background:var(--accent); color:#fff; border-radius:0.35rem; padding:0.15rem 0.4rem; font-size:0.65rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; transition:opacity 0.1s; }
  .cal-post-chip:hover { opacity:0.85; }
  .cal-post-chip.draft { background:var(--surface); color:var(--text-secondary); border:1px solid var(--border); }
  .cal-post-chip.published { background:#dcfce7; color:#166534; }
  .cal-post-chip.failed { background:#fee2e2; color:#991b1b; }
  .cal-post-chip.scheduled { background:#dbeafe; color:#1d4ed8; }

  .cal-more { font-size:0.65rem; color:var(--text-secondary); cursor:pointer; }
  .cal-more:hover { color:var(--accent); }

  .post-detail-drawer {
    position:fixed; right:0; top:0; bottom:0; width:340px;
    background:var(--surface-2); border-left:1px solid var(--border);
    padding:1.5rem; overflow-y:auto; z-index:50;
    transform:translateX(100%); transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);
  }
  .post-detail-drawer.open { transform:translateX(0); }
  .drawer-close { position:absolute; top:1rem; right:1rem; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; padding:0.25rem 0.625rem; cursor:pointer; color:var(--text-secondary); }
  
  /* Post Card Styles (Copied from Posts Page) */
  .media-preview-container { width:100%; height:200px; border-radius:0.75rem 0.75rem 0 0; overflow:hidden; background:var(--surface-3); display:flex; align-items:center; justify-content:center; position:relative; }
  .media-preview-img { width:100%; height:100%; object-fit:cover; }
  .media-preview-count { position:absolute; bottom:0.5rem; right:0.5rem; background:rgba(0,0,0,0.6); color:white; font-size:0.7rem; padding:0.2rem 0.4rem; border-radius:0.25rem; font-weight:600; }

  .post-card { background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; display:flex; flex-direction:column; overflow:hidden; margin-top:1.5rem; }
  .post-card-body { padding:0.75rem; display:flex; flex-direction:column; flex:1; gap:0.5rem; }
  .post-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem; }
  .post-status-pill { padding:0.15rem 0.5rem; border-radius:1rem; border:1px solid var(--border); font-size:0.65rem; font-weight:600; text-transform:capitalize; background:var(--surface-3); color:var(--text-secondary); width:fit-content; }
  .post-status-pill-absolute { position:absolute; top:0.5rem; left:0.5rem; z-index:10; background:rgba(0,0,0,0.6); color:white; border:none; }
  .post-content { font-size:0.875rem; color:var(--text-primary); line-height:1.5; word-break:break-word; margin-bottom:0.25rem; white-space:pre-wrap; }
  .post-meta { font-size:0.75rem; color:var(--text-secondary); display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:auto; align-items:center; }
  .platform-chip { padding:0.25rem 0.5rem; border-radius:0.5rem; background:var(--surface); border:1px solid var(--border); font-size:0.7rem; color:var(--text-secondary); text-transform:capitalize; display:flex; align-items:center; gap:0.25rem; transition:background 0.15s; }
`;

const STATUS_CHIP: Record<string, string> = {
  draft:"draft", scheduled:"scheduled", published:"published", failed:"failed", publishing:"scheduled",
};

const formatDate = (timestampMs: number) => {
  const date = new Date(timestampMs);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    ...(isCurrentYear ? {} : { year: "numeric" })
  });
};

const getViaBadge = (post: any, socialStore: any) => {
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

const getMediaPreview = (post: any) => {
  if (!post.mediaItems) return null;
  try {
    const items = JSON.parse(post.mediaItems);
    if (Array.isArray(items) && items.length > 0) {
      return {
        url: items[0].url || items[0],
        count: items.length
      };
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

const getLocalYYYYMMDD = (d: Date) => {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

function buildCalendar(year: number, month: number, posts: any[]) {
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean; posts: any[] }[] = [];

  // Prev month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false, posts: [] });
  }
  // Current month
  for (let d = 1; d <= daysInMon; d++) {
    const date  = new Date(year, month, d);
    const dayStr = getLocalYYYYMMDD(date);
    const dayPosts = posts.filter((p: any) => {
      const sf = p.scheduledFor
        ? getLocalYYYYMMDD(new Date(p.scheduledFor * 1000))
        : p.status === "published" && p.publishedAt
          ? getLocalYYYYMMDD(new Date(p.publishedAt * 1000))
          : null;
      return sf === dayStr;
    });
    cells.push({ date, isCurrentMonth: true, posts: dayPosts });
  }
  // Next month padding to fill last row
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, next++), isCurrentMonth: false, posts: [] });
  }
  return cells;
}

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default component$(() => {
  useStylesScoped$(STYLES);

  const socialStore = useContext(SocialContext);
  const posts = useSignal<any[]>([]);
  const loading = useSignal(true);
  const now   = new Date();
  const viewYear  = useSignal(now.getFullYear());
  const viewMonth = useSignal(now.getMonth());
  const selected  = useSignal<any>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const res = await invoke("list_social_posts", { limit: 200 });
      posts.value = res as any[];
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const cells = buildCalendar(viewYear.value, viewMonth.value, posts.value);
  const monthLabel = new Date(viewYear.value, viewMonth.value, 1)
    .toLocaleString("en", { month: "long", year: "numeric" });

  const prevMonth = $(() => {
    if (viewMonth.value === 0) { viewYear.value--; viewMonth.value = 11; }
    else viewMonth.value--;
  });
  const nextMonth = $(() => {
    if (viewMonth.value === 11) { viewYear.value++; viewMonth.value = 0; }
    else viewMonth.value++;
  });

  const todayKey = getLocalYYYYMMDD(now);

  return (
    <div class="calendar-container">
      {/* Calendar nav */}
      <div class="cal-header-bar">
        <button class="cal-btn" onClick$={$(() => { viewYear.value = now.getFullYear(); viewMonth.value = now.getMonth(); })}>Today</button>

        <div class="cal-nav-group">
          <div class="cal-nav-arrow" onClick$={prevMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </div>
          <div class="cal-month-info">
            <span class="cal-month-title">{monthLabel}</span>
            <span class="cal-month-sub">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
          </div>
          <div class="cal-nav-arrow" onClick$={nextMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        </div>

        <div>
          {loading.value && <span style="font-size:0.8rem;color:var(--text-secondary);">Loading...</span>}
        </div>
      </div>

      {/* Calendar grid */}
      <div class="calendar-grid">
        {DOW.map((d) => <div class="cal-dow" key={d}>{d}</div>)}
        {cells.map((cell, i) => {
          const cellKey  = getLocalYYYYMMDD(cell.date);
          const isToday  = cellKey === todayKey;
          const visible  = cell.posts.slice(0, 3);
          const overflow = cell.posts.length - visible.length;
          return (
            <div
              key={i}
              class={`cal-cell${!cell.isCurrentMonth ? " other-month" : ""}${isToday ? " today" : ""}`}
            >
              <span class={`cal-day-num${isToday ? " today" : ""}`}>{cell.date.getDate()}</span>
              {visible.map((p: any) => (
                <div
                  key={p.id}
                  class={`cal-post-chip ${STATUS_CHIP[p.status] || "draft"}`}
                  onClick$={() => selected.value = p}
                  title={p.content}
                >
                  {p.content.slice(0, 30)}{p.content.length > 30 ? "…" : ""}
                </div>
              ))}
              {overflow > 0 && (
                <span class="cal-more">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Post detail drawer */}
      <div class={`post-detail-drawer${selected.value ? " open" : ""}`}>
        <button class="drawer-close" onClick$={() => selected.value = null}>✕</button>
        {selected.value && (() => {
          const post = selected.value;
          const media = getMediaPreview(post);
          return (
            <>
              <div style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:0.5rem;">Post Detail</div>
              <div class="post-card">
                {media && (
                  <div class="media-preview-container">
                    <span class="post-status-pill post-status-pill-absolute">
                      {post.status}
                    </span>
                    {media.url.match(/\.(mp4|webm)$/i) ? (
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
                    <div class="platform-chip">
                      <div dangerouslySetInnerHTML={PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default} style="width:0.8rem;height:0.8rem;" />
                      {post.platform}
                    </div>
                    <span style="display:flex; align-items:center; margin-left: auto;">
                      {getViaBadge(post, socialStore)}
                      {formatDate((post.scheduledFor || post.publishedAt || post.createdAt as number) * 1000)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Calendar — Social",
  meta: [{ name: "description", content: "Visual calendar for all your scheduled and published social posts." }],
};
