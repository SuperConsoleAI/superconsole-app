/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, $, useTask$, type Signal, type PropFunction } from "@builder.io/qwik";
import { type DocumentHead, routeAction$, routeLoader$, zod$, z, useLocation, useNavigate } from "@builder.io/qwik-city";
import { getCommunity, updateCommunity, publishCommunity, deleteCommunity } from "~/lib/ipc";
import { CommunityCtx } from "~/lib/community-context";
import { useContext } from "@builder.io/qwik";

import { SlideOver } from "~/components/SlideOver";

// ── Types ─────────────────────────────────────────────────────────────────────
type MediaItem = { type: "image" | "video"; url: string };
type PricingModel = "free" | "subscription" | "freemium" | "tiers" | "one_time";
type TierKey = "standard" | "premium" | "vip";

interface TierConfig {
  enabled: boolean;
  monthlyPrice: string;
  yearlyPrice: string;
  oneTimePrice: string;
  benefits: string[];
}

// ── Static config ──────────────────────────────────────────────────────────────
const MODEL_OPTIONS: { key: PricingModel; label: string; desc: string }[] = [
  { key: "free", label: "Free", desc: "Free to join" },
  { key: "subscription", label: "Subscription", desc: "Charge monthly, annual, or both" },
  { key: "freemium", label: "Freemium", desc: "Free to join with 1-2 paid upgrade tiers" },
  { key: "tiers", label: "Tiers", desc: "2-3 paid tiers" },
  { key: "one_time", label: "1-time", desc: "1-time payment" },
];
const TIER_LABELS: Record<TierKey, string> = { standard: "Standard", premium: "Premium", vip: "VIP" };

// Which tiers are shown per model
const MODEL_TIERS: Record<PricingModel, TierKey[]> = {
  free: [],
  subscription: ["standard"],
  freemium: ["standard", "premium", "vip"],
  tiers: ["standard", "premium", "vip"],
  one_time: ["standard"],
};

// Whether benefits are shown per model
const MODEL_SHOW_BENEFITS: Record<PricingModel, boolean> = {
  free: false, subscription: false, freemium: true, tiers: true, one_time: false,
};

// Whether free trial toggle is shown per model
const MODEL_SHOW_TRIAL: Record<PricingModel, boolean> = {
  free: false, subscription: true, freemium: false, tiers: true, one_time: false,
};

// Whether "Previous free members" row is shown per model
const MODEL_SHOW_PREV_MEMBERS: Record<PricingModel, boolean> = {
  free: false, subscription: false, freemium: false, tiers: true, one_time: false,
};

