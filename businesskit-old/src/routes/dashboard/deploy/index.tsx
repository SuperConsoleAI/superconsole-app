// src/routes/dashboard/deploy/index.tsx
//
// WHAT:  Cloudflare Workers deployment & Custom Domains manager.
// HOW:   Manages Cloudflare connection, worker deployment status, custom domain routing (Internal & SaaS fallback), and attachment to shared workers.
//        Full responsive mobile-first design and container query support when AgentChatSidebar expands.

import { component$, useStylesScoped$, useSignal, useVisibleTask$, $, useStore } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppContext } from "../../../lib/app-context";
import { LuCheckCircle2, LuLink, LuPencil, LuRocket, LuUser, LuActivity, LuGlobe, LuTrash, LuExternalLink, LuInfo, LuCopy } from "@qwikest/icons/lucide";
import cfLogo from "~/assets/cloudflare.svg?url";
import workersLogo from "~/assets/workers.svg?url";

const iconStyle = "width:1rem;height:1rem;flex-shrink:0;color:var(--text-secondary);";
const sectionIconStyle = "width:1.5rem;height:1.5rem;flex-shrink:0;color:var(--text-primary);";

const STYLES = `
  /* Main Container */
  .deploy-wrap {
    width: 100%;
    max-width: 900px;
    min-width: 0;
    box-sizing: border-box;
  }

  /* Grid Layout with Container Query Support */
  .deploy-grid-wrap {
    container-type: inline-size;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .deploy-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: stretch;
    margin-bottom: 1.25rem;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  @container (max-width: 860px) {
    .deploy-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
  @media (max-width: 860px) {
    .deploy-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
  
  /* Section card */
  .deploy-section {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    padding: 1.5rem;
    margin-bottom: 1.25rem;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    min-width: 0;
    flex-wrap: wrap;
  }
  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .section-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.15rem 0.5rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, #10b981 12%, var(--surface));
    color: #059669;
    border: 1px solid color-mix(in srgb, #10b981 25%, var(--border));
    flex-shrink: 0;
    word-break: break-word;
    max-width: 100%;
  }
  .section-badge.warn {
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
    color: #b45309;
    border-color: color-mix(in srgb, #f59e0b 25%, var(--border));
  }

  /* Meta rows */
  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0;
    width: 100%;
    max-width: 100%;
    border-top: 1px solid var(--border);
    min-width: 0;
    box-sizing: border-box;
  }
  .meta-row:first-of-type {
    border-top: none;
  }
  .meta-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
    min-width: 6.5rem;
    flex-shrink: 0;
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
  }
  .meta-value {
    font-size: 0.78rem;
    background: var(--surface-1);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-family: monospace;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-sizing: border-box;
  }

  /* Action row & progress wrapper */
  .action-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-top: 1rem;
    width: 100%;
    flex-wrap: wrap;
    box-sizing: border-box;
  }
  .progress-wrapper {
    flex: 1;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-sizing: border-box;
  }

  /* Connected domain row */
  .connected-domain-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    width: 100%;
    box-sizing: border-box;
  }

  /* Domain tabs */
  .domain-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
    width: 100%;
    box-sizing: border-box;
  }

  /* DNS record box */
  .dns-record-box {
    background: var(--surface);
    padding: 0.6rem;
    padding-right: 2.2rem;
    border-radius: 0.375rem;
    font-family: monospace;
    font-size: 0.78rem;
    border: 1px solid var(--border);
    position: relative;
    word-break: break-all;
    overflow-wrap: anywhere;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
  }

  /* Collapsible update form */
  .update-details { border:1px solid var(--border); border-radius:0.625rem; overflow:hidden; }
  .update-details summary { padding:0.65rem 1rem; cursor:pointer; font-size:0.825rem; font-weight:600; color:var(--text-primary); background:var(--surface); user-select:none; list-style:none; display:flex; align-items:center; gap:0.4rem; }
  .update-details summary::-webkit-details-marker { display:none; }
  .update-details summary:hover { background:color-mix(in srgb,var(--accent) 5%,var(--surface)); }
  .update-details[open] summary { border-bottom:1px solid var(--border); color:var(--accent); }
  .update-form-body { padding:1rem; background:var(--surface-2); box-sizing: border-box; width: 100%; }

  /* Fields */
  .field { margin-bottom:0.875rem; width: 100%; box-sizing: border-box; }
  .field label { display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary); margin-bottom:0.3rem; }
  .field input, .field select { display:block; width:100%; box-sizing:border-box; padding:0.55rem 0.75rem; border:1px solid var(--border); border-radius:0.5rem; font-size:0.875rem; background:var(--surface); color:var(--text-primary); outline:none; transition:border-color 0.15s; }
  .field input:focus, .field select:focus { border-color:var(--accent); }

  /* Messages */
  .msg-error   { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:0.5rem 0.75rem; border-radius:0.5rem; font-size:0.8rem; margin-bottom:0.75rem; word-break: break-word; }
  .msg-success { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:0.5rem 0.75rem; border-radius:0.5rem; font-size:0.8rem; margin-bottom:0.75rem; word-break: break-word; }

  /* Save button */
  .btn-save { padding:0.55rem 1.25rem; background:var(--accent); color:var(--button-primary-text); border:none; border-radius:0.5rem; font-size:0.825rem; font-weight:700; cursor:pointer; transition:opacity 0.15s; text-transform:capitalize; }
  .btn-save:hover:not(:disabled) { opacity:0.88; }
  .btn-save:disabled { opacity:0.4; cursor:not-allowed; }
  
  .btn-danger { background:var(--error); color:white; }

  /* Modes grid */
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1rem;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .mode-card { border:1px solid var(--border); padding:1.25rem; border-radius:0.75rem; cursor:pointer; background:var(--surface); transition:all 0.2s; display:flex; flex-direction:column; gap:0.5rem; min-width: 0; box-sizing: border-box; }
  .mode-card:hover { border-color:var(--text-secondary); }
  .mode-card.selected { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 5%,var(--surface)); box-shadow: 0 0 0 1px var(--accent); }
  .mode-card h3 { font-size:0.95rem; font-weight:700; margin:0; display:flex; align-items:center; gap:0.5rem; }
  .mode-card .mode-meta { font-size:0.8rem; color:var(--text-secondary); margin:0; }
  .mode-card .mode-desc { font-size:0.85rem; color:var(--text-primary); margin:0; flex-grow:1; }
  
  /* Progress Bar */
  .progress-bg { width: 100%; height: 8px; background: var(--surface-1); border-radius: 4px; overflow: hidden; margin-top: 0.75rem; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }

  /* Mobile & Container Responsive */
  @container (max-width: 580px) {
    .deploy-section { padding: 1rem; border-radius: 0.75rem; margin-bottom: 1rem; }
    .meta-row { gap: 0.4rem; padding: 0.4rem 0; }
    .meta-label { min-width: 4.5rem; font-size: 0.8rem; }
    .meta-value { font-size: 0.72rem; }
    .mode-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
    .mode-card { padding: 0.875rem !important; }
    .action-row { flex-direction: column !important; align-items: stretch !important; gap: 0.75rem !important; }
    .action-row .btn-save { width: 100% !important; justify-content: center !important; }
    .connected-domain-row { flex-direction: column !important; align-items: stretch !important; gap: 0.75rem !important; }
  }

  @media (max-width: 640px) {
    .deploy-section { padding: 1rem; border-radius: 0.75rem; margin-bottom: 1rem; }
    .meta-row { gap: 0.4rem; padding: 0.4rem 0; }
    .meta-label { min-width: 4.5rem; font-size: 0.8rem; }
    .meta-value { font-size: 0.72rem; }
    .mode-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
    .mode-card { padding: 0.875rem !important; }
    .action-row { flex-direction: column !important; align-items: stretch !important; gap: 0.75rem !important; }
    .action-row .btn-save { width: 100% !important; justify-content: center !important; }
    .connected-domain-row { flex-direction: column !important; align-items: stretch !important; gap: 0.75rem !important; }
  }
`;

