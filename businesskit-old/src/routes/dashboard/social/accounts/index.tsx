import { component$, useSignal, $, useStylesScoped$, useContext } from "@builder.io/qwik";
import { type DocumentHead, useNavigate } from "@builder.io/qwik-city";
import { LuTrash } from "@qwikest/icons/lucide";
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

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');

const STYLES = `
  .accounts-layout { display:grid; grid-template-columns:1fr 340px; gap:1.5rem; align-items:start; }
  @media(max-width:900px){ .accounts-layout { grid-template-columns:1fr; } }
  
  .connect-panel { background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; padding:1.5rem; position:sticky; top:0; margin-top:0; }
  
  .account-list { display:flex; flex-direction:column; gap:0.75rem; }
  .account-card { background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; padding:0.7rem; display:flex; align-items:center; gap:1rem; }
  .account-avatar { width:2.5rem; height:2.5rem; border-radius:0.5rem; border:1px solid var(--border); padding:0.4rem; display:flex; align-items:center; justify-content:center; font-size:1.25rem; font-weight:700; background:var(--surface-1); color:var(--text-primary); flex-shrink:0; }
  .account-info { flex:1; min-width:0; }
  .account-name { font-size:0.9rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .account-sub { font-size:0.75rem; color:var(--text-secondary); text-transform:capitalize; margin-top:0.15rem; }
  
  .connect-panel-title { font-size:1rem; font-weight:600; color:var(--text-primary); margin-bottom:1rem; }
  .platform-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:0.5rem; }
  .platform-btn { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.75rem 0.5rem; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.5rem; cursor:pointer; font-size:0.7rem; font-weight:600; color:var(--text-secondary); transition:all 0.15s; }
  .platform-btn:hover { border-color:var(--text-primary); color:var(--text-primary); }
  .platform-btn.selected { background:var(--surface-3); border-color:var(--text-primary); color:var(--text-primary); }
  .platform-icon { width:1.5rem; height:1.5rem; display:flex; align-items:center; justify-content:center; opacity:0.9; }
  
  .btn-oauth { width:100%; padding:0.6rem; border-radius:var(--radius-sm); background:var(--surface-3); border:1px solid var(--border); color:var(--text-primary); font-size:0.8rem; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; margin-bottom:0.5rem; transition:all 0.15s; }
  .btn-oauth:hover { border-color:var(--text-primary); }
  
  .btn-full { width:100%; padding:0.6rem; border-radius:var(--radius-sm); background:var(--button-primary-bg); color:var(--button-primary-text); font-size:0.8rem; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; margin-top:1rem; border:none; }
  .btn-full:hover { opacity:0.9; }

  .empty-state { text-align:center; padding:3rem; color:var(--text-secondary); font-size:0.875rem; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-lg); }

  .skeleton { background:var(--surface-3); border-radius:0.25rem; animation:pulse 1.5s infinite; }
  @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
`;

const PLATFORM_ICONS: Record<string, string> = {
  twitter: wrapIcon(xFormerlyTwitterSvg), x: wrapIcon(xFormerlyTwitterSvg), instagram: wrapIcon(instagramSvg), facebook: wrapIcon(facebookSvg),
  linkedin: wrapIcon(linkedinSvg), tiktok: wrapIcon(tiktokSvg), youtube: wrapIcon(youtubeSvg),
  pinterest: wrapIcon(pinterestSvg), threads: wrapIcon(threadsSvg), reddit: wrapIcon(redditSvg),
  bluesky: wrapIcon(blueskySvg), snapchat: wrapIcon(snapchatSvg), composio: wrapIcon(composioLogo),
};
const PLATFORMS = ["twitter", "instagram", "facebook", "linkedin", "tiktok", "youtube", "pinterest", "threads", "reddit", "bluesky", "snapchat"];
const ZERNIO_LOGO_WRAPPED = wrapIcon(zernioLogo);