const STYLES = `
  /* ── Root containment ── */
  .settings-main {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  @media (max-width: 768px) {
    .settings-main {    }
  }
  @media (max-width: 480px) {
    .settings-main {    }
  }

  .comm-tabs { display: none; }

  .settings-section {
    margin-bottom: 1.5rem;
    display: flex; flex-direction: column; gap: 1rem;
    min-width: 0;
  }

  .section-title  { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .section-desc   { font-size: 0.82rem; color: var(--text-secondary); margin-top: -0.5rem; }
  .form-row       { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
  .form-row-2     { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
  @media (max-width: 540px) { .form-row-2 { grid-template-columns: 1fr; } }

  label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
  .form-input {
     border-radius: 0.55rem;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text-primary); font-size: 0.88rem;
    width: 100%; box-sizing: border-box; min-width: 0; padding: 0.5rem 0.75rem;
  }
  .form-input:focus { outline: none; border-color: var(--accent); }
  .form-textarea  { min-height: 90px; resize: vertical; }
  .form-hint      { font-size: 0.72rem; color: var(--text-secondary); }

  .btn {
     border-radius: 0.55rem; font-size: 0.83rem; font-weight: 600; padding: 0.5rem 0.75rem;
    border: none; cursor: pointer; display: inline-flex; align-items: center;
    gap: 0.35rem; transition: opacity 0.15s; text-decoration: none; flex-shrink: 0;
  }
  .btn:hover      { opacity: 0.85; }
  .btn-primary    { background: var(--button-primary-background, var(--accent)); color: var(--button-primary-text, #fff); }
  .btn-ghost      { background: var(--surface); color: var(--text-primary); border: 1px solid var(--border); }
  .btn-danger     { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .btn-sm         {  font-size: 0.78rem; }
  .btn-row        { display: flex; gap: 0.65rem; justify-content: flex-end; padding-top: 0.25rem; flex-wrap: wrap; }

  .success-banner { background: #d1fae5; color: #065f46; border-radius: 0.6rem;  font-size: 0.82rem; border: 1px solid #6ee7b7; }
  .error-banner   { background: #fee2e2; color: #991b1b; border-radius: 0.6rem;  font-size: 0.82rem; border: 1px solid #fca5a5; }
  .danger-zone    { border: 1px solid #fca5a5; border-radius: 0.85rem;  background: #fff5f5; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem; }
  .danger-title   { font-size: 0.95rem; font-weight: 700; color: #991b1b; }
  .danger-desc    { font-size: 0.82rem; color: #b91c1c; }
  hr { border: none; border-top: 1px solid var(--border); margin: 0; }

  .media-list { display: flex; flex-direction: column; gap: 0.6rem; }
  .media-row  { display: grid; grid-template-columns: 72px 1fr auto; gap: 0.45rem; align-items: center; min-width: 0; }
  @media (max-width: 480px) { .media-row { grid-template-columns: 1fr auto; } }

  /* ── Pricing ──────────────────────────────────────────────────────── */
  .model-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }

  /* 5-tab strip — CSS grid so it wraps cleanly on mobile */
  .model-tabs {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    overflow: hidden;
    width: 100%;
  }
  @media (max-width: 560px) { .model-tabs { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 360px) { .model-tabs { grid-template-columns: repeat(2, 1fr); } }

  .model-tab {
    cursor: pointer;
    background: var(--surface);
    padding: 0.5rem;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 0.2rem;
    transition: background 0.12s; min-width: 0;
  }
  /* last in each row: no right border; last row: no bottom border */
  .model-tab:last-child,
  .model-tab:nth-child(5n) { border-right: none; }
  @media (max-width: 560px) {
    .model-tab:nth-child(5n)  { border-right: 1px solid var(--border); }
    .model-tab:nth-child(3n)  { border-right: none; }
    .model-tab:nth-child(n+4) { border-bottom: none; }
  }
  @media (max-width: 360px) {
    .model-tab:nth-child(3n)  { border-right: 1px solid var(--border); }
    .model-tab:nth-child(2n)  { border-right: none; }
    .model-tab:nth-child(n+5) { border-bottom: none; }
  }
  /* remove all bottom borders on last row (5 cols: items 5) */
  .model-tab:nth-child(n+5) { border-bottom: none; }

  .model-tab.active { background: var(--surface-2); }
  .model-tab-title {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.82rem; font-weight: 600; color: var(--text-primary);
    white-space: nowrap; overflow: hidden; min-width: 0;
  }
  .model-radio { width: 0.85rem; height: 0.85rem; accent-color: #2563eb; flex-shrink: 0; cursor: pointer; }
  .model-tab-desc {
    font-size: 0.66rem; color: var(--text-secondary); line-height: 1.3;
    padding-left: 1.2rem; overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }

  /* Tier grid */
  .tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.85rem; }
  @media (max-width: 640px) { .tier-grid { grid-template-columns: 1fr; } }

  /* Tier card */
  .tier-card {
    border: 1px solid var(--border); border-radius: 0.75rem;
    background: var(--surface); display: flex; flex-direction: column; gap: 0;
    overflow: hidden; min-width: 0; padding: 0.5rem;
  }
  .tier-card-head {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 0.95rem; font-weight: 700; color: var(--text-primary);
     gap: 0.5rem;
  }
  .tier-card-body {
    display: flex; flex-direction: column; gap: 0.8rem;
     transition: opacity 0.18s; min-width: 0;
  }
  .tier-card-body.dimmed { opacity: 0.35; pointer-events: none; }

  /* Pill toggle */
  .pill-wrap { position: relative; display: inline-block; width: 2.2rem; height: 1.2rem; cursor: pointer; flex-shrink: 0; }
  .pill-wrap input { opacity: 0; width: 0; height: 0; position: absolute; }
  .pill-track {
    position: absolute; inset: 0; border-radius: 9999px;
    background: var(--border); transition: background 0.18s;
  }
  .pill-wrap input:checked + .pill-track { background: #6b7280; }
  .pill-track::before {
    content: ""; position: absolute;
    width: 0.85rem; height: 0.85rem; border-radius: 50%; background: #fff;
    left: 0.175rem; top: 50%; transform: translateY(-50%);
    transition: left 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,.25);
  }
  .pill-wrap input:checked + .pill-track::before { left: calc(100% - 1.025rem); }

  /* Price input */
  .price-field-label { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.2rem; }
  .price-input-wrap {
    display: flex; align-items: center; padding: 0.5rem 0.75rem;
    border: 1px solid var(--border); border-radius: 0.45rem;
    background: var(--surface-2); overflow: hidden; min-width: 0;
    box-sizing: border-box;
  }
  .price-input-wrap:focus-within { border-color: var(--accent); }
  .price-sym    {  font-size: 0.85rem; color: var(--text-secondary); user-select: none; flex-shrink: 0; }
  .price-num {
    flex: 1; border: none; outline: none; background: transparent;
    color: var(--text-primary); font-size: 0.88rem; 
    min-width: 0; width: 0;
    -moz-appearance: textfield; appearance: textfield;
  }
  .price-num::-webkit-inner-spin-button,
  .price-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .price-suffix {  font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; user-select: none; flex-shrink: 0; }

  /* Benefits */
  .benefit-section { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
  .benefit-row {
    display: flex; align-items: center; gap: 0.35rem;
    border: 1px solid var(--border); border-radius: 0.45rem;
    background: var(--surface-2);  min-width: 0;
  }
  .benefit-grip  { color: var(--text-secondary); opacity: 0.45; flex-shrink: 0; display: flex; align-items: center; }
  .benefit-input {
    flex: 1; border: none; outline: none; background: transparent;
    font-size: 0.82rem; color: var(--text-primary); min-width: 0; width: 0;
  }
  .benefit-del {
    background: none; border: none; cursor: pointer; 
    color: var(--text-secondary); display: flex; align-items: center; flex-shrink: 0;
    transition: color 0.12s;
  }
  .benefit-del:hover { color: #ef4444; }
  .benefit-add {
    display: flex; align-items: center; gap: 0.3rem;
    font-size: 0.79rem; color: #3b82f6; font-weight: 500;
    background: none; border: none; cursor: pointer; 
  }
  .benefit-add:hover { color: #2563eb; }

  /* Bottom extras */
  .pricing-extras { display: flex; flex-direction: column; gap: 0.7rem; }
  .free-members-row {
    display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
    font-size: 0.84rem; color: var(--text-primary);
  }
  .free-members-row select {
    font-size: 0.84rem; font-weight: 700; color: var(--text-primary);
    background: none; border: none; border-bottom: 1px solid var(--border);
    cursor: pointer; outline: none;  max-width: 100%;
  }
  .trial-row { display: flex; align-items: center; gap: 0.65rem; font-size: 0.84rem; color: var(--text-primary); flex-wrap: wrap; }
`;