type CfZone = {
  id: string;
  name: string;
};

type CfAccountInfo = {
  account_name: string;
  zones: CfZone[];
};

type ConnectionRow = {
  id: string;
  provider: string;
  access_token: string;
  extra: string;
};

type DeploymentStatus = {
  worker_name: string;
  current_version: string | null;
  latest_version: string | null;
  status: string;
  deploy_url: string | null;
  deployed_at: number | null;
  update_available: boolean;
  deployment_id?: string;
  custom_domain?: string | null;
};

export default component$(() => {
  useStylesScoped$(STYLES);

  const appState = useAppContext();
  const nav = useNavigate();

  const activeProfile = appState.profiles.value.find(p => p.id === appState.activeProfileId.value);
  const profileAllocatedPlan = (activeProfile?.allocated_plan || "").trim().toUpperCase();

  const licStatus = (appState.license.value?.status || "").toLowerCase();
  const isLicActive = licStatus === "active" || licStatus === "grace" || licStatus === "trial";
  const globalPlan = (appState.license.value?.plan || "").trim().toUpperCase();

  const isPro = profileAllocatedPlan !== ""
    ? (profileAllocatedPlan !== "FREE" && isLicActive)
    : (isLicActive && globalPlan !== "" && globalPlan !== "FREE");

  const showUpgrade = !isPro;

  // Connection State
  const cfAccountId = useSignal("");
  const cfApiToken = useSignal("");
  const connection = useSignal<ConnectionRow | null>(null);
  const accountInfo = useSignal<CfAccountInfo | null>(null);
  const connectLoading = useSignal(false);
  const connectError = useSignal("");

  // Deploy State
  const orgDeployments = useSignal<any[]>([]);
  const selectedDeploymentId = useSignal("new");
  const deployment = useSignal<DeploymentStatus | null>(null);
  const isDeploying = useSignal(false);
  const deployProgress = useStore({ step: "", pct: 0, message: "" });
  const deployError = useSignal("");
  const isInitialLoad = useSignal(true);

  // Custom Domain State
  const customDomain = useSignal("");
  const selectedZoneId = useSignal("");
  const customDomainStatus = useSignal("");
  const domainLoading = useSignal(false);
  const isEditingDomain = useSignal(false);
  const customDomainMode = useSignal<"internal" | "external">("internal");
  const saasVerification = useSignal<{ cname_target: string, txt_name: string, txt_value: string } | null>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => appState.activeProfileId.value);
    
    if (!appState.activeProfileId) return;

    try {
      const status: DeploymentStatus = await invoke("get_deployment_status");
      if (status.status !== "not_deployed") {
        deployment.value = status;
        if (status.deployment_id) {
          selectedDeploymentId.value = status.deployment_id;
        } else {
          selectedDeploymentId.value = "new";
        }
      } else {
        deployment.value = null; // Clear if not deployed on this profile
        selectedDeploymentId.value = "new";
      }

      // Load CF Credentials based on attachment status
      if (status.deployment_id) {
        try {
          const parentCreds: any = await invoke("get_parent_cf_connection", { parentDeploymentId: status.deployment_id });
          cfAccountId.value = parentCreds.account_id;
          cfApiToken.value = parentCreds.api_token;

          const info: CfAccountInfo = await invoke("validate_cloudflare_connection", {
            cfAccountId: parentCreds.account_id,
            cfApiToken: parentCreds.api_token
          });
          accountInfo.value = info;
        } catch (e: any) {
          console.warn("Could not fetch parent CF connection:", e);
        }
      } else {
        const connections: ConnectionRow[] = await invoke("list_connections", {
          service: "cloudflare"
        });

        if (connections.length > 0) {
          connection.value = connections[0];
          cfAccountId.value = connection.value.extra;
          cfApiToken.value = connection.value.access_token;

          try {
            const info: CfAccountInfo = await invoke("validate_cloudflare_connection", {
              cfAccountId: connection.value.extra,
              cfApiToken: connection.value.access_token
            });
            accountInfo.value = info;
          } catch (e: any) {
            connectError.value = e.toString();
          }
        }
      }

      const orgDeps: any[] = await invoke("get_org_deployments");
      orgDeployments.value = orgDeps.filter(d => !d.deployment_id && d.cf_worker_name);

      await listen("deploy:progress", (event: any) => {
        const { step, pct, message } = event.payload;
        deployProgress.step = step;
        deployProgress.pct = pct;
        deployProgress.message = message;
      });

      await listen("deploy:done", (event: any) => {
        isDeploying.value = false;
        if (event.payload.url) {
          deployment.value = {
            worker_name: "",
            current_version: event.payload.version,
            latest_version: event.payload.version,
            status: "active",
            deploy_url: event.payload.url,
            deployed_at: Date.now() / 1000,
            update_available: false,
          };
        }
      });

    } catch (e) {
      console.error(e);
    } finally {
      isInitialLoad.value = false;
    }
  });

  const handleConnect = $(async () => {
    connectError.value = "";
    connectLoading.value = true;
    try {
      const info: CfAccountInfo = await invoke("validate_cloudflare_connection", {
        cfAccountId: cfAccountId.value,
        cfApiToken: cfApiToken.value
      });

      await invoke("create_connection", {
        data: {
          name: "Cloudflare",
          service: "cloudflare",
          access_token: cfApiToken.value,
          extra: cfAccountId.value,
          provider: "cloudflare"
        }
      });

      accountInfo.value = info;

      const connections: ConnectionRow[] = await invoke("list_connections", {
        service: "cloudflare"
      });
      if (connections.length > 0) connection.value = connections[0];

    } catch (e: any) {
      connectError.value = e.toString();
    } finally {
      connectLoading.value = false;
    }
  });

  const handleDisconnect = $(async () => {
    if (!connection.value) return;
    try {
      await invoke("delete_connection", { id: connection.value.id });
      connection.value = null;
      accountInfo.value = null;
      cfAccountId.value = "";
      cfApiToken.value = "";
    } catch (e: any) {
      console.error(e);
    }
  });

  const handleDeploy = $(async () => {
    if (showUpgrade) {
      nav("/dashboard/settings?tab=plan");
      return;
    }

    const isAttaching = selectedDeploymentId.value !== "new";

    if (!isAttaching && !connection.value) {
      deployError.value = "Please connect your Cloudflare account first.";
      return;
    }

    isDeploying.value = true;
    deployError.value = "";
    deployProgress.pct = 0;
    deployProgress.message = isAttaching ? "Attaching to deployment..." : "Starting deployment...";

    try {
      const result: DeploymentStatus = await invoke("deploy_frontend", {
        cfAccountId: isAttaching ? "" : connection.value!.extra,
        cfApiToken: isAttaching ? "" : connection.value!.access_token,
        deployMode: isAttaching ? "shared_worker" : "isolated",
        deploymentId: isAttaching ? selectedDeploymentId.value : null
      });

      deployment.value = result;
    } catch (e: any) {
      deployError.value = e.toString();
      isDeploying.value = false;
    }
  });


  if (isInitialLoad.value) {
    return (
      <div class="deploy-wrap">
        <div class="deploy-grid-wrap">
          <div class="deploy-grid">
            {[1, 2].map((i) => (
              <div key={i} class="deploy-section" style="margin-bottom: 0;">
                <div class="section-header" style="margin-bottom: 1.5rem;">
                  <div class="skeleton" style="height:24px;width:24px;border-radius:4px" />
                  <div class="skeleton" style="height:18px;width:140px;border-radius:4px" />
                </div>
                <div class="skeleton" style="height:32px;width:100%;border-radius:4px;margin-bottom:1rem" />
                <div class="skeleton" style="height:32px;width:100%;border-radius:4px;margin-bottom:1rem" />
                <div class="skeleton" style="height:32px;width:100%;border-radius:4px;margin-bottom:1rem" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const showCfConfig = (!deployment.value && selectedDeploymentId.value === "new") || (deployment.value && !deployment.value.deployment_id);

  return (
    <div class="deploy-wrap">
      <div class="deploy-grid-wrap">
        <div class="deploy-grid">
          {showCfConfig && (
            <div class="deploy-section" style="margin-bottom: 0;">
              <div class="section-header">
                <span class="section-icon">
                  <img src={cfLogo} alt="Cloudflare" width={24} height={24} />
                </span>
                <span class="section-title">Cloudflare Account</span>
                {accountInfo.value
                  ? <span class="section-badge">Connected</span>
                  : <span class="section-badge warn">Not configured</span>
                }
              </div>

              {accountInfo.value ? (
                <>
                  <div class="meta-row">
                    <LuUser style={iconStyle} />
                    <span class="meta-label">Account</span>
                    <span class="meta-value">{accountInfo.value.account_name}</span>
                  </div>
                  <div class="meta-row">
                    <LuActivity style={iconStyle} />
                    <span class="meta-label">Zones Access</span>
                    <span class="meta-value">{accountInfo.value.zones.length} zones</span>
                  </div>
                </>
              ) : (
                <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                  Required for hosting your frontend on Cloudflare Pages or Workers.{" "}
                  <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer"
                    style="color:var(--accent);text-decoration:none;font-weight:600;">
                    Get API Token ↗
                  </a>
                </p>
              )}

              <div style="flex: 1; min-height: 1rem;" />

              <details class="update-details" open={!accountInfo.value}>
                <summary><LuPencil style={iconStyle} /> {accountInfo.value ? "Update Connection" : "Add Credentials"}</summary>
                <div class="update-form-body">
                  <div class="field">
                    <label>Account ID</label>
                    <input type="text" value={cfAccountId.value} onInput$={(e: any) => cfAccountId.value = e.target.value} placeholder="023e105f4ecef8ad9ca31a8372d0c353" required />
                  </div>
                  <div class="field">
                    <label>API Token</label>
                    <input type="password" value={cfApiToken.value} onInput$={(e: any) => cfApiToken.value = e.target.value} placeholder="••••••••••••••••••••••••" required />
                  </div>
                  {connectError.value && <div class="msg-error">{connectError.value}</div>}

                  <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
                    <button onClick$={handleConnect} class="btn-save" disabled={connectLoading.value}>
                      {connectLoading.value ? "Connecting…" : "Connect"}
                    </button>
                    {accountInfo.value && (
                      <button onClick$={handleDisconnect} class="btn-save btn-danger" style="background:transparent; color:var(--error); border:1px solid var(--error);">
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {(accountInfo.value || deployment.value) && (
            <div class="deploy-section" style="margin-bottom: 0;">
              <div class="section-header">
                <span class="section-icon">
                  <img src={workersLogo} alt="Workers" width={24} height={24} />
                </span>
                <span class="section-title">Deployment Status</span>
                {deployment.value
                  ? <span class="section-badge" style="background:var(--success); color:white; display:inline-flex; align-items:center; gap:0.25rem;">
                    <LuCheckCircle2 style="width:0.9rem;height:0.9rem;" />
                    {deployment.value.deployment_id ? `Attached to [${orgDeployments.value.find((d: any) => d.id === deployment.value!.deployment_id)?.cf_worker_name || 'Shared Worker'}]` : "Deployed"}
                  </span>
                  : <span class="section-badge warn">Not Deployed</span>
                }
              </div>

              {deployment.value ? (
                <>
                  <div class="meta-row">
                    <LuLink style={iconStyle} />
                    <span class="meta-label">URL</span>
                    <span class="meta-value">
                      <a href={deployment.value.deploy_url || "#"} target="_blank" style="color:inherit;text-decoration:none;">
                        {deployment.value.deploy_url}
                      </a>
                    </span>
                  </div>
                  <div class="meta-row">
                    <LuRocket style={iconStyle} />
                    <span class="meta-label">Version</span>
                    <span class="meta-value">{deployment.value.current_version}</span>
                  </div>

                  <div style="flex: 1; min-height: 1rem;" />

                  <div class="action-row">
                    {showUpgrade ? (
                      <button
                        type="button"
                        onClick$={() => nav("/dashboard/settings?tab=plan")}
                        class="btn-save"
                        style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); display: inline-flex; align-items: center; gap: 0.4rem;"
                      >
                        <LuRocket style="width:0.85rem;height:0.85rem;" />
                        <span>Upgrade to Deploy</span>
                      </button>
                    ) : (
                      <button onClick$={handleDeploy} class="btn-save" disabled={isDeploying.value}>
                        {isDeploying.value ? "Working..." : (selectedDeploymentId.value !== "new" ? "Sync Attachment" : (deployment.value ? "Redeploy" : "Deploy"))}
                      </button>
                    )}
                    {selectedDeploymentId.value !== "new" && (
                      <span style="font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center;">
                        (Worker is managed by parent profile)
                      </span>
                    )}
                    {isDeploying.value && (
                      <div class="progress-wrapper">
                        <div class="progress-bg" style="margin-top:0;">
                          <div class="progress-fill" style={{ width: `${deployProgress.pct}%` }}></div>
                        </div>
                        <span style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">{deployProgress.message}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                    Your project is ready to be deployed to Cloudflare. Select a mode below to begin.
                  </p>
                  <div style="flex: 1; min-height: 1rem;" />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!deployment.value && (
        <div class="deploy-section">
          <div class="section-header">
            <span class="section-icon"><LuCheckCircle2 style={sectionIconStyle} /></span>
            <span class="section-title">Deploy Configuration</span>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="font-size:0.875rem; font-weight:600; color:var(--text-primary);">Deploy To</label>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin:0.25rem 0 0.75rem;">
              Choose whether to deploy this profile as a standalone new project, or attach it to an existing deployment to share resources.
            </p>

            <select
              value={selectedDeploymentId.value}
              onChange$={(e: any) => selectedDeploymentId.value = e.target.value}
              style="width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--border); background:var(--surface); color:var(--text-primary); font-size:0.875rem;"
            >
              <option value="new">Deploy as New Project</option>
              {orgDeployments.value.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {`Attach to: ${d.cf_worker_name || "Existing Deployment"} (${d.cf_deployment_url})`}
                </option>
              ))}
            </select>
          </div>

          {deployError.value && <div class="msg-error">{deployError.value}</div>}

          {isDeploying.value ? (
            <div style="background:var(--surface-1); padding:1rem; border-radius:0.5rem; border:1px solid var(--border);">
              <p style="font-size:0.875rem; font-weight:600; margin:0 0 0.25rem 0;">Deploying to Cloudflare...</p>
              <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">{deployProgress.message}</p>
              <div class="progress-bg">
                <div class="progress-fill" style={{ width: `${deployProgress.pct}%` }}></div>
              </div>
            </div>
          ) : showUpgrade ? (
            <button
              type="button"
              onClick$={() => nav("/dashboard/settings?tab=plan")}
              class="btn-save"
              style="align-self:flex-start; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); display: inline-flex; align-items: center; gap: 0.4rem;"
            >
              <LuRocket style="width:0.85rem;height:0.85rem;" />
              <span>Upgrade to Deploy</span>
            </button>
          ) : (
            <button onClick$={handleDeploy} class="btn-save" style="align-self:flex-start;">
              Deploy Now
            </button>
          )}
        </div>
      )}

      {deployment.value && (
        <div class="deploy-section">
          <div class="section-header">
            <span class="section-icon"><LuGlobe style={sectionIconStyle} /></span>
            <span class="section-title">Custom Domain</span>
          </div>

          {deployment.value.deployment_id && (
            <div style="background:var(--surface-3); padding:0.75rem; border-radius:0.5rem; margin-bottom:1rem; font-size:0.85rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.5rem; border:1px solid var(--border);">
              <LuGlobe style="width:1rem;height:1rem;color:var(--accent);" />
              Inheriting Cloudflare configuration from parent deployment. Domains will be managed in the shared Cloudflare account.
            </div>
          )}

          {deployment.value.custom_domain && !isEditingDomain.value ? (
            <div style="background:var(--surface-1); padding:1rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom: 1rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; gap:0.5rem;">
                <p style="font-size:0.875rem; font-weight:600; margin:0; color:var(--text-primary);">Connected Domain</p>
                <div style="display:flex; gap:0.35rem; align-items:center; flex-shrink:0;">
                  <button 
                    onClick$={() => { isEditingDomain.value = true; saasVerification.value = null; }} 
                    class="btn-ghost" 
                    title="Edit Custom Domain"
                    style="height:32px; padding:0 0.65rem; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--border); border-radius:4px; box-sizing:border-box;"
                  >
                    <LuPencil style="width:0.85rem;height:0.85rem;" />
                    <span>Edit</span>
                  </button>
                  <button 
                    onClick$={async () => {
                      if (confirm("Remove this custom domain?")) {
                        try {
                          domainLoading.value = true;
                          await invoke("delete_custom_domain", {
                            profileId: appState.activeProfileId.value!,
                            domain: deployment.value!.custom_domain,
                            cfAccountId: cfAccountId.value,
                            cfApiToken: cfApiToken.value
                          });
                          deployment.value!.custom_domain = null;
                          customDomain.value = "";
                          isEditingDomain.value = true;
                          saasVerification.value = null;
                        } catch (e: any) {
                          alert(`Error deleting domain: ${e.toString()}`);
                        } finally {
                          domainLoading.value = false;
                        }
                      }
                    }} 
                    class="btn-ghost" 
                    title="Delete Custom Domain"
                    style="height:32px; width:32px; padding:0; color:var(--error); display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--border); border-radius:4px; box-sizing:border-box; flex-shrink:0;"
                    disabled={domainLoading.value}
                  >
                    <LuTrash style="width:0.95rem;height:0.95rem;" />
                  </button>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem; min-width:0; background:var(--surface-2); padding:0.55rem 0.75rem; border-radius:0.375rem; border:1px solid var(--border); overflow:hidden;">
                <a 
                  href={`https://${deployment.value.custom_domain}`} 
                  target="_blank" 
                  style="color:var(--accent); font-weight:500; text-decoration:none; display:flex; align-items:center; gap:0.35rem; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.875rem;"
                >
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{deployment.value.custom_domain}</span>
                  <LuExternalLink style="width:0.85rem;height:0.85rem;flex-shrink:0;" />
                </a>
              </div>
            </div>
          ) : (
            <>
              <div class="domain-tabs">
                <button 
                  onClick$={() => customDomainMode.value = "internal"}
                  style={`padding: 0.5rem 1rem; background:transparent; border:none; cursor:pointer; color: ${customDomainMode.value === "internal" ? "var(--text-primary)" : "var(--text-secondary)"}; border-bottom: 2px solid ${customDomainMode.value === "internal" ? "var(--accent)" : "transparent"}; font-weight: 500; font-size: 0.875rem; white-space: nowrap;`}
                >
                  Internal CF Domain
                </button>
                <button 
                  onClick$={() => customDomainMode.value = "external"}
                  style={`padding: 0.5rem 1rem; background:transparent; border:none; cursor:pointer; color: ${customDomainMode.value === "external" ? "var(--text-primary)" : "var(--text-secondary)"}; border-bottom: 2px solid ${customDomainMode.value === "external" ? "var(--accent)" : "transparent"}; font-weight: 500; font-size: 0.875rem; white-space: nowrap;`}
                >
                  External Domain (SaaS)
                </button>
              </div>

              {saasVerification.value ? (
                <div style="background:var(--surface-1); padding:1rem; border-radius:0.5rem; border:1px solid var(--accent); margin-bottom: 1rem;">
                  <h4 style="margin:0 0 0.5rem 0; display:flex; align-items:center; gap:0.5rem; color:var(--accent);">
                    <LuCheckCircle2 /> Domain Added! Action Required
                  </h4>
                  <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom: 1rem;">
                    Please add the following DNS records to your domain provider (e.g., GoDaddy, Namecheap) to verify ownership and route traffic.
                  </p>
                  
                  <div style="margin-bottom:1rem;">
                    <div style="font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">CNAME Record (Routing)</div>
                    <div class="dns-record-box">
                      <button 
                        onClick$={() => navigator.clipboard.writeText(saasVerification.value!.cname_target)}
                        style="position:absolute; top:0.5rem; right:0.5rem; background:transparent; border:none; cursor:pointer; color:var(--text-secondary);"
                        title="Copy CNAME Target"
                      >
                        <LuCopy />
                      </button>
                      Name: @ (or {customDomain.value})<br/>
                      Target: {saasVerification.value.cname_target}
                    </div>
                  </div>

                  <div>
                    <div style="font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">TXT Record (Verification & SSL)</div>
                    <div class="dns-record-box">
                      <button 
                        onClick$={() => navigator.clipboard.writeText(saasVerification.value!.txt_value)}
                        style="position:absolute; top:0.5rem; right:0.5rem; background:transparent; border:none; cursor:pointer; color:var(--text-secondary);"
                        title="Copy TXT Value"
                      >
                        <LuCopy />
                      </button>
                      Name: {saasVerification.value.txt_name}<br/>
                      Content: {saasVerification.value.txt_value}
                    </div>
                  </div>

                  <button 
                    onClick$={() => {
                      deployment.value = { ...deployment.value!, custom_domain: customDomain.value };
                      isEditingDomain.value = false;
                      saasVerification.value = null;
                    }}
                    class="btn-save" style="margin-top: 1rem; width: 100%;"
                  >
                    I have updated my DNS
                  </button>
                </div>
              ) : (
                <>
                  <div class="field" style="margin-bottom: 1rem;">
                    <label>
                      {customDomainMode.value === "external" ? "1. Choose SaaS Fallback Zone" : "1. Choose your domain/zone"}
                    </label>
                    <select
                      value={selectedZoneId.value}
                      onChange$={(e: any) => selectedZoneId.value = e.target.value}
                      style="width:100%; max-width: 100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--border); background:var(--surface); color:var(--text-primary); font-size:0.875rem;"
                    >
                      <option value="" disabled selected>-- Select a Zone --</option>
                      {accountInfo.value?.zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                  </div>

                  <div class="field" style="max-width: 100%; margin-bottom: 0;">
                    <label>
                      {customDomainMode.value === "external" ? "2. Set External Domain (e.g. client.com)" : "2. Set Custom Domain"}
                    </label>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                      <input
                        type="text"
                        placeholder="shop.yourdomain.com"
                        value={customDomain.value}
                        onInput$={(e: any) => customDomain.value = e.target.value}
                        style="flex: 1; width: 100%;"
                      />
                    </div>

                    {selectedZoneId.value && customDomainMode.value === "external" && (
                      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem;">
                        <div style="background:var(--surface-3); padding:0.75rem; border-radius:0.5rem; font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:flex-start; gap:0.5rem; border:1px solid var(--border);">
                          <LuInfo style="width:1rem;height:1rem;color:var(--accent);flex-shrink:0;margin-top:0.1rem;" />
                          <div>
                            <strong>1. Enable Cloudflare for SaaS</strong> and configure a Fallback Origin in your CF dashboard first.{" "}
                            <a
                              href={`https://dash.cloudflare.com/${cfAccountId.value}/${accountInfo.value?.zones.find(z => z.id === selectedZoneId.value)?.name}/ssl-tls/custom-hostnames`}
                              target="_blank"
                              style="color:var(--accent);font-weight:500;text-decoration:none;"
                            >
                              Enable here ↗
                            </a>
                          </div>
                        </div>

                        <div style="background:var(--surface-3); padding:0.75rem; border-radius:0.5rem; font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:flex-start; gap:0.5rem; border:1px solid var(--border);">
                          <LuInfo style="width:1rem;height:1rem;color:var(--accent);flex-shrink:0;margin-top:0.1rem;" />
                          <div>
                            <strong>2. Create Fallback DNS Record</strong>: Add an AAAA record for <code style="background:var(--surface-1); padding:0.1rem 0.3rem; border-radius:0.25rem;">fallback</code> pointing to <code style="background:var(--surface-1); padding:0.1rem 0.3rem; border-radius:0.25rem;">100::</code> in your chosen zone.{" "}
                            <a
                              href={`https://dash.cloudflare.com/${cfAccountId.value}/${accountInfo.value?.zones.find(z => z.id === selectedZoneId.value)?.name}/dns/records`}
                              target="_blank"
                              style="color:var(--accent);font-weight:500;text-decoration:none;"
                            >
                              Add DNS Record ↗
                            </a>
                          </div>
                        </div>

                        <div style="background:var(--surface-3); padding:0.75rem; border-radius:0.5rem; font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:flex-start; gap:0.5rem; border:1px solid var(--border);">
                          <LuInfo style="width:1rem;height:1rem;color:var(--accent);flex-shrink:0;margin-top:0.1rem;" />
                          <div>
                            <strong>3. Add Worker Route</strong>: Inside your Worker settings, you must add <code style="background:var(--surface-1); padding:0.1rem 0.3rem; border-radius:0.25rem;">*fallback.{accountInfo.value?.zones.find(z => z.id === selectedZoneId.value)?.name}/*</code> in Custom Domains and Routes.{" "}
                            <a
                              href={`https://dash.cloudflare.com/${cfAccountId.value}/workers/services/view/${deployment.value?.deployment_id ? orgDeployments.value.find((d: any) => d.id === deployment.value!.deployment_id)?.cf_worker_name || 'businesskit' : deployment.value?.worker_name}/production/domains`}
                              target="_blank"
                              style="color:var(--accent);font-weight:500;text-decoration:none;"
                            >
                              Add Route Here ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style="display:flex; gap: 0.5rem; align-items:center; margin-top: 1rem; flex-wrap:wrap;">
                      {showUpgrade ? (
                        <button
                          type="button"
                          onClick$={() => nav("/dashboard/settings?tab=plan")}
                          class="btn-save"
                          style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); display: inline-flex; align-items: center; gap: 0.4rem;"
                        >
                          <LuGlobe style="width:0.85rem;height:0.85rem;" />
                          <span>Upgrade to Add Domain</span>
                        </button>
                      ) : (
                        <button
                          onClick$={async () => {
                            if (!selectedZoneId.value || !customDomain.value) {
                              customDomainStatus.value = "Please enter domain and select a zone.";
                              return;
                            }
                            domainLoading.value = true;
                            customDomainStatus.value = "";
                            try {
                              if (customDomainMode.value === "external") {
                                const verifyData: any = await invoke("add_external_custom_domain", {
                                  profileId: appState.activeProfileId.value!,
                                  domain: customDomain.value,
                                  zoneId: selectedZoneId.value,
                                  cfAccountId: cfAccountId.value,
                                  cfApiToken: cfApiToken.value,
                                });
                                saasVerification.value = verifyData;
                                customDomainStatus.value = "";
                              } else {
                                await invoke("add_custom_domain", {
                                  profileId: appState.activeProfileId.value!,
                                  domain: customDomain.value,
                                  zoneId: selectedZoneId.value,
                                  cfAccountId: cfAccountId.value,
                                  cfApiToken: cfApiToken.value,
                                });
                                deployment.value = { ...deployment.value!, custom_domain: customDomain.value };
                                isEditingDomain.value = false;
                                customDomainStatus.value = "Domain added successfully!";
                              }
                            } catch (e: any) {
                              customDomainStatus.value = `Error: ${e.toString()}`;
                            } finally {
                              domainLoading.value = false;
                            }
                          }}
                          class="btn-save"
                          disabled={domainLoading.value}
                        >
                          {domainLoading.value ? "Adding..." : (deployment.value?.custom_domain ? "Update Custom Domain" : "Add Custom Domain")}
                        </button>
                      )}
                      {deployment.value?.custom_domain && (
                        <button
                          onClick$={() => isEditingDomain.value = false}
                          class="btn-ghost"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {customDomainStatus.value && (
                      <p style={`font-size:0.875rem; margin-top:0.75rem; ${customDomainStatus.value.includes('Error') || customDomainStatus.value.includes('Please') ? 'color:var(--error);' : 'color:var(--success);'}`}>
                        {customDomainStatus.value}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Mode Legend ── */}
      <div class="deploy-section" style="margin-top: 2rem;">
        <div class="section-header">
          <span class="section-icon"><LuGlobe style={sectionIconStyle} /></span>
          <span class="section-title">Deployment Architecture Reference</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1rem;">
          BusinessKit supports four conceptual deployment architectures. By attaching multiple profiles to a single deployment above, you utilize <strong>Shared Worker / Shared DB</strong> modes.
        </p>
        <div class="mode-grid" style="pointer-events: none; opacity: 0.8;">
          <div class="mode-card">
            <h3>🔒 Isolated</h3>
            <p class="mode-meta">Dedicated Worker · Dedicated DB</p>
            <p class="mode-desc">Max isolation, but uses up CF Worker limits fast.</p>
          </div>
          <div class="mode-card">
            <h3>📦 Shared DB</h3>
            <p class="mode-meta">Dedicated Worker · Shared DB</p>
            <p class="mode-desc">Isolated compute, but shared data storage.</p>
          </div>
          <div class="mode-card">
            <h3>🌐 Shared Worker</h3>
            <p class="mode-meta">Shared Worker · Dedicated DB</p>
            <p class="mode-desc">Shared compute router, but isolated data storage.</p>
          </div>
          <div class="mode-card">
            <h3>⚡ Shared All</h3>
            <p class="mode-meta">Shared Worker · Shared DB</p>
            <p class="mode-desc">Max consolidation, lowest CF cost.</p>
          </div>
        </div>
      </div>

      {deployment.value && (
        <div class="deploy-section" style="margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 2rem;">
          <div class="section-header" style="margin-bottom: 1rem;">
            <span class="section-title" style="color: var(--error);">Danger Zone</span>
          </div>
          <p class="desc" style="margin-bottom: 1rem;">
            {deployment.value.deployment_id 
              ? "This will detach the profile from the parent worker and delete all copied credentials. You can always re-attach later." 
              : "This will attempt to delete the Cloudflare worker and permanently remove the deployment records for this profile."}
          </p>
          <button 
            onClick$={async () => {
              if (confirm("Are you sure you want to delete this deployment? This action cannot be undone.")) {
                try {
                  isDeploying.value = true;
                  deployProgress.message = "Deleting deployment...";
                  await invoke("delete_deployment", { profileId: appState.activeProfileId.value! });
                  deployment.value = null;
                  selectedDeploymentId.value = "new";
                  // Refresh deployments list
                  const orgDeps: any[] = await invoke("get_org_deployments");
                  orgDeployments.value = orgDeps.filter((d: any) => !d.deployment_id && d.cf_worker_name);
                  alert("Deployment deleted successfully.");
                } catch (e: any) {
                  alert(`Error deleting deployment: ${e.toString()}`);
                } finally {
                  isDeploying.value = false;
                }
              }
            }}
            class="btn-save btn-danger" 
            style="background: transparent; color: var(--error); border: 1px solid var(--error); align-self: flex-start;"
            disabled={isDeploying.value}
          >
            {deployment.value.deployment_id ? "Detach Deployment" : "Delete Deployment"}
          </button>
        </div>
      )}

    </div>
  );
});

export const head: DocumentHead = {
  title: "Deploy | Dashboard",
};
