// src/lib/types.ts
// Shared TypeScript types — match EXACTLY to Rust command return structs in lib.rs.
// DO NOT add fields that don't exist in Rust — invoke() will return undefined for them.

// ── Auth ────────────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/commands/auth.rs → AuthUser, AuthInfo
export interface AuthUser {
  id: string;
  workos_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface AuthInfo {
  user: AuthUser;
  has_org: boolean;
  org_id: string | null;
}


// ── License ────────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/lib.rs → LicenseStatus
export interface LicenseStatus {
  status: string;            // "active" | "inactive" | "cancelled" | "grace" | "trial"
  plan: string;              // "starter" | "pro" | "business"
  expires_at: number | null;
  checked_at: number;
  grace_until: number | null;
}

export function isLicenseActive(lic: LicenseStatus | null): boolean {
  return lic?.status === "active" || lic?.status === "grace" || lic?.status === "trial";
}

// ── Organization ───────────────────────────────────────────────────────────────
// Matches: src-tauri/src/lib.rs → Organization
export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  plan: string;
  subscription_status: string;
  subscription_expires_at: number | null;
  cf_account_id: string | null;
  cf_api_token: string | null;   // encrypted — never display
  created_at: number;
  updated_at: number;
}

// ── Profile (project) ──────────────────────────────────────────────────────────
// Matches: src-tauri/src/lib.rs → Profile
// NOTE: field is "title" in Rust (from existing DB column), not "name"
export interface Profile {
  id: string;
  user_id: string;
  slug: string;
  title: string;             // ← "title" not "name" — matches DB column
  bio: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  created_at: number | null;
  updated_at: number | null;
  allocated_plan: string | null;
  plan_allocated_at: number | null;
}

// ── Deployment ─────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/lib.rs → Deployment
export interface Deployment {
  id: string;
  organization_id: string;
  profile_id: string;
  slug: string;
  deploy_mode: string;       // "project" | "workspace"
  cf_deployment_url: string | null;
  cf_worker_name: string | null;
  current_version: string | null;
  latest_version: string | null;
  status: string;            // "pending" | "active" | "failed"
  deployed_at: number | null;
  created_at: number;
  updated_at: number;
}

// ── Analytics (from profile_analytics table in UserDB) ─────────────────────────
// Matches: src-tauri/src/commands/analytics.rs → ProfileAnalyticsRow
export interface ProfileAnalytics {
  profile_id: string;
  total_visits: number;
  unique_visits: number;
  total_link_clicks: number;
  total_product_views: number;
  total_revenue: number;      // in cents
  updated_at: number;
}

export interface CategoryAnalyticsRow {
  category_id: string;
  category_slug?: string | null;
  profile_id: string;
  total_links: number;
  active_links: number;
  total_clicks: number;
  total_views: number;
  total_visits: number;
  views_7d?: string | null;
  views_30d?: string | null;
  views_12m?: string | null;
  views_lifetime?: string | null;
  visits_device_breakdown?: string | null;
  visits_os_breakdown?: string | null;
  visits_browser_breakdown?: string | null;
  visits_country_breakdown?: string | null;
  visits_city_breakdown?: string | null;
  visits_referrer_breakdown?: string | null;
  visits_7d?: string | null;
  visits_30d?: string | null;
  visits_12m?: string | null;
  visits_lifetime?: string | null;
  device_clicks?: string | null;
  os_clicks?: string | null;
  browser_clicks?: string | null;
  country_clicks?: string | null;
  city_clicks?: string | null;
  referrer_clicks?: string | null;
  clicks_lifetime?: string | null;
  clicks_7d?: string | null;
  clicks_30d?: string | null;
  clicks_12m?: string | null;
  updated_at: string;
}

export interface LinkAnalyticsRow {
  link_id: string;
  profile_id: string;
  total_clicks: number;
  device_clicks?: string | null;
  os_clicks?: string | null;
  browser_clicks?: string | null;
  country_clicks?: string | null;
  city_clicks?: string | null;
  referrer_clicks?: string | null;
  clicks_lifetime?: string | null;
  clicks_7d?: string | null;
  clicks_30d?: string | null;
  clicks_12m?: string | null;
  updated_at: number;
}

// ── Auth callback event ────────────────────────────────────────────────────────
// Matches: src-tauri/src/commands/auth.rs → AuthCallbackPayload
export interface AuthCallbackPayload {
  has_org: boolean;
  org_id: string | null;
}

// ── Update check ───────────────────────────────────────────────────────────────
// Matches: src-tauri/src/commands/deploy.rs → check_for_updates return
export interface UpdateInfo {
  current: string;
  latest: string;
  update_available: boolean;
}

// ── ProfileRow (UserDB) ───────────────────────────────────────────────────────
// Matches: src-tauri/src/db/user.rs → ProfileRow
export interface ProfileRow {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  bio: string | null;
  avatar_url: string | null;
  navigation_menu: string | null;
  footer_menu: string | null;
  enabled_categories: string | null;
  home_visibility: string | null;
  category_visibility: string | null;
  profile_theme: string | null;
  collect_emails: string | null;
  social_links: string | null;    // JSON array: [{platform, url}]
  about: string | null;
  cover_images: string | null;
  support_email: string | null;
  is_primary: boolean;
  welcome_video_url: string | null;
  form_id: string | null;
  about_visibility: string | null;
  landing_visibility: string | null;
  info_visibility: string | null;
  home_page: string | null;
}

