import { component$, useSignal, useVisibleTask$, $, useStylesScoped$, useContext } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";

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

import composioLogo from "~/assets/composio.svg?raw";

import { SocialProfileAnalytics } from "~/components/social/analytics/SocialProfileAnalytics";
import { SocialPostAnalytics } from "~/components/social/analytics/SocialPostAnalytics";
import { SocialContext } from "~/routes/dashboard/social/layout";

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');
const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg), x: wrapIcon(xFormerlyTwitterSvg), instagram: wrapIcon(instagramSvg), facebook: wrapIcon(facebookSvg),
  linkedin: wrapIcon(linkedinSvg), tiktok: wrapIcon(tiktokSvg), youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg), threads: wrapIcon(threadsSvg), reddit: wrapIcon(redditSvg),
  bluesky: wrapIcon(blueskySvg), snapchat: wrapIcon(snapchatSvg),
  composio: wrapIcon(composioLogo),
  default: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

export default component$(() => {
  useStylesScoped$(`
    .filters-bar { display:flex; align-items:center; justify-content:space-between; }
    .filter-group-box { display:flex; gap:0.25rem; background:var(--surface-2); border:1px solid var(--border); border-radius:0.5rem; padding:0.25rem; }
    .filter-btn-icon { width:32px; height:32px; padding:0.375rem; border-radius:0.375rem; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer; color:var(--text-secondary); transition:all 0.15s; }
    .filter-btn-icon:hover { background:var(--surface-3); color:var(--text-primary); }
    .filter-btn-icon.active { background:var(--surface-3); color:var(--text-primary); }
  `);

  const socialStore = useContext(SocialContext);
  const accounts = socialStore.accounts.filter((a: any) => a.isConnected);
  const connectedPlatforms = Array.from(new Set(accounts.map((a: any) => a.platform))) as string[];

  const profileData = useSignal<any>(null);
  const postData = useSignal<any[]>([]);
  const isSyncing = useSignal(false);
  const activeTab = useSignal<"profile" | "posts">("profile");
  const platformFilter = useSignal<string>("");

  const fetchData = $(async () => {
    try {
      const profileId = localStorage.getItem('bk-active-profile');
      if (!profileId) return;

      const profileStats = await invoke("get_social_analytics_view", { profileId });
      profileData.value = profileStats;

      const postsStats = await invoke("get_social_post_analytics", { profileId });
      postData.value = postsStats as any[];

    } catch (e) {
      console.error("Failed to load analytics", e);
    }
  });

  const syncAnalytics = $(async () => {
    try {
      isSyncing.value = true;
      const profileId = localStorage.getItem('bk-active-profile');
      if (!profileId) return;

      // The Rust command should handle the 24h logic and call Zernio if needed
      await invoke("sync_social_analytics", { profileId });
      await invoke("sync_social_posts_analytics", { profileId });

      await fetchData();
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      isSyncing.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
    // Auto-sync on load (Rust backend enforces 24h limit)
    await syncAnalytics();
  });

  return (
    <div style="display: flex; flex-direction: column; gap: 1.5rem; width: 100%;">
      
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
        </div>
        
        {/* Right: Toggle */}
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <div style="display: flex; background: var(--surface-2); padding: 0.25rem; border-radius: 0.5rem; border: 1px solid var(--border);">
            <button
              onClick$={() => activeTab.value = "profile"}
              style={`padding: 0.5rem 1rem; border-radius: 0.35rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; border: none; ${activeTab.value === 'profile' ? 'background: var(--surface-3); color: var(--text-primary);' : 'background: transparent; color: var(--text-secondary);'}`}
            >
              Profile Overview
            </button>
            <button
              onClick$={() => activeTab.value = "posts"}
              style={`padding: 0.5rem 1rem; border-radius: 0.35rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; border: none; ${activeTab.value === 'posts' ? 'background: var(--surface-3); color: var(--text-primary);' : 'background: transparent; color: var(--text-secondary);'}`}
            >
              Post Performance
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style="flex: 1; min-height: 0;">
        {activeTab.value === "profile" && (
          <SocialProfileAnalytics data={profileData.value} platformFilter={platformFilter.value} />
        )}
        
        {activeTab.value === "posts" && (
          <SocialPostAnalytics data={postData.value} platformFilter={platformFilter.value} />
        )}
      </div>
      
    </div>
  );
});
