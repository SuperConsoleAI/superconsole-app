import { component$, $, useSignal, useVisibleTask$, useStylesScoped$, useContext } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuRefreshCw } from "@qwikest/icons/lucide";

import { SocialContext } from "../layout";
import { SocialInboxSidebar } from "~/components/social/InboxSidebar";
import { SocialInboxThread, type SocialMessage } from "~/components/social/InboxThread";
import { SocialInboxContactDetails } from "~/components/social/InboxContactDetails";

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

export default component$(() => {
  useStylesScoped$(`
    .inbox-layout { display:flex;flex:1;height:100%;overflow:hidden;gap:0.5rem;padding:0;box-sizing:border-box; position:relative; }
    
    .panel-left { width: 320px; flex-shrink: 0; display:flex; flex-direction:column; }
    .panel-center { flex:1; display:flex; flex-direction:column; min-width:0; position:relative; }
    .panel-right { width: 300px; flex-shrink: 0; display:flex; flex-direction:column; transition: transform 0.3s ease; }
    
    @media (max-width: 1024px) {
      .panel-right { display: none; }
      .panel-right.open { display: flex; flex: 1; min-width: 0; }
      .panel-center.hide-on-tablet { display: none; }
    }
    
    @media (max-width: 768px) {
      .panel-left { flex: 1; width: auto; }
      .panel-left.hide-on-mobile { display: none; }
      .panel-center { flex: 1; width: auto; }
      .panel-right.open { flex: 1; width: auto; }
      .empty-state { display: none !important; }
    }
    
    .filter-btn-icon { height:32px; padding:0 0.5rem; border-radius:0.375rem; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer; color:var(--text-secondary); transition:all 0.15s; }
    .filter-btn-icon:hover { background:var(--surface-3); color:var(--text-primary); }
    
    @keyframes spin { 100% { transform:rotate(360deg); } }
    .spin { animation:spin 1s linear infinite; }
  `);

  const socialStore = useContext(SocialContext);
  const accounts = socialStore.accounts.filter((a) => a.isConnected);
  
  const activeMessages = useSignal<SocialMessage[]>([]);
  const selectedId = useSignal<string | null>(null);
  const selectedAccountId = useSignal<string>(""); // "" means all accounts
  const showDetails = useSignal(false);
  const isLoadingMessages = useSignal(false);
  const syncingMessages = useSignal(false);

  const filteredConversations = socialStore.inboxConversations.filter(c => {
    if (selectedAccountId.value) {
      const selectedAcc = accounts.find((a: any) => a.id === selectedAccountId.value);
      if (selectedAcc) {
        // Match by username (case insensitive) if available
        if (c.accountUsername && selectedAcc.username) {
          if (c.accountUsername.toLowerCase() !== selectedAcc.username.toLowerCase()) {
            return false;
          }
        } else if (c.platform && selectedAcc.platform) {
          // Fallback to platform if username missing
          if (c.platform.toLowerCase() !== selectedAcc.platform.toLowerCase()) {
            return false;
          }
        }
      }
    }
    return true;
  });

  const selectedContact = filteredConversations.find(c => c.id === selectedId.value) ?? null;

  const fetchConversations = $(async () => {
    try {
      const profileId = localStorage.getItem('bk-active-profile');
      if (!profileId) return;
      
      const data: any[] = await invoke("list_inbox_conversations", { profileId });
      socialStore.inboxConversations = data.map(d => {
        let accUsername = d.accountId || "";
        const connName = d.inboxSource || "";
        let connIcon: string | undefined = undefined;
        
        const acc = socialStore.accounts.find((a: any) => String(a.id) === String(d.accountId) || String(a.externalAccountId) === String(d.accountId));
        if (acc) {
            if (acc.username) accUsername = acc.username;
        }

        if (connName) {
            const isZernio = connName.toLowerCase().includes("zernio");
            if (isZernio) {
                connIcon = ZERNIO_LOGO_WRAPPED;
            } else {
                const conn = socialStore.connections.find((c: any) => c.name === connName || c.label === connName);
                if (conn) {
                    connIcon = PLATFORM_ICONS[conn.service?.toLowerCase()] || undefined;
                }
            }
        }

        return {
          id: d.id,
          platform: d.platform || "instagram",
          accountId: d.accountId || "",
          accountUsername: accUsername,
          participantId: d.participantPlatformId || d.participantUsername || "",
          participantName: d.participantName || d.participantUsername || "Unknown Contact",
          participantPicture: d.participantPicture || undefined,
          lastMessage: d.lastMessagePreview || "",
          updatedTime: d.lastMessageAt ? new Date(d.lastMessageAt * 1000).toISOString() : new Date().toISOString(),
          status: d.status || "open",
          unreadCount: d.unreadCount || 0,
          connectionName: connName,
          connectionIcon: connIcon,
          crmContactId: d.crmContactId || undefined
        };
      });
    } catch (e: any) {
      console.error("Failed to load local inbox", e);
    }
  });

  const syncConversations = $(async () => {
    try {
      const profileId = localStorage.getItem('bk-active-profile');
      if (!profileId) return;
      await invoke("zernio_list_inbox_conversations", { profileId });
      await fetchConversations(); // update UI after sync
    } catch (e: any) {
      console.error("Failed to sync inbox", e);
      alert("Failed to sync conversations:\n" + e);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (!socialStore.inboxFetched) {
      socialStore.inboxLoading = true;
      fetchConversations().then(() => {
        socialStore.inboxFetched = true;
        socialStore.inboxLoading = false;
        handleSync();
      });
    } else {
      // Always do a silent background sync when revisiting the tab
      handleSync();
    }
  });

  const handleSync = $(async () => {
    socialStore.inboxSyncing = true;
    try {
      await syncConversations();
    } finally {
      socialStore.inboxSyncing = false;
    }
  });

  const handleSelectConversation = $((id: string) => {
    selectedId.value = id;
    showDetails.value = false;
    
    // Optimistically load from cache
    if (socialStore.inboxMessages[id]) {
      activeMessages.value = socialStore.inboxMessages[id];
      isLoadingMessages.value = false;
    } else {
      activeMessages.value = [];
      isLoadingMessages.value = true;
    }

    const contact = socialStore.inboxConversations.find(c => c.id === id);
    if (!contact) return;

    const profileId = localStorage.getItem('bk-active-profile') || "";

    invoke("zernio_get_inbox_messages", {
      profileId: profileId,
      conversationId: id
    }).then((res: any) => {
      if (res && Array.isArray(res)) {
        const msgs = res.map(m => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderPlatformId || "unknown",
          senderName: m.senderUsername || m.senderDisplayName || "Unknown",
          text: m.content || "",
          timestamp: m.receivedAt ? new Date(m.receivedAt * 1000).toISOString() : new Date().toISOString(),
          isOwn: m.isOwn
        }));
        if (selectedId.value === id) {
          activeMessages.value = msgs;
        }
        socialStore.inboxMessages = { ...socialStore.inboxMessages, [id]: msgs };
      }
    }).catch(e => {
      console.error("Failed to load messages:", e);
    }).finally(() => {
      if (selectedId.value === id) {
        isLoadingMessages.value = false;
      }
      
      // Background sync to fetch any new messages silently
      handleRefreshThread();
    });
  });

  const handleRefreshThread = $(async () => {
    const id = selectedId.value;
    if (!id) return;
    const contact = socialStore.inboxConversations.find(c => c.id === id);
    if (!contact) return;
    
    syncingMessages.value = true;
    try {
      const profileId = localStorage.getItem('bk-active-profile') || "";
      const syncedRes: any = await invoke("zernio_sync_inbox_messages", {
        profileId: profileId,
        conversationId: id,
        apiKey: "",
        accountId: contact.accountId
      });
      if (syncedRes && Array.isArray(syncedRes)) {
        const msgs = syncedRes.map(m => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderPlatformId || "unknown",
          senderName: m.senderUsername || m.senderDisplayName || "Unknown",
          text: m.content || "",
          timestamp: m.receivedAt ? new Date(m.receivedAt * 1000).toISOString() : new Date().toISOString(),
          isOwn: m.isOwn
        }));
        if (selectedId.value === id) {
          activeMessages.value = msgs;
        }
        socialStore.inboxMessages = { ...socialStore.inboxMessages, [id]: msgs };
      }
    } catch (e) {
      console.error("Failed to sync messages:", e);
    } finally {
      syncingMessages.value = false;
    }
  });

  const handleSendMessage = $(async (text: string) => {
    if (!selectedContact) return;

    // Optimistic UI
    const tempId = Date.now().toString();
    activeMessages.value = [...activeMessages.value, {
      id: tempId,
      conversationId: selectedContact.id,
      senderId: selectedContact.accountId,
      senderName: selectedContact.accountUsername,
      text,
      timestamp: new Date().toISOString(),
      isOwn: true
    }];

    try {
      const profileId = localStorage.getItem('bk-active-profile') || "";
      await invoke("zernio_send_inbox_message", {
        profileId: profileId,
        conversationId: selectedContact.id,
        apiKey: (selectedContact as any).apiKey || "",
        accountId: selectedContact.accountId,
        text
      });
      // Optionally reload messages after sending
    } catch (e) {
      console.error("Failed to send message:", e);
      // Remove optimistic message on fail
      activeMessages.value = activeMessages.value.filter(m => m.id !== tempId);
    }
  });

  return (
    <div class="page-full" style="padding:1rem 1rem 3rem 1rem;box-sizing:border-box;background:var(--background);display:flex;flex-direction:column;gap:0.75rem;">
      {(socialStore.loading || socialStore.inboxLoading) ? (
        <div style="display:flex;flex-direction:column;gap:0.75rem;height:100%;">
          <div class="skeleton" style="height:48px; border-radius:0.75rem; width:100%;" />
          <div class="inbox-layout" style="opacity: 0.7; pointer-events: none; padding: 1rem; gap: 1rem; border:1px solid var(--border);border-radius:0.75rem;">
            <div class="panel-left" style="gap: 0.75rem;">
               <div class="skeleton" style="height:72px; border-radius:12px; width: 100%;" />
               <div class="skeleton" style="height:72px; border-radius:12px; width: 100%;" />
               <div class="skeleton" style="height:72px; border-radius:12px; width: 100%;" />
               <div class="skeleton" style="height:72px; border-radius:12px; width: 100%;" />
            </div>
            <div class="panel-center" style="gap: 1rem; padding: 2rem;">
               <div class="skeleton" style="height:48px; width:40%; border-radius:12px; align-self: flex-start;" />
               <div class="skeleton" style="height:100px; width:60%; border-radius:12px; align-self: flex-start;" />
               <div class="skeleton" style="height:80px; width:50%; border-radius:12px; align-self: flex-end;" />
               <div class="skeleton" style="height:60px; width:70%; border-radius:12px; align-self: flex-start;" />
            </div>
          </div>
        </div>
      ) : socialStore.error ? (
        <div class="p-6 bg-red-50 text-red-600 rounded-xl border border-red-200">
          Error loading inbox: {socialStore.error}
        </div>
      ) : (
        <>
          <div style="display:flex;gap:0.35rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;padding:0.35rem;align-items:center;overflow-x:auto;">
            <button
              class="filter-btn-icon"
              style={`padding:0.25rem 0.5rem; border-radius:0.35rem; min-width:auto; height:1.75rem; ${!selectedAccountId.value ? 'background:var(--surface-3);color:var(--text-primary);' : ''}`}
              onClick$={() => selectedAccountId.value = ""}
              title="All Accounts"
            >
              <div style="font-weight:700;font-size:0.65rem;">ALL</div>
            </button>
            {accounts.length > 0 && <div style="width:1px; background:var(--border); margin:0.15rem 0.35rem; align-self:stretch;" />}
            {accounts.map((acc: any) => (
              <button
                key={acc.id}
                class="filter-btn-icon"
                style={`display:flex;align-items:center;gap:0.35rem;padding-left:0.35rem;padding-right:0.5rem;width:auto;height:1.75rem;border-radius:0.35rem; ${selectedAccountId.value === acc.id ? 'background:var(--surface-3);color:var(--text-primary);' : ''}`}
                onClick$={() => selectedAccountId.value = acc.id}
              >
                <div dangerouslySetInnerHTML={PLATFORM_ICONS[acc.platform] || PLATFORM_ICONS.default} style="width:1rem;height:1rem;" />
                <span style="font-size:0.75rem;font-weight:600;white-space:nowrap;">{acc.username}</span>
              </button>
            ))}
            
            <div style="margin-left:auto; display:flex; gap:0.35rem;">
              <button 
                class="filter-btn-icon"
                style="height:2rem; width:2rem; border-radius:0.35rem; display:flex; align-items:center; justify-content:center;"
                onClick$={handleSync}
                disabled={socialStore.inboxSyncing}
                title="Sync with Zernio"
              >
                <LuRefreshCw class={socialStore.inboxSyncing ? "spin" : ""} style="width:1.25rem;height:1.25rem;" />
              </button>
            </div>
          </div>

          <div class="inbox-layout">
            {/* Left: contact list */}
            <div class={["panel-left", selectedContact ? "hide-on-mobile" : ""]} >
              <SocialInboxSidebar
                conversations={filteredConversations}
                selectedId={selectedId.value}
                onSelect$={handleSelectConversation}
              />
            </div>

            {/* Center: thread or empty state */}
            {selectedContact ? (
              <>
                <div class={["panel-center", showDetails.value ? "hide-on-tablet" : ""]}>
                  <SocialInboxThread
                    conversation={selectedContact}
                    messages={activeMessages.value}
                    onToggleDetails$={$(() => { showDetails.value = !showDetails.value; })}
                    onBack$={$(() => { selectedId.value = null; })}
                    onSendMessage$={handleSendMessage}
                    onRefresh$={handleRefreshThread}
                    isRefreshing={syncingMessages.value}
                  />
                </div>

                {/* Right: contact details */}
                <div class={["panel-right", showDetails.value ? "open" : ""]}>
                  <SocialInboxContactDetails
                    conversation={selectedContact}
                    onClose$={$(() => { showDetails.value = false; })}
                  />
                </div>
              </>
            ) : (
              <div class={["empty-state", "flex", "flex-col"]} style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-direction:column;gap:0.75rem;border:1px solid var(--border);border-radius:0.75rem;background:var(--surface-1);">
                <div style="font-size:3rem;">💬</div>
                <div style="font-size:1rem;font-weight:600;">Select a conversation</div>
                <div style="font-size:0.875rem;">to view the thread</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Social Inbox — BusinessKit",
};