export default component$(() => {
  useStylesScoped$(STYLES);
  const nav = useNavigate();
  const store = useContext(SocialContext);
  
  const selPlatform = useSignal<string>("");
  const disconnecting = useSignal<string | null>(null);
  
  const syncingConn = useSignal<string | null>(null);
  const syncError = useSignal<string>("");

  const connectPlatform = $(async (connId: string) => {
    try {
      const conn = store.connections.find(c => c.id === connId);
      if (!conn) return alert("Connection not found");
      
      const apiKey = conn.access_token || conn.accessToken || conn.client_id || conn.clientId;
      if (!apiKey) return alert("Connection missing API Key");

      const isZernio = conn.service?.toLowerCase().includes("zernio");
      const isComposio = conn.service?.toLowerCase().includes("composio");
      const ZERNIO_BASE = "https://zernio.com/api/v1";
      
      if (!isZernio && !isComposio) {
        alert("Native OAuth connecting not yet implemented. Please connect via Zernio or Composio.");
        return;
      }
      
      if (isComposio) {
        // Composio OAuth Flow
        const res = await fetch("https://backend.composio.dev/api/v3.1/connected_accounts/link", {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
             app: selPlatform.value,
             redirect_url: "businesskit://oauth-callback"
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.redirect_url || data.url) {
            const { open } = await import("@tauri-apps/plugin-shell");
            await open(data.redirect_url || data.url);
          } else {
             alert("Could not extract redirect URL from Composio.");
          }
        } else {
          alert("Failed to initiate Composio connection: " + await res.text());
        }
        return;
      }
      
      let externalProfileId = conn.external_profile_id || conn.externalProfileId;
      if (!externalProfileId) {
        const createRes = await fetch(`${ZERNIO_BASE}/profiles`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ name: "BusinessKit Desktop App" })
        });
        if (createRes.ok) {
          const profileData = await createRes.json();
          externalProfileId = profileData.id || profileData.profileId;
          try {
            await invoke("update_connection_profile_id", { id: connId, profileId: externalProfileId });
          } catch(e) { console.error("Could not update local db", e); }
        }
      }
      
      if (!externalProfileId) { alert("Could not create Zernio Profile."); return; }
      
      const connectParams = new URLSearchParams();
      connectParams.set("profileId", externalProfileId);
      connectParams.set("state", btoa(JSON.stringify({ platform: selPlatform.value, ts: Date.now(), mode: "desktop" })));
      
      // Attempting to use a deep link for the desktop app so it doesn't redirect to the webapp's /signin
      connectParams.set("redirectUri", "businesskit://oauth-callback");
      
      const res = await fetch(`${ZERNIO_BASE}/connect/${selPlatform.value}?${connectParams.toString()}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          const { open } = await import("@tauri-apps/plugin-shell");
          await open(data.authUrl);
        }
      }
    } catch (err) { console.error(err); }
  });

  const disconnect = $(async (id: string) => {
    disconnecting.value = id;
    try {
      await invoke("disconnect_social_account", { id });
      await store.refresh();
    } finally { disconnecting.value = null; }
  });

  const syncConnection = $(async (connId: string) => {
    syncingConn.value = connId;
    syncError.value = "";
    try {
      const conn = store.connections.find(c => c.id === connId);
      if (!conn) { syncError.value = "Connection not found locally."; return; }
      
      const isZernio = conn.service?.toLowerCase().includes("zernio");
      const isComposio = conn.service?.toLowerCase().includes("composio");
      if (!isZernio && !isComposio) return;
      
      const apiKey = conn.access_token || conn.accessToken || conn.client_id || conn.clientId;
      if (!apiKey) { syncError.value = "Missing API key in connection row."; return; }
      
      let url = "";
      let headers: any = {};
      
      if (isComposio) {
          url = "https://backend.composio.dev/api/v3.1/connected_accounts";
          headers = { "x-api-key": apiKey, "Accept": "application/json" };
      } else {
          const profileId = conn.external_profile_id || conn.externalProfileId;
          url = profileId 
            ? `https://zernio.com/api/v1/accounts?profileId=${profileId}`
            : "https://zernio.com/api/v1/accounts";
          headers = { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" };
      }
        
      const res = await fetch(url, { headers });
      
      if (res.ok) {
        const body = await res.json();
        let accounts = [];
        if (isComposio) {
            accounts = body.items || body.data || body.connectedAccounts || body || [];
        } else {
            accounts = body.accounts || body.data || body.social_accounts || body.socialAccounts || body || [];
        }

        if (accounts.length === 0) {
          syncError.value = "Provider returned 0 accounts! (No connected accounts on profile)";
        } else {
          const errs = [];
          for (const acc of accounts) {
            let platform = "unknown";
            let platformUserId = "";
            let username = null;
            let displayName = null;
            let avatarUrl = null;
            let bio = null;
            let verified = 0;
            let platformData = "";
            let followerCount = 0;
            let followingCount = 0;
            let postCount = 0;
            let accId = "";
            let profileId = null;

            if (isComposio) {
                if (acc.status && acc.status !== "ACTIVE") continue; // Skip non-active
                platform = (acc.toolkit?.slug || "composio_unknown").toLowerCase();
                accId = acc.id || acc.nanoid || "";
                
                let igUserId = acc.state?.val?.account_id || acc.user_id || accId;
                let igUsername = acc.alias || acc.state?.val?.username || acc.user_id || null;
                
                if (platform === "instagram") {
                    try {
                        const proxyRes = await fetch("https://backend.composio.dev/api/v3.1/tools/execute/proxy", {
                            method: "POST",
                            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                connected_account_id: accId,
                                endpoint: "https://graph.instagram.com/v21.0/me?fields=id,username",
                                method: "GET"
                            })
                        });
                        if (proxyRes.ok) {
                            const proxyBody = await proxyRes.json();
                            let parsed = proxyBody?.data || {};
                            if (typeof parsed === 'string') {
                                try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
                            }
                            if (parsed?.id) igUserId = parsed.id;
                            if (parsed?.username) igUsername = parsed.username;
                        }
                    } catch (e) { console.error("Composio proxy error", e); }
                }

                platformUserId = igUserId;
                username = igUsername;
                displayName = acc.alias || null;
                platformData = JSON.stringify(acc);
            } else {
                accId = acc._id || acc.id || acc.accountId;
                profileId = conn.external_profile_id || conn.externalProfileId || null;
                const profileData = acc.profile || acc.metadata?.profile || acc.raw || acc;
                const extraData = acc.metadata || {};
                
                platform = (acc.platform || "unknown").toLowerCase();
                platformUserId = acc.platformUserId || acc.platform_user_id || acc.metadata?.platformUserId || acc.metadata?.id || profileData.id || profileData.profileId || accId;
                followerCount = profileData.followerCount ?? profileData.followers_count ?? extraData.followerCount ?? 0;
                followingCount = profileData.followingCount ?? profileData.following_count ?? extraData.followingCount ?? 0;
                postCount = extraData.mediaCount ?? extraData.tweetCount ?? extraData.videoCount ?? 0;
                bio = profileData.bio || acc.metadata?.userProfile?.bio || null;
                verified = (extraData.isPremium || extraData.verifiedType) ? 1 : 0;
                platformData = JSON.stringify(extraData);
                username = acc.username || acc.handle || null;
                displayName = acc.displayName || acc.display_name || null;
                avatarUrl = acc.profilePicture || acc.profile_picture || acc.avatarUrl || acc.avatar_url || null;
            }

            try {
              await invoke("upsert_social_account", {
                platform: platform,
                platformUserId: platformUserId || "",
                username: username,
                displayName: displayName,
                avatarUrl: avatarUrl,
                platformBio: bio,
                platformVerified: verified,
                platformData: platformData,
                followerCount: followerCount,
                followingCount: followingCount,
                postCount: postCount,
                connectionId: connId,
                externalAccountId: accId || null,
                externalProfileId: profileId || null,
                tokenExpiresAt: 0,
              });
            } catch (err: any) {
              errs.push(String(err));
            }
          }
          if (errs.length > 0) syncError.value = "DB Save Errors: " + errs.join(", ");
        }
      } else {
        const text = await res.text();
        syncError.value = `Provider API Error ${res.status}: ${text}`;
      }
      await store.refresh();
      alert("Sync completed!");
    } catch (err: any) {
      syncError.value = `Network or unexpected error: ${err.message || err}`;
    } finally { syncingConn.value = null; }
  });

  return (
    <>
      {store.loading ? (
        <div class="account-list">
          {[1, 2, 3].map((i) => <div key={i} class="account-card"><div class="skeleton" style="width:3rem;height:3rem;border-radius:50%" /><div class="skeleton" style="height:1rem;width:40%" /></div>)}
        </div>
      ) : (
        <div class="accounts-layout">
          <div>
            {store.accounts.length === 0 ? (
              <div class="empty-state">No accounts connected yet.</div>
            ) : (
              <div class="account-list">
                {(() => {
                  const uniqueAccounts = store.accounts.filter((a: any, idx: number, arr: any[]) => arr.findIndex(x => x.id === a.id) === idx);
                  return uniqueAccounts.map((a: any) => {
                    const matchingAccounts = store.accounts.filter((acc: any) => acc.id === a.id);
                    const connIds = matchingAccounts.map((acc: any) => acc.connectionId || acc.connection_id).filter(Boolean);
                    const conns = connIds.map(cId => store.connections.find((c: any) => c.id === cId)).filter(Boolean);
                    
                    return (
                      <div class="account-card" key={a.id}>
                        <div class="account-avatar"><div style="width:1.5rem;height:1.5rem;" dangerouslySetInnerHTML={PLATFORM_ICONS[a.platform] || PLATFORM_ICONS.twitter} /></div>
                        <div class="account-info" style="flex:1;">
                          <div class="account-name">{a.displayName || a.username || a.platform}</div>
                          <div class="account-sub">{a.platform}</div>
                        </div>
                        {conns.length > 0 && (
                            <div style="display:flex;align-items:center;gap:0.3rem;margin-left:auto;margin-right:0.5rem;" title="Connections">
                               {conns.map((c: any, i: number) => {
                                   const isZernio = c.service?.toLowerCase().includes("zernio");
                                   const icon = isZernio ? ZERNIO_LOGO_WRAPPED : (PLATFORM_ICONS[c.service?.toLowerCase()] || ZERNIO_LOGO_WRAPPED);
                                   return <div key={c.id || i} style="width:1rem;height:1rem;display:flex;opacity:0.8;" dangerouslySetInnerHTML={icon} title={`Connected via ${c.name || c.service}`} />;
                               })}
                            </div>
                        )}
                        <span style={`padding:0.15rem 0.45rem;border-radius:1rem;font-size:0.68rem;font-weight:700;flex-shrink:0;${conns.length === 0 ? 'margin-left:auto;' : ''}${a.isConnected ? "background:var(--success-soft);color:var(--success);" : "background:var(--surface-1);color:var(--text-secondary);"}`}>
                          {a.isConnected ? "Connected" : "Disconnected"}
                        </span>
                        <div class="account-actions" style="margin-left:0.5rem;">
                          <button type="button" preventdefault:click class="btn-sm btn-danger" disabled={disconnecting.value === a.id} onClick$={() => disconnect(a.id)} style="padding:0.4rem;display:flex;align-items:center;justify-content:center;" title="Disconnect">
                            {disconnecting.value === a.id ? "…" : <LuTrash style="width:1rem;height:1rem;" />}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {store.connections.length > 0 && (
              <>
                <div style="font-size:0.875rem;font-weight:700;color:var(--text-primary);margin:1.5rem 0 0.75rem;">
                  API Keys ({store.connections.length})
                </div>
                {syncError.value && (
                  <div style="background:var(--error-soft);border:1px solid var(--error);color:var(--error);padding:0.75rem 1rem;border-radius:var(--radius-md);font-size:0.8rem;margin-bottom:1rem;font-weight:600;white-space:pre-wrap;">
                    {syncError.value}
                  </div>
                )}
                <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:1.5rem;">
                  {store.connections.map((c: any) => (
                    <div key={c.id} style="background:var(--surface-3);border-radius:var(--radius-md);border:1px solid var(--border);padding:0.7rem;display:flex;align-items:center;gap:1rem;">
                      <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0.4rem;">
                        <div style="width:1.5rem;height:1.5rem;" dangerouslySetInnerHTML={c.service?.toLowerCase().includes("zernio") ? ZERNIO_LOGO_WRAPPED : (PLATFORM_ICONS[c.service?.toLowerCase()] || ZERNIO_LOGO_WRAPPED)} />
                      </div>
                      
                      <div style="flex:1;min-width:0;">
                        <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{c.name || c.label || "API Key"}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);text-transform:capitalize;margin-top:0.1rem;">{c.service}</div>
                        {c.label && <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem;">{c.label}</div>}
                      </div>

                      <span style={`padding:0.15rem 0.45rem;border-radius:1rem;font-size:0.68rem;font-weight:700;flex-shrink:0;margin-left:0.5rem;${c.is_active !== false ? "background:var(--success-soft);color:var(--success);" : "background:var(--surface-1);color:var(--text-secondary);"}`}>
                        {c.is_active !== false ? "Active" : "Inactive"}
                      </span>
                      
                      <div style="display:flex;gap:0.4rem;flex-shrink:0;margin-left:0.5rem;">
                        {(c.service?.toLowerCase().includes("zernio") || c.service?.toLowerCase().includes("composio")) && (
                          <button
                            type="button" preventdefault:click
                            onClick$={() => syncConnection(c.id)}
                            disabled={syncingConn.value === c.id}
                            title="Sync connected accounts"
                            style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);padding:0.35rem 0.7rem;border-radius:var(--radius-sm);cursor:pointer;font-size:0.75rem;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:0.35rem;"
                          >
                            {syncingConn.value === c.id ? (
                              <svg style="animation:spin 1s linear infinite;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            )}
                            Sync
                          </button>
                        )}
                        <button
                          type="button" preventdefault:click
                          onClick$={() => nav("/dashboard/settings/connections")}
                          title="Manage Connection"
                          style="background:transparent;color:var(--text-secondary);border:1px solid var(--border);padding:0.35rem 0.7rem;border-radius:var(--radius-sm);cursor:pointer;font-size:0.75rem;font-weight:600;transition:all 0.15s;"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div class="connect-panel">
            <div class="connect-panel-title">🔗 Connect Account</div>
            <div class="platform-grid">
              {PLATFORMS.map((p) => (
                <button type="button" preventdefault:click key={p} class={`platform-btn${selPlatform.value === p ? " selected" : ""}`} onClick$={() => selPlatform.value = selPlatform.value === p ? "" : p}>
                  <span class="platform-icon" dangerouslySetInnerHTML={PLATFORM_ICONS[p]} />
                  <span style="text-transform:capitalize;">{p}</span>
                </button>
              ))}
            </div>
            {selPlatform.value && (
              <div style="margin-top:1rem;margin-bottom:1rem;">
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:0.5rem;">
                  2. Select Connection
                </div>
                {(() => {
                  const validConns = store.connections.filter((c: any) => {
                    const svc = c.service?.toLowerCase() || "";
                    return svc.includes("zernio") || svc.includes("composio") || svc === selPlatform.value.toLowerCase();
                  });
                  return validConns.length > 0 ? validConns.map((c: any) => {
                    const isZernio = c.service?.toLowerCase().includes("zernio");
                    const isComposio = c.service?.toLowerCase().includes("composio");
                    const icon = isZernio ? ZERNIO_LOGO_WRAPPED : (PLATFORM_ICONS[c.service?.toLowerCase()] || ZERNIO_LOGO_WRAPPED);
                    const providerName = isZernio ? "Zernio" : (isComposio ? "Composio" : (c.service?.charAt(0).toUpperCase() + c.service?.slice(1)));
                    return (
                      <button type="button" preventdefault:click key={c.id} class="btn-oauth" onClick$={() => connectPlatform(c.id)}>
                        <span style="display:flex;align-items:center;justify-content:center;width:1.2rem;height:1.2rem;margin-right:0.3rem;" dangerouslySetInnerHTML={icon} /> 
                        Connect {selPlatform.value.charAt(0).toUpperCase() + selPlatform.value.slice(1)} via {c.name || c.label || providerName}
                      </button>
                    );
                  }) : (
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;text-align:center;">
                      No connections found. Add one below.
                    </div>
                  );
                })()}
              </div>
            )}
            
            <div class="divider" />
            
            <button class="btn-full" style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);margin-top:0;" onClick$={() => nav("/dashboard/settings/connections")}>
              ➕ Add Connection
            </button>
          </div>
        </div>
      )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Accounts — Social",
  meta: [{ name: "description", content: "Connect and manage your social media accounts and Zernio API keys." }],
};
