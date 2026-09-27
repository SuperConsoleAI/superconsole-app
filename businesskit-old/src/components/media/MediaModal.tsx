// src/components/media/MediaModal.tsx
//
// Dedicated Upload & Media Creation Modal for Cloudflare R2 & Webflow Assets.
// Supports storage provider selection (Cloudflare R2 vs Webflow Assets),
// format conversion selection (.AVIF default, .WebP option, or Original untouched),
// multi-step UI status animation, and Webflow asset ID deletion.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  LuUpload,
  LuZap,
  LuCloud,
  LuAlertCircle,
  LuLoader,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { type MediaItem } from "./MediaPickerModal";

import { svg as cloudflareSvg } from "thesvg/cloudflare";
import { svg as webflowSvg } from "thesvg/webflow";

const wrapIcon = (svg: string) => svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block;" ');

export interface MediaModalProps {
  open: Signal<boolean>;
  zIndex?: number;
  onUploaded$: PropFunction<(media: MediaItem) => void>;
}

interface R2Config {
  is_configured: boolean;
}

interface WebflowConfig {
  is_configured: boolean;
  site_id?: string;
}

export const MediaModal = component$<MediaModalProps>(({ open, zIndex, onUploaded$ }) => {
  const uploading = useSignal(false);
  const r2Connected = useSignal(false);
  const webflowConnected = useSignal(false);

  // Storage provider signal: 'r2' (default) | 'webflow'
  const storageProvider = useSignal<"r2" | "webflow">("r2");

  const conversionInfo = useSignal<string | null>(null);
  const error = useSignal<string | null>(null);
  const stepMsg = useSignal("Uploading...");

  // Format selection signal: 'avif' (default) | 'webp' | 'original'
  const convertFormat = useSignal<"avif" | "webp" | "original">("avif");

  // Form Signals
  const uploadUrl = useSignal("");
  const uploadFileName = useSignal("");
  const uploadAltText = useSignal("");

  const checkStatus = $(async () => {
    try {
      const r2Cfg = await invoke<R2Config>("media_get_r2_config");
      r2Connected.value = r2Cfg.is_configured;
    } catch (e) {
      console.error("[MediaModal] check R2 failed:", e);
    }
    try {
      const wfCfg = await invoke<WebflowConfig>("media_get_webflow_config");
      webflowConnected.value = wfCfg.is_configured;
      if (!r2Connected.value && wfCfg.is_configured) {
        storageProvider.value = "webflow";
      }
    } catch (e) {
      console.error("[MediaModal] check Webflow failed:", e);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => open.value);
    if (isOpen) {
      error.value = null;
      conversionInfo.value = null;
      stepMsg.value = "Uploading...";
      uploadUrl.value = "";
      uploadFileName.value = "";
      uploadAltText.value = "";
      checkStatus();
    }
  });

  const handlePickFile = $(async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (storageProvider.value === "r2" && !r2Connected.value) {
      error.value = "Cloudflare R2 is not connected. Please configure R2 in Settings → Connections first.";
      return;
    }
    if (storageProvider.value === "webflow" && !webflowConnected.value) {
      error.value = "Webflow is not connected. Please configure Webflow token & Site ID in Settings → Connections first.";
      return;
    }

    uploading.value = true;
    error.value = null;
    conversionInfo.value = null;

    stepMsg.value = convertFormat.value === "original"
      ? "Processing file..."
      : `Processing image (converting to .${convertFormat.value.toUpperCase()})...`;

    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || "");
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      await new Promise((r) => setTimeout(r, 400));

      const fileType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "document";

      stepMsg.value = storageProvider.value === "webflow"
        ? "Uploading to Webflow Assets API..."
        : "Uploading to Cloudflare R2...";

      const created = await invoke<MediaItem>("media_create", {
        data: {
          filename: file.name,
          url: fileDataUrl,
          file_type: fileType,
          mime_type: file.type,
          size_bytes: file.size,
          target_format: convertFormat.value,
          storage_provider: storageProvider.value,
        },
      });

      stepMsg.value = "Saving...";
      await new Promise((r) => setTimeout(r, 300));

      stepMsg.value = "Done!";
      uploading.value = false;
      open.value = false;
      await onUploaded$(created);
    } catch (err) {
      error.value = String(err);
      uploading.value = false;
      conversionInfo.value = null;
    }
  });

  const handleSaveUrl = $(async () => {
    if (!uploadUrl.value.trim()) {
      error.value = "Enter a valid public media URL.";
      return;
    }
    uploading.value = true;
    error.value = null;
    stepMsg.value = "Saving...";
    try {
      const filename = uploadFileName.value.trim() || uploadUrl.value.split("/").pop() || "media-file";
      const created = await invoke<MediaItem>("media_create", {
        data: {
          filename,
          url: uploadUrl.value.trim(),
          file_type: "image",
          alt_text: uploadAltText.value.trim() || null,
          storage_provider: "external",
        },
      });

      uploading.value = false;
      open.value = false;
      await onUploaded$(created);
    } catch (err) {
      error.value = String(err);
      uploading.value = false;
    }
  });

  const isCurrentProviderConnected = storageProvider.value === "r2" ? r2Connected.value : webflowConnected.value;

  return (
    <SlideOver open={open} title="Upload Media" subtitle="Upload to R2 / Webflow Assets or add public URLs." width="520px" zIndex={zIndex}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error.value && (
          <div style={{ padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <LuAlertCircle style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
            <span>{error.value}</span>
          </div>
        )}

        {/* Storage Provider Selector */}
        <div style={{ padding: "0.5rem", background: "var(--surface2)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Destination Storage Provider
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <button
              type="button"
              onClick$={() => { storageProvider.value = "r2"; }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.55rem 0.75rem",
                borderRadius: "0.375rem",
                border: storageProvider.value === "r2" ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: storageProvider.value === "r2" ? "rgba(99,102,241,0.12)" : "var(--surface1)",
                color: storageProvider.value === "r2" ? "var(--accent)" : "var(--text-primary)",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              <span style={{ width: "1.125rem", height: "1.125rem", display: "inline-block", flexShrink: 0 }} dangerouslySetInnerHTML={wrapIcon(cloudflareSvg)} />
              <span>Cloudflare R2</span>
              {r2Connected.value && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />}
            </button>

            <button
              type="button"
              onClick$={() => { storageProvider.value = "webflow"; }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.55rem 0.75rem",
                borderRadius: "0.375rem",
                border: storageProvider.value === "webflow" ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: storageProvider.value === "webflow" ? "rgba(99,102,241,0.12)" : "var(--surface1)",
                color: storageProvider.value === "webflow" ? "var(--accent)" : "var(--text-primary)",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              <span style={{ width: "1.125rem", height: "1.125rem", display: "inline-block", flexShrink: 0 }} dangerouslySetInnerHTML={wrapIcon(webflowSvg)} />
              <span>Webflow Assets</span>
              {webflowConnected.value && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />}
            </button>
          </div>
        </div>

        {!isCurrentProviderConnected ? (
          <div style={{ padding: "1.25rem", borderRadius: "0.5rem", background: "var(--surface2)", border: "1px solid var(--border)", textAlign: "center" }}>
            <LuCloud style={{ width: "2rem", height: "2rem", color: "var(--text-secondary)", margin: "0 auto 0.5rem" }} />
            <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              {storageProvider.value === "webflow" ? "Webflow Connection Not Configured" : "Cloudflare R2 Storage Not Connected"}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              {storageProvider.value === "webflow"
                ? "Connect your Webflow API Token & Site ID in Settings → Connections to upload directly to Webflow Assets."
                : "Connect your Cloudflare R2 API keys in Settings → Credentials to upload images and files."}
            </div>
            <Link
              href={storageProvider.value === "webflow" ? "/dashboard/settings/connections/" : "/dashboard/settings/credentials/"}
              onClick$={() => { open.value = false; }}
              style={{ display: "inline-block", padding: "0.55rem 1.15rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", textDecoration: "none" }}
            >
              {storageProvider.value === "webflow" ? "Configure Webflow in Settings → Connections" : "Configure R2 in Settings → Credentials"}
            </Link>
          </div>
        ) : (
          /* Upload Dropzone */
          <div style={{ border: "2px dashed var(--border)", borderRadius: "0.5rem", padding: "1.5rem 1rem", textAlign: "center", background: "var(--surface2)" }}>
            <LuZap style={{ width: "2.25rem", height: "2.25rem", color: "var(--accent)", margin: "0 auto 0.5rem" }} />
            <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              Upload to {storageProvider.value === "webflow" ? "Webflow Assets API" : "Cloudflare R2 Bucket"}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Select image conversion format below, then browse local file:
            </div>

            {/* Format Selection Option Controls */}
            <div style={{ margin: "0 auto 1.25rem", maxWidth: "420px", textAlign: "left", padding: "0.75rem 1rem", background: "var(--surface1, rgba(0,0,0,0.15))", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Image Format Options
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                  <input
                    type="radio"
                    name="target_format"
                    value="avif"
                    checked={convertFormat.value === "avif"}
                    onChange$={() => { convertFormat.value = "avif"; }}
                    style={{ accentColor: "#3b82f6", width: "1rem", height: "1rem" }}
                  />
                  <span style={{ fontWeight: convertFormat.value === "avif" ? "600" : "400" }}>
                    Auto-convert to .AVIF (Default — Max Compression)
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                  <input
                    type="radio"
                    name="target_format"
                    value="webp"
                    checked={convertFormat.value === "webp"}
                    onChange$={() => { convertFormat.value = "webp"; }}
                    style={{ accentColor: "#3b82f6", width: "1rem", height: "1rem" }}
                  />
                  <span style={{ fontWeight: convertFormat.value === "webp" ? "600" : "400" }}>
                    Convert to .WebP Format
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--text-primary)" }}>
                  <input
                    type="radio"
                    name="target_format"
                    value="original"
                    checked={convertFormat.value === "original"}
                    onChange$={() => { convertFormat.value = "original"; }}
                    style={{ accentColor: "#3b82f6", width: "1rem", height: "1rem" }}
                  />
                  <span style={{ fontWeight: convertFormat.value === "original" ? "600" : "400" }}>
                    Keep Original Format (No Conversion — Upload PNG/JPG as-is)
                  </span>
                </label>
              </div>
            </div>

            {uploading.value && (
              <div style={{ marginBottom: "1rem", padding: "0.5rem", background: "rgba(99,102,241,0.1)", borderRadius: "0.375rem", fontSize: "0.8125rem", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontWeight: "500" }}>
                <LuLoader class="animate-spin" style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>{stepMsg.value}</span>
              </div>
            )}

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: "600", cursor: uploading.value ? "not-allowed" : "pointer", opacity: uploading.value ? 0.75 : 1 }}>
              {uploading.value && <LuLoader class="animate-spin" style={{ width: "1rem", height: "1rem" }} />}
              <span>{uploading.value ? stepMsg.value : `Upload to ${storageProvider.value === "webflow" ? "Webflow Assets" : "Cloudflare R2"}`}</span>
              <input type="file" onChange$={handlePickFile} disabled={uploading.value} style={{ display: "none" }} />
            </label>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500", margin: "0.5rem 0" }}>
          ── OR ADD PUBLIC URL ──
        </div>

        {/* Direct URL Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Image / File Public URL
            </label>
            <input
              type="text"
              placeholder="https://cdn.prod.website-files.com/.../photo.jpg"
              value={uploadUrl.value}
              onInput$={(e) => { uploadUrl.value = (e.target as HTMLInputElement).value; }}
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.875rem" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Filename / Title (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Hero Banner 2026"
              value={uploadFileName.value}
              onInput$={(e) => { uploadFileName.value = (e.target as HTMLInputElement).value; }}
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.875rem" }}
            />
          </div>

          <button
            type="button"
            disabled={uploading.value}
            onClick$={handleSaveUrl}
            style={{
              width: "100%",
              height: "2.5rem",
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: uploading.value ? "not-allowed" : "pointer",
              marginTop: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              opacity: uploading.value ? 0.75 : 1,
            }}
          >
            {uploading.value ? (
              <>
                <LuLoader class="animate-spin" style={{ width: "1rem", height: "1rem" }} />
                <span>{stepMsg.value}</span>
              </>
            ) : (
              <>
                <LuUpload style={{ width: "1rem", height: "1rem" }} />
                <span>Save Media URL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});
