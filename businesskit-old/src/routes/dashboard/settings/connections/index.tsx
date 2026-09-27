import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionsModal } from "~/components/ConnectionsModal";
import { LuPencil, LuTrash2 } from "@qwikest/icons/lucide";
import { SettingsContext } from "../layout";
import { detectDefaultAiConnection } from "~/lib/agent-config";
import composioLogoUrl from "~/assets/composio.svg?url";

const LOGO_TOKEN = "pk_IDWh7HGRQeK9H368zgbzTw";

const SERVICE_DOMAINS: Record<string, string> = {
  zernio:        "zernio.com",
  composio:      "composio.dev",
  openrouter:    "openrouter.ai",
  gemini:        "google.com",
  anthropic:     "anthropic.com",
  openai:        "openai.com",
  deepseek:      "deepseek.com",
  groq:          "groq.com",
  mistral:       "mistral.ai",
  xai:           "x.ai",
  grok:          "x.ai",
  spacexai:      "x.ai",
  gst_einvoice:  "gst.gov.in",
  razorpay:      "razorpay.com",
  payu:          "payu.in",
  cashfree:      "cashfree.com",
  stripe:        "stripe.com",
  paddle:        "paddle.com",
  twilio:        "twilio.com",
  sendgrid:      "sendgrid.com",
  mailchimp:     "mailchimp.com",
  google:        "google.com",
  slack:         "slack.com",
  notion:        "notion.so",
  airtable:      "airtable.com",
  hubspot:       "hubspot.com",
  salesforce:    "salesforce.com",
  zapier:        "zapier.com",
  shopify:       "shopify.com",
  webflow:       "webflow.com",
  github:        "github.com",
  twitter:       "twitter.com",
  instagram:     "instagram.com",
  linkedin:      "linkedin.com",
  youtube:       "youtube.com",
  tiktok:        "tiktok.com",
  pinterest:     "pinterest.com",
};

function logoUrl(service: string) {
  if (service === "composio") return composioLogoUrl;
  const domain = SERVICE_DOMAINS[service.toLowerCase()] ?? `${service.toLowerCase()}.com`;
  return `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}`;
}

