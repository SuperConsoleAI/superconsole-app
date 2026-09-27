import { component$, PropFunction, useStylesScoped$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { LuX, LuUser, LuBriefcase, LuMapPin } from "@qwikest/icons/lucide";
import type { SocialConversation } from "./InboxSidebar";

interface Props {
  conversation: SocialConversation;
  onClose$: PropFunction<() => void>;
}

export const SocialInboxContactDetails = component$<Props>(({ conversation, onClose$ }) => {
  const nav = useNavigate();
  useStylesScoped$(`
    .details-panel { display:flex; flex-direction:column; height:100%; border:1px solid var(--border); border-radius:0.75rem; background:var(--surface-1); overflow:hidden; }
    
    .header { display:none; align-items:center; justify-content:space-between; padding:1rem; border-bottom:1px solid var(--border); background:var(--surface-2); }
    @media (max-width:1024px) { .header { display:flex; } }
    .title { font-size:1rem; font-weight:700; color:var(--text-primary); }
    .close-btn { background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.25rem; display:flex; align-items:center; justify-content:center; border-radius:0.25rem; transition:background 0.15s; }
    .close-btn:hover { background:var(--surface-3); color:var(--text-primary); }
    
    .body { flex:1; padding:1.5rem; overflow-y:auto; display:flex; flex-direction:column; gap:1.5rem; align-items:center; }
    
    .avatar-lg { width:5rem; height:5rem; border-radius:50%; background:var(--surface-3); object-fit:cover; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:2rem; font-weight:700; margin-bottom:0.5rem; }
    
    .info-block { display:flex; flex-direction:column; align-items:center; gap:0.25rem; text-align:center; }
    .name-lg { font-size:1.25rem; font-weight:700; color:var(--text-primary); }
    .handle { font-size:0.875rem; color:var(--text-secondary); }
    
    .platform-chip { padding:0.25rem 0.5rem; border-radius:0.5rem; background:var(--surface); border:1px solid var(--border); font-size:0.7rem; color:var(--text-secondary); text-transform:capitalize; display:flex; align-items:center; justify-content:center; gap:0.25rem; transition:background 0.15s; cursor:pointer; }
    a.platform-chip:hover { background:var(--surface-3); }
    
    .meta-list { display:flex; flex-direction:column; gap:0.75rem; width:100%; }
    .meta-item { display:flex; align-items:flex-start; gap:0.75rem; font-size:0.875rem; color:var(--text-secondary); }
    .meta-item svg { margin-top:0.2rem; flex-shrink:0; }
    .meta-content { display:flex; flex-direction:column; gap:0.1rem; }
    .meta-label { font-size:0.75rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
    .meta-val { color:var(--text-primary); font-weight:500; }
  `);

  return (
    <div class="details-panel">
      <div class="header">
        <span class="title">Contact Details</span>
        <button class="close-btn" onClick$={onClose$}><LuX style="width:1.25rem;height:1.25rem;" /></button>
      </div>
      
      <div class="body">
        <div style="display:flex; flex-direction:column; align-items:center; width:100%;">
          {conversation.participantPicture ? (
            <img src={conversation.participantPicture} class="avatar-lg" width={80} height={80} alt="Avatar" />
          ) : (
            <div class="avatar-lg">{conversation.participantName.charAt(0).toUpperCase()}</div>
          )}
          
          <div class="info-block">
            <span class="name-lg">{conversation.participantName}</span>
            <span class="handle">@{conversation.participantName.toLowerCase().replace(/ /g, '')}</span>
          </div>
          
          {conversation.crmContactId && (
            <a
              href="#"
              class="platform-chip"
              style="text-decoration:none; margin-top:0.75rem;"
              onClick$={(e) => {
                e.preventDefault();
                window.sessionStorage.setItem("__bk_view_contact_id", conversation.crmContactId!);
                nav("/dashboard/crm/default/");
              }}
            >
              <LuUser style="width:0.8rem;height:0.8rem;" />
              View in CRM
            </a>
          )}
        </div>
        
        <div class="meta-list">
          <div class="meta-item">
            <LuUser class="meta-icon" />
            <span>Platform: {conversation.platform}</span>
          </div>
          <div class="meta-item">
            <LuBriefcase class="meta-icon" />
            <span>Received via {conversation.accountUsername}</span>
          </div>
          <div class="meta-item">
            <LuMapPin class="meta-icon" />
            <span>Location unavailable</span>
          </div>
        </div>
      </div>
    </div>
  );
});
