// src/lib/ipc.ts
// Tauri v2: #[tauri::command] deserializes args as camelCase.
// ALL invoke() arg keys must be camelCase — snake_case silently fails.

import { invoke } from "@tauri-apps/api/core";
import type {
  LicenseStatus, Organization, Profile, ProfileAnalytics,
  UpdateInfo, Deployment,
} from "./types";

// AuthSession — returned by sign_in and auth_status (Tauri Rust command)
export interface AuthSession {
  user_id: string;
  email: string;
  name: string | null;
  token: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authStatus = () =>
  invoke<AuthSession | null>("auth_status");

export const signIn = (screenHint?: "sign-in" | "sign-up") =>
  invoke<string>("sign_in", { screenHint: screenHint ?? "sign-in" });

export const signOut = () =>
  invoke<void>("sign_out");

export interface UserSettingsData {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    github?: string;
  } | string;
}

export const getUserSettings = () =>
  invoke<UserSettingsData>("get_user_settings");

export const updateUserSettings = (data: UserSettingsData) =>
  invoke<{ success: boolean; message?: string }>("update_user_settings", { data });

// ── License ───────────────────────────────────────────────────────────────────
export const getLicenseStatus = () =>
  invoke<LicenseStatus>("get_license_status");

export const refreshLicense = () =>
  invoke<LicenseStatus>("refresh_license");

// ── Organization ──────────────────────────────────────────────────────────────
export const getOrganization = () =>
  invoke<Organization | null>("get_organization");

export const getUserOrganizations = () =>
  invoke<Organization[]>("get_user_organizations");

export const isCentralDbReady = () =>
  invoke<boolean>("is_central_db_ready");

export const getActiveProfileId = () =>
  invoke<string | null>("get_active_profile_id");

export const switchOrganization = (orgId: string) =>
  invoke<void>("switch_organization", { orgId });   // ← camelCase

// ── Projects / Profiles ───────────────────────────────────────────────────────
export const getProjects = () =>
  invoke<Profile[]>("get_projects");

export const createOrganization = (name: string) =>
  invoke<Organization>("create_new_organization", { name });

export const createProject = (name: string, slug: string) =>
  invoke<Profile>("create_project", { name, slug });

export const getPlanAllocations = () =>
  invoke<{ total_slots: number; used_slots: number; available_slots: number; current_plan: string }>("get_plan_allocations");

export const assignProfilePlan = (profileId: string, targetPlan: string) =>
  invoke<Profile>("assign_profile_plan", { profileId, targetPlan });

// Tauri v2: profile_id → profileId
export const switchProject = (profileId: string) =>
  invoke<void>("switch_project", { profileId });    // ← camelCase

export const getUserdbStatus = (force?: boolean) =>
  invoke<{
    profile_id: string;
    turso_url: string;
    last_provisioned_at: number | null;
    table_count: number;
    expected_table_count: number;
    tables: { name: string; module?: string; exists: boolean; rowCount: number | null; colCount: number | null; expectedCols: number }[];
    index_count: number;
    expected_index_count: number;
    indexes: { name: string; table: string; module?: string; exists: boolean }[];
    trigger_count: number;
    expected_trigger_count: number;
    triggers: { name: string; table: string; module?: string; exists: boolean }[];
    view_count: number;
    expected_view_count: number;
    views: { name: string; module?: string }[];
  }>("get_userdb_status", { force });

/** Lightweight: Central DB only, no UserDB queries. Use for layout redirect check. */
export const getProvisionStatus = () =>
  invoke<{ has_userdb: boolean; last_provisioned_at: number | null }>("get_provision_status");

export const provisionUserDbNow = () =>
  invoke<string>("provision_user_db_now");

export const provisionMigrationsNow = () =>
  invoke<string>("provision_migrations_now");

export const recreateUserTable = (tableName: string) =>
  invoke<string>("recreate_user_table", { tableName });

export const recreateUserTriggers = (group?: string) =>
  invoke<string>("recreate_user_triggers", { group });

export const recreateSingleTrigger = (triggerName: string) =>
  invoke<string>("recreate_single_trigger", { triggerName });

export interface RawSqlResult {
  columns: string[];
  rows: any[][];
  rows_affected: number;
  execution_time_ms: number;
}