// ── Loader ─────────────────────────────────────────────────────────────────────
export const CommunitySettings = component$<{ open: Signal<boolean>; communityId: string; initialCommunity?: any; onClose$?: PropFunction<() => void> }>(({ open, communityId, initialCommunity, onClose$ }) => {
  useStylesScoped$(STYLES);
  const commCtx = useContext(CommunityCtx, null as any);
  
  const communitySig = useSignal<any>(initialCommunity || null);
  const loading = useSignal(initialCommunity ? false : !!communityId);
  
  useTask$(({ track }) => {
    track(() => communityId);
    track(() => initialCommunity);
    if (!communityId) return;
    
    if (initialCommunity) {
      communitySig.value = initialCommunity;
      if (commCtx) commCtx.communityTitle.value = initialCommunity.name;
      loading.value = false;
    } else if (communityId) {
      loading.value = true;
    }
  });

  useTask$(async ({ track }) => {
    track(() => communityId);
    track(() => initialCommunity);
    if (!communityId || initialCommunity) return;
    
    try {
      const c = await getCommunity(communityId);
      communitySig.value = c;
      if (c && commCtx) commCtx.communityTitle.value = c.name;
    } catch (e) {
      console.error("Failed to load community:", e);
    } finally {
      loading.value = false;
    }
  });

  const updateSettingsIsRunning = useSignal(false);
  const updateSettingsValue = useSignal<any>(null);
  const submitUpdateSettings = $(async (data: any) => {
    updateSettingsIsRunning.value = true;
    try {
      await updateCommunity(communityId, {
        name: data.title,
        slug: data.slug,
        description: data.description,
        icon: data.icon,
        cover_image: data.cover_image,
        is_private: data.accessType === "invite_only",
        requires_approval: data.requiresApproval === "1",
      });
      updateSettingsValue.value = { success: true };
      communitySig.value = await getCommunity(communityId);
    } catch(e: any) {
      updateSettingsValue.value = { failed: true, message: e.message };
    } finally {
      updateSettingsIsRunning.value = false;
    }
  });

  const publishIsRunning = useSignal(false);
  const publishValue = useSignal<any>(null);
  const submitPublish = $(async () => {
    publishIsRunning.value = true;
    try {
      await publishCommunity(communityId);
      publishValue.value = { success: true };
      communitySig.value = await getCommunity(communityId);
    } catch(e: any) {
      publishValue.value = { failed: true, message: e.message };
    } finally {
      publishIsRunning.value = false;
    }
  });

  const deleteIsRunning = useSignal(false);
  const deleteValue = useSignal<any>(null);
  const submitDelete = $(async () => {
    deleteIsRunning.value = true;
    try {
      await deleteCommunity(communityId);
      deleteValue.value = { success: true };
      nav("/dashboard/community");
    } catch(e: any) {
      deleteValue.value = { failed: true, message: e.message };
    } finally {
      deleteIsRunning.value = false;
    }
  });


  const data = { value: { community: communitySig.value } };

  const update = { isRunning: updateSettingsIsRunning, value: updateSettingsValue, submit: submitUpdateSettings };
  const publish = { isRunning: publishIsRunning, value: publishValue, submit: submitPublish, actionPath: "" };
  const del = { isRunning: deleteIsRunning, value: deleteValue, submit: submitDelete, actionPath: "" };
  const c = data.value.community as any;
  const cid = c?.id ?? "";

  const topMembers = ([] || []).slice(0, 8).map((m: any) => ({
    id: m.id, firstName: m.firstName,
    profilePictureUrl: m.profilePictureUrl || m.avatarUrl,
  }));
  const onlineCount = 0 ?? 0;
  let quickLinks: any[] = [];
  try { quickLinks = JSON.parse(c?.links || "[]"); } catch { /* */ }

  // ── Media ──────────────────────────────────────────────────────────────────
  const mediaItems = useSignal<MediaItem[]>([]);
  const mediaJson = useSignal("[]");
  const newMediaUrl = useSignal("");
  const newMediaType = useSignal<"image" | "video">("image");

  // ── Links ──────────────────────────────────────────────────────────────────
  const linkItems = useSignal<{ label: string; href: string }[]>([]);
  const linksJson = useSignal("[]");
  const newLinkLabel = useSignal("");
  const newLinkHref = useSignal("");

  // ── Pricing ────────────────────────────────────────────────────────────────
  const pricingModel = useSignal<PricingModel>("free");
  const tiers = useSignal<Record<TierKey, TierConfig>>({
    standard: { enabled: true, monthlyPrice: "0", yearlyPrice: "0", oneTimePrice: "0", benefits: [] },
    premium: { enabled: true, monthlyPrice: "0", yearlyPrice: "0", oneTimePrice: "0", benefits: [] },
    vip: { enabled: false, monthlyPrice: "0", yearlyPrice: "0", oneTimePrice: "0", benefits: [] },
  });
  const freeMemberTier = useSignal("standard");
  const trialEnabled = useSignal(false);
  const plansJson = useSignal("[]");

  // ── Sync → hidden field ────────────────────────────────────────────────────
  const syncPlans = $(() => {
    const model = pricingModel.value;
    const t = tiers.value;
    const plans: any[] = [];

    for (const k of MODEL_TIERS[model]) {
      if (!t[k].enabled) continue;
      const base = { tier: model === "subscription" ? "subscription" : model === "one_time" ? "one_time" : k };
      if (model === "one_time") {
        plans.push({ ...base, one_time_price_cents: Math.round(Number(t[k].oneTimePrice) * 100) });
      } else {
        plans.push({
          ...base,
          monthly_price_cents: Math.round(Number(t[k].monthlyPrice) * 100),
          yearly_price_cents: Math.round(Number(t[k].yearlyPrice) * 100),
          benefits: t[k].benefits,
        });
      }
    }
    plansJson.value = JSON.stringify(plans);
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  useTask$(({ track }) => {
    const cVal = track(() => communitySig.value);
    if (!cVal) return;

    try { mediaItems.value = JSON.parse(cVal.mediaItems || "[]"); mediaJson.value = cVal.mediaItems || "[]"; } catch { /* */ }
    try { linkItems.value = JSON.parse(cVal.links || "[]"); linksJson.value = cVal.links || "[]"; } catch { /* */ }

    try {
      const plans: any[] = JSON.parse(cVal.pricingPlans || "[]");
      if (plans.length === 0) {
        pricingModel.value = cVal.accessType === "paid" ? "subscription" : "free";
      } else {
        const first = plans[0]?.tier as string;
        if (first === "subscription") pricingModel.value = "subscription";
        else if (first === "one_time") pricingModel.value = "one_time";
        else if (plans.some((p: any) => p.tier === "vip")) pricingModel.value = "tiers";
        else if (plans.length >= 2) pricingModel.value = "freemium";
        else pricingModel.value = "tiers";

        const updated = { ...tiers.value };
        for (const p of plans) {
          const k: TierKey = (p.tier === "subscription" || p.tier === "one_time") ? "standard" : (p.tier as TierKey);
          if (k in updated) {
            updated[k] = {
              enabled: true,
              monthlyPrice: ((p.monthly_price_cents ?? p.price_cents ?? 0) / 100).toFixed(2),
              yearlyPrice: ((p.yearly_price_cents ?? 0) / 100).toFixed(2),
              oneTimePrice: ((p.one_time_price_cents ?? p.price_cents ?? 0) / 100).toFixed(2),
              benefits: p.benefits ?? [],
            };
          }
        }
        if (!plans.some((p: any) => p.tier === "vip")) updated.vip.enabled = false;
        tiers.value = updated;
      }
    } catch { /* */ }

    if (cVal.trialDays && cVal.trialDays > 0) trialEnabled.value = true;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addBenefit = $((key: TierKey) => {
    tiers.value = { ...tiers.value, [key]: { ...tiers.value[key], benefits: [...tiers.value[key].benefits, ""] } };
    syncPlans();
  });
  const removeBenefit = $((key: TierKey, idx: number) => {
    tiers.value = { ...tiers.value, [key]: { ...tiers.value[key], benefits: tiers.value[key].benefits.filter((_, i) => i !== idx) } };
    syncPlans();
  });

  const addMedia = $(() => {
    const url = newMediaUrl.value.trim(); if (!url) return;
    const isVideo = /youtube\.com|youtu\.be|vimeo\.com|\.mp4|\.webm|\.mov/i.test(url);
    const updated = [...mediaItems.value, { type: (isVideo ? "video" : newMediaType.value) as "image" | "video", url }];
    mediaItems.value = updated; mediaJson.value = JSON.stringify(updated); newMediaUrl.value = "";
  });
  const removeMedia = $((idx: number) => {
    const updated = mediaItems.value.filter((_, i) => i !== idx);
    mediaItems.value = updated; mediaJson.value = JSON.stringify(updated);
  });

  const addLink = $(() => {
    const label = newLinkLabel.value.trim(); const href = newLinkHref.value.trim();
    if (!label || !href || linkItems.value.length >= 3) return;
    const updated = [...linkItems.value, { label, href }];
    linkItems.value = updated; linksJson.value = JSON.stringify(updated);
    newLinkLabel.value = ""; newLinkHref.value = "";
  });
  const removeLink = $((idx: number) => {
    const updated = linkItems.value.filter((_, i) => i !== idx);
    linkItems.value = updated; linksJson.value = JSON.stringify(updated);
  });

  const model = pricingModel.value;
  const visibleTiers = (MODEL_TIERS as any)[model];
  const showBenefits = (MODEL_SHOW_BENEFITS as any)[model];
  const showTrial = (MODEL_SHOW_TRIAL as any)[model];
  const showPrevMembers = (MODEL_SHOW_PREV_MEMBERS as any)[model];
  const totalMembers = ((communitySig.value?.member_count) || 0) ?? 0;

  return (
    <SlideOver open={open} onClose$={onClose$} title="Community Settings" width="50%">
      <div class="settings-main">
        {loading.value ? (
          <div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading...</div>
        ) : !c ? (
          <div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Community not found.</div>
        ) : (
          <form preventdefault:submit onSubmit$={async (e,el) => { const fd = new FormData(el); submitUpdateSettings(Object.fromEntries(fd)); }} style="display: flex; flex-direction: column; flex: 1;">
            <div style="flex: 1; display: flex; flex-direction: column; gap: 1.5rem;">
              <input type="hidden" name="mediaItems" value={mediaJson.value} />
                <input type="hidden" name="pricingPlans" value={plansJson.value} />
                <input type="hidden" name="links" value={linksJson.value} />
                <input type="hidden" name="trialDays" value={showTrial && trialEnabled.value ? "7" : "0"} />

                {/* ─── General ────────────────────────────────────────── */}
                <div class="settings-section">
                  {updateSettingsValue.value?.success && <div class="success-banner">✓ Settings saved</div>}
                  {updateSettingsValue.value?.failed && <div class="error-banner">{updateSettingsValue.value.message}</div>}

                  <div class="form-row">
                    <label for="comm-title">Community Name *</label>
                    <input id="comm-title" name="title" class="form-input" value={c.name} required />
                  </div>
                  <div class="form-row">
                    <label for="comm-tagline">Tagline</label>
                    <input id="comm-tagline" name="tagline" class="form-input" value={c.tagline ?? ""} />
                  </div>
                  <div class="form-row">
                    <label for="comm-desc">Description</label>
                    <textarea id="comm-desc" name="description" class="form-input form-textarea">{c.description ?? ""}</textarea>
                  </div>

                  {/* Quick Links */}
                  <div class="form-row" style="margin-top:0.25rem;">
                    <label>Quick Links (Max 3)</label>
                    <div style="display:flex;flex-direction:column;gap:0.45rem;margin-top:0.25rem;">
                      {linkItems.value.map((item, idx) => (
                        <div key={idx} style="display:flex;gap:0.45rem;align-items:center;">
                          <input class="form-input" style="flex:1;" placeholder="Label" value={item.label} onInput$={(e) => {
                            const u = [...linkItems.value]; u[idx] = { ...u[idx], label: (e.target as HTMLInputElement).value };
                            linkItems.value = u; linksJson.value = JSON.stringify(u);
                          }} />
                          <input class="form-input" style="flex:2;" placeholder="URL" value={item.href} onInput$={(e) => {
                            const u = [...linkItems.value]; u[idx] = { ...u[idx], href: (e.target as HTMLInputElement).value };
                            linkItems.value = u; linksJson.value = JSON.stringify(u);
                          }} />
                          <button type="button" class="btn btn-ghost btn-sm" style="flex-shrink:0;"
                            onClick$={() => removeLink(idx)}>
                            X
                          </button>
                        </div>
                      ))}
                      {linkItems.value.length < 3 && (
                        <div style="display:flex;gap:0.45rem;align-items:center;margin-top:0.1rem;">
                          <input class="form-input" style="flex:1;" placeholder="Label" value={newLinkLabel.value}
                            onInput$={(e) => { newLinkLabel.value = (e.target as HTMLInputElement).value; }} />
                          <input class="form-input" style="flex:2;" placeholder="https://..." value={newLinkHref.value}
                            onInput$={(e) => { newLinkHref.value = (e.target as HTMLInputElement).value; }} />
                          <button type="button" class="btn btn-ghost btn-sm" style="flex-shrink:0;"
                            onClick$={addLink}>
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div class="form-row-2">
                    <div class="form-row">
                      <label for="comm-cover">Cover Image URL</label>
                      <input id="comm-cover" name="coverImageUrl" class="form-input" placeholder="https://..." value={c.cover_image ?? ""} />
                      <div class="form-hint">Banner shown at top of the community page</div>
                    </div>
                    <div class="form-row">
                      <label for="comm-logo">Logo URL</label>
                      <input id="comm-logo" name="logoUrl" class="form-input" placeholder="https://..." value={c.icon ?? ""} />
                      <div class="form-hint">Square logo shown in community header</div>
                    </div>
                  </div>

                  <hr />

                  <div class="form-row-2">
                    <div class="form-row">
                      <label for="comm-access">Access Type</label>
                      <select id="comm-access" name="accessType" class="form-input">
                        <option value="free" selected={!c.is_private}>Free</option>
                        <option value="paid" selected={false}>Paid</option>
                        <option value="invite_only" selected={c.is_private}>Invite Only</option>
                        <option value="application" selected={false}>Application</option>
                      </select>
                    </div>
                    <div class="form-row">
                      <label for="comm-price">Default Price (USD)</label>
                      <div class="price-input-wrap">
                        <span class="price-sym">$</span>
                        <input id="comm-price" name="price" type="number" min="0" step="0.01"
                          class="price-num" placeholder="0"
                          value={c.priceCents ? (c.priceCents / 100).toFixed(2) : "0"} />
                      </div>
                    </div>
                  </div>

                  <div class="form-row-2">
                    <div class="form-row">
                      <label for="comm-public">Visibility</label>
                      <select id="comm-public" name="isPublic" class="form-input">
                        <option value="1" selected={c.isPublic === 1}>Public</option>
                        <option value="0" selected={c.isPublic === 0}>Unlisted</option>
                      </select>
                    </div>
                    <div class="form-row">
                      <label for="comm-wcp">Who Can Post</label>
                      <select id="comm-wcp" name="whoCanPost" class="form-input">
                        <option value="anyone" selected={c.whoCanPost === "anyone"}>Anyone (Public)</option>
                        <option value="member" selected={c.whoCanPost === "member"}>Members Only</option>
                        <option value="moderator" selected={c.whoCanPost === "moderator"}>Moderators &amp; Above</option>
                        <option value="admin" selected={c.whoCanPost === "admin"}>Admins Only</option>
                        <option value="owner" selected={c.whoCanPost === "owner"}>Owner Only</option>
                      </select>
                    </div>
                  </div>

                  <hr />

                  <div class="form-row">
                    <label for="comm-seo-title">SEO Title</label>
                    <input id="comm-seo-title" name="seoTitle" class="form-input" value={c.seoTitle ?? ""} />
                  </div>
                  <div class="form-row">
                    <label for="comm-seo-desc">SEO Description</label>
                    <textarea id="comm-seo-desc" name="seoDescription" class="form-input" style="min-height:60px;resize:vertical;">{c.seoDescription ?? ""}</textarea>
                  </div>


                </div>

                {/* ─── Media Slider ─────────────────────────────────────── */}
                <div class="settings-section">
                  <div class="section-title">📸 Media Slider</div>
                  <div class="section-desc">Images and videos shown in a slider on your community page.</div>
                  <div class="media-list">
                    {mediaItems.value.map((item, idx) => (
                      <div key={idx} class="media-row">
                        <span style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">
                          {item.type === "video" ? "🎬 Video" : "🖼 Image"}
                        </span>
                        <input class="form-input" value={item.url} onInput$={(e) => {
                          const u = [...mediaItems.value]; u[idx] = { ...u[idx], url: (e.target as HTMLInputElement).value };
                          mediaItems.value = u; mediaJson.value = JSON.stringify(u);
                        }} />
                        <button type="button" class="btn btn-ghost btn-sm" style=""
                          onClick$={() => removeMedia(idx)}>
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;">
                    <div class="form-row" style="flex:1;min-width:200px;">
                      <label>URL (image or video)</label>
                      <input class="form-input" placeholder="https://youtube.com/..." value={newMediaUrl.value}
                        onInput$={(e) => { newMediaUrl.value = (e.target as HTMLInputElement).value; }} />
                    </div>
                    <div class="form-row">
                      <label>Type</label>
                      <select class="form-input" value={newMediaType.value}
                        onChange$={(e) => { newMediaType.value = (e.target as HTMLSelectElement).value as "image" | "video"; }}>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                    </div>
                    <button type="button" class="btn btn-ghost" style="display:flex;align-items:center;gap:0.3rem;"
                      onClick$={addMedia}>
                      + Add
                    </button>
                  </div>
                  <div class="form-hint">Video URLs (YouTube/Vimeo/.mp4) are auto-detected.</div>

                </div>

                {/* ─── Pricing Model ──────────────────────────────────────── */}
                <div class="settings-section">
                  <div class="model-header">
                    <div class="section-title">Pricing Plans</div>

                  </div>

                  {/* 5-tab strip */}
                  <div class="model-tabs">
                    {MODEL_OPTIONS.map(opt => (
                      <div
                        key={opt.key}
                        class={`model-tab${pricingModel.value === opt.key ? " active" : ""}`}
                        onClick$={() => { pricingModel.value = opt.key; syncPlans(); }}
                      >
                        <div class="model-tab-title">
                          <input type="radio" class="model-radio" name="_pricingModelUI"
                            checked={pricingModel.value === opt.key}
                            onChange$={() => { pricingModel.value = opt.key; syncPlans(); }}
                          />
                          {opt.label}
                        </div>
                        <div class="model-tab-desc">{opt.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Tier cards ─────────────────────────────────────── */}
                  {visibleTiers.length > 0 && (
                    <div class="tier-grid">
                      {visibleTiers.map(key => {
                        const tier = tiers.value[key];
                        const isVip = key === "vip";
                        const isEnabled = tier.enabled;

                        return (
                          <div key={key} class="tier-card">

                            {/* Header — always interactive */}
                            <div class="tier-card-head">
                              {TIER_LABELS[key]}
                              {isVip && (
                                <label class="pill-wrap" onClick$={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange$={(e) => {
                                      const checked = (e.target as HTMLInputElement).checked;
                                      tiers.value = { ...tiers.value, vip: { ...tiers.value.vip, enabled: checked } };
                                      syncPlans();
                                    }}
                                  />
                                  <span class="pill-track" />
                                </label>
                              )}
                            </div>

                            {/* Body — dimmed when VIP is off */}
                            <div class={`tier-card-body${isVip && !isEnabled ? " dimmed" : ""}`}>

                              {/* 1-time: single price field */}
                              {model === "one_time" && (
                                <div>
                                  <div class="price-field-label">One-time price</div>
                                  <div class="price-input-wrap">
                                    <span class="price-sym">$</span>
                                    <input type="number" min="0" step="0.01" class="price-num" placeholder="0"
                                      value={tier.oneTimePrice}
                                      onInput$={(e) => {
                                        tiers.value = { ...tiers.value, [key]: { ...tiers.value[key], oneTimePrice: (e.target as HTMLInputElement).value } };
                                        syncPlans();
                                      }}
                                    />
                                    <span class="price-suffix">one-time</span>
                                  </div>
                                </div>
                              )}

                              {/* Freemium Standard = always free, no price fields */}
                              {model === "freemium" && key === "standard" && (
                                <div style="display:flex;align-items:center;gap:0.4rem;">
                                  <span style="font-size:0.78rem;font-weight:700;color:#16a34a;background:#dcfce7;border:1px solid #86efac;border-radius:0.35rem;">Free</span>
                                  <span style="font-size:0.75rem;color:var(--text-secondary);">Members join at no cost</span>
                                </div>
                              )}

                              {/* Subscription / Freemium paid tiers / Tiers: monthly + yearly */}
                              {model !== "one_time" && !(model === "freemium" && key === "standard") && (
                                <>
                                  <div>
                                    <div class="price-field-label">Monthly price</div>
                                    <div class="price-input-wrap">
                                      <span class="price-sym">$</span>
                                      <input type="number" min="0" step="0.01" class="price-num" placeholder="0"
                                        value={tier.monthlyPrice}
                                        onInput$={(e) => {
                                          tiers.value = { ...tiers.value, [key]: { ...tiers.value[key], monthlyPrice: (e.target as HTMLInputElement).value } };
                                          syncPlans();
                                        }}
                                      />
                                      <span class="price-suffix">/month</span>
                                    </div>
                                  </div>
                                  <div>
                                    <div class="price-field-label">Yearly price</div>
                                    <div class="price-input-wrap">
                                      <span class="price-sym">$</span>
                                      <input type="number" min="0" step="0.01" class="price-num" placeholder="0"
                                        value={tier.yearlyPrice}
                                        onInput$={(e) => {
                                          tiers.value = { ...tiers.value, [key]: { ...tiers.value[key], yearlyPrice: (e.target as HTMLInputElement).value } };
                                          syncPlans();
                                        }}
                                      />
                                      <span class="price-suffix">/year</span>
                                    </div>
                                  </div>
                                </>
                              )}

                              {/* Benefits — Freemium + Tiers only */}
                              {showBenefits && (
                                <div class="benefit-section">
                                  <div class="price-field-label">Benefits</div>
                                  {tier.benefits.map((b: any, bidx: any) => (
                                    <div key={bidx} class="benefit-row">
                                      <span class="benefit-grip">=</span>
                                      <input class="benefit-input" value={b} placeholder="Add a benefit…"
                                        onInput$={(e) => {
                                          const updated = { ...tiers.value };
                                          updated[key] = {
                                            ...updated[key],
                                            benefits: updated[key].benefits.map((x: any, i: any) =>
                                              i === bidx ? (e.target as HTMLInputElement).value : x
                                            ),
                                          };
                                          tiers.value = updated; syncPlans();
                                        }}
                                      />
                                      <button type="button" class="benefit-del"
                                        onClick$={() => removeBenefit(key, bidx)}>
                                        X
                                      </button>
                                    </div>
                                  ))}
                                  <button type="button" class="benefit-add"
                                    onClick$={() => addBenefit(key)}>
                                    + Add benefit
                                  </button>
                                </div>
                              )}

                            </div>{/* end tier-card-body */}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Bottom extras ──────────────────────────────────── */}
                  {(showTrial || showPrevMembers) && (
                    <div class="pricing-extras">
                      {showPrevMembers && (
                        <div class="free-members-row">
                          <span>Previous free members ({totalMembers}) get</span>
                          <strong>
                            <select value={freeMemberTier.value}
                              onChange$={(e) => { freeMemberTier.value = (e.target as HTMLSelectElement).value; }}>
                              <option value="standard">Standard tier</option>
                              <option value="premium">Premium tier</option>
                              {tiers.value.vip.enabled && <option value="vip">VIP tier</option>}
                            </select>
                          </strong>
                          <span style="font-size:0.7rem;color:var(--text-secondary);">∨</span>
                        </div>
                      )}

                      {showTrial && (
                        <div class="trial-row">
                          <label class="pill-wrap">
                            <input type="checkbox" checked={trialEnabled.value}
                              onChange$={(e) => { trialEnabled.value = (e.target as HTMLInputElement).checked; }} />
                            <span class="pill-track" />
                          </label>
                          <span style={!trialEnabled.value ? "color:var(--text-secondary);" : ""}>
                            7-day free trial
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Publish Toggle ────────────────────────────────────────────────── */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "1rem", height: "1rem" }}>
                      🚀
                    </div>
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                        Published
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Make your community visible to the world
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick$={async () => {
                      const fd = new FormData();
                      await publish.submit(fd);
                    }}
                    style={{
                      width: "2.75rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: publishIsRunning.value ? "not-allowed" : "pointer",
                      background: c.published ? "var(--accent)" : "var(--border)",
                      position: "relative",
                      transition: "background 200ms ease",
                      flexShrink: "0",
                      opacity: publishIsRunning.value ? "0.6" : "1",
                    }}
                    role="switch"
                    aria-checked={c.published}
                    disabled={publishIsRunning.value}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "0.1875rem",
                        left: c.published ? "1.3125rem" : "0.1875rem",
                        width: "1.125rem",
                        height: "1.125rem",
                        background: c.published ? "var(--button-primary-text)" : "white",
                        borderRadius: "9999px",
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

              {/* ── Save button ───────────────────────────────────────────────── */}
              <div
                style={{
                  position: "sticky",
                  bottom: "-1.5rem",
                  margin: "0 -1.5rem -1.5rem",
                  padding: "1rem 1.5rem",
                  background: "var(--surface-2)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="submit"
                  disabled={updateSettingsIsRunning.value}
                  style={{
                    width: "100%",
                    height: "2.625rem",
                    background: updateSettingsIsRunning.value ? "var(--muted)" : "var(--button-primary-bg)",
                    color: updateSettingsIsRunning.value ? "var(--text-secondary)" : "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    cursor: updateSettingsIsRunning.value ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    transition: "background 150ms ease, opacity 150ms ease",
                  }}
                >
                  {updateSettingsIsRunning.value ? (
                    "Saving Settings…"
                  ) : (
                    "Save Settings"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </SlideOver>
  );
});

export const head: DocumentHead = { title: "Settings — Community Dashboard" };
