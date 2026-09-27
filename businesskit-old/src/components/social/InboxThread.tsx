import { component$, PropFunction, useStylesScoped$ } from "@builder.io/qwik";
import { LuSend, LuInfo, LuArrowLeft, LuRefreshCw } from "@qwikest/icons/lucide";
import type { SocialConversation } from "./InboxSidebar";

export interface SocialMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isOwn: boolean;
}

interface Props {
  conversation: SocialConversation;
  messages: SocialMessage[];
  onToggleDetails$: PropFunction<() => void>;
  onBack$: PropFunction<() => void>;
  onSendMessage$: PropFunction<(text: string) => void>;
  onRefresh$?: PropFunction<() => void>;
  isRefreshing?: boolean;
}

export const SocialInboxThread = component$<Props>(({ conversation, messages, onToggleDetails$, onBack$, onSendMessage$, onRefresh$, isRefreshing }) => {
  useStylesScoped$(`
    .thread { display:flex; flex-direction:column; height:100%; border:1px solid var(--border); border-radius:0.75rem; background:var(--surface-1); overflow:hidden; position:relative; }
    
    .header { display:flex; align-items:center; justify-content:space-between; padding:1rem; border-bottom:1px solid var(--border); background:var(--surface-2); }
    .header-left { display:flex; align-items:center; gap:0.75rem; }
    .back-btn { display:none; background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.25rem; }
    @media (max-width:768px) { .back-btn { display:flex; } }
    .header-avatar { width:2.25rem; height:2.25rem; border-radius:50%; background:var(--surface); object-fit:cover; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-weight:600; box-shadow: 0 0 0 2px var(--border); }
    .header-info { display:flex; flex-direction:column; }
    .header-name { font-size:1rem; font-weight:700; color:var(--text-primary); }
    .header-platform { font-size:0.75rem; color:var(--text-secondary); text-transform:capitalize; }
    .header-actions { display:flex; gap:0.5rem; }
    .icon-btn { width:2rem; height:2rem; border-radius:50%; border:1px solid var(--border); background:var(--surface-2); color:var(--text-secondary); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.15s; }
    .icon-btn:hover { background:var(--surface-3); color:var(--text-primary); }
    
    .messages-area { flex:1; padding:1.5rem; overflow-y:auto; display:flex; flex-direction:column; gap:1rem; }
    
    .msg-wrap { display:flex; flex-direction:column; max-width:75%; }
    .msg-wrap.own { align-self:flex-end; align-items:flex-end; }
    .msg-wrap.other { align-self:flex-start; align-items:flex-start; }
    
    .msg-bubble { padding:0.75rem 1rem; border-radius:1rem; font-size:0.9rem; line-height:1.4; color:var(--text-primary); }
    .msg-wrap.own .msg-bubble { background:var(--button-primary-bg); color:var(--button-primary-text); border-bottom-right-radius:0.25rem; }
    .msg-wrap.other .msg-bubble { background:var(--surface-2); border:1px solid var(--border); border-bottom-left-radius:0.25rem; }
    
    .msg-time { font-size:0.65rem; color:var(--text-secondary); margin-top:0.25rem; }
    
    .compose-area { padding:1rem; border-top:1px solid var(--border); background:var(--surface-2); display:flex; gap:0.5rem; }
    .compose-input { flex:1; padding:0.75rem 1rem; border:1px solid var(--border); border-radius:1.5rem; background:var(--surface); color:var(--text-primary); font-size:0.9rem; outline:none; }
    .compose-input:focus { border-color:var(--accent); }
    .send-btn { width:2.5rem; height:2.5rem; border-radius:50%; border:none; background:var(--button-primary-bg); color:var(--button-primary-text); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:opacity 0.15s; }
    .send-btn:hover { opacity:0.9; }
    @keyframes spin { 100% { transform:rotate(360deg); } }
    .spin { animation:spin 1s linear infinite; }
  `);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  };

  return (
    <div class="thread">
      <div class="header">
        <div class="header-left">
          <button class="back-btn" onClick$={onBack$}>
            <LuArrowLeft />
          </button>
          {conversation.participantPicture ? (
            <img src={conversation.participantPicture} class="header-avatar" width={36} height={36} alt="Avatar" />
          ) : (
            <div class="header-avatar">{conversation.participantName.charAt(0).toUpperCase()}</div>
          )}
          <div class="header-info">
            <span class="header-name">{conversation.participantName}</span>
            <span class="header-platform">
              {conversation.platform} • {conversation.accountUsername}
              {conversation.connectionName && (
                <span style="display:inline-flex; align-items:center; gap:0.25rem; background:var(--surface-3); padding:0.15rem 0.4rem; border-radius:0.25rem; font-size:0.6rem; font-weight:600; color:var(--text-primary); margin-left:0.5rem;">
                  {conversation.connectionIcon && <div style="width:0.7rem; height:0.7rem; display:flex; align-items:center; opacity:0.8;" dangerouslySetInnerHTML={conversation.connectionIcon} />}
                  {conversation.connectionName}
                </span>
              )}
            </span>
          </div>
        </div>
        <div class="header-actions">
          {onRefresh$ && (
            <button class="icon-btn" onClick$={onRefresh$} title="Refresh Messages" disabled={isRefreshing}>
              <LuRefreshCw class={isRefreshing ? "spin" : ""} />
            </button>
          )}
          <button class="icon-btn" onClick$={onToggleDetails$} title="Details">
            <LuInfo />
          </button>
        </div>
      </div>
      
      <div class="messages-area">
        {messages.length === 0 ? (
          <div style="text-align:center; color:var(--text-secondary); margin-top:2rem;">No messages yet.</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} class={["msg-wrap", msg.isOwn ? "own" : "other"]}>
              <div class="msg-bubble">{msg.text}</div>
              <div class="msg-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))
        )}
      </div>
      
      <div class="compose-area">
        <input 
          type="text" 
          placeholder="Type a message..." 
          class="compose-input" 
          onKeyDown$={(e: any) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              onSendMessage$(e.target.value.trim());
              e.target.value = '';
            }
          }}
        />
        <button class="send-btn" onClick$={() => {
           const input = document.querySelector('.compose-input') as HTMLInputElement;
           if (input && input.value.trim()) {
             onSendMessage$(input.value.trim());
             input.value = '';
           }
        }}>
          <LuSend />
        </button>
      </div>
    </div>
  );
});