export const executeRawSql = (sql: string) =>
  invoke<RawSqlResult>("execute_raw_sql", { sql });

// ── UserDB connect (manual) ───────────────────────────────────────────────────
export const connectUserDb = (tursoUrl: string, tursoToken: string, orgId: string, profileId?: string) =>
  invoke<void>("connect_user_db", { tursoUrl, tursoToken, orgId, profileId });

// ── API Keys (keychain) ───────────────────────────────────────────────────────
export const saveApiKey = (keyName: string, keyValue: string) =>
  invoke<void>("save_api_key", { keyName, keyValue });  // ← camelCase

export const getApiKey = (keyName: string) =>
  invoke<string | null>("get_api_key", { keyName });   // ← camelCase

export const deleteApiKey = (keyName: string) =>
  invoke<void>("delete_api_key", { keyName });          // ← camelCase

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getProfileAnalytics = () =>
  invoke<ProfileAnalytics | null>("get_profile_analytics");

export const getCategoryAnalytics = () =>
  invoke<import("./types").CategoryAnalyticsRow[]>("get_category_analytics");

export const getSingleCategoryAnalytics = (slug: string) =>
  invoke<import("./types").CategoryAnalyticsRow | null>("get_single_category_analytics", { slug });

export const getLinkAnalytics = () =>
  invoke<import("./types").LinkAnalyticsRow[]>("get_link_analytics");

export const getSingleLinkAnalytics = (linkId: string) =>
  invoke<import("./types").LinkAnalyticsRow | null>("get_single_link_analytics", { linkId });

export const getCmsCategoryAnalytics = async (slug: string): Promise<import("./types").CmsAnalyticsRow | null> => {
  return await invoke("get_cms_analytics", { slug });
};

// ── Deploy ────────────────────────────────────────────────────────────────────
export const checkForUpdates = () =>
  invoke<UpdateInfo>("check_for_updates");

export const getDeploymentStatus = (profileId: string) =>
  invoke<Deployment | null>("get_deployment_status", { profileId });  // ← camelCase

export const connectCloudflare = (cfAccountId: string, cfApiToken: string) =>
  invoke<void>("connect_cloudflare", { cfAccountId, cfApiToken });    // ← camelCase

export const deployFrontend = (profileId: string, deployMode: string) =>
  invoke<void>("deploy_frontend", { profileId, deployMode });          // ← camelCase

// ── Profile editor ────────────────────────────────────────────────────────────
export const getProfile = () =>
  invoke<import("./types").ProfileRow>("get_profile");

export const updateProfile = (data: import("./types").UpdateProfileData) =>
  invoke<import("./types").ProfileRow>("update_profile", { data });

// ── Links ─────────────────────────────────────────────────────────────────────
export const getLinks = () =>
  invoke<import("./types").LinkRow[]>("get_links");

export const createLink = (data: import("./types").CreateLinkData) =>
  invoke<import("./types").LinkRow>("create_link", { data });

export const updateLink = (linkId: string, data: import("./types").UpdateLinkData) =>
  invoke<import("./types").LinkRow>("update_link", { id: linkId, data });

export const deleteLink = (linkId: string) =>
  invoke<void>("delete_link", { id: linkId });

// ── Page settings ─────────────────────────────────────────────────────────────
export const getPageSettings = () =>
  invoke<import("./types").SettingsRow | null>("get_page_settings");

export const updatePageSettings = (data: import("./types").UpsertSettingsData) =>
  invoke<import("./types").SettingsRow>("update_page_settings", { data });

// ── Link Pages ────────────────────────────────────────────────────────────────
export const getLinkPage = (categorySlug: string) =>
  invoke<import("./types").LinkPageRow | null>("get_link_page", { categorySlug });

export const upsertLinkPage = (data: import("./types").UpsertLinkPageData) =>
  invoke<import("./types").LinkPageRow>("upsert_link_page", { data });

// ── Window management ─────────────────────────────────────────────────────────
export const toggleFullscreen = () => invoke<void>("toggle_fullscreen");
export const reorderLinks = (updates: {id: string, order_index: number}[]) => invoke('reorder_links', { updates });

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts = (productType?: string) =>
  invoke<import("./types").ProductRow[]>("get_products", { productType }); // ← camelCase

export const getProduct = (productId: string) =>
  invoke<import("./types").ProductRow>("get_product", { productId }); // ← camelCase