// ── PageRecord ─────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/db/pages.rs -> PageRecord, CreatePageData, UpdatePageData
export interface PageRecord {
  id: string;
  profile_id: string;
  media_id: string | null;
  user_id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  nav_active: boolean;
  menu_active: boolean;
  footer_active: boolean;
  published: boolean;
  sections: string;
  faq: string | null;
  ai_summary: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_og_image: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreatePageData {
  id?: string | null;
  profile_id: string;
  media_id?: string | null;
  user_id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  sections?: string | null;
  faq?: string | null;
  published?: boolean | null;
  nav_active?: boolean | null;
  menu_active?: boolean | null;
  footer_active?: boolean | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
}

export interface UpdatePageData {
  title?: string | null;
  slug?: string | null;
  media_id?: string | null;
  excerpt?: string | null;
  sections?: string | null;
  faq?: string | null;
  published?: boolean | null;
  nav_active?: boolean | null;
  menu_active?: boolean | null;
  footer_active?: boolean | null;
  ai_summary?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
}

// ── LinkRow ────────────────────────────────────────────────────────────────────
export interface LinkRow {
  id: string;
  profile_id: string;
  category_id: string;
  category_slug: string | null;
  title: string;
  url: string;
  description: string | null;
  image_url: string | null;
  order_index: number | null;
  is_active: boolean;
  keywords: string | null;
  hidden_from_profile: boolean;
  sale_price: string | null;
  price: string | null;
  button_text: string | null;
  location: string | null;
  date: string | null;
  collection_name: string | null;
  slug: string | null;
  platform_name: string | null;
  logo_url: string | null;
  video_url: string | null;
  in_app: boolean;
  post_url: string[] | null;
}

// ── SettingsRow ───────────────────────────────────────────────────────────────
export interface SettingsRow {
  id: string;
  profile_id: string;
  site_title: string | null;
  tagline: string | null;
  site_description: string | null;
  logo_url: string | null;
  favicon: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical_url: string | null;
  robots: string | null;
  timezone: string | null;
  location: string | null;
  industry: string | null;
  theme: string | null;
  language: string | null;
}

// ── Mutation payloads ─────────────────────────────────────────────────────────
export interface UpdateProfileData {
  slug?: string | null;
  title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  navigation_menu?: string | null;
  social_links?: string | null;
  about?: string | null;
  support_email?: string | null;
  enabled_categories?: string | null;
  home_visibility?: string | null;
  category_visibility?: string | null;
  about_visibility?: string | null;
  landing_visibility?: string | null;
  info_visibility?: string | null;
  home_page?: string | null;
}

export interface CreateLinkData {
  profile_id: string;
  category_id: string;
  title: string;
  url: string;
  description?: string | null;
  image_url?: string | null;
  order_index?: number | null;
  keywords?: string | null;
  slug?: string | null;
  platform_name?: string | null;
  logo_url?: string | null;
  video_url?: string | null;
  post_url?: string[] | null;
  sale_price?: string | null;
  price?: string | null;
  button_text?: string | null;
  location?: string | null;
  date?: string | null;
  collection_name?: string | null;
}

export interface UpdateLinkData {
  title?: string | null;
  url?: string | null;
  description?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  video_url?: string | null;
  order_index?: number | null;
  published?: boolean | null;
  is_active?: boolean | null;
  keywords?: string | null;
  platform_name?: string | null;
  slug?: string | null;
  post_url?: string[] | null;
  sale_price?: string | null;
  price?: string | null;
  button_text?: string | null;
  location?: string | null;
  date?: string | null;
  collection_name?: string | null;
}

export interface UpsertSettingsData {
  profile_id: string;
  site_title?: string | null;
  tagline?: string | null;
  site_description?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  timezone?: string | null;
  location?: string | null;
  industry?: string | null;
  theme?: string | null;
  language?: string | null;
}

export interface LinkPageRow {
  id: string;
  profile_id: string;
  category_id: string | null;
  category_slug: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_og_image: string | null;
  seo_robots: string | null;
  seo_block_indexing: number;
}

export interface UpsertLinkPageData {
  profile_id: string;
  category_id?: string | null;
  category_slug: string;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
  seo_robots?: string | null;
  seo_block_indexing?: number;
}

// ── Products (Phase 2) ──────────────────────────────────────────────────────────
export interface ProductRow {
  id: string;
  profile_id: string;
  user_id: string;
  product_type: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  description: string | null;
  price_cents: number;
  sale_price_cents: number | null;
  currency: string;
  published: boolean;
  thumbnail_url: string | null;
  hero_image_url: string | null;
  visibility: string;
  tags: string | null;
  category_id: string | null;
  collection_id: string | null;
  is_featured: boolean;
  order_index: number;
  sections?: string;
  hide_default_sections?: boolean;
  created_at: number | null;
  updated_at: number | null;
  published_at: number | null;
}

export interface CreateProductData {
  profile_id: string;
  user_id: string;
  product_type: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  description: string | null;
  price_cents: number | null;
  sale_price_cents: number | null;
  currency: string | null;
  thumbnail_url: string | null;
  hero_image_url: string | null;
  media_id?: string | null;
  slider_id?: string | null;
  seo_og_image?: string | null;
  visibility: string | null;
  tags: string | null;
  category_id: string | null;
  order_index: number | null;
  sections?: string;
  hide_default_sections?: boolean;
  lessons?: string | null;
  total_lessons?: number | null;
}

export interface UpdateProductData {
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  description?: string | null;
  price_cents?: number | null;
  sale_price_cents?: number | null;
  thumbnail_url?: string | null;
  hero_image_url?: string | null;
  media_id?: string | null;
  slider_id?: string | null;
  seo_og_image?: string | null;
  published?: boolean | null;
  visibility?: string | null;
  tags?: string | null;
  category_id?: string | null;
  is_featured?: boolean | null;
  order_index?: number | null;
  sections?: string;
  hide_default_sections?: boolean;
  lessons?: string | null;
  total_lessons?: number | null;
}

export interface ProductAnalyticsRow {
  product_id: string;
  profile_id: string;
  total_views: number;
  unique_views: number;
  total_sales: number;
  total_revenue: number;
  email_open: number;
  email_clicks: number;
  updated_at: number;
  views_7d?: string;
  views_30d?: string;
  views_12m?: string;
  sales_7d?: string;
  sales_30d?: string;
  sales_12m?: string;
  revenue_7d?: string;
  revenue_30d?: string;
  revenue_12m?: string;
  visits_7d?: string;
  visits_30d?: string;
  visits_12m?: string;
  device_breakdown?: string;
  os_breakdown?: string;
  browser_breakdown?: string;
  views_country_breakdown?: string;
  views_city_breakdown?: string;
  views_referrer_breakdown?: string;
}

export interface JobAnalyticsRow {
  id: string;
  job_id: string;
  profile_id: string;
  bot_views: number;
  total_views: number;
  total_visits: number;
  total_applications: number;
  device_breakdown: string;
  os_breakdown: string;
  browser_breakdown: string;
  country_breakdown: string;
  city_breakdown: string;
  referrer_breakdown: string;
  utm_source_breakdown: string;
  utm_medium_breakdown: string;
  utm_campaign_breakdown: string;
  views_device_breakdown: string;
  views_os_breakdown: string;
  views_browser_breakdown: string;
  views_country_breakdown: string;
  views_city_breakdown: string;
  views_referrer_breakdown: string;
  views_7d: string;
  views_30d: string;
  views_12m: string;
  views_lifetime: string;
  applications_7d: string;
  applications_30d: string;
  applications_12m: string;
  applications_lifetime: string;
  last_aggregated_at: number | null;
  updated_at: string;
}

export interface ContentAnalyticsRow {
  content_id: string;
  profile_id: string;
  total_views: number;
  total_reactions: number;
  total_comments: number;
  device_breakdown?: string;
  os_breakdown?: string;
  browser_breakdown?: string;
  country_breakdown?: string;
  city_breakdown?: string;
  referrer_breakdown?: string;
  views_7d?: string;
  views_30d?: string;
  views_12m?: string;
}

export interface CmsAnalyticsRow {
  id?: string;
  cms_id: string;
  slug?: string;
  total_posts: number;
  total_published: number;
  total_sales: number;
  total_revenue: number;
  views_7d: string | null;
  views_30d: string | null;
  views_12m: string | null;
  sales_7d: string | null;
  sales_30d: string | null;
  sales_12m: string | null;
  revenue_7d: string | null;
  revenue_30d: string | null;
  revenue_12m: string | null;
  visits_7d: string | null;
  visits_30d: string | null;
  visits_12m: string | null;
  device_breakdown: string | null;
}

export interface ProfileAnalyticsRow {
  profile_id: string;
  total_views: number;
  unique_views: number;
  total_clicks: number;
  total_sales: number;
  total_revenue: number;
  email_open: number;
  email_clicks: number;
  updated_at: number;
  last_aggregated_at: number;
  views_7d?: string;
  views_30d?: string;
  views_12m?: string;
  clicks_7d?: string;
  clicks_30d?: string;
  clicks_12m?: string;
  device_clicks?: string;
  os_clicks?: string;
  browser_clicks?: string;
  country_clicks?: string;
  city_clicks?: string;
  referrer_clicks?: string;
  device_breakdown?: string;
  os_breakdown?: string;
  browser_breakdown?: string;
  views_country_breakdown?: string;
  views_city_breakdown?: string;
  views_referrer_breakdown?: string;
}

export interface PurchaseRow {
  id: string;
  email: string;
  customer_name: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  currency: string;
  payment_processor: string;
  payment_status: string;
  status: string;
  created_at: number;
  access_token: string;
  access_count: number;
  last_accessed_at: number | null;
  approval_status: string | null;
  product_id: string;
  product_title: string | null;
  product_type: string | null;
  product_slug: string | null;
}

// ── CMS & Content ─────────────────────────────────────────────────────────────

export interface CmsRow {
  id: string;
  profile_id: string;
  slug: string;
  title: string;
  description: string | null;
  category_id: string | null;
  nav_active: number;
  menu_active: number;
  footer_active: number;
  subscribe_form: number;
  settings: string;
  sections?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateCmsData {
  title?: string;
  description?: string;
  nav_active?: number;
  menu_active?: number;
  footer_active?: number;
  subscribe_form?: number;
  sections?: string;
}

export interface ContentRow {
  id: string;
  cms_id: string | null;
  category_id: string | null;
  profile_id: string;
  user_id: string;
  media_id?: string | null;
  slug: string;
  title: string;
  content: string | null;
  excerpt: string | null;
  hero_image_url: string | null;
  cta_button_url: string | null;
  cta_button_text: string | null;
  additional_details: string;
  sections?: string;
  hide_default_sections?: number;
  published: number;
  hidden: number;
  collection_id: string | null;
  hide_author: number;
  image_ads: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContentData {
  cms_id: string;
  user_id: string;
  category_id?: string;
  media_id?: string;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  hero_image_url?: string;
  cta_button_url?: string;
  cta_button_text?: string;
  additional_details?: string;
  sections?: string;
  hide_default_sections?: number;
  published?: number;
  hidden?: number;
  collection_id?: string;
  hide_author?: number;
  image_ads?: string;
  ai_summary?: string;
}

export interface UpdateContentData {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  hero_image_url?: string;
  media_id?: string;
  cta_button_url?: string;
  cta_button_text?: string;
  additional_details?: string;
  sections?: string;
  hide_default_sections?: number;
  published?: number;
  hidden?: number;
  collection_id?: string;
  hide_author?: number;
  image_ads?: string;
  ai_summary?: string;
}

// ── Shop Items ─────────────────────────────────────────────────────────────────
export interface ShopItem {
  id: string;
  profile_id: string;
  user_id?: string | null;
  updated_by?: string | null;
  link_id?: string | null;
  affiliate_id?: string | null;
  item_type: string;
  category_id: string;
  shop_category_id?: string | null;
  parent_id?: string | null;
  collection_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  external_url?: string | null;
  sku?: string | null;
  unit_id?: string | null;
  hsn_sac_code?: string | null;
  media_id?: string | null;
  slider_id?: string | null;
  video_url?: string | null;
  video_media_id?: string | null;
  price: number;
  cost_price: number;
  compare_price?: number | null;
  default_mrp: number;
  discount_pct: number;
  currency: string;
  is_taxable: number;
  tax_inclusive: number;
  is_active: number;
  published: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
  track_inventory: number;
  sections?: string | null;
  hide_default_sections?: number;
  faq?: string | null;
  additional_details?: string | null;
  ai_summary?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
  seo_robots?: string | null;
  seo_block_indexing?: number;
  notes?: string | null;
  agent_notes?: string | null;
  archived?: number;
  archived_at?: number | null;
  avg_rating?: number;
  review_count?: number;
}

export interface CreateShopItemData {
  name: string;
  price: number;
  user_id?: string;
  updated_by?: string;
  link_id?: string;
  affiliate_id?: string;
  cost_price?: number;
  compare_price?: number;
  default_mrp?: number;
  discount_pct?: number;
  currency?: string;
  category_id?: string;
  shop_category_id?: string;
  parent_id?: string;
  collection_id?: string;
  unit_id?: string;
  item_type?: string;
  description?: string;
  external_url?: string;
  sku?: string;
  hsn_sac_code?: string;
  media_id?: string;
  slider_id?: string;
  video_url?: string;
  video_media_id?: string;
  is_taxable?: boolean;
  tax_inclusive?: boolean;
  track_inventory?: number;
  sections?: string;
  hide_default_sections?: number;
  faq?: string;
  additional_details?: string;
  ai_summary?: string;
  seo_title?: string;
  seo_description?: string;
  seo_og_image?: string;
  seo_robots?: string;
  seo_block_indexing?: number;
  notes?: string;
  agent_notes?: string;
}

export interface UpdateShopItemData {
  user_id?: string;
  updated_by?: string;
  name?: string;
  price?: number;
  link_id?: string;
  affiliate_id?: string;
  cost_price?: number;
  compare_price?: number;
  default_mrp?: number;
  discount_pct?: number;
  currency?: string;
  category_id?: string;
  shop_category_id?: string;
  parent_id?: string;
  collection_id?: string;
  unit_id?: string;
  description?: string;
  external_url?: string;
  sku?: string;
  hsn_sac_code?: string;
  media_id?: string;
  slider_id?: string;
  video_url?: string;
  video_media_id?: string;
  is_taxable?: boolean;
  tax_inclusive?: boolean;
  is_active?: boolean;
  track_inventory?: number;
  published?: number;
  sections?: string;
  hide_default_sections?: number;
  faq?: string;
  additional_details?: string;
  ai_summary?: string;
  seo_title?: string;
  seo_description?: string;
  seo_og_image?: string;
  seo_robots?: string;
  seo_block_indexing?: number;
  notes?: string;
  agent_notes?: string;
}

// ── Jobs ───────────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/commands/jobs.rs

export interface JobListingRow {
  id: string;
  profile_id: string;
  media_id: string | null;
  user_id: string;
  ai_summary: string | null;
  title: string;
  company: string;
  location: string;
  location_type: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  excerpt: string | null;
  description: string;
  requirements: string | null;
  slug: string;
  published: boolean;
  hidden: boolean;
  image_url: string | null;
  logo_url: string | null;
  additional_details: string | null;
  total_applicants: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  collection_id: string | null;
  form_settings: string | null;
}

export interface JobApplicationRow {
  id: string;
  job_id: string;
  profile_id: string;
  resume_url: string | null;
  resume_filename: string | null;
  resume_size_mb: number | null;
  resume_type: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  date_of_birth: string | null;
  country_of_residence: string | null;
  physical_location: string | null;
  timezone: string | null;
  weekly_availability: string | null;
  linkedin: string | null;
  leetcode: string | null;
  github: string | null;
  codechef: string | null;
  codeforces: string | null;
  summary: string | null;
  education: string | null;
  work_experience: string | null;
  projects: string | null;
  publications: string | null;
  certifications: string | null;
  awards: string | null;
  portfolio: string | null;
  other_links: string | null;
  skills: string | null;
  terms_accepted: number;
  resume_updated: number;
  status: string;
  stage: string;
  decision: string | null;
  decided_at: number | null;
  decision_note: string | null;
  duration_ms: number | null;
  cf_country: string | null;
  cf_city: string | null;
  os: string | null;
  device: string | null;
  browser: string | null;
  ip_address: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobData {
  user_id: string;
  title: string;
  company: string;
  location: string;
  location_type: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string;
  requirements: string | null;
  slug: string;
  published: boolean;
  excerpt: string | null;
  image_url: string | null;
  additional_details: string | null;
  expires_at: string | null;
}

export interface UpdateJobData {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  location_type?: string | null;
  employment_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  description?: string | null;
  requirements?: string | null;
  slug?: string | null;
  published?: boolean | null;
  excerpt?: string | null;
  image_url?: string | null;
  additional_details?: string | null;
  expires_at?: string | null;
}

// ── Forms ───────────────────────────────────────────────────────────────────────
// Matches: src-tauri/src/commands/forms.rs

export interface FormRow {
  id: string;
  profile_id: string;
  title: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  background: string | null;
  layout: string;                // classic | card | conversational | minimal
  published: boolean;
  hidden: boolean;
  email_notification: boolean;
  accepting_responses: boolean;
  thank_you_settings: string | null;  // JSON string
  collection_id: string | null;
  created_at: string;
  updated_at: string;
  submission_count: number;
}

export interface QuestionRow {
  id: string;
  form_id: string;
  question_type: string;         // short_text | email | number | single_select | …
  title: string;
  label: string | null;
  description: string | null;
  position: number;
  options: string;               // JSON []
  required: boolean;
  placeholder: string | null;
  button_text: string | null;
  image_url: string | null;
  embed_url: string | null;
  settings: string | null;       // JSON extra settings
  ai_follow_up: string | null;   // JSON AI follow-up config
}

export interface SubmissionRow {
  id: string;
  form_id: string;
  answers: string;               // JSON { question_id: answer }
  status: string;                // viewed | partial | submitted
  device: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface FormAnalyticsRow {
  id: string;
  form_id: string;
  views: number;
  visits: number;
  starts: number;
  partials: number;
  submissions: number;
  avg_completion_ms: number;
  trends_7d: string;             // JSON [0,0,0,0,0,0,0]
  trends_30d: string;
  trends_12m: string;
  device: string;                // JSON breakdown {}
  country: string;
  updated_at: string;
}

export interface CreateFormData {
  title: string;
  slug: string;
  description?: string | null;
  layout?: string | null;
}

export interface UpdateFormData {
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  layout?: string | null;
  background?: string | null;
  image_url?: string | null;
  email_notification?: boolean | null;
  accepting_responses?: boolean | null;
  published?: boolean | null;
  hidden?: boolean | null;
  thank_you_settings?: string | null;
  collection_id?: string | null;
}

export interface QuestionData {
  id?: string | null;
  question_type: string;
  title: string;
  label?: string | null;
  description?: string | null;
  position: number;
  options?: string | null;       // JSON []
  required?: boolean | null;
  placeholder?: string | null;
  button_text?: string | null;
  image_url?: string | null;
  settings?: string | null;
  embed_url?: string | null;
}

// ── Community ─────────────────────────────────────────────────────────────────

export interface CommunityRow {
  id: string;
  profile_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  cover_image: string | null;
  is_private: boolean;
  requires_approval: boolean;
  member_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityMemberRow {
  id: string;
  community_id: string;
  profile_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  points: number;
  post_count: number;
  joined_at: string;
}

export interface CommunityPostRow {
  id: string;
  community_id: string;
  profile_id: string;
  member_id: string | null;
  category_id: string | null;
  title: string;
  body: string | null;
  media_urls: string;
  post_type: string;
  status: string;
  is_pinned: boolean;
  reaction_count: number;
  comment_count: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardRow {
  id: string;
  community_id: string;
  member_id: string;
  display_name: string | null;
  avatar_url: string | null;
  points: number;
  rank: number;
  post_count: number;
  comment_count: number;
  updated_at: string;
}

export interface CommunityEventRow {
  id: string;
  community_id: string;
  profile_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_online: boolean;
  meeting_url: string | null;
  rsvp_count: number;
  created_at: string;
}

export interface CommunityAnalyticsRow {
  id: string;
  community_id: string;
  profile_id: string;
  total_members: number;
  active_members_7d: number;
  active_members_30d: number;
  paid_members: number;
  free_members: number;
  churned_members: number;
  pending_members: number;
  total_posts: number;
  total_comments: number;
  total_reactions: number;
  total_lessons: number;
  total_lesson_completions: number;
  total_revenue_cents: number;
  mrr_cents: number;
  arr_cents: number;
  avg_posts_per_member: number;
  avg_comments_per_post: number;
  avg_completion_rate_pct: number;
  bot_views: number;
  total_views: number;
  online_count: number;
  updated_at: number;
}

export interface CommunityCategoryRow {
  id: string;
  community_id: string;
  profile_id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  allow_member_posts: boolean;
  color: string | null;
  post_count: number;
}

// ── CRM (Phase 3) ─────────────────────────────────────────────────────────────

export interface ContactRow {
  id: string;
  profile_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  company: string | null;
  job_title: string | null;
  website: string | null;
  contact_type: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  platform: string | null;
  platform_username: string | null;
  platform_url: string | null;
  social_links: string;
  bio: string | null;
  pain_point: string | null;
  lead_score: number;
  icp_match: string;
  urgency: string;
  buying_intent: string;
  outreach_status: string;
  outreach_attempts: number;
  next_follow_up_at: number | null;
  next_action: string | null;
  status: string;
  source: string | null;
  tags: string;
  custom_fields: string;
  notes: string | null;
  agent_notes?: string | null;
  groups: string;
  total_spent_cents: number;
  total_purchases: number;
  agent_status: string;
  archived: boolean;
  archived_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateContactData {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  company?: string | null;
  job_title?: string | null;
  website?: string | null;
  contact_type?: string | null;
  city?: string | null;
  country?: string | null;
  platform?: string | null;
  platform_username?: string | null;
  platform_url?: string | null;
  social_links?: string | null;
  bio?: string | null;
  source?: string | null;
  tags?: string | null;
  notes?: string | null;
  agent_notes?: string | null;
  message?: string | null;
}

export interface UpdateContactData {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  website?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  country?: string | null;
  status?: string | null;
  outreach_status?: string | null;
  next_follow_up_at?: number | null;
  next_action?: string | null;
  tags?: string | null;
  notes?: string | null;
  agent_notes?: string | null;
  lead_score?: number | null;
  icp_match?: string | null;
  urgency?: string | null;
  pain_point?: string | null;
  agent_status?: string | null;
}

export interface ListContactsOpts {
  status?: string | null;
  outreach_status?: string | null;
  agent_status?: string | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface DealRow {
  id: string;
  profile_id: string;
  contact_id: string;
  title: string;
  value_cents: number;
  currency: string;
  stage: string;
  probability: number;
  expected_close_at: number | null;
  closed_at: number | null;
  lost_reason: string | null;
  notes: string | null;
  agent_notes?: string | null;
  product_id: string | null;
  line_items: string;
  created_at: number;
  updated_at: number;
}

export interface CreateDealData {
  contact_id: string;
  title: string;
  value_cents?: number | null;
  currency?: string | null;
  stage?: string | null;
  probability?: number | null;
  expected_close_at?: number | null;
  product_id?: string | null;
  notes?: string | null;
  agent_notes?: string | null;
}

export interface ActivityRow {
  id: string;
  profile_id: string;
  contact_id: string;
  deal_id: string | null;
  activity_type: string;
  direction: string;
  sender: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  metadata: string;
  approval_status: string | null;
  read_at: number | null;
  occurred_at: number;
  created_at: number;
  idempotency_key: string | null;
}

export interface LogActivityData {
  contact_id: string;
  deal_id?: string | null;
  activity_type: string;
  direction?: string | null;
  sender?: string | null;
  subject?: string | null;
  body?: string | null;
  outcome?: string | null;
  metadata?: string | null;
  approval_status?: string | null;
  occurred_at?: number | null;
  idempotency_key?: string | null;
}

export interface TaskRow {
  id: string;
  profile_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  due_at: number | null;
  priority: string;
  status: string;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateTaskData {
  contact_id?: string | null;
  deal_id?: string | null;
  title: string;
  description?: string | null;
  due_at?: number | null;
  priority?: string | null;
  idempotency_key?: string | null;
}

export interface NoteRow {
  id: string;
  profile_id: string;
  contact_id: string;
  deal_id: string | null;
  body: string;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface GroupRow {
  id: string;
  profile_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  contact_count: number;
  created_at: number;
}

export interface TemplateRow {
  id: string;
  profile_id: string;
  name: string;
  template_type: string;
  subject: string | null;
  body: string;
  platform: string | null;
  tags: string;
  use_count: number;
  reply_rate_pct: number;
  created_at: number;
  updated_at: number;
}

export interface CreateTemplateData {
  name: string;
  template_type: string;
  subject?: string | null;
  body: string;
  platform?: string | null;
  tags?: string | null;
}

// ── Visual Builder Types ────────────────────────────────────────────────────────
export interface SectionBlock {
  id: string;
  type: string;
  enabled: boolean;
  order?: number;
  component_id?: string;
  data: any;
}

export interface CustomComponentData {
  html: string;
  css: string;
  schema: string;
}

export interface HomeCategorySection {
  category: any;
  heading?: string;
  description?: string;
  links?: any[];
}

export type PageSettingsLinkItem = any;


export interface PageContentBlock {
  sectionOrder: string[];
  textField: string | null;
  heroSlider: any[];
  introSection: any | null;
  featuredSection: any | null;
  heroSection: any | null;
  curriculum: any | null;
  peopleSection: any | null;
  aboutSection: any | null;
  ctaSection: any | null;
  testimonials: any | null;
  pricing: any | null;
  faq: any | null;
}

// ── Shop CRM, Loyalty, Hospitality & Billing Types ─────────────────────────────

export interface ShopCustomer {
  id: string;
  contact_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  dl_no?: string | null;
  billing_addr?: string | null;
  city?: string | null;
  state?: string | null;
  credit_limit: number;
  credit_used: number;
  wallet_balance: number;
  loyalty_pts: number;
  loyalty_pts_expiring_at?: number | null;
  total_orders: number;
  total_spent: number;
  notes?: string | null;
  agent_notes?: string | null;
  tags?: string | null;
  collect_taxes: number;
  accepts_email_marketing: number;
  accepts_sms_marketing: number;
  accepts_whatsapp_marketing: number;
  date_of_birth?: string | null;
  anniversary?: string | null;
  addresses?: string | null;
  gst_supply_type?: string | null;
  is_active: number;
  created_at: number;
}

export interface CreditLedgerEntry {
  id: string;
  customer_id: string;
  entry_type: string; // 'issuance' | 'redemption' | 'topup' | 'redeem' | 'refund' | 'adjustment'
  amount: number;
  balance_after: number;
  document_id?: string | null;
  payment_id?: string | null;
  notes?: string | null;
  created_at: number;
}

export interface TopupWalletData {
  customer_id: string;
  amount: number;
  payment_mode?: string | null;
  notes?: string | null;
}

export interface RedeemWalletData {
  customer_id: string;
  amount: number;
  document_id?: string | null;
  notes?: string | null;
}

export interface RedeemLoyaltyPointsData {
  customer_id: string;
  document_id: string;
  points_to_redeem: number;
}

export interface CampaignAudienceFilter {
  group_id?: string | null;
  channel?: string | null; // 'email' | 'sms' | 'whatsapp'
  min_loyalty_pts?: number | null;
  min_spent?: number | null;
  birthday_month_day?: string | null; // 'MM-DD'
  anniversary_month_day?: string | null;
}

export interface CrmCampaign {
  id: string;
  profile_id: string;
  name: string;
  template_id: string;
  channel: string; // 'email' | 'sms' | 'whatsapp'
  audience_filter: string;
  status: string; // 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  scheduled_at?: number | null;
  sent_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateCampaignData {
  name: string;
  template_id: string;
  channel: string;
  audience_filter?: string | null;
  scheduled_at?: number | null;
}

export interface AdjustCreditData {
  customer_id: string;
  delta_amount: number;
  entry_type?: string | null;
  document_id?: string | null;
  notes?: string | null;
}

export interface LoyaltyLedgerEntry {
  id: string;
  customer_id: string;
  entry_type: string; // 'earn' | 'redeem' | 'expire' | 'adjust'
  points: number;
  balance_after: number;
  document_id?: string | null;
  reason?: string | null;
  expires_at?: number | null;
  created_at: number;
}

export interface AdjustLoyaltyData {
  customer_id: string;
  points_delta: number;
  entry_type?: string | null;
  document_id?: string | null;
  reason?: string | null;
  expires_at?: number | null;
}

export interface LoyaltyConfig {
  profile_id: string;
  is_enabled: number;
  points_per_currency: number;
  point_value_currency: number;
  min_order_amount: number;
  max_redeem_percent: number;
  expiry_days: number;
}

export interface UpdateLoyaltyConfigData {
  is_enabled?: number | null;
  points_per_currency?: number | null;
  point_value_currency?: number | null;
  min_order_amount?: number | null;
  max_redeem_percent?: number | null;
  expiry_days?: number | null;
}

export interface ShopTable {
  id: string;
  profile_id: string;
  location_type: string; // 'table' | 'room' | 'counter'
  name: string;
  number?: string | null;
  floor?: string | null;
  capacity: number;
  base_rate: number;
  amenities: string;
  rate_overrides: string;
  booking_rules: string;
  status: string; // 'available' | 'occupied' | 'reserved' | 'maintenance'
  is_active: number;
  sort_order: number;
}

export interface CreateTableData {
  name: string;
  number?: string | null;
  floor?: string | null;
  capacity?: number | null;
  base_rate?: number | null;
  amenities?: string[] | null;
  rate_overrides?: string | null;
  booking_rules?: string | null;
}

export interface ShopReservation {
  id: string;
  profile_id: string;
  item_id: string;
  item_type: string;
  location_id?: string | null;
  staff_id?: string | null;
  order_id?: string | null;
  document_id?: string | null;
  customer_id?: string | null;
  source_channel: string; // 'direct' | 'walk_in' | 'zomato' | 'eazydiner' | 'airbnb'
  status: string; // 'hold' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
  slot_start: number;
  slot_end: number;
  party_size: number;
  notes?: string | null;
  meta: string;
  confirmed_at?: number | null;
  created_at: number;
}

export interface CreateReservationData {
  item_id: string;
  location_id?: string | null;
  staff_id?: string | null;
  customer_id?: string | null;
  source_channel?: string | null;
  slot_start: number;
  slot_end: number;
  party_size?: number | null;
  notes?: string | null;
  meta?: string | null;
}

export interface StayRoom {
  id: string;
  profile_id: string;
  location_type: string;
  name: string;
  number?: string | null;
  floor?: string | null;
  capacity: number;
  base_rate: number;
  amenities: string;
  rate_overrides?: string;
  booking_rules?: string;
  status: string;
  is_active: number;
  sort_order: number;
  image_url?: string | null;
}

export interface CreateRoomData {
  name: string;
  number?: string | null;
  floor?: string | null;
  capacity?: number | null;
  base_rate?: number | null;
  amenities?: string[] | null;
  rate_overrides?: string | null;
  booking_rules?: string | null;
}

export interface NightlyRateBreakdown {
  date: string;
  rate: number;
  is_override: boolean;
}

export interface StayPricingCalculation {
  location_id: string;
  room_name: string;
  base_rate: number;
  slot_start: number;
  slot_end: number;
  nights: number;
  nightly_rates: NightlyRateBreakdown[];
  total_room_charge: number;
}

export interface BookingRulesConfig {
  min_nights?: number | null;
  max_nights?: number | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  house_rules?: string | null;
}

export interface UpdateRateCalendarData {
  location_id: string;
  rate_overrides: Record<string, number>;
}

export interface UpdateBookingRulesData {
  location_id: string;
  rules: BookingRulesConfig;
}

export interface StayReservation {
  id: string;
  profile_id: string;
  item_id: string;
  item_type: string;
  location_id?: string | null;
  room_name?: string | null;
  staff_id?: string | null;
  order_id?: string | null;
  document_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  source_channel?: string;
  external_booking_id?: string | null;
  status: string;
  slot_start: number;
  slot_end: number;
  party_size: number;
  notes?: string | null;
  meta?: string;
  confirmed_at?: number | null;
  created_at: number;
}

export interface CreateStayReservationData {
  item_id?: string | null;
  location_id?: string | null;
  staff_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  source_channel?: string | null;
  slot_start: number;
  slot_end: number;
  party_size?: number | null;
  notes?: string | null;
  meta?: string | null;
}

export interface ShopInvoice {
  id: string;
  profile_id: string;
  user_id?: string | null;
  updated_by?: string | null;
  doc_number: string;
  doc_date: number;
  status: string;
  channel: string;
  service_mode?: string | null;
  subtotal: number;
  discount_amt: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  profit: number;
  notes?: string | null;
  created_at: number;
  updated_at: number;
  customer_name?: string | null;
  payment_mode?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_gstin?: string | null;
  customer_pan?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_dl_no?: string | null;
  customer_gst_supply_type?: string | null;
  customer_country?: string | null;
}

export interface ShopReview {
  id: string;
  profile_id: string;
  contact_id?: string | null;
  contact_name?: string | null;
  document_id?: string | null;
  reservation_id?: string | null;
  item_id?: string | null;
  item_name?: string | null;
  variant_id?: string | null;
  direction: "guest_to_host" | "host_to_guest" | string;
  rating?: number | null;
  title?: string | null;
  review_text?: string | null;
  is_verified_purchase: number;
  is_published: number;
  response_text?: string | null;
  responded_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateReviewData {
  contact_id?: string | null;
  document_id?: string | null;
  reservation_id?: string | null;
  item_id?: string | null;
  variant_id?: string | null;
  direction?: string | null;
  rating?: number | null;
  title?: string | null;
  review_text?: string | null;
  is_published?: number | null;
}

export interface ListReviewsFilter {
  item_id?: string | null;
  document_id?: string | null;
  reservation_id?: string | null;
  contact_id?: string | null;
  direction?: string | null;
  is_published?: number | null;
  min_rating?: number | null;
  limit?: number | null;
}

export interface AggregatorOrderItem {
  item_id?: string | null;
  item_name: string;
  qty: number;
  unit_price: number;
  discount_pct?: number | null;
  notes?: string | null;
}

export interface AggregatorOrderPayload {
  aggregator: "zomato" | "swiggy" | "doordash" | "ubereats" | string;
  order_id: string;
  service_mode?: "delivery" | "takeaway" | string;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  items: AggregatorOrderItem[];
  subtotal: number;
  discount_amt?: number | null;
  tax_amount?: number | null;
  delivery_fee?: number | null;
  grand_total: number;
  notes?: string | null;
}

export interface AggregatorOrderResult {
  invoice_id: string;
  doc_number: string;
  channel: string;
  service_mode: string;
  grand_total: number;
  is_duplicate: boolean;
}

export interface IcalSyncResult {
  total_events: number;
  created_count: number;
  updated_count: number;
  cancelled_count: number;
  conflict_count: number;
}

export interface SyncOtaIcalData {
  location_id: string;
  service?: "airbnb_ics" | "booking_com_ics" | "vrbo_ics" | string;
  ical_url?: string | null;
  ical_content?: string | null;
}

export interface ServiceModeSegment {
  service_mode: string;
  orders_count: number;
  revenue: number;
  percentage: number;
}

export interface DailyServiceModeAnalytics {
  snapshot_date: number;
  total_orders: number;
  total_revenue: number;
  segments: ServiceModeSegment[];
}

// ── In-App Agent Chat & Brand Foundation ─────────────────────────────────────
export interface ChatSession {
  id: string;
  profile_id: string;
  user_id?: string | null;
  staff_id?: string | null;
  title: string;
  model?: string | null;
  provider?: string | null;
  mode?: "hosted" | "cli" | "pty" | string | null;
  domain?: string | null;
  cli_resume_ref?: string | null;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost?: number;
  message_count?: number;
  tool_call_count?: number;
  last_message_preview?: string | null;
  is_pinned?: boolean | number;
  is_saved?: boolean | number;
  created_at: number;
  updated_at: number;
}

export interface AgentCommand {
  id: string;
  profileId: string;
  name: string;
  slash: string;
  description?: string | null;
  promptTemplate?: string | null;
  domainTags: string[];
  requiredTools: string[];
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentCommandPayload {
  name: string;
  slash: string;
  description?: string;
  promptTemplate?: string;
  domainTags: string[];
  requiredTools?: string[];
}

export interface AgentToolCatalogItem {
  name: string;
  domain: string;
  description: string;
  jsonChars: number;
  tokenEstimate: number;
}

export interface AgentAnalytics {
  id: string;
  profileId: string;
  totalSessions: number;
  totalMessages: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  sessions7d: number[];
  sessions30d: number[];
  sessions12m: number[];
  sessionsLifetime: Record<string, number>;
  cost7d: number[];
  cost30d: number[];
  cost12m: number[];
  costLifetime: Record<string, number>;
  tokens7d: number[];
  tokens30d: number[];
  tokens12m: number[];
  tokensLifetime: Record<string, number>;
  modelBreakdown: Record<string, { sessions: number; tokens: number; cost: number }>;
  providerBreakdown: Record<string, { sessions: number; tokens: number; cost: number }>;
  toolBreakdown: Record<string, number>;
  staffBreakdown: Record<string, { sessions: number; messages: number; tokens: number; cost: number }>;
  lastAggregatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls_json: string | null;
  created_at: number;
}

export interface BrandFoundation {
  profile_id: string;
  about_me: string | null;
  brand_voice: string | null;
  working_style: string | null;
  business_goals: string | null;
  created_at: number;
  updated_at: number;
}

export interface SaveBrandFoundationData {
  about_me?: string;
  brand_voice?: string;
  working_style?: string;
  business_goals?: string;
}

export interface AttachmentPayload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface ChatTokenPayload {
  request_id: string;
  session_id: string;
  token: string;
}

export interface ChatToolCallPayload {
  request_id: string;
  session_id: string;
  tool_name: string;
  tool_id: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "executing" | "completed" | "failed";
}

export interface ChatDonePayload {
  request_id: string;
  session_id: string;
  content: string;
  tool_results: Array<{ tool: string; id: string; result: unknown }>;
}

export interface ChatErrorPayload {
  request_id: string;
  session_id: string;
  error: string;
}

