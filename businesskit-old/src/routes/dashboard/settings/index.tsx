import { component$, useSignal, useVisibleTask$, useStylesScoped$, useContext, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useLocation } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuCreditCard, LuBuilding, LuCheckCircle2, LuAlertCircle, LuRocket, LuUsers, LuFolderOpen, LuCalendarClock } from "@qwikest/icons/lucide";

import { SettingsContext } from "./layout";
import styles from "./settings.css?inline";
import { TimezoneSelect } from "~/components/TimezoneSelect";
import { useAppContext } from "~/lib/app-context";
import { CountrySelect } from "~/components/common/Country";
import { CountryCurrencySelect, SupportedCurrenciesPicker } from "~/components/common/CountryCurrency";

export default component$(() => {
  useStylesScoped$(styles);
  const ctx = useAppContext();

  const loc = useLocation();
  const initialTab = loc.url.searchParams.get("tab") as "general" | "plan" | "workspace" || "general";
  const activeTab = useSignal<"general" | "plan" | "workspace">(initialTab);

  const settingsCtx = useContext(SettingsContext);
  const loading = settingsCtx.loading;

  const org = useSignal<any>(null);
  const settings = useSignal<any>(null);
  const currentUserId = useSignal<string | null>(null);
  const userRole = useSignal<string>("owner");
  const isSaving = useSignal(false);
  const planAllocations = useSignal<{ total_slots: number; used_slots: number; available_slots: number; current_plan: string } | null>(null);
  const assigningProfile = useSignal<string | null>(null);

  // Form signals
  const siteTitle = useSignal("");
  const tagline = useSignal("");
  const siteDesc = useSignal("");
  const timezone = useSignal("");
  const location = useSignal("");
  const country = useSignal("");
  const currency = useSignal("");
  const supportedCurrencies = useSignal<string[]>([]);
  const industry = useSignal("");
  const logoUrl = useSignal("");
  const favicon = useSignal("");
  const language = useSignal("");
  const saveMessage = useSignal<{ type: "success" | "error"; text: string } | null>(null);

  const fetchError = useSignal<string | null>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => settingsCtx.profile);
    try {
      fetchError.value = null;
      const [fetchedOrg, fetchedSettings, fetchedAllocations, auth, myAccess]: [any, any, any, any, any] = await Promise.all([
        invoke("get_organization").catch(() => null),
        invoke("get_settings").catch(() => null),
        invoke("get_plan_allocations").catch(() => null),
        invoke("auth_status").catch(() => null),
        invoke("get_my_access").catch(() => null),
      ]);

      org.value = fetchedOrg;
      settings.value = fetchedSettings;
      planAllocations.value = fetchedAllocations;
      if (myAccess?.role) {
        userRole.value = myAccess.role;
      }
      if (auth?.user?.id) {
        currentUserId.value = auth.user.id;
      } else if (auth?.user_id) {
        currentUserId.value = auth.user_id;
      }

      if (fetchedSettings) {
        const s = fetchedSettings as any;
        siteTitle.value = s.site_title || "";
        tagline.value = s.tagline || "";
        siteDesc.value = s.site_description || "";
        timezone.value = s.timezone || "UTC";
        location.value = s.location || "";
        country.value = s.country || "";
        currency.value = s.currency || "";
        industry.value = s.industry || "";
        logoUrl.value = s.logo_url || "";
        favicon.value = s.favicon || "";
        language.value = s.language || "en";

        if (s.supported_currencies) {
          try {
            const parsed = JSON.parse(s.supported_currencies);
            if (Array.isArray(parsed) && parsed.length > 0) {
              supportedCurrencies.value = parsed;
            } else if (s.currency && typeof s.currency === "string" && s.currency.trim()) {
              supportedCurrencies.value = [s.currency.trim()];
            } else {
              supportedCurrencies.value = ["USD"];
            }
          } catch {
            supportedCurrencies.value = s.currency && typeof s.currency === "string" && s.currency.trim()
              ? [s.currency.trim()]
              : ["USD"];
          }
        } else if (s.currency && typeof s.currency === "string" && s.currency.trim()) {
          supportedCurrencies.value = [s.currency.trim()];
        } else {
          supportedCurrencies.value = ["USD"];
        }
      }
    } catch (e: any) {
      console.error("Failed to load settings data", e);
      fetchError.value = e.message || String(e);
    }
  });


  const getPlanDetails = (plan: string) => {
    switch (plan?.toUpperCase()) {
      case "BASIC": return { name: "Basic", profiles: 1, team: 0, apps: "Unlimited", deploy: true, color: "linear-gradient(135deg, #3b82f6, #2dd4bf)" };
      case "PRO": return { name: "Pro", profiles: 2, team: 2, apps: "Unlimited", deploy: true, color: "linear-gradient(135deg, #8b5cf6, #ec4899)" };
      case "BUSINESS": return { name: "Business", profiles: 10, team: 10, apps: "Unlimited", deploy: true, color: "linear-gradient(135deg, #f59e0b, #ef4444)" };
      case "FREE":
      default:
        return { name: "FREE", profiles: 1, team: 0, apps: "Default Only", deploy: false, color: "linear-gradient(135deg, #64748b, #94a3b8)" };
    }
  };

  // Active workspace and subscription plan determination:
  const licStatus = (ctx.license.value?.status || org.value?.subscription_status || "").toLowerCase();
  const isLicActive = licStatus === "active" || licStatus === "grace" || licStatus === "trial";
  const orgPlan = (org.value?.plan && org.value.plan.toLowerCase() !== "starter" ? org.value.plan : "").trim().toUpperCase();
  const globalPlan = (planAllocations.value?.current_plan || ctx.license.value?.plan || orgPlan || "FREE").trim().toUpperCase();
  const activeProfile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
  const profileAllocatedPlan = (activeProfile?.allocated_plan || "").trim().toUpperCase();

  const subscriptionPlan = isLicActive && globalPlan !== "" && globalPlan !== "FREE"
    ? globalPlan
    : (planAllocations.value?.current_plan || "FREE");
  const subscriptionPlanDetails = getPlanDetails(subscriptionPlan);

  const effectivePlan = profileAllocatedPlan !== ""
    ? (profileAllocatedPlan === "FREE" ? "FREE" : (isLicActive ? profileAllocatedPlan : "FREE"))
    : (isLicActive && globalPlan !== "" && globalPlan !== "FREE" ? globalPlan : "FREE");

  // Main hero card and plan limits reflect the active subscription tier if licensed, else workspace tier
  const displayPlanDetails = isLicActive && subscriptionPlan !== "FREE"
    ? subscriptionPlanDetails
    : getPlanDetails(effectivePlan);
  const isTrial = licStatus === "trial" || org.value?.subscription_status?.toLowerCase() === "trial" || ctx.license.value?.status?.toLowerCase() === "trial";

  const nowSec = Date.now() / 1000;
  const subExpiresAt = org.value?.subscription_expires_at || ctx.license.value?.expires_at;
  const hasFutureSub = subExpiresAt && subExpiresAt > nowSec;
  const isOrgOwner = !currentUserId.value || !org.value?.owner_user_id || org.value.owner_user_id === currentUserId.value;
  const isOrgAdminOrOwner = isOrgOwner || ["owner", "admin", "manager"].includes(userRole.value.toLowerCase());

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleAssignPlan = $(async (profileId: string, targetPlan: string) => {
    assigningProfile.value = profileId;
    try {
      await invoke("assign_profile_plan", { profileId, targetPlan });
      // Refresh allocations and profiles
      const updatedAllocations = await invoke("get_plan_allocations");
      planAllocations.value = updatedAllocations as any;
      const updatedProfiles = await invoke("get_projects");
      ctx.profiles.value = updatedProfiles as any;
      saveMessage.value = { type: "success", text: "Workspace plan updated." };
    } catch (e: any) {
      saveMessage.value = { type: "error", text: e.toString() };
    } finally {
      assigningProfile.value = null;
      setTimeout(() => { saveMessage.value = null; }, 3000);
    }
  });

  return (
    <>
      {loading ? (
        <div style="display:flex;align-items:center;justify-content:center;height:12rem;color:var(--text-secondary);">Loading...</div>
      ) : (
        <section class="profile-main">
          <div class="form-wrapper">
            <div class="form-card">
              <div class="tab-list">
                <button type="button" class={`tab-trigger ${activeTab.value === "general" ? "active" : ""}`} onClick$={() => { activeTab.value = "general"; }}>General</button>
                <button type="button" class={`tab-trigger ${activeTab.value === "plan" ? "active" : ""}`} onClick$={() => { activeTab.value = "plan"; }}>Plan & Billing</button>
                <button type="button" class={`tab-trigger ${activeTab.value === "workspace" ? "active" : ""}`} onClick$={() => { activeTab.value = "workspace"; }}>Workspace</button>
              </div>

              {activeTab.value === "plan" ? (
                <div class="tab-panel">

                  {/* Hero Plan Card */}
                  <div class="premium-card" style={{ background: displayPlanDetails.color }}>
                    <div class="plan-hero-header">
                      <div class="plan-hero-title-group">
                        <div class="plan-hero-subtitle">Subscription Plan</div>
                        <h2 class="plan-hero-title">{displayPlanDetails.name}</h2>
                      </div>

                      {/* Billing Date */}
                      <div class="plan-hero-billing">
                        <div class="plan-hero-billing-label">
                          <LuCalendarClock class="w-3.5 h-3.5" />
                          {isTrial && hasFutureSub ? "Trial Expires" : hasFutureSub ? "Next Billing Date" : "Billing Status"}
                        </div>
                        <div class="plan-hero-billing-val">
                          {hasFutureSub ? formatDate(subExpiresAt!) : (displayPlanDetails.name === "FREE" ? "Free Tier" : "Active")}
                        </div>
                      </div>
                    </div>

                    {isTrial && hasFutureSub && (
                      <div class="plan-trial-banner">
                        <LuAlertCircle class="w-5 h-5 flex-shrink-0" />
                        <div style="font-size:0.9375rem; font-weight:500;">
                          Your {displayPlanDetails.name} trial ends soon. You will be automatically downgraded to the FREE tier unless you upgrade.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Workspace Allocations */}
                  <div style="margin-bottom: 2.5rem; width: 100%;">
                    <div class="workspace-alloc-header">
                      <h3 style="font-size:1.125rem; font-weight:600; color:var(--text-primary); margin:0;">Workspace Plan Allocation</h3>
                      {planAllocations.value && (
                        <div style="font-size:0.875rem; color:var(--text-secondary); background:var(--muted); padding:0.25rem 0.75rem; border-radius:1rem;">
                          {planAllocations.value.used_slots} of {planAllocations.value.total_slots} {planAllocations.value.current_plan} slots used
                        </div>
                      )}
                    </div>
                    
                    <div class="workspace-alloc-list">
                      {ctx.profiles.value
                        .filter(p => !org.value?.id || !p.organization_id || p.organization_id === org.value.id)
                        .map(p => {
                        const isProfPaid = (p.allocated_plan || "FREE").toUpperCase() !== "FREE";
                        const now = Date.now() / 1000;
                        const locked = isProfPaid && Boolean(p.plan_allocated_at && (now - p.plan_allocated_at < 2592000));
                        const daysLeft = locked ? Math.ceil((2592000 - (now - p.plan_allocated_at!)) / 86400) : 0;
                        const isAssigning = assigningProfile.value === p.id;
                        const isActive = ctx.activeProfileId.value === p.id;
                        const currentTier = (planAllocations.value?.current_plan || subscriptionPlan || "").toUpperCase();
                        const targetPlanName = currentTier && currentTier !== "FREE" ? currentTier : "PRO";
                        const targetPlanDetails = getPlanDetails(targetPlanName);
                        const hasAvailableSlots = Boolean(planAllocations.value && planAllocations.value.available_slots > 0);
                        
                        return (
                          <div key={p.id} class="workspace-alloc-item" style={{ opacity: isActive ? 1 : 0.85 }}>
                            <div class="workspace-alloc-left">
                              <div style="width:2.5rem; height:2.5rem; border-radius:0.5rem; background:var(--muted); display:flex; align-items:center; justify-content:center; font-weight:600; color:var(--text-primary); overflow:hidden; flex-shrink:0;">
                                {p.avatar_url ? (
                                  <img src={p.avatar_url} alt={p.title} width="40" height="40" style="width:100%; height:100%; object-fit:cover;" />
                                ) : (
                                  p.title.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div style="min-width: 0; flex: 1;">
                                <div style="font-weight:500; color:var(--text-primary); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">{p.title}</span>
                                  {isActive && <span style="font-size:0.65rem; background:var(--muted); padding:0.125rem 0.375rem; border-radius:1rem; text-transform:uppercase;">Active</span>}
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.125rem;">
                                  Currently: <span style={{ fontWeight: 600, color: isProfPaid ? (getPlanDetails(p.allocated_plan || "PRO").color) : "var(--text-secondary)" }}>{(p.allocated_plan || "FREE").toUpperCase()}</span>
                                </div>
                              </div>
                            </div>
                            <div class="workspace-alloc-right">
                              {!isOrgAdminOrOwner ? (
                                <div style="font-size:0.75rem; color:var(--text-secondary);">Managed by organization admin or owner</div>
                              ) : isProfPaid ? (
                                locked ? (
                                  <div style="font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.375rem;" title="Paid plans can only be changed once every 30 days.">
                                    <LuCalendarClock class="w-3.5 h-3.5" />
                                    Locked ({daysLeft}d)
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick$={() => handleAssignPlan(p.id, "FREE")}
                                    disabled={isAssigning}
                                    class="button-secondary"
                                    style="padding:0.375rem 0.75rem; font-size:0.75rem;"
                                  >
                                    {isAssigning ? "..." : "Downgrade to FREE"}
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick$={() => {
                                    if (hasAvailableSlots) {
                                      handleAssignPlan(p.id, targetPlanName);
                                    } else {
                                      alert(`No available ${targetPlanDetails.name} slots.`);
                                    }
                                  }}
                                  disabled={isAssigning || !hasAvailableSlots}
                                  class="button-primary"
                                  title={!hasAvailableSlots ? `No available ${targetPlanDetails.name} slots.` : `Upgrade workspace to ${targetPlanDetails.name}`}
                                  style={{
                                    padding: "0.375rem 0.75rem",
                                    fontSize: "0.75rem",
                                    background: hasAvailableSlots ? targetPlanDetails.color : "var(--muted)",
                                    color: hasAvailableSlots ? "white" : "var(--text-secondary)",
                                    opacity: hasAvailableSlots ? 1 : 0.5,
                                    cursor: hasAvailableSlots ? "pointer" : "not-allowed",
                                  }}
                                >
                                  {isAssigning ? "..." : `Upgrade to ${targetPlanDetails.name}`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {saveMessage.value && (
                      <div class={`action-message ${saveMessage.value.type}`} style="margin-top:1rem;">
                        {saveMessage.value.type === "success" ? <LuCheckCircle2 class="w-4 h-4 flex-shrink-0" /> : <LuAlertCircle class="w-4 h-4 flex-shrink-0" />}
                        <span>{saveMessage.value.text}</span>
                      </div>
                    )}
                  </div>

                  {/* Limits Grid */}
                  <h3 style="font-size:1.125rem; font-weight:600; margin-bottom:1rem; color:var(--text-primary);">Plan Limits</h3>
                  <div class="stat-card-grid">
                    <div class="stat-card">
                      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
                        <div class="stat-icon" style="margin-bottom: 0;"><LuFolderOpen class="w-5 h-5" /></div>
                        <div style="font-size:0.875rem; font-weight:500; color:var(--text-secondary);">Workspaces Allowed</div>
                      </div>
                      <div style="font-size:1.5rem; font-weight:600; color:var(--text-primary);">{displayPlanDetails.profiles}</div>
                    </div>

                    <div class="stat-card">
                      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
                        <div class="stat-icon" style="margin-bottom: 0;"><LuUsers class="w-5 h-5" /></div>
                        <div style="font-size:0.875rem; font-weight:500; color:var(--text-secondary);">Team Members</div>
                      </div>
                      <div style="font-size:1.5rem; font-weight:600; color:var(--text-primary);">{displayPlanDetails.team}</div>
                    </div>

                    <div class="stat-card">
                      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
                        <div class="stat-icon" style="margin-bottom: 0;"><LuCreditCard class="w-5 h-5" /></div>
                        <div style="font-size:0.875rem; font-weight:500; color:var(--text-secondary);">App Installs</div>
                      </div>
                      <div style="font-size:1.5rem; font-weight:600; color:var(--text-primary);">{displayPlanDetails.apps}</div>
                    </div>

                    <div class="stat-card">
                      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
                        <div class="stat-icon" style="margin-bottom: 0;"><LuRocket class="w-5 h-5" /></div>
                        <div style="font-size:0.875rem; font-weight:500; color:var(--text-secondary);">Deployment</div>
                      </div>
                      <div style="font-size:1.125rem; font-weight:600; display:flex; align-items:center; gap:0.5rem; color:var(--text-primary);">
                        {displayPlanDetails.deploy ? <><LuCheckCircle2 style="color:var(--success)" class="w-5 h-5 flex-shrink-0" /> Enabled</> : <><LuAlertCircle style="color:var(--error)" class="w-5 h-5 flex-shrink-0" /> Disabled</>}
                      </div>
                    </div>
                  </div>

                  <div class="plan-footer-actions">
                    <button class="button-primary" disabled={displayPlanDetails.name === "Business"}>
                      Upgrade Plan
                    </button>
                    <button class="button-secondary">
                      Manage Billing
                    </button>
                  </div>

                </div>
              ) : activeTab.value === "general" ? (
                <div class="tab-panel">
                  <div class="field-group">
                    <form preventdefault:submit onSubmit$={async () => {
                      isSaving.value = true;
                      try {
                        await invoke("update_settings", {
                          data: {
                            site_title: siteTitle.value,
                            tagline: tagline.value,
                            site_description: siteDesc.value,
                            timezone: timezone.value,
                            location: location.value,
                            country: country.value,
                            currency: currency.value,
                            supported_currencies: JSON.stringify(supportedCurrencies.value),
                            industry: industry.value,
                            logo_url: logoUrl.value,
                            favicon: favicon.value,
                            language: language.value,
                          }
                        });
                        saveMessage.value = { type: "success", text: "Settings saved successfully" };
                        setTimeout(() => { saveMessage.value = null; }, 3000);
                      } catch (e: any) {
                        saveMessage.value = { type: "error", text: String(e) };
                      } finally {
                        isSaving.value = false;
                      }
                    }}>
                      {saveMessage.value && (
                        <div class={`action-message ${saveMessage.value.type}`} style="margin-bottom:1rem;">
                          {saveMessage.value.type === "success" ? <LuCheckCircle2 class="w-4 h-4 flex-shrink-0" /> : <LuAlertCircle class="w-4 h-4 flex-shrink-0" />}
                          <span>{saveMessage.value.text}</span>
                        </div>
                      )}

                      <div class="form-grid-2">
                        <div class="field-group">
                          <label class="field-label">Site Title</label>
                          <input class="text-input" style={{ height: "38px" }} value={siteTitle.value} onInput$={(e) => siteTitle.value = (e.target as HTMLInputElement).value} placeholder="My Awesome Business" />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Tagline</label>
                          <input class="text-input" style={{ height: "38px" }} value={tagline.value} onInput$={(e) => tagline.value = (e.target as HTMLInputElement).value} placeholder="We do awesome things" />
                        </div>
                      </div>

                      <div class="form-grid-2">
                        <div class="field-group">
                          <label class="field-label">Logo URL</label>
                          <input class="text-input" style={{ height: "38px" }} value={logoUrl.value} onInput$={(e) => logoUrl.value = (e.target as HTMLInputElement).value} placeholder="https://example.com/logo.png" />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Favicon URL</label>
                          <input class="text-input" style={{ height: "38px" }} value={favicon.value} onInput$={(e) => favicon.value = (e.target as HTMLInputElement).value} placeholder="https://example.com/favicon.ico" />
                        </div>
                      </div>

                      <div class="field-group" style="max-width:800px; margin-bottom:1.5rem;">
                        <label class="field-label">Site Description</label>
                        <textarea class="text-area" rows={3} value={siteDesc.value} onInput$={(e) => siteDesc.value = (e.target as HTMLTextAreaElement).value} placeholder="A short description of your business for SEO..." />
                      </div>

                      <div class="form-grid-4">
                        <div class="field-group">
                          <label class="field-label">Country</label>
                          <CountrySelect
                            class="text-input"
                            style={{ height: "38px", border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--field-fill)", color: "var(--text-primary)" }}
                            value={country.value}
                            onChange$={(val: string) => country.value = val}
                          />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Location</label>
                          <input class="text-input" style={{ height: "38px" }} value={location.value} onInput$={(e) => location.value = (e.target as HTMLInputElement).value} placeholder="City, State" />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Timezone</label>
                          <TimezoneSelect value={timezone.value} onTimezoneChange$={(v) => timezone.value = v} />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Industry</label>
                          <select class="text-input" style={{ height: "38px" }} value={industry.value} onChange$={(e) => industry.value = (e.target as HTMLSelectElement).value}>
                            <option value="">Select Industry</option>
                            <option value="ecommerce">E-commerce</option>
                            <option value="saas">SaaS / Software</option>
                            <option value="agency">Agency / Consulting</option>
                            <option value="retail">Retail</option>
                            <option value="healthcare">Healthcare</option>
                            <option value="medicines">Medicines / Pharmacy</option>
                            <option value="education">Education</option>
                            <option value="finance">Finance / Fintech</option>
                            <option value="real_estate">Real Estate</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div class="form-grid-2">
                        <div class="field-group">
                          <label class="field-label">Default Billing Currency</label>
                          <CountryCurrencySelect
                            class="text-input"
                            style={{ height: "38px", border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--field-fill)", color: "var(--text-primary)" }}
                            value={currency.value}
                            onChange$={(val: string) => currency.value = val}
                          />
                        </div>
                        <div class="field-group">
                          <label class="field-label">Language</label>
                          <select class="text-input" style={{ height: "38px" }} value={language.value} onChange$={(e) => language.value = (e.target as HTMLSelectElement).value}>
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="hi">Hindi</option>
                          </select>
                        </div>
                      </div>

                      <div class="field-group" style="max-width:800px; margin-bottom:2rem;">
                        <label class="field-label">
                          Accepted / Supported Currencies
                          <span style="font-size:0.75rem; font-weight:400; color:var(--text-secondary); margin-left:0.5rem;">
                            (Click to toggle accepted currencies for store items & billing)
                          </span>
                        </label>
                        <SupportedCurrenciesPicker
                          selectedCodes={supportedCurrencies.value}
                          onChange$={(codes: string[]) => supportedCurrencies.value = codes}
                        />
                      </div>

                      <div class="form-footer">
                        <button type="submit" class="button-primary" disabled={isSaving.value} style="height: 2.25rem; padding: 0 1.25rem;">
                          {isSaving.value ? "Saving..." : "Save Settings"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                <div class="tab-panel">
                  <div class="field-group">
                    <h2 style="font-size:1.25rem; font-weight:600; margin-bottom:1.5rem; display:flex; align-items:center; gap:0.5rem;">
                      <LuBuilding class="w-5 h-5 flex-shrink-0" /> Workspace Details
                    </h2>

                    <div class="field-group" style="max-width: 500px;">
                      <label class="field-label">Organization Name</label>
                      <input class="text-input" value={org.value?.name || ""} disabled style="background:var(--surface-2);" />
                      <p class="form-hint">Organization rename is not available yet.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Settings | BusinessKit",
};