export const createProduct = (data: import("./types").CreateProductData) =>
  invoke<import("./types").ProductRow>("create_product", { data });

export const updateProduct = (productId: string, data: import("./types").UpdateProductData) =>
  invoke<import("./types").ProductRow>("update_product", { productId, data }); // ← camelCase

// ── Product Analytics ─────────────────────────────────────────────────────────
export const getProductAnalytics = () =>
  invoke<import("./types").ProductAnalyticsRow[]>("get_product_analytics");

// ── Sales ─────────────────────────────────────────────────────────────────────
export const getProductPurchases = (productType?: string) =>
  invoke<import("./types").PurchaseRow[]>("get_product_purchases", { productType });

// ── CMS & Content ─────────────────────────────────────────────────────────────
export const listCms = () =>
  invoke<import("./types").CmsRow[]>("list_cms");

export const updateCms = (cmsId: string, data: import("./types").UpdateCmsData) =>
  invoke<import("./types").CmsRow>("update_cms", { cmsId, data });

export const listContent = (cmsId?: string, limit?: number, offset?: number) =>
  invoke<import("./types").ContentRow[]>("list_content", { cmsId, limit, offset });

export const getContent = (contentId: string) =>
  invoke<import("./types").ContentRow>("get_content", { contentId });

export const createContent = (data: import("./types").CreateContentData) =>
  invoke<import("./types").ContentRow>("create_content", { data });

export const createCollection = (data: { title: string; description?: string; icon?: string; category_id?: string; parent_id?: string; }) =>
  invoke<any>("create_collection", { data });

export const listCollections = () =>
  invoke<any[]>("list_collections");

export const listCategories = () =>
  invoke<any[]>("list_categories");

export const updateContent = (contentId: string, data: import("./types").UpdateContentData) =>
  invoke<import("./types").ContentRow>("update_content", { contentId, data });

export const deleteContent = (contentId: string) =>
  invoke<void>("delete_content", { contentId });

export const publishContent = (contentId: string) =>
  invoke<void>("publish_content", { contentId });

export const unpublishContent = (contentId: string) =>
  invoke<void>("unpublish_content", { contentId });

export const archiveContent = (contentId: string) =>
  invoke<void>("archive_content", { contentId });

// ── Content Analytics ─────────────────────────────────────────────────────────
export const getContentAnalytics = () =>
  invoke<import("./types").ContentAnalyticsRow[]>("get_all_content_analytics");

export const getAllCmsAnalytics = () =>
  invoke<import("./types").CmsAnalyticsRow[]>("get_all_cms_analytics");

// ── Jobs ─────────────────────────────────────────────────────────────────────

export const getJobListingsIPC = () =>
  invoke<import("./types").JobListingRow[]>("get_job_listings");

export const createJobListingIPC = (data: import("./types").CreateJobData) =>
  invoke<import("./types").JobListingRow>("create_job_listing", { data });

export const updateJobListingIPC = (id: string, data: import("./types").UpdateJobData) =>
  invoke<import("./types").JobListingRow>("update_job_listing", { id, data });

export const deleteJobListingIPC = (id: string) =>
  invoke<boolean>("delete_job_listing", { id });

export const getJobApplicationsIPC = () =>
  invoke<import("./types").JobApplicationRow[]>("get_job_applications");

export const updateJobApplicationStatusIPC = (id: string, decision: string | null, stage: string | null) =>
  invoke<import("./types").JobApplicationRow>("update_job_application_status", { id, decision, stage });

export const getJobAnalyticsIPC = () =>
  invoke<import("./types").JobAnalyticsRow[]>("get_job_analytics");

export const aggregateJobAnalyticsIPC = (forceRefresh: boolean = false) =>
  invoke<void>("aggregate_job_analytics", { forceRefresh });

// ── Forms ─────────────────────────────────────────────────────────────────────
// All args must be camelCase — Tauri v2 deserializes that way.

export const listFormsIPC = () =>
  invoke<import("./types").FormRow[]>("list_forms");

export const createFormIPC = (data: import("./types").CreateFormData) =>
  invoke<import("./types").FormRow>("create_form", { data });

export const updateFormIPC = (formId: string, data: import("./types").UpdateFormData) =>
  invoke<import("./types").FormRow>("update_form", { formId, data });

