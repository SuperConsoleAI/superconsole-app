import { component$, useStylesScoped$, useContext } from "@builder.io/qwik";
import { type DocumentHead, Link } from "@builder.io/qwik-city";
import { SocialContext } from "./layout";
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

const STYLES = `
  .account-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .account-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .account-card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .account-avatar {
    width: 2.75rem; height: 2.75rem;
    border-radius: 0.5rem;
    object-fit: cover;
    background: var(--surface-1);
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 1.1rem; color: var(--text-primary);
    padding: 0.4rem;
  }
  .account-avatar :global(svg) { width:1.5rem !important; height:1.5rem !important; display:block; }
  .account-meta { flex: 1; min-width: 0; }
  .account-name { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .account-platform { font-size: 0.75rem; color: var(--text-secondary); text-transform: capitalize; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-dot.connected { background: #22c55e; }
  .status-dot.disconnected { background: #ef4444; }
  .account-stats {
    display: flex; gap: 1rem;
  }
  .account-stat { flex: 1; }
  .account-stat-value { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
  .account-stat-label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
  .account-actions { display: flex; gap: 0.5rem; margin-top: auto; }
  .btn-sm {
    padding: 0 1rem;
    height: 2.625rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease, opacity 150ms ease;
    text-decoration: none;
    flex: 1;
    box-sizing: border-box;
  }
  .btn-primary { 
    background: var(--button-primary-bg); 
    color: var(--button-primary-text); 
    border: none; 
  }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost { 
    background: transparent; 
    color: var(--text-primary); 
    border: 1px solid var(--border); 
  }
  .btn-ghost:hover { background: var(--surface-3); }
  .btn-danger { background: #fee2e2; color: #991b1b; }
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);
  }
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
  .empty-title { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
  .section-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 2rem 0 0.75rem; }
  .quick-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .stat-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .stat-card-value { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
  .stat-card-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; }
  .connect-prompt {
    background: linear-gradient(145deg, var(--accent), var(--accent-hover));
    border-radius: 0.75rem;
    padding: 1.5rem;
    color: var(--surface-1);
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .connect-prompt-text { flex: 1; }
  .connect-prompt h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
  .connect-prompt p { font-size: 0.85rem; opacity: 0.9; }
  .skeleton { background:var(--surface-3); border-radius:0.25rem; animation:pulse 1.5s infinite; }
  @keyframes pulse { 0% { opacity:0.6; } 50% { opacity:1; } 100% { opacity:0.6; } }
`;

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');
const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg), x: wrapIcon(xFormerlyTwitterSvg), instagram: wrapIcon(instagramSvg), facebook: wrapIcon(facebookSvg),
  linkedin: wrapIcon(linkedinSvg), tiktok: wrapIcon(tiktokSvg), youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg), threads: wrapIcon(threadsSvg), reddit: wrapIcon(redditSvg),
  bluesky: wrapIcon(blueskySvg), snapchat: wrapIcon(snapchatSvg),
  default: `<svg style="width:100%;height:100%;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

export default component$(() => {
  useStylesScoped$(STYLES);
  
  const store = useContext(SocialContext);

  const connected = store.accounts.filter((a) => a.isConnected);
  const total     = store.accounts.length;

  return (
    <>
      {store.loading ? (
          <div class="account-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} class="account-card">
                <div class="account-card-header">
                  <div class="skeleton" style="width:2.75rem;height:2.75rem;border-radius:0.5rem;" />
                  <div style="flex:1;">
                    <div class="skeleton" style="height:1rem;width:60%;margin-bottom:0.4rem;" />
                    <div class="skeleton" style="height:0.8rem;width:40%;" />
                  </div>
                </div>
                <div class="account-stats">
                  <div class="skeleton" style="height:2rem;width:100%;" />
                  <div class="skeleton" style="height:2rem;width:100%;" />
                </div>
                <div class="account-actions">
                  <div class="skeleton" style="height:2.2rem;width:100%;border-radius:0.5rem;" />
                  <div class="skeleton" style="height:2.2rem;width:100%;border-radius:0.5rem;" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Connect prompt if no accounts */}
            {total === 0 && (
              <div class="connect-prompt">
                <div style="font-size:2.5rem;">📡</div>
                <div class="connect-prompt-text">
                  <h3>Connect your social accounts</h3>
                  <p>Schedule posts, manage DMs, and track analytics across all platforms from one place.</p>
                </div>
                <Link href="/dashboard/social/accounts" style="padding:0 1rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;height:32px;box-sizing:border-box;transition:background 0.15s;background:var(--surface-1);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);flex-shrink:0;">
                  Connect Account
                </Link>
              </div>
            )}

            {/* Quick stats */}
            {total > 0 && (
              <>
                <div class="quick-stats">
                  <div class="stat-card">
                    <div class="stat-card-value">{total}</div>
                    <div class="stat-card-label">Accounts</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-card-value">{connected.length}</div>
                    <div class="stat-card-label">Connected</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-card-value">
                      {connected.reduce((sum: number, a: any) => sum + (a.followerCount || 0), 0).toLocaleString()}
                    </div>
                    <div class="stat-card-label">Total Followers</div>
                  </div>
                </div>

                <div class="section-title">Connected Accounts</div>
                <div class="account-grid">
                  {store.accounts.map((account: any) => (
                    <div class="account-card" key={account.id}>
                      <div class="account-card-header">
                        {account.avatarUrl ? (
                          <img src={account.avatarUrl} alt="" class="account-avatar" width={44} height={44} style="padding:0;" referrerPolicy="no-referrer" />
                        ) : (
                          <div class="account-avatar">
                            <div style="width:1.5rem;height:1.5rem;" dangerouslySetInnerHTML={PLATFORM_ICONS[account.platform] || PLATFORM_ICONS.default} />
                          </div>
                        )}
                        <div class="account-meta">
                          <div class="account-name">
                            {account.displayName || account.username || account.platform}
                          </div>
                          <div class="account-platform" style="display:flex;align-items:center;gap:0.375rem;">
                            <div class={`status-dot ${account.isConnected ? "connected" : "disconnected"}`} />
                            {account.username ? `@${account.username}` : account.platform}
                          </div>
                        </div>
                        <div style="width:1.25rem;height:1.25rem;margin-bottom:auto;margin-top:0.25rem;" dangerouslySetInnerHTML={PLATFORM_ICONS[account.platform] || PLATFORM_ICONS.default} />
                      </div>

                      <div class="account-stats">
                        <div class="account-stat">
                          <div class="account-stat-value">{(account.followerCount || 0).toLocaleString()}</div>
                          <div class="account-stat-label">Followers</div>
                        </div>
                        <div class="account-stat">
                          <div class="account-stat-value">{(account.followingCount || 0).toLocaleString()}</div>
                          <div class="account-stat-label">Following</div>
                        </div>
                      </div>

                      <div class="account-actions">
                        <Link 
                          href="/dashboard/social/posts" 
                          style={{
                            flex: 1,
                            height: "2rem",
                            background: "var(--surface-3)",
                            color: "var(--text-primary)",
                            border: "none",
                            borderRadius: "0.375rem",
                            fontSize: "0.8rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            transition: "background 150ms ease, opacity 150ms ease",
                            textDecoration: "none",
                          }}
                        >
                          Post
                        </Link>
                        <Link 
                          href="/dashboard/social/analytics" 
                          style={{
                            flex: 1,
                            height: "2rem",
                            background: "transparent",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            fontSize: "0.8rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            transition: "background 150ms ease, opacity 150ms ease",
                            textDecoration: "none",
                          }}
                        >
                          Analytics
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Social — Dashboard",
  meta: [{ name: "description", content: "Manage all your social media accounts, posts, and analytics." }],
};
