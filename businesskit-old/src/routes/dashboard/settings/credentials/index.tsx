// src/routes/dashboard/settings/credentials/index.tsx
//
// WHAT:  Credentials management page — Turso DB, WorkOS Auth, Cloudflare R2 & API.
// HOW:   Fetches / lists service credentials & handles updating / validation via Tauri IPC.
//        Responsive grid collapsing to single column on mobile & when AgentChatSidebar expands.

import { component$, useStylesScoped$, useSignal, $, useContext, useTask$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { getProfile } from "~/lib/ipc";
import { SettingsContext } from "../layout";
import { triggerHaptic } from "~/lib/haptics";
import { LuLink, LuKey, LuUser, LuArrowRight, LuPencil, LuInfo, LuGlobe, LuLoader2, LuCopy, LuCheck, LuExternalLink } from "@qwikest/icons/lucide";
import tursoLogo from "~/assets/turso.svg?url";
import workosLogo from "~/assets/workos.svg?url";
import cloudflareLogo from "~/assets/cloudflare.svg?url";
import r2Logo from "~/assets/r2.svg?url";

const iconStyle = "width:1rem;height:1rem;flex-shrink:0;color:var(--text-secondary);";

const STYLES = `
  /* No-DB banner */
  .notice-banner { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:2.5rem; background:var(--surface-2); border:1px solid var(--border); border-radius:0.875rem; text-align:center; }
  .notice-banner p { color:var(--text-secondary); font-size:0.9rem; margin:0; }
  
  /* Grid Container & Layout with Container Query Support */
  .cred-grid-wrap {
    container-type: inline-size;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .cred-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: stretch;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  @container (max-width: 960px) {
    .cred-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
  @media (max-width: 960px) {
    .cred-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
  
  /* Section card */
  .cred-section {
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
  .section-header { display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem; min-width: 0; }
  .section-icon { font-size:1.25rem; flex-shrink:0; }
  .section-title { font-size:1rem; font-weight:700; color:var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .section-badge { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:0.15rem 0.5rem; border-radius:0.35rem; background:color-mix(in srgb,#10b981 12%,var(--surface)); color:#059669; border:1px solid color-mix(in srgb,#10b981 25%,var(--border)); flex-shrink: 0; }
  .section-badge.warn { background:color-mix(in srgb,#f59e0b 12%,var(--surface)); color:#b45309; border-color:color-mix(in srgb,#f59e0b 25%,var(--border)); }

  /* Meta rows - Matching status/index.tsx */
  .meta-row { display:flex; align-items:center; gap:0.6rem; padding:0.4rem 0; width:100%; max-width: 100%; border-top:1px solid var(--border); min-width: 0; box-sizing: border-box; }
  .meta-row:first-of-type { border-top:none; }
  .meta-label { color:var(--text-secondary); font-size:0.875rem; min-width:6.5rem; flex-shrink:0; font-weight:normal; text-transform:none; letter-spacing:normal; }
  .meta-value { font-size:0.78rem; background:var(--surface-1); padding:0.15rem 0.4rem; border-radius:4px; font-family:monospace; color:var(--text-primary); flex:1; min-width: 0; max-width: 100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-sizing: border-box; }

  @container (max-width: 580px) {
    .cred-section { padding: 1rem; border-radius: 0.75rem; }
    .meta-row { gap: 0.4rem; padding: 0.4rem 0; }
    .meta-label { min-width: 4.5rem; font-size: 0.8rem; }
    .meta-value { font-size: 0.72rem; }
    .field-row { grid-template-columns: 1fr !important; }
  }

  @media (max-width: 640px) {
    .cred-section { padding: 1rem; border-radius: 0.75rem; }
    .meta-row { gap: 0.4rem; padding: 0.4rem 0; }
    .meta-label { min-width: 4.5rem; font-size: 0.8rem; }
    .meta-value { font-size: 0.72rem; }
    .field-row { grid-template-columns: 1fr !important; }
  }

  /* Divider */
  .section-divider { height:1px; background:var(--border); margin:1.25rem 0; }

  /* Collapsible update form */
  .update-details { border:1px solid var(--border); border-radius:0.625rem; overflow:hidden; }
  .update-details summary { padding:0.65rem 1rem; cursor:pointer; font-size:0.825rem; font-weight:600; color:var(--text-primary); background:var(--surface); user-select:none; list-style:none; display:flex; align-items:center; gap:0.4rem; }
  .update-details summary::-webkit-details-marker { display:none; }
  .update-details summary:hover { background:color-mix(in srgb,var(--accent) 5%,var(--surface)); }
  .update-details[open] summary { border-bottom:1px solid var(--border); color:var(--accent); }
  .update-form-body { padding:1rem; background:var(--surface-2); box-sizing: border-box; width: 100%; }

  /* Fields */
  .field { margin-bottom:0.875rem; }
  .field label { display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary); margin-bottom:0.3rem; }
  .field input { display:block; width:100%; box-sizing:border-box; padding:0.55rem 0.75rem; border:1px solid var(--border); border-radius:0.5rem; font-size:0.875rem; background:var(--surface); color:var(--text-primary); outline:none; transition:border-color 0.15s; }
  .field input:focus { border-color:var(--accent); }
  .field-row { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
  @container (max-width: 520px) { .field-row { grid-template-columns:1fr; } }
  @media(max-width:520px){ .field-row { grid-template-columns:1fr; } }

  /* Messages */
  .msg-error   { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:0.5rem 0.75rem; border-radius:0.5rem; font-size:0.8rem; margin-bottom:0.75rem; }
  .msg-success { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:0.5rem 0.75rem; border-radius:0.5rem; font-size:0.8rem; margin-bottom:0.75rem; }

  /* Save button */
  .btn-save { padding:0.55rem 1.25rem; background:var(--accent); color:var(--button-primary-text); border:none; border-radius:0.5rem; font-size:0.825rem; font-weight:700; cursor:pointer; transition:opacity 0.15s; text-transform:capitalize; }
  .btn-save:hover:not(:disabled) { opacity:0.88; }
  .btn-save:disabled { opacity:0.4; cursor:not-allowed; }
`;

export default component$(() => {
  useStylesScoped$(STYLES);

  const settingsCtx = useContext(SettingsContext);
  const creds = settingsCtx.centralCredentials;
  const loading = settingsCtx.loading;
  const error = useSignal<string | null>(null);

  // Turso form
  const tursoUrlInput = useSignal("");
  const tursoTokenInput = useSignal("");
  const tursoLoading = useSignal(false);
  const tursoStepMsg = useSignal("");
  const tursoSuccess = useSignal(false);
  const tursoError = useSignal<string | null>(null);

  // WorkOS form
  const workosClientIdInput = useSignal("");
  const workosApiKeyInput = useSignal("");
  const workosRedirectUriInput = useSignal("");
  const workosLoading = useSignal(false);
  const workosStepMsg = useSignal("");
  const workosSuccess = useSignal(false);
  const workosError = useSignal<string | null>(null);

  // WorkOS Domain & Redirect URI Selection State
  const profileSlug = useSignal("");
  const settingsCountry = useSignal("");
  const detectedCustomDomain = useSignal("");
  const workosDomainType = useSignal<"subdomain" | "custom_domain" | "manual">("subdomain");
  const workosCustomDomain = useSignal("");
  const workosCopied = useSignal(false);

  const handleCopyWorkosUri = $(async () => {
    const isInd = (settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india";
    const ext = isInd ? "businesskit.in" : "businesskit.io";
    const s = profileSlug.value || settingsCtx.profile?.slug || "workspace";
    const fallback = `https://${s}.${ext}/auth/callback`;
    const uri = workosRedirectUriInput.value.trim() || fallback;
    try {
      await navigator.clipboard.writeText(uri);
      workosCopied.value = true;
      triggerHaptic("success");
      setTimeout(() => {
        workosCopied.value = false;
      }, 2000);
    } catch (e) {
      console.error("Failed to copy WorkOS URI:", e);
    }
  });

  const handleCopyText = $(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerHaptic("success");
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  });

  // CF API form
  const cfConnection = useSignal<any>(null);
  const cfAccountIdInput = useSignal("");
  const cfApiTokenInput = useSignal("");
  const cfLoading = useSignal(false);
  const cfStepMsg = useSignal("");
  const cfSuccess = useSignal(false);
  const cfError = useSignal<string | null>(null);

  // R2 form
  const r2Connection = useSignal<any>(null);
  const r2AccountIdInput = useSignal("");
  const r2AccessKeyInput = useSignal("");
  const r2SecretKeyInput = useSignal("");
  const r2BucketNameInput = useSignal("businesskit-media");
  const r2PublicUrlInput = useSignal("");
  const r2Loading = useSignal(false);
  const r2Success = useSignal(false);
  const r2Error = useSignal<string | null>(null);

  // Custom Domain Selector State
  const userZones = useSignal<{ id: string; name: string }[]>([]);
  const r2DomainType = useSignal<"custom" | "dev">("custom");
  const r2Subdomain = useSignal("r2");
  const r2SelectedZone = useSignal("");

  useTask$(async ({ track }) => {
    track(() => settingsCtx.centralCredentials);
    if (settingsCtx.centralCredentials) {
      tursoUrlInput.value = settingsCtx.centralCredentials.turso_url;
      workosClientIdInput.value = settingsCtx.centralCredentials.workos_client_id;
      workosRedirectUriInput.value = settingsCtx.centralCredentials.workos_redirect_uri;

      // Fetch profile & settings country & custom domains
      try {
        const [prof, setts, depStatus]: [any, any, any] = await Promise.all([
          getProfile().catch(() => null),
          invoke("get_settings").catch(() => null),
          invoke("get_deployment_status").catch(() => null),
        ]);

        if (prof) {
          profileSlug.value = prof.slug || "";
          if (prof.primary_domain) {
            detectedCustomDomain.value = prof.primary_domain;
            if (!workosCustomDomain.value) {
              workosCustomDomain.value = prof.primary_domain;
            }
          }
        }
        if (setts) {
          settingsCountry.value = setts.country || "";
        }
        if (depStatus && depStatus.custom_domain) {
          detectedCustomDomain.value = depStatus.custom_domain;
          if (!workosCustomDomain.value) {
            workosCustomDomain.value = depStatus.custom_domain;
          }
        }

        const isInd = (settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india";
        const ext = isInd ? "businesskit.in" : "businesskit.io";
        const currentSlug = profileSlug.value || settingsCtx.profile?.slug || "workspace";

        if (!workosRedirectUriInput.value) {
          if (detectedCustomDomain.value) {
            workosDomainType.value = "custom_domain";
            workosRedirectUriInput.value = `https://${detectedCustomDomain.value}/auth/callback`;
          } else {
            workosDomainType.value = "subdomain";
            workosRedirectUriInput.value = `https://${currentSlug}.${ext}/auth/callback`;
          }
        } else {
          const uri = workosRedirectUriInput.value;
          if (uri.includes(".businesskit.in") || uri.includes(".businesskit.io")) {
            workosDomainType.value = "subdomain";
          } else if (detectedCustomDomain.value && uri.includes(detectedCustomDomain.value)) {
            workosDomainType.value = "custom_domain";
          } else {
            try {
              const cleanUrl = uri.replace(/^https?:\/\//, "").replace(/\/auth\/callback\/?$/, "");
              workosCustomDomain.value = cleanUrl;
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        console.error("Failed to load profile/settings context:", err);
      }
      
      if (settingsCtx.centralCredentials.has_user_db) {
        try {
          const cfConns: any[] = await invoke("list_connections", { service: "cloudflare" });
          if (cfConns && cfConns.length > 0) {
            cfConnection.value = cfConns[0];
            cfAccountIdInput.value = cfConns[0].extra;
            
            // Auto fetch zones for custom domain selection
            try {
              const info: any = await invoke("validate_cloudflare_connection", {
                cfAccountId: cfConns[0].extra,
                cfApiToken: cfConns[0].access_token
              });
              if (info && info.zones) {
                userZones.value = info.zones;
                if (info.zones.length > 0 && !r2SelectedZone.value) {
                  r2SelectedZone.value = info.zones[0].name;
                }
              }
            } catch(err) {
              console.error("Failed to load Cloudflare zones:", err);
            }
          }
        } catch(e) {
          console.error("Failed to load CF connection:", e);
        }

        try {
          const conns: any[] = await invoke("list_connections", { service: "cloudflare_r2" });
          if (conns && conns.length > 0) {
            r2Connection.value = conns[0];
            const extraVal = conns[0].extra;
            if (extraVal) {
              try {
                const parsed = JSON.parse(extraVal);
                r2AccountIdInput.value = parsed.account_id || extraVal;
                r2BucketNameInput.value = parsed.bucket_name || "businesskit-media";
                let savedUrl = parsed.public_url || conns[0].url || "";
                if (savedUrl.includes("pub-914c578f65") || (savedUrl.startsWith("https://pub-") && savedUrl.length < 35)) {
                  savedUrl = "";
                }
                r2PublicUrlInput.value = savedUrl;
              } catch {
                r2AccountIdInput.value = extraVal;
              }
            }
            r2AccessKeyInput.value = conns[0].access_token || "";
          }
        } catch(e) {
          console.error("Failed to load R2 connection:", e);
        }
      }
    }
  });

  const handleTursoUpdate = $(async () => {
    if (!tursoUrlInput.value.trim() || !tursoTokenInput.value.trim()) {
      tursoError.value = "URL and Token are required";
      triggerHaptic("error");
      return;
    }
    tursoLoading.value = true;
    tursoError.value = null;
    tursoSuccess.value = false;
    tursoStepMsg.value = "Testing...";
    triggerHaptic("medium");

    const saveTimer = setTimeout(() => {
      if (tursoLoading.value) {
        tursoStepMsg.value = "Saving...";
        triggerHaptic("light");
      }
    }, 450);

    try {
      await invoke("update_turso_creds", {
        tursoUrl: tursoUrlInput.value.trim(),
        tursoToken: tursoTokenInput.value.trim(),
      });
      clearTimeout(saveTimer);
      tursoStepMsg.value = "Saving...";
      await new Promise((r) => setTimeout(r, 200));

      tursoStepMsg.value = "Saved!";
      tursoSuccess.value = true;
      tursoTokenInput.value = "";
      triggerHaptic("success");
      await settingsCtx.refresh();
    } catch (e) {
      clearTimeout(saveTimer);
      tursoError.value = String(e);
      triggerHaptic("error");
    } finally {
      tursoLoading.value = false;
      tursoStepMsg.value = "";
    }
  });

  const handleWorkosUpdate = $(async () => {
    if (!workosClientIdInput.value.trim() || !workosApiKeyInput.value.trim()) {
      workosError.value = "Client ID and API Key are required";
      triggerHaptic("error");
      return;
    }
    workosLoading.value = true;
    workosError.value = null;
    workosSuccess.value = false;
    workosStepMsg.value = "Testing...";
    triggerHaptic("medium");

    const saveTimer = setTimeout(() => {
      if (workosLoading.value) {
        workosStepMsg.value = "Saving...";
        triggerHaptic("light");
      }
    }, 450);

    try {
      await invoke("update_workos_creds", {
        clientId: workosClientIdInput.value.trim(),
        apiKey: workosApiKeyInput.value.trim(),
        redirectUri: workosRedirectUriInput.value.trim(),
      });
      clearTimeout(saveTimer);
      workosStepMsg.value = "Saving...";
      await new Promise((r) => setTimeout(r, 200));

      workosStepMsg.value = "Saved!";
      workosSuccess.value = true;
      workosApiKeyInput.value = "";
      triggerHaptic("success");
      await settingsCtx.refresh();
    } catch (e) {
      clearTimeout(saveTimer);
      workosError.value = String(e);
      triggerHaptic("error");
    } finally {
      workosLoading.value = false;
      workosStepMsg.value = "";
    }
  });

  const handleCFUpdate = $(async () => {
    if (!cfAccountIdInput.value.trim() || !cfApiTokenInput.value.trim()) {
      cfError.value = "Account ID and API Token are required";
      triggerHaptic("error");
      return;
    }
    cfLoading.value = true;
    cfError.value = null;
    cfSuccess.value = false;
    cfStepMsg.value = "Testing...";
    triggerHaptic("medium");

    const saveTimer = setTimeout(() => {
      if (cfLoading.value) {
        cfStepMsg.value = "Saving...";
        triggerHaptic("light");
      }
    }, 450);

    try {
      // Validate with Cloudflare first (like in deploy page)
      await invoke("validate_cloudflare_connection", {
        cfAccountId: cfAccountIdInput.value.trim(),
        cfApiToken: cfApiTokenInput.value.trim()
      });

      if (cfConnection.value) {
        await invoke("delete_connection", { id: cfConnection.value.id });
      }
      
      await invoke("create_connection", {
        data: {
          name: "Cloudflare",
          service: "cloudflare",
          access_token: cfApiTokenInput.value.trim(),
          extra: cfAccountIdInput.value.trim(),
          provider: "cloudflare"
        }
      });
      
      clearTimeout(saveTimer);
      cfStepMsg.value = "Saving...";
      await new Promise((r) => setTimeout(r, 200));

      cfStepMsg.value = "Saved!";
      cfSuccess.value = true;
      cfApiTokenInput.value = "";
      triggerHaptic("success");
      
      // refresh
      const cfConns: any[] = await invoke("list_connections", { service: "cloudflare" });
      if (cfConns && cfConns.length > 0) cfConnection.value = cfConns[0];
    } catch (e) {
      clearTimeout(saveTimer);
      cfError.value = String(e);
      triggerHaptic("error");
    } finally {
      cfLoading.value = false;
      cfStepMsg.value = "";
    }
  });

function parseAccountId(extraVal: any): string {
  if (!extraVal) return "";
  if (typeof extraVal === "object") return extraVal.account_id || "";
  try {
    const parsed = JSON.parse(extraVal);
    return parsed.account_id || extraVal;
  } catch {
    return String(extraVal);
  }
}

  const r2StepMsg = useSignal("");

  const handleR2Update = $(async () => {
    if (!r2AccountIdInput.value.trim() || !r2AccessKeyInput.value.trim() || !r2SecretKeyInput.value.trim()) {
      r2Error.value = "Account ID, Access Key ID, and Secret Access Key are required";
      return;
    }
    r2Loading.value = true;
    r2Error.value = null;
    r2Success.value = false;

    const accId = r2AccountIdInput.value.trim();
    const accessKey = r2AccessKeyInput.value.trim();
    const secretKey = r2SecretKeyInput.value.trim();
    const bucketName = r2BucketNameInput.value.trim() || "businesskit-media";

    const cfApiToken = cfConnection.value?.access_token || cfApiTokenInput.value || null;

    try {
      // 1. Testing connection...
      r2StepMsg.value = "Testing connection...";
      await invoke("validate_r2_connection", {
        accountId: accId,
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        bucketName: bucketName,
      });

      // 2. Creating bucket (if not exist)...
      r2StepMsg.value = "Creating bucket (if not exist)...";
      await invoke("create_r2_bucket", {
        accountId: accId,
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        bucketName: bucketName,
        apiToken: cfApiToken,
      });

      let finalPublicUrl = "";

      // 3. Enabling / Attaching Domain based on selected Mode...
      if (r2DomainType.value === "custom") {
        let customTarget = "";
        if (userZones.value.length > 0 && r2SelectedZone.value) {
          const sub = r2Subdomain.value.trim() || "r2";
          customTarget = `https://${sub}.${r2SelectedZone.value}`;
        } else if (r2PublicUrlInput.value) {
          const inputUrl = r2PublicUrlInput.value.trim();
          if (!inputUrl.includes("pub-914c578f65") && !(inputUrl.startsWith("https://pub-") && inputUrl.length < 35)) {
            customTarget = inputUrl;
          }
        }

        const selectedZoneObj = userZones.value.find((z) => z.name === r2SelectedZone.value);
        const zoneId = selectedZoneObj?.id || null;

        if (customTarget) {
          const cleanDomain = customTarget.replace("https://", "").replace("http://", "");
          r2StepMsg.value = `Attaching custom domain (${cleanDomain})...`;
          try {
            await invoke("attach_r2_custom_domain", {
              accountId: accId,
              bucketName: bucketName,
              customDomain: cleanDomain,
              zoneId: zoneId,
              apiToken: cfApiToken,
            });
            finalPublicUrl = customTarget;
          } catch (e) {
            console.warn("Custom domain attach error:", e);
            finalPublicUrl = customTarget;
          }
        }
      } else if (r2DomainType.value === "dev") {
        r2StepMsg.value = "Enabling R2 Dev URL on Cloudflare...";
        try {
          const enabledUrl: string = await invoke("enable_r2_managed_domain", {
            accountId: accId,
            bucketName: bucketName,
            apiToken: cfApiToken,
          });
          if (enabledUrl) {
            finalPublicUrl = enabledUrl;
          }
        } catch (err) {
          console.warn("Enable R2 managed domain notice:", err);
        }
      }

      // Fallback: fetch domains if not set
      if (!finalPublicUrl) {
        r2StepMsg.value = "Fetching domain from Cloudflare...";
        try {
          const fetchedDomains: string[] = await invoke("fetch_r2_bucket_domains", {
            accountId: accId,
            bucketName: bucketName,
            apiToken: cfApiToken,
          });
          if (fetchedDomains && fetchedDomains.length > 0) {
            finalPublicUrl = fetchedDomains[0];
          }
        } catch (err) {
          console.warn("Domain fetch notice:", err);
        }
      }

      // 4. Saving...
      r2StepMsg.value = "Saving...";
      if (r2Connection.value) {
        await invoke("delete_connection", { id: r2Connection.value.id });
      }
      
      const extraJson = JSON.stringify({
        account_id: accId,
        bucket_name: bucketName,
        public_url: finalPublicUrl || null,
      });

      await invoke("create_connection", {
        data: {
          name: "Cloudflare R2",
          service: "cloudflare_r2",
          client_id: accessKey,
          client_secret: secretKey,
          access_token: accessKey,
          refresh_token: secretKey,
          url: finalPublicUrl || null,
          extra: extraJson,
        }
      });
      
      r2StepMsg.value = "Saved!";
      r2Success.value = true;
      r2SecretKeyInput.value = "";
      r2PublicUrlInput.value = finalPublicUrl;
      
      // refresh
      const conns: any[] = await invoke("list_connections", { service: "cloudflare_r2" });
      if (conns && conns.length > 0) {
        r2Connection.value = conns[0];
      }
    } catch (e) {
      r2Error.value = String(e);
    } finally {
      r2Loading.value = false;
      r2StepMsg.value = "";
    }
  });

  return (
    <>
      <div>
        {loading && <div style="color:var(--text-secondary);">Loading...</div>}
        {error.value && <div class="msg-error">{error.value}</div>}

        {loading ? null : creds && (
          <div class="cred-grid-wrap">
            <div class="cred-grid">
              {/* ── Turso Database ── */}
            <div class="cred-section" style="margin-bottom: 0;">
              <div class="section-header">
                <span class="section-icon">
                  <img src={tursoLogo} alt="Turso" width={24} height={24} />
                </span>
                <span class="section-title">Turso Database</span>
                {creds.has_user_db ? (
                  <span class="section-badge">Connected</span>
                ) : (
                  <span class="section-badge warn">Not connected</span>
                )}
              </div>

              {creds.has_user_db ? (
                <>
                  <div class="meta-row">
                    <LuLink style={iconStyle} />
                    <span class="meta-label">URL</span>
                    <span class="meta-value" title={creds.turso_url}>{creds.turso_url}</span>
                  </div>
                  <div class="meta-row">
                    <LuKey style={iconStyle} />
                    <span class="meta-label">Token</span>
                    <span class="meta-value" title="Protected Auth Token">{creds.turso_token_masked}</span>
                  </div>
                </>
              ) : (
                <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                  No database connected yet. Enter your Turso database credentials to store your products, members, and data.{" "}
                  <a href="https://turso.tech" target="_blank" rel="noopener noreferrer"
                    style="color:var(--accent);text-decoration:none;font-weight:600;">
                    Get free database at turso.tech ↗
                  </a>
                </p>
              )}

              <div style="flex: 1; min-height: 1rem;" />

              <details class="update-details" open={!creds.has_user_db}>
                <summary><LuPencil style={iconStyle} /> {creds.has_user_db ? "Update Connection" : "Connect Turso Database"}</summary>
                <div class="update-form-body">
                  <div class="field">
                    <label>Database URL</label>
                    <input type="text" placeholder="libsql://your-db.turso.io" value={tursoUrlInput.value} onInput$={(e) => tursoUrlInput.value = (e.target as HTMLInputElement).value} required />
                  </div>
                  <div class="field">
                    <label>{creds.has_user_db ? "New Auth Token" : "Auth Token"}</label>
                    <input type="password" value={tursoTokenInput.value} onInput$={(e) => tursoTokenInput.value = (e.target as HTMLInputElement).value} placeholder={creds.has_user_db ? "Paste new token to rotate" : "Paste Turso auth token"} required />
                  </div>
                  {tursoError.value && <div class="msg-error">{tursoError.value}</div>}
                  {tursoSuccess.value && <div class="msg-success">✓ Database {creds.has_user_db ? "updated" : "connected"} &amp; synchronized</div>}
                  <button onClick$={handleTursoUpdate} class="btn-save" disabled={tursoLoading.value} style="display:flex; align-items:center; justify-content:center; gap:8px;">
                    {tursoLoading.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
                    <span>{tursoLoading.value ? (tursoStepMsg.value || "Testing & saving…") : creds.has_user_db ? "Test & Save" : "Test & Connect Database"}</span>
                  </button>
                </div>
              </details>
            </div>

                {/* ── WorkOS Auth ── */}
                <div class="cred-section" style="margin-bottom: 0;">
                  <div class="section-header">
                    <span class="section-icon">
                      <img src={workosLogo} alt="WorkOS" width={24} height={24} />
                    </span>
                    <span class="section-title">WorkOS Authentication</span>
                    {creds.has_workos
                      ? <span class="section-badge">Connected</span>
                      : <span class="section-badge warn">Not configured</span>
                    }
                  </div>

                  {creds.has_workos ? (
                    <>
                      <div class="meta-row">
                        <LuUser style={iconStyle} />
                        <span class="meta-label">Client ID</span>
                        <span class="meta-value" title={creds.workos_client_id}>{creds.workos_client_id}</span>
                      </div>
                      <div class="meta-row">
                        <LuKey style={iconStyle} />
                        <span class="meta-label">API Key</span>
                        <span class="meta-value" title="Protected API Key">{creds.workos_api_key_masked}</span>
                      </div>
                      {creds.workos_redirect_uri && (
                        <div class="meta-row">
                          <LuArrowRight style={iconStyle} />
                          <span class="meta-label">Redirect URI</span>
                          <span class="meta-value" title={creds.workos_redirect_uri}>{creds.workos_redirect_uri}</span>
                          <button
                            type="button"
                            onClick$={() => handleCopyText(creds.workos_redirect_uri)}
                            title="Copy Redirect URI"
                            style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.15rem 0.35rem; border-radius:0.25rem; display:flex; align-items:center; flex-shrink:0;"
                            onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                            onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                          >
                            <LuCopy style="width:0.85rem;height:0.85rem;" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                      Required if you sell products or collect payments.{" "}
                      <a href="https://workos.com" target="_blank" rel="noopener noreferrer"
                        style="color:var(--accent);text-decoration:none;font-weight:600;">
                        Create a free WorkOS account ↗
                      </a>
                    </p>
                  )}

                  <div style="flex: 1; min-height: 1rem;" />

                  <details class="update-details">
                    <summary><LuPencil style={iconStyle} /> {creds.has_workos ? "Update Credentials" : "Add WorkOS Credentials"}</summary>
                    <div class="update-form-body">
                      <div class="field">
                        <label>Client ID</label>
                        <input type="text" value={workosClientIdInput.value} onInput$={(e) => workosClientIdInput.value = (e.target as HTMLInputElement).value} placeholder="client_01..." required />
                      </div>
                      <div class="field">
                        <label>API Key (Secret Key)</label>
                        <input type="password" value={workosApiKeyInput.value} onInput$={(e) => workosApiKeyInput.value = (e.target as HTMLInputElement).value} placeholder="sk_test_..." required />
                      </div>

                      {/* Redirect URI Configuration Options */}
                      <div class="field">
                        <label>Redirect URI Option</label>
                        <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
                          <button
                            type="button"
                            onClick$={() => {
                              workosDomainType.value = "subdomain";
                              const isInd = (settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india";
                              const ext = isInd ? "businesskit.in" : "businesskit.io";
                              const s = profileSlug.value || settingsCtx.profile?.slug || "workspace";
                              workosRedirectUriInput.value = `https://${s}.${ext}/auth/callback`;
                            }}
                            style={{
                              flex: 1,
                              padding: "0.45rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: workosDomainType.value === "subdomain" ? "var(--surface-3)" : "transparent",
                              color: workosDomainType.value === "subdomain" ? "var(--accent)" : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Subdomain ({((settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india") ? ".in" : ".io"})
                          </button>

                          <button
                            type="button"
                            onClick$={() => {
                              workosDomainType.value = "custom_domain";
                              const dom = workosCustomDomain.value || detectedCustomDomain.value || "";
                              if (dom) {
                                const clean = dom.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/auth\/callback$/, "");
                                workosRedirectUriInput.value = `https://${clean}/auth/callback`;
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: "0.45rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: workosDomainType.value === "custom_domain" ? "var(--surface-3)" : "transparent",
                              color: workosDomainType.value === "custom_domain" ? "var(--accent)" : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Custom Domain
                          </button>

                          <button
                            type="button"
                            onClick$={() => {
                              workosDomainType.value = "manual";
                            }}
                            style={{
                              flex: 1,
                              padding: "0.45rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: workosDomainType.value === "manual" ? "var(--surface-3)" : "transparent",
                              color: workosDomainType.value === "manual" ? "var(--accent)" : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Manual URL
                          </button>
                        </div>
                      </div>

                      {workosDomainType.value === "subdomain" ? (
                        <div class="field">
                          <label>Profile Slug & BusinessKit Domain</label>
                          <div style="display:flex; align-items:center; gap:0.5rem;">
                            <input
                              type="text"
                              value={profileSlug.value}
                              onInput$={(e) => {
                                const val = (e.target as HTMLInputElement).value;
                                profileSlug.value = val;
                                const isInd = (settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india";
                                const ext = isInd ? "businesskit.in" : "businesskit.io";
                                const s = val.trim() || "workspace";
                                workosRedirectUriInput.value = `https://${s}.${ext}/auth/callback`;
                              }}
                              placeholder="e.g. ujjwal"
                              style="flex:1;"
                            />
                            <span style="font-size:0.875rem; font-weight:600; color:var(--text-secondary); background:var(--surface-1); padding:0.55rem 0.75rem; border-radius:0.5rem; border:1px solid var(--border); white-space:nowrap;">
                              .{((settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india") ? "businesskit.in" : "businesskit.io"}
                            </span>
                          </div>
                          <p style="font-size:0.72rem; color:var(--text-secondary); margin-top:0.35rem;">
                            Country: <strong>{settingsCountry.value || "Default"}</strong> {((settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india") ? "→ 🇮🇳 .businesskit.in" : "→ 🌐 .businesskit.io"} • From <code>profiles.slug</code>
                          </p>
                        </div>
                      ) : workosDomainType.value === "custom_domain" ? (
                        <div class="field">
                          <label>Custom Domain</label>
                          <input
                            type="text"
                            value={workosCustomDomain.value}
                            onInput$={(e) => {
                              const val = (e.target as HTMLInputElement).value;
                              workosCustomDomain.value = val;
                              const dom = val.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/auth\/callback$/, "");
                              if (dom) {
                                workosRedirectUriInput.value = `https://${dom}/auth/callback`;
                              }
                            }}
                            placeholder={detectedCustomDomain.value || "e.g. yourdomain.com or auth.yourdomain.com"}
                          />
                          {detectedCustomDomain.value && (
                            <div style="margin-top:0.35rem; display:flex; align-items:center; gap:0.35rem; font-size:0.72rem; color:var(--text-secondary);">
                              <span>From custom_domains:</span>
                              <button
                                type="button"
                                onClick$={() => {
                                  workosCustomDomain.value = detectedCustomDomain.value;
                                  workosRedirectUriInput.value = `https://${detectedCustomDomain.value}/auth/callback`;
                                }}
                                style="background:none; border:none; color:var(--accent); text-decoration:underline; font-weight:600; cursor:pointer; padding:0;"
                              >
                                {detectedCustomDomain.value}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div class="field">
                          <label>Redirect URI</label>
                          <input
                            type="url"
                            value={workosRedirectUriInput.value}
                            onInput$={(e) => { workosRedirectUriInput.value = (e.target as HTMLInputElement).value; }}
                            placeholder="https://yourdomain.com/auth/callback"
                          />
                        </div>
                      )}

                      {/* Copy & Paste Redirect URI Box */}
                      <div class="field" style="margin-top: 0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                          <label style="margin-bottom:0;">WorkOS Redirect URI (Copy to Dashboard)</label>
                          <a
                            href="https://dashboard.workos.com/configuration/redirect-uris"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="color:var(--accent); font-size:0.72rem; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:0.25rem;"
                          >
                            <span>Open Dashboard</span>
                            <LuExternalLink style="width:0.75rem;height:0.75rem;" />
                          </a>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                            padding: "0.35rem 0.5rem 0.35rem 0.75rem",
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={workosRedirectUriInput.value || `https://${profileSlug.value || "workspace"}.${((settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india") ? "businesskit.in" : "businesskit.io"}/auth/callback`}
                          >
                            {workosRedirectUriInput.value || `https://${profileSlug.value || "workspace"}.${((settingsCountry.value || "").trim().toUpperCase() === "IN" || (settingsCountry.value || "").trim().toLowerCase() === "india") ? "businesskit.in" : "businesskit.io"}/auth/callback`}
                          </span>
                          <button
                            type="button"
                            onClick$={handleCopyWorkosUri}
                            title="Copy Redirect URI to Clipboard"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.75rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: workosCopied.value ? "var(--success-soft, rgba(16,185,129,0.12))" : "var(--surface-2)",
                              color: workosCopied.value ? "var(--success, #10b981)" : "var(--text-primary)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              flexShrink: 0,
                            }}
                          >
                            {workosCopied.value ? (
                              <>
                                <LuCheck style="width:0.875rem;height:0.875rem;" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <LuCopy style="width:0.875rem;height:0.875rem;" />
                                <span>Copy URI</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.35rem;line-height:1.4;">
                          💡 Copy this URL and paste into your WorkOS Dashboard under <strong>Configuration → Redirect URIs</strong>.
                        </p>
                      </div>

                      {workosError.value && <div class="msg-error">{workosError.value}</div>}
                      {workosSuccess.value && <div class="msg-success">✓ WorkOS credentials saved</div>}
                      <button onClick$={handleWorkosUpdate} class="btn-save" disabled={workosLoading.value} style="display:flex; align-items:center; justify-content:center; gap:8px;">
                        {workosLoading.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
                        <span>{workosLoading.value ? (workosStepMsg.value || "Saving…") : "Save"}</span>
                      </button>
                    </div>
                  </details>
                </div>

                {/* ── Cloudflare R2 ── */}
                <div class="cred-section" style="margin-bottom: 0;">
                  <div class="section-header">
                    <span class="section-icon">
                      <img src={r2Logo} alt="Cloudflare R2" width={24} height={24} />
                    </span>
                    <span class="section-title">Cloudflare R2</span>
                    {r2Connection.value
                      ? <span class="section-badge">Connected</span>
                      : <span class="section-badge warn">Not configured</span>
                    }
                  </div>

                  {r2Connection.value ? (
                    <>
                      <div class="meta-row">
                        <LuUser style={iconStyle} />
                        <span class="meta-label">Account ID</span>
                        <span class="meta-value" title={parseAccountId(r2Connection.value.extra)}>{parseAccountId(r2Connection.value.extra)}</span>
                      </div>
                      <div class="meta-row">
                        <LuKey style={iconStyle} />
                        <span class="meta-label">Access Key ID</span>
                        <span class="meta-value" title={r2Connection.value.access_token}>{r2Connection.value.access_token}</span>
                      </div>
                      <div class="meta-row">
                        <LuLink style={iconStyle} />
                        <span class="meta-label">S3 Endpoint</span>
                        <span class="meta-value" title={`https://${parseAccountId(r2Connection.value.extra)}.r2.cloudflarestorage.com`}>
                          https://{parseAccountId(r2Connection.value.extra)}.r2.cloudflarestorage.com
                        </span>
                      </div>
                      <div class="meta-row">
                        <LuGlobe style={iconStyle} />
                        <span class="meta-label">Public CDN URL</span>
                        <span class="meta-value" title={r2Connection.value.url || "Public Development URL not enabled"}>
                          {r2Connection.value.url && r2Connection.value.url !== "null" ? (
                            r2Connection.value.url
                          ) : (
                            <span style="color:#b45309;font-weight:600;">
                              Public Development URL not enabled
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                      Required for file, image, and video uploads. Create an API token with R2 permissions in your Cloudflare dashboard.{" "}
                      <a
                        href={r2AccountIdInput.value ? `https://dash.cloudflare.com/${r2AccountIdInput.value}/r2/plans` : "https://dash.cloudflare.com/r2/plans"}
                        target="_blank"
                        rel="noopener noreferrer"
                        style="color:var(--accent);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:0.25rem;"
                      >
                        Activate R2 in Cloudflare Dashboard ↗
                      </a>
                    </p>
                  )}

                  <div style="flex: 1; min-height: 1rem;" />

                  <details class="update-details">
                    <summary><LuPencil style={iconStyle} /> {r2Connection.value ? "Update Credentials" : "Add R2 Credentials"}</summary>
                    <div class="update-form-body">
                      <div class="field">
                        <label>Account ID</label>
                        <input
                          type="text"
                          value={r2AccountIdInput.value}
                          onInput$={(e) => {
                            const val = (e.target as HTMLInputElement).value.trim();
                            r2AccountIdInput.value = val;
                            if (val && !r2BucketNameInput.value) {
                              r2BucketNameInput.value = "businesskit-media";
                            }
                          }}
                          placeholder="cf_account_id..."
                          required
                        />
                      </div>
                      <div class="field">
                        <label>Access Key ID</label>
                        <input type="text" value={r2AccessKeyInput.value} onInput$={(e) => r2AccessKeyInput.value = (e.target as HTMLInputElement).value} placeholder="Access Key ID..." required />
                      </div>
                      <div class="field">
                        <label>Secret Access Key</label>
                        <input type="password" value={r2SecretKeyInput.value} onInput$={(e) => r2SecretKeyInput.value = (e.target as HTMLInputElement).value} placeholder="Secret Access Key..." required />
                      </div>
                      <div class="field">
                        <label>Bucket Name</label>
                        <input type="text" value={r2BucketNameInput.value} onInput$={(e) => r2BucketNameInput.value = (e.target as HTMLInputElement).value} placeholder="e.g. businesskit-media" />
                      </div>
                      {/* Public Domain Configuration */}
                      <div class="field">
                        <label>Public Access Domain Type</label>
                        <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
                          <button
                            type="button"
                            onClick$={() => { r2DomainType.value = "custom"; }}
                            style={{
                              flex: 1,
                              padding: "0.45rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: r2DomainType.value === "custom" ? "var(--surface-3)" : "transparent",
                              color: r2DomainType.value === "custom" ? "var(--accent)" : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Custom Domain (e.g. r2.example.com)
                          </button>
                          <button
                            type="button"
                            onClick$={() => { r2DomainType.value = "dev"; }}
                            style={{
                              flex: 1,
                              padding: "0.45rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: r2DomainType.value === "dev" ? "var(--surface-3)" : "transparent",
                              color: r2DomainType.value === "dev" ? "var(--accent)" : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            R2 Dev URL (pub-xxx.r2.dev)
                          </button>
                        </div>
                      </div>

                      {r2DomainType.value === "custom" && userZones.value.length > 0 ? (
                        <div class="field">
                          <label>Custom Subdomain & Zone</label>
                          <div class="field-row">
                            <input
                              type="text"
                              value={r2Subdomain.value}
                              onInput$={(e) => { r2Subdomain.value = (e.target as HTMLInputElement).value; }}
                              placeholder="e.g. r2 or media"
                            />
                            <select
                              value={r2SelectedZone.value}
                              onChange$={(e) => { r2SelectedZone.value = (e.target as HTMLSelectElement).value; }}
                              style={{
                                width: "100%",
                                padding: "0.55rem 0.75rem",
                                border: "1px solid var(--border)",
                                borderRadius: "0.5rem",
                                fontSize: "0.875rem",
                                background: "var(--surface)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {userZones.value.map((z) => (
                                <option key={z.id} value={z.name}>
                                  {`.${z.name}`}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p style="font-size:0.75rem;color:var(--accent);margin-top:0.35rem;font-weight:600;">
                            Preview: https://{r2Subdomain.value || "r2"}.{r2SelectedZone.value || "example.com"}
                          </p>
                        </div>
                      ) : r2DomainType.value === "dev" ? (
                        <div class="field">
                          <label>Cloudflare R2 Public Development URL (Auto-fetched on Save)</label>
                          <input
                            type="url"
                            value={r2PublicUrlInput.value || "Will be fetched automatically from Cloudflare on Save"}
                            readOnly
                            disabled
                            style={{ background: "var(--surface-1)", cursor: "not-allowed", color: "var(--text-secondary)", opacity: 0.8 }}
                          />
                          <p style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.3rem;">
                            🔒 Read-only. BusinessKit automatically fetches your bucket's exact R2 Dev URL from Cloudflare when you click Save.
                          </p>
                        </div>
                      ) : (
                        <div class="field">
                          <label>Public Custom Domain / R2 Public URL</label>
                          <input
                            type="url"
                            value={r2PublicUrlInput.value}
                            onInput$={(e) => { r2PublicUrlInput.value = (e.target as HTMLInputElement).value; }}
                            placeholder="e.g. https://r2.example.com or https://pub-xxx.r2.dev"
                          />
                        </div>
                      )}
                      {r2Error.value && <div class="msg-error">{r2Error.value}</div>}
                      {r2Success.value && <div class="msg-success">✓ Cloudflare R2 credentials saved</div>}
                      <button onClick$={handleR2Update} class="btn-save" disabled={r2Loading.value} style="display:flex; align-items:center; justify-content:center; gap:8px;">
                        {r2Loading.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
                        <span>{r2Loading.value ? (r2StepMsg.value || "Saving…") : "Save"}</span>
                      </button>

                      <div style="background:var(--surface-3); padding:0.75rem; border-radius:0.5rem; font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:flex-start; gap:0.5rem; border:1px solid var(--border); margin-top:0.875rem;">
                        <LuInfo style="width:1rem;height:1rem;color:var(--accent);flex-shrink:0;margin-top:0.1rem;" />
                        <div>
                          <strong>Activate R2 Plan</strong>: Enable Cloudflare R2 storage in your Cloudflare dashboard to create buckets and upload media.{" "}
                          <a
                            href={r2AccountIdInput.value ? `https://dash.cloudflare.com/${r2AccountIdInput.value}/r2/plans` : r2Connection.value ? `https://dash.cloudflare.com/${parseAccountId(r2Connection.value.extra)}/r2/plans` : "https://dash.cloudflare.com/r2/plans"}
                            target="_blank"
                            rel="noopener noreferrer"
                            style="color:var(--accent);font-weight:600;text-decoration:none;"
                          >
                            Activate in Cloudflare Dashboard ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>

                {/* ── Cloudflare API ── */}
                <div class="cred-section" style="margin-bottom: 0;">
                  <div class="section-header">
                    <span class="section-icon">
                      <img src={cloudflareLogo} alt="Cloudflare API" width={24} height={24} />
                    </span>
                    <span class="section-title">Cloudflare API</span>
                    {cfConnection.value
                      ? <span class="section-badge">Connected</span>
                      : <span class="section-badge warn">Not configured</span>
                    }
                  </div>

                  {cfConnection.value ? (
                    <>
                      <div class="meta-row">
                        <LuUser style={iconStyle} />
                        <span class="meta-label">Account ID</span>
                        <span class="meta-value" title={cfConnection.value.extra}>{cfConnection.value.extra}</span>
                      </div>
                      <div class="meta-row">
                        <LuKey style={iconStyle} />
                        <span class="meta-label">API Token</span>
                        <span class="meta-value" title="Protected API Token">••••••••••••••••••••••••••••••••</span>
                      </div>
                    </>
                  ) : (
                    <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem;">
                      Required to deploy your frontend and manage custom domains automatically.
                    </p>
                  )}

                  <div style="flex: 1; min-height: 1rem;" />

                  <details class="update-details">
                    <summary><LuPencil style={iconStyle} /> {cfConnection.value ? "Update Credentials" : "Add CF Credentials"}</summary>
                    <div class="update-form-body">
                      <div class="field">
                        <label>Account ID</label>
                        <input type="text" value={cfAccountIdInput.value} onInput$={(e) => cfAccountIdInput.value = (e.target as HTMLInputElement).value} placeholder="cf_account_id..." required />
                      </div>
                      <div class="field">
                        <label>API Token (Edit/Deploy access)</label>
                        <input type="password" value={cfApiTokenInput.value} onInput$={(e) => cfApiTokenInput.value = (e.target as HTMLInputElement).value} placeholder="CF API Token..." required />
                      </div>
                      {cfError.value && <div class="msg-error">{cfError.value}</div>}
                      {cfSuccess.value && <div class="msg-success">✓ Cloudflare API credentials saved</div>}
                      <button onClick$={handleCFUpdate} class="btn-save" disabled={cfLoading.value} style="display:flex; align-items:center; justify-content:center; gap:8px;">
                        {cfLoading.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
                        <span>{cfLoading.value ? (cfStepMsg.value || "Testing & saving…") : "Test & Save"}</span>
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
        )}
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: "Credentials | Settings",
};