export const deleteFormIPC = (formId: string) =>
  invoke<void>("delete_form", { formId });

export const toggleFormPublishedIPC = (formId: string, published: boolean) =>
  invoke<void>("toggle_form_published", { formId, published });

export const listFormQuestionsIPC = (formId: string) =>
  invoke<import("./types").QuestionRow[]>("list_form_questions", { formId });

export const updateFormQuestionsIPC = (formId: string, questions: import("./types").QuestionData[]) =>
  invoke<void>("update_form_questions", { formId, questions });

export const listSubmissionsIPC = (formId: string, limit?: number) =>
  invoke<import("./types").SubmissionRow[]>("list_submissions", { formId, limit });

export const getFormAnalyticsIPC = (formId: string) =>
  invoke<import("./types").FormAnalyticsRow | null>("get_form_analytics", { formId });

// ── Community ─────────────────────────────────────────────────────────────────

export const listCommunities = () =>
  invoke<import("./types").CommunityRow[]>("list_communities");

export const getCommunity = (communityId: string) =>
  invoke<import("./types").CommunityRow>("get_community", { communityId });

export const createCommunity = (data: { name: string; slug: string; description?: string; icon?: string; cover_image?: string; is_private?: boolean; requires_approval?: boolean; }) =>
  invoke<import("./types").CommunityRow>("create_community", { data });

export const updateCommunity = (communityId: string, data: any) =>
  invoke<void>("update_community", { communityId, data });

export const deleteCommunity = (communityId: string) =>
  invoke<void>("delete_community", { communityId });

export const publishCommunity = (communityId: string) =>
  invoke<void>("publish_community", { communityId });

export const getCommunityMembers = (communityId: string, status?: string, limit?: number) =>
  invoke<any[]>("get_community_members", { communityId, status, limit });

export const approveMember = (memberId: string) =>
  invoke<void>("approve_member", { memberId });

export const banMember = (memberId: string) =>
  invoke<void>("ban_member", { memberId });

export const listCommunityPosts = (communityId: string, postType?: string, pinnedOnly?: boolean, limit?: number) =>
  invoke<import("./types").CommunityPostRow[]>("list_community_posts", { communityId, postType, pinnedOnly, limit });

export const createCommunityPost = (data: any) =>
  invoke<string>("create_post", { data });

export const deleteCommunityPost = (postId: string, communityId: string) =>
  invoke<void>("delete_post", { postId, communityId });

export const pinCommunityPost = (postId: string, communityId: string, pinned: boolean) =>
  invoke<void>("pin_post", { postId, communityId, pinned });

export const getCommunityLeaderboard = (communityId: string, limit?: number) =>
  invoke<import("./types").LeaderboardRow[]>("get_community_leaderboard", { communityId, limit });

export const listCommunityEvents = (communityId: string, includePast?: boolean) =>
  invoke<import("./types").CommunityEventRow[]>("list_community_events", { communityId, includePast });

export const getCommunityAnalytics = (communityId: string) =>
  invoke<import("./types").CommunityAnalyticsRow>("get_community_analytics", { communityId });

export const aggregateCommunityAnalytics = (communityId: string, force?: boolean) =>
  invoke<void>("aggregate_community_analytics", { communityId, force });

export const createCommunityCategory = (communityId: string, name: string, slug: string, description?: string, icon?: string, color?: string) =>
  invoke<string>("create_community_category", { communityId, name, slug, description, icon, color });

export const listCommunityCategories = (communityId: string) =>
  invoke<import("./types").CommunityCategoryRow[]>("list_community_categories", { communityId });

export const startChatSession = (
  title?: string,
  userId?: string,
  staffId?: string,
  model?: string,
  provider?: string,
  domain?: string
) =>
  invoke<import("./types").ChatSession>("start_chat_session", {
    title,
    userId,
    staffId,
    model,
    provider,
    domain,
  });

export const listChatSessions = () =>
  invoke<import("./types").ChatSession[]>("list_chat_sessions");

export const listAgentCommands = (domain?: string) =>
  invoke<import("./types").AgentCommand[]>("list_agent_commands", { domain });

export const createAgentCommand = (payload: import("./types").CreateAgentCommandPayload) =>
  invoke<import("./types").AgentCommand>("create_agent_command", { payload });