export default component$(() => {
  const settingsCtx = useContext(SettingsContext);
  const loading = settingsCtx.loading;
  const connections = settingsCtx.connections || [];
  
  const modalOpen = useSignal(false);
  const editingConnection = useSignal<any>(null);
  const searchQuery = useSignal("");
  const deleting = useSignal<string | null>(null);
  const imgErrors = useSignal<Record<string, boolean>>({});

  const openCreateModal = $(() => {
    editingConnection.value = null;
    modalOpen.value = true;
  });

  const openPresetModal = $((service: string, defaultName: string, defaultModel?: string) => {
    editingConnection.value = {
      name: defaultName,
      service: service,
      label: defaultModel || "",
      client_id: "",
      client_secret: "",
      access_token: "",
      url: "",
      extra: defaultModel ? JSON.stringify({ default_model: defaultModel }) : "{}",
    };
    modalOpen.value = true;
  });

  const openEditModal = $((conn: any) => {
    editingConnection.value = conn;
    modalOpen.value = true;
  });

  const deleteConn = $(async (id: string) => {
    deleting.value = id;
    try {
      await invoke("delete_connection", { id });
      await settingsCtx.refresh();
      try {
        const remaining: any = await invoke("list_connections");
        if (Array.isArray(remaining)) {
          const def = detectDefaultAiConnection(remaining);
          localStorage.setItem("bk-agent-provider", def.provider);
          localStorage.setItem("bk-agent-model", def.model);
          localStorage.removeItem("bk-agent-model-manual");
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("bk-ai-connection-updated", {
                detail: { provider: def.provider, model: def.model },
              })
            );
          }
        }
      } catch {
        // ignore connection sync error
      }
    } catch (err) {
      console.error("Error deleting connection:", err);
    } finally {
      deleting.value = null;
    }
  });

  const filteredConnections = connections.filter((c: any) => 
    c.name.toLowerCase().includes(searchQuery.value.toLowerCase()) || 
    (c.service || "").toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    (c.label || "").toLowerCase().includes(searchQuery.value.toLowerCase())
  );

  const totalConns = connections.length;
  const activeConns = connections.filter((c: any) => c.is_active).length;
  const inactiveConns = totalConns - activeConns;

  return (
    <>
      {/* Stats Grid */}
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="padding: 1.25rem; border-radius: 0.75rem; background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.875rem;">
            Total Connections
          </div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">
            {totalConns}
          </div>
        </div>

        <div style="padding: 1.25rem; border-radius: 0.75rem; background: linear-gradient(145deg, var(--accent), var(--accent-hover)); color: var(--surface-1);">
          <div style="display: flex; align-items: center; gap: 0.5rem; opacity: 0.9; margin-bottom: 0.5rem; font-size: 0.875rem;">
            Active Integrations
          </div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--surface-1);">
            {activeConns}
          </div>
        </div>

        <div style="padding: 1.25rem; border-radius: 0.75rem; background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.875rem;">
            Inactive
          </div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">
            {inactiveConns}
          </div>
        </div>
      </div>

      <div>
        <div style="margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
          <input
            type="text"
            placeholder="Search connections..."
            value={searchQuery.value}
            onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
            style="flex: 1; max-width: 300px; padding: 0.5rem 0.75rem; background: var(--field-fill); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem; outline: none; transition: border-color 150ms ease;"
            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
          <button
            onClick$={openCreateModal}
            style="background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.5rem 1rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.875rem;display:flex;align-items:center;gap:0.4rem;white-space:nowrap;"
          >
            <span>➕</span> Add Connection
          </button>
        </div>

        {/* Quick Connect Presets */}
        <div style="display: flex; gap: 0.5rem; flex-wrap: nowrap; overflow-x: auto; margin-bottom: 1.25rem; padding-bottom: 0.25rem; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
          <button type="button" onClick$={() => openPresetModal("openrouter", "OpenRouter AI Gateway", "google/gemini-3.5-flash-lite")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🌐</span> Connect OpenRouter
          </button>
          <button type="button" onClick$={() => openPresetModal("gemini", "Google Gemini (AI Studio)", "gemini-3.1-flash-lite")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>✨</span> Connect Gemini
          </button>
          <button type="button" onClick$={() => openPresetModal("anthropic", "Anthropic Claude", "claude-5-sonnet")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🧠</span> Connect Anthropic
          </button>
          <button type="button" onClick$={() => openPresetModal("openai", "OpenAI API", "gpt-5.4-nano")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>⚡</span> Connect OpenAI
          </button>
          <button type="button" onClick$={() => openPresetModal("xai", "SpaceXAI (Grok)", "grok-4.3")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🚀</span> Connect SpaceXAI (Grok)
          </button>
          <button type="button" onClick$={() => openPresetModal("mistral", "Mistral AI", "mistralai/mistral-small-4")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🌪️</span> Connect Mistral
          </button>
          <button type="button" onClick$={() => openPresetModal("deepseek", "DeepSeek API", "deepseek-chat")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🐳</span> Connect DeepSeek
          </button>
          <button type="button" onClick$={() => openPresetModal("groq", "Groq Cloud (LPU)", "openai/gpt-oss-120b")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>⚡</span> Connect Groq
          </button>
          <button type="button" onClick$={() => openPresetModal("gst_einvoice", "GST Portal / GSP E-Invoice")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🇮🇳</span> Connect GST / E-Invoice
          </button>
          <button type="button" onClick$={() => openPresetModal("razorpay", "Razorpay Payment Gateway")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>💳</span> Connect Razorpay
          </button>
          <button type="button" onClick$={() => openPresetModal("payu", "PayU Gateway")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>💳</span> Connect PayU
          </button>
          <button type="button" onClick$={() => openPresetModal("stripe", "Stripe International")}
            style="padding: 0.35rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; white-space: nowrap; transition: all 150ms ease;">
            <span>🌐</span> Connect Stripe
          </button>
        </div>

        {loading ? (
          <div style="background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);padding:3rem;text-align:center;color:var(--text-secondary);">
            Loading...
          </div>
        ) : filteredConnections.length === 0 ? (
          <div style="background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);padding:3rem;text-align:center;color:var(--text-secondary);margin-bottom:1.5rem;">
            <div style="font-size:2.5rem;margin-bottom:0.75rem;">🔌</div>
            <div>No connections found.</div>
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:1.5rem;">
            {filteredConnections.map((c: any) => (
                  <div key={c.id} style="background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1rem;">
                    {imgErrors.value[c.service] ? (
                      <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-1);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">🔑</div>
                    ) : (
                      <img
                        src={logoUrl(c.service)}
                        alt={c.service}
                        width={40}
                        height={40}
                        style="width:2.5rem;height:2.5rem;border-radius:0.5rem;border:1px solid var(--border);object-fit:cover;background:var(--surface-1);flex-shrink:0;box-sizing:border-box;"
                        onError$={() => {
                          imgErrors.value = { ...imgErrors.value, [c.service]: true };
                        }}
                      />
                    )}

                    <div style="flex:1;min-width:0;">
                      <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{c.name}</div>
                      <div style="font-size:0.75rem;color:var(--text-secondary);text-transform:capitalize;margin-top:0.1rem;">{c.service}</div>
                      {c.label && <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem;">{c.label}</div>}
                    </div>

                    {(() => {
                      let isPrim = false;
                      try {
                        const extra = typeof c.extra === "string" ? JSON.parse(c.extra || "{}") : c.extra || {};
                        if (extra.is_primary === true || extra.primary === true) isPrim = true;
                      } catch {
                        // ignore extra json parse error
                      }
                      return isPrim ? (
                        <span style="padding:0.15rem 0.5rem;border-radius:1rem;font-size:0.68rem;font-weight:700;flex-shrink:0;background:var(--accent-soft, rgba(99,102,241,0.15));color:var(--accent);border:1px solid rgba(99,102,241,0.25);">
                          Primary
                        </span>
                      ) : null;
                    })()}

                    <span style={`padding:0.15rem 0.45rem;border-radius:1rem;font-size:0.68rem;font-weight:700;flex-shrink:0;${c.is_active ? "background:var(--success-soft);color:var(--success);" : "background:var(--surface-1);color:var(--text-secondary);"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>

                    <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                      <button
                        onClick$={() => openEditModal(c)}
                        title="Edit Connection"
                        style="background:transparent;color:var(--text-secondary);border:1px solid var(--border);padding:0.35rem;border-radius:var(--radius-sm);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;"
                        onMouseOver$={(e) => { 
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; 
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-secondary)'; 
                        }}
                        onMouseOut$={(e) => { 
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; 
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; 
                        }}
                      >
                        <LuPencil style="width:1rem;height:1rem;" />
                      </button>
                      <button
                        disabled={deleting.value === c.id}
                        onClick$={() => deleteConn(c.id)}
                        title="Revoke Connection"
                        style="background:transparent;color:var(--error,#EF4444);border:1px solid var(--error-soft);padding:0.35rem;border-radius:var(--radius-sm);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;"
                        onMouseOver$={(e) => { 
                          (e.currentTarget as HTMLElement).style.color = 'white'; 
                          (e.currentTarget as HTMLElement).style.background = 'var(--error, #EF4444)'; 
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--error, #EF4444)'; 
                        }}
                        onMouseOut$={(e) => { 
                          (e.currentTarget as HTMLElement).style.color = 'var(--error, #EF4444)'; 
                          (e.currentTarget as HTMLElement).style.background = 'transparent'; 
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--error-soft)'; 
                        }}
                      >
                        {deleting.value === c.id ? "…" : <LuTrash2 style="width:1rem;height:1rem;" />}
                      </button>
                    </div>
                  </div>
            ))}
          </div>
        )}
      </div>

      <ConnectionsModal
        open={modalOpen}
        editingConnection={editingConnection}
        onSaved$={settingsCtx.refresh}
      />
    </>
  );
});

export const head: DocumentHead = {
  title: "API Connections — Settings",
  meta: [{ name: "description", content: "Manage your BYOK API keys and service integrations." }],
};
