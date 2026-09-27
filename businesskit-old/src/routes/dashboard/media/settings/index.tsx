// src/routes/dashboard/media/settings/index.tsx
//
// Cloudflare R2 Storage settings route.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuCloud,
  LuCheckCircle2,
  LuAlertCircle,
  LuLoader,
} from "@qwikest/icons/lucide";
import { MediaTabs } from "~/components/media/MediaTabs";

interface R2Config {
  account_id?: string | null;
  access_key_id?: string | null;
  secret_access_key?: string | null;
  bucket_name?: string | null;
  public_url?: string | null;
  is_configured: boolean;
}

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const r2ConfigSessionCache: { current: R2Config | null } = { current: null };

export default component$(() => {
  const loading = useSignal(true);
  const saving = useSignal(false);
  const isConfigured = useSignal(false);
  const statusMsg = useSignal<string | null>(null);
  const errorMsg = useSignal<string | null>(null);

  const accountId = useSignal("");
  const accessKeyId = useSignal("");
  const secretAccessKey = useSignal("");
  const bucketName = useSignal("");
  const publicUrl = useSignal("");

  const applyConfig = $((cfg: R2Config) => {
    isConfigured.value = cfg.is_configured;
    accountId.value = cfg.account_id || "";
    accessKeyId.value = cfg.access_key_id || "";
    secretAccessKey.value = cfg.secret_access_key || "";
    bucketName.value = cfg.bucket_name || "";
    publicUrl.value = cfg.public_url || "";
  });

  const loadConfig = $(async () => {
    if (r2ConfigSessionCache.current !== null) {
      applyConfig(r2ConfigSessionCache.current);
      loading.value = false;
    } else {
      loading.value = true;
    }
    try {
      const cfg = await invoke<R2Config>("media_get_r2_config");
      applyConfig(cfg);
      r2ConfigSessionCache.current = cfg;
    } catch (e) {
      console.error("[R2Settings] load error:", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    loadConfig();
  });

  const handleSave = $(async () => {
    if (!accessKeyId.value.trim() || !secretAccessKey.value.trim()) {
      errorMsg.value = "Access Key ID and Secret Access Key are required.";
      return;
    }

    saving.value = true;
    errorMsg.value = null;
    statusMsg.value = null;

    try {
      const extraJson = JSON.stringify({
        account_id: accountId.value.trim() || null,
        bucket_name: bucketName.value.trim() || null,
        public_url: publicUrl.value.trim() || null,
      });

      // Save connection record in connections table
      await invoke("create_connection", {
        data: {
          name: "Cloudflare R2 Storage",
          service: "cloudflare_r2",
          client_id: accessKeyId.value.trim(),
          client_secret: secretAccessKey.value.trim(),
          url: publicUrl.value.trim() || null,
          extra: extraJson,
        },
      });

      statusMsg.value = "Cloudflare R2 connection credentials saved successfully!";
      isConfigured.value = true;
      r2ConfigSessionCache.current = {
        account_id: accountId.value.trim() || null,
        access_key_id: accessKeyId.value.trim(),
        secret_access_key: secretAccessKey.value.trim(),
        bucket_name: bucketName.value.trim() || null,
        public_url: publicUrl.value.trim() || null,
        is_configured: true,
      };
    } catch (e) {
      errorMsg.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <div style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
          Cloudflare R2 Storage Settings
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
          Connect your Cloudflare R2 bucket to store images, videos, and media files directly in your own Cloudflare account.
        </p>
      </div>

      {/* Navigation Tabs Bar */}
      <div style={{ marginBottom: "1.5rem" }}>
        <MediaTabs />
      </div>

      {/* Main Card Form */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.5rem" }}>
        {/* Status Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <LuCloud style="width:1.25rem;height:1.25rem;color:var(--accent);" />
            <span style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
              Cloudflare R2 Status
            </span>
          </div>

          {isConfigured.value ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", background: "rgba(16,185,129,0.1)", color: "#10b981", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600" }}>
              <LuCheckCircle2 style="width:0.875rem;height:0.875rem;" /> Active
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600" }}>
              <LuAlertCircle style="width:0.875rem;height:0.875rem;" /> Not Configured
            </span>
          )}
        </div>

        {statusMsg.value && (
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.375rem", color: "#10b981", fontSize: "0.8125rem" }}>
            {statusMsg.value}
          </div>
        )}

        {errorMsg.value && (
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
            {errorMsg.value}
          </div>
        )}

        {loading.value ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuLoader style="width:1.25rem;height:1.25rem;animation:spin 1s linear infinite;" /> Loading credentials...
          </div>
        ) : (
          <form style={{ display: "flex", flexDirection: "column", gap: "1rem" }} onSubmit$={(e) => { e.preventDefault(); handleSave(); }}>
            {/* Account ID */}
            <div>
              <label style={labelStyle}>Cloudflare Account ID</label>
              <input
                type="text"
                placeholder="e.g. 5a1b2c3d4e5f6g7h8i9j"
                value={accountId.value}
                onInput$={(e) => {
                  const val = (e.target as HTMLInputElement).value.trim();
                  accountId.value = val;
                  if (val && !bucketName.value) {
                    bucketName.value = "businesskit-media";
                  }
                  if (val && !publicUrl.value) {
                    publicUrl.value = `https://pub-${val.slice(0, 10)}.r2.dev`;
                  }
                }}
                style={inputStyle}
              />
            </div>

            {/* R2 Access Key ID */}
            <div>
              <label style={labelStyle}>R2 Access Key ID *</label>
              <input
                type="text"
                placeholder="e.g. 9842104921049210"
                value={accessKeyId.value}
                onInput$={(e) => { accessKeyId.value = (e.target as HTMLInputElement).value; }}
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
            </div>

            {/* R2 Secret Access Key */}
            <div>
              <label style={labelStyle}>R2 Secret Access Key *</label>
              <input
                type="password"
                placeholder="••••••••••••••••••••••••••••••••"
                value={secretAccessKey.value}
                onInput$={(e) => { secretAccessKey.value = (e.target as HTMLInputElement).value; }}
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
            </div>

            {/* Bucket Name */}
            <div>
              <label style={labelStyle}>R2 Bucket Name</label>
              <input
                type="text"
                placeholder="e.g. my-brand-uploads"
                value={bucketName.value}
                onInput$={(e) => { bucketName.value = (e.target as HTMLInputElement).value; }}
                style={inputStyle}
              />
            </div>

            {/* Public Custom Domain */}
            <div>
              <label style={labelStyle}>Public Custom Domain / R2 Public URL</label>
              <input
                type="text"
                placeholder="e.g. https://media.mybrand.com or https://pub-xxx.r2.dev"
                value={publicUrl.value}
                onInput$={(e) => { publicUrl.value = (e.target as HTMLInputElement).value; }}
                style={inputStyle}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
                Public URL prefix used to serve uploaded images & AVIF files globally via Cloudflare CDN.
              </span>
            </div>

            {/* Submit Button */}
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={saving.value}
                style={{
                  height: "2.5rem",
                  padding: "0 1.25rem",
                  background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
                  color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  cursor: saving.value ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving...</> : "Save Credentials"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Cloudflare R2 Storage Settings — BusinessKit",
};