export const updateAgentCommand = (id: string, payload: import("./types").CreateAgentCommandPayload) =>
  invoke<import("./types").AgentCommand>("update_agent_command", { id, payload });

export const deleteAgentCommand = (id: string) =>
  invoke<void>("delete_agent_command", { id });

export const listAgentTools = () =>
  invoke<import("./types").AgentToolCatalogItem[]>("list_agent_tools");

export const getAgentAnalytics = () =>
  invoke<import("./types").AgentAnalytics | null>("get_agent_analytics");

export const getChatHistory = (sessionId: string) =>
  invoke<import("./types").ChatMessage[]>("get_chat_history", { sessionId });

export const sendChatMessage = (
  sessionId: string,
  message: string,
  requestId: string,
  provider?: string,
  model?: string,
  domain?: string,
  attachment?: import("./types").AttachmentPayload,
  reasoningEffort?: string,
  sourceCommandId?: string
) =>
  invoke<void>("send_chat_message", { sessionId, message, requestId, provider, model, domain, attachment, reasoningEffort, sourceCommandId });

export const stopChatSession = (requestId: string) =>
  invoke<void>("stop_chat_session", { requestId });

export const getBrandFoundation = () =>
  invoke<import("./types").BrandFoundation>("get_brand_foundation");

export const saveBrandFoundation = (data: import("./types").SaveBrandFoundationData) =>
  invoke<import("./types").BrandFoundation>("save_brand_foundation", { data });

export interface OpenRouterPriceInfo {
  id: string;
  name: string;
  prompt_price_1m: number;
  completion_price_1m: number;
  formatted: string;
  supports_reasoning?: boolean;
}

export const renameChatSession = (sessionId: string, title: string) =>
  invoke<void>("rename_chat_session", { sessionId, title });

export const togglePinChatSession = (sessionId: string, isPinned: boolean) =>
  invoke<boolean>("toggle_pin_chat_session", { sessionId, isPinned });

export const toggleSaveChatSession = (sessionId: string, isSaved: boolean) =>
  invoke<boolean>("toggle_save_chat_session", { sessionId, isSaved });

export const deleteChatSession = (sessionId: string) =>
  invoke<void>("delete_chat_session", { sessionId });

export const getOpenRouterPricing = () =>
  invoke<Record<string, OpenRouterPriceInfo>>("get_openrouter_pricing");

export interface CliModelStatus {
  provider: string;
  model_id: string;
  active_model: string;
  active_effort: string;
  thinking_enabled: boolean;
  source_path: string;
}

export const getActiveCliModels = () =>
  invoke<Record<string, CliModelStatus>>("get_active_cli_models");

export const setCliActiveModel = (provider: string, modelId: string, effort?: string) =>
  invoke<CliModelStatus>("set_cli_active_model", { provider, modelId, effort });

// ── Window Management (Multi-Window Workspaces) ──────────────────────────────
export const openProfileWindow = (profileId: string, title?: string) =>
  invoke<void>("open_profile_window", { profileId, title });

// ── Phase 9: Terminal Mode (PTY) — desktop only ───────────────────────────────

export interface PtySessionInfo {
  session_id: string;
  workspace_path: string;
  output_dir: string;
  history?: string | null;
}

/** Spawns a real interactive PTY session for the given CLI (claude/codex/antigravity). */
export const startTerminalSession = (
  profileId: string,
  sessionId: string,
  cli: string,
  rows: number,
  cols: number,
  resumeId?: string
) =>
  invoke<PtySessionInfo>("start_terminal_session", {
    profileId,
    sessionId,
    cli,
    rows,
    cols,
    resumeId,
  });

/** Sends raw keystroke data to the running PTY process. */
export const writeTerminalInput = (sessionId: string, data: string) =>
  invoke<void>("write_terminal_input", { sessionId, data });

/** Notifies the PTY of a terminal resize (rows × cols). */
export const resizeTerminalSession = (sessionId: string, rows: number, cols: number) =>
  invoke<void>("resize_terminal_session", { sessionId, rows, cols });

/** Kills the running PTY process for this session. */
export const stopTerminalSession = (sessionId: string) =>
  invoke<void>("stop_terminal_session", { sessionId });

/** Returns list of currently active PTY session IDs. */
export const listTerminalSessions = () =>
  invoke<string[]>("list_terminal_sessions");


