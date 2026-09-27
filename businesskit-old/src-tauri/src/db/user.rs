// src-tauri/src/db/user.rs
// UserDB client — per-project Turso connection via HTTP API (TursoConn).
// Credentials come from OS keychain (loaded from Central DB on first connect).
// Uses the same reqwest-based HTTP shim as CentralDB — no TLS root CA issues on iOS.

use anyhow::{anyhow, Result};
use crate::db::turso::TursoConn;
use serde::{Deserialize, Serialize};

pub struct UserDb {
    conn: TursoConn,
    pub turso_url: String,
}

impl Clone for UserDb {
    fn clone(&self) -> Self {
        Self {
            conn: self.conn.clone(),
            turso_url: self.turso_url.clone(),
        }
    }
}

impl UserDb {
    /// Connect to user's Turso database via HTTP API (no TLS root CA issues on iOS).
    pub async fn connect(turso_url: &str, turso_token: &str) -> Result<Self> {
        let url = crate::db::turso::normalize_turso_url(turso_url);
        Ok(Self {
            conn: TursoConn::new(&url, turso_token),
            turso_url: url,
        })
    }

    pub fn conn(&self) -> Result<TursoConn> {
        Ok(self.conn.clone())
    }

    // ── Link Pages (Category SEO) ───────────────────────────────────────────────

    pub async fn get_link_page(
        &self,
        profile_id: &str,
        category_slug: &str,
    ) -> Result<Option<LinkPageRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, category_id, category_slug, seo_title, seo_description,
                        seo_og_image, seo_robots, seo_block_indexing
                 FROM link_pages WHERE profile_id = ?1 AND category_slug = ?2",
                crate::turso_params![profile_id, category_slug],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(LinkPageRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                category_id: row.get(2)?,
                category_slug: row.get(3)?,
                seo_title: row.get(4)?,
                seo_description: row.get(5)?,
                seo_og_image: row.get(6)?,
                seo_robots: row.get(7)?,
                seo_block_indexing: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn upsert_link_page(&self, data: &UpsertLinkPageData) -> Result<LinkPageRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn()?;

        let mut cat_id = data.category_id.clone();
        if cat_id.is_none() {
            let mut rows = conn
                .query(
                    "SELECT id FROM categories WHERE slug = ?1",
                    crate::turso_params![data.category_slug.clone()],
                )
                .await?;
            if let Some(r) = rows.next().await? {
                cat_id = Some(r.get::<String>(0)?);
            }
        }

        conn.execute(
            "INSERT INTO link_pages
               (id, profile_id, category_id, category_slug, seo_title, seo_description, seo_og_image, seo_robots, seo_block_indexing)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(profile_id, category_slug) DO UPDATE SET
               category_id = COALESCE(excluded.category_id, link_pages.category_id),
               seo_title = excluded.seo_title,
               seo_description = excluded.seo_description,
               seo_og_image = excluded.seo_og_image,
               seo_robots = excluded.seo_robots,
               seo_block_indexing = excluded.seo_block_indexing,
               updated_at = (strftime('%s','now'))",
            crate::turso_params![
                id,
                data.profile_id.clone(),
                cat_id,
                data.category_slug.clone(),
                data.seo_title.clone(),
                data.seo_description.clone(),
                data.seo_og_image.clone(),
                data.seo_robots.clone(),
                data.seo_block_indexing.unwrap_or(0),
            ],
        )
        .await?;

        let row = self
            .get_link_page(&data.profile_id, &data.category_slug)
            .await?;
        row.ok_or_else(|| anyhow!("Failed to retrieve link_page after upsert"))
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    pub async fn get_profile(&self, profile_id: &str) -> Result<ProfileRow> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, user_id, slug, title, bio, avatar_url, navigation_menu,
                        footer_menu, enabled_categories, home_visibility, category_visibility,
                        profile_theme, collect_emails, social_links, about,
                        cover_images, support_email, is_primary, welcome_video_url, form_id,
                        about_visibility, landing_visibility, info_visibility, home_page
                 FROM profiles WHERE id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(ProfileRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                slug: row.get(2)?,
                title: row.get(3)?,
                bio: row.get(4)?,
                avatar_url: row.get(5)?,
                navigation_menu: row.get(6)?,
                footer_menu: row.get(7)?,
                enabled_categories: row.get(8)?,
                home_visibility: row.get(9)?,
                category_visibility: row.get(10)?,
                profile_theme: row.get(11)?,
                collect_emails: row.get(12)?,
                social_links: row.get(13)?,
                about: row.get(14)?,
                cover_images: row.get(15)?,
                support_email: row.get(16)?,
                is_primary: row.get::<i64>(17)? != 0,
                welcome_video_url: row.get(18)?,
                form_id: row.get(19)?,
                about_visibility: row.get(20)?,
                landing_visibility: row.get(21)?,
                info_visibility: row.get(22)?,
                home_page: row.get(23)?,
            })
        } else {
            Err(anyhow!("Profile not found: {}", profile_id))
        }
    }

    pub async fn update_profile(&self, profile_id: &str, data: &UpdateProfileData) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE profiles SET
               slug = COALESCE(?1, slug),
               title = COALESCE(?2, title),
               bio = COALESCE(?3, bio),
               avatar_url = COALESCE(?4, avatar_url),
               navigation_menu = COALESCE(?5, navigation_menu),
               social_links = COALESCE(?6, social_links),
               about = COALESCE(?7, about),
               support_email = COALESCE(?8, support_email),
               enabled_categories = COALESCE(?9, enabled_categories),
               home_visibility = COALESCE(?10, home_visibility),
               category_visibility = COALESCE(?11, category_visibility),
               about_visibility = COALESCE(?12, about_visibility),
               landing_visibility = COALESCE(?13, landing_visibility),
               info_visibility = COALESCE(?14, info_visibility),
               home_page = COALESCE(?15, home_page),
               updated_at = unixepoch()
             WHERE id = ?16",
            crate::turso_params![
                data.slug.clone(),
                data.title.clone(),
                data.bio.clone(),
                data.avatar_url.clone(),
                data.navigation_menu.clone(),
                data.social_links.clone(),
                data.about.clone(),
                data.support_email.clone(),
                data.enabled_categories.clone(),
                data.home_visibility.clone(),
                data.category_visibility.clone(),
                data.about_visibility.clone(),
                data.landing_visibility.clone(),
                data.info_visibility.clone(),
                data.home_page.clone(),
                profile_id
            ],
        )
        .await?;
        Ok(())
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    pub async fn get_settings(&self, profile_id: &str) -> Result<Option<SettingsRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, site_title, tagline, site_description,
                        logo_url, favicon, og_title, og_description, og_image,
                        canonical_url, robots, timezone, location, industry,
                        theme, language
                 FROM settings WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(SettingsRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                site_title: row.get(2)?,
                tagline: row.get(3)?,
                site_description: row.get(4)?,
                logo_url: row.get(5)?,
                favicon: row.get(6)?,
                og_title: row.get(7)?,
                og_description: row.get(8)?,
                og_image: row.get(9)?,
                canonical_url: row.get(10)?,
                robots: row.get(11)?,
                timezone: row.get(12)?,
                location: row.get(13)?,
                industry: row.get(14)?,
                theme: row.get(15)?,
                language: row.get(16)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn upsert_settings(&self, data: &UpsertSettingsData) -> Result<SettingsRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO settings
               (id, profile_id, site_title, tagline, site_description, logo_url, favicon,
                og_title, og_description, og_image, canonical_url, robots,
                timezone, location, industry, theme, language,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
                     unixepoch(), unixepoch())
             ON CONFLICT(profile_id) DO UPDATE SET
               site_title      = COALESCE(?3,  site_title),
               tagline         = COALESCE(?4,  tagline),
               site_description= COALESCE(?5,  site_description),
               logo_url        = COALESCE(?6,  logo_url),
               favicon         = COALESCE(?7,  favicon),
               og_title        = COALESCE(?8,  og_title),
               og_description  = COALESCE(?9,  og_description),
               og_image        = COALESCE(?10, og_image),
               canonical_url   = COALESCE(?11, canonical_url),
               robots          = COALESCE(?12, robots),
               timezone        = COALESCE(?13, timezone),
               location        = COALESCE(?14, location),
               industry        = COALESCE(?15, industry),
               theme           = COALESCE(?16, theme),
               language        = COALESCE(?17, language),
               updated_at      = unixepoch()",
            crate::turso_params![
                id,
                data.profile_id.clone(),
                data.site_title.clone(),
                data.tagline.clone(),
                data.site_description.clone(),
                data.logo_url.clone(),
                data.favicon.clone(),
                data.og_title.clone(),
                data.og_description.clone(),
                data.og_image.clone(),
                data.canonical_url.clone(),
                data.robots.clone(),
                data.timezone.clone(),
                data.location.clone(),
                data.industry.clone(),
                data.theme.clone(),
                data.language.clone()
            ],
        )
        .await?;
        Ok(self.get_settings(&data.profile_id).await?.unwrap())
    }

    // ── Products ──────────────────────────────────────────────────────────────

    pub async fn get_products(
        &self,
        profile_id: &str,
        product_type: Option<&str>,
    ) -> Result<Vec<ProductRow>> {
        let conn = self.conn()?;
        let mut rows = if let Some(t) = product_type {
            conn.query(
                "SELECT id, profile_id, user_id, type, title, slug, excerpt, description,
                        price_cents, sale_price_cents, currency, published, thumbnail_url,
                        hero_image_url, visibility, tags, category_id, collection_id,
                        is_featured, order_index, sections, hide_default_sections, created_at, updated_at, published_at,
                        media_id, slider_id, seo_og_image
                 FROM products WHERE profile_id = ?1 AND type = ?2
                 ORDER BY order_index ASC, created_at DESC",
                crate::turso_params![profile_id, t],
            )
            .await?
        } else {
            conn.query(
                "SELECT id, profile_id, user_id, type, title, slug, excerpt, description,
                        price_cents, sale_price_cents, currency, published, thumbnail_url,
                        hero_image_url, visibility, tags, category_id, collection_id,
                        is_featured, order_index, sections, hide_default_sections, created_at, updated_at, published_at,
                        media_id, slider_id, seo_og_image
                 FROM products WHERE profile_id = ?1
                 ORDER BY order_index ASC, created_at DESC",
                crate::turso_params![profile_id],
            )
            .await?
        };

        let mut products = Vec::new();
        while let Some(row) = rows.next().await? {
            products.push(product_from_row(&row)?);
        }
        Ok(products)
    }

    pub async fn get_product(&self, product_id: &str) -> Result<ProductRow> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, user_id, type, title, slug, excerpt, description,
                        price_cents, sale_price_cents, currency, published, thumbnail_url,
                        hero_image_url, visibility, tags, category_id, collection_id,
                        is_featured, order_index, sections, hide_default_sections, created_at, updated_at, published_at,
                        media_id, slider_id, seo_og_image
                 FROM products WHERE id = ?1",
                crate::turso_params![product_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            product_from_row(&row)
        } else {
            Err(anyhow!("Product not found: {}", product_id))
        }
    }

    pub async fn create_product(&self, data: &CreateProductData) -> Result<ProductRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO products
               (id, profile_id, user_id, type, title, slug, excerpt, description,
                price_cents, sale_price_cents, currency, published, thumbnail_url,
                hero_image_url, visibility, tags, category_id, is_featured,
                order_index, sections, hide_default_sections, media_id, slider_id, seo_og_image, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,?12,?13,
                     COALESCE(?14,'published'),?15,?16,0,?17,?18,?19,?20,?21,?22, unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                data.profile_id.clone(),
                data.user_id.clone(),
                data.product_type.clone(),
                data.title.clone(),
                data.slug.clone(),
                data.excerpt.clone(),
                data.description.clone(),
                data.price_cents.unwrap_or(0),
                data.sale_price_cents,
                data.currency.clone().unwrap_or_else(|| "usd".to_string()),
                data.thumbnail_url.clone(),
                data.hero_image_url.clone(),
                data.visibility.clone(),
                data.tags.clone(),
                data.category_id.clone(),
                data.order_index.unwrap_or(0),
                data.sections.clone().unwrap_or_else(|| "[]".to_string()),
                data.hide_default_sections.map(|b| if b { 1i64 } else { 0i64 }).unwrap_or(0),
                data.media_id.clone(),
                data.slider_id.clone(),
                data.seo_og_image.clone()
            ],
        )
        .await?;
        self.get_product(&id).await
    }

    pub async fn update_product(
        &self,
        product_id: &str,
        data: &UpdateProductData,
    ) -> Result<ProductRow> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE products SET
               title          = COALESCE(?1,  title),
               slug           = COALESCE(?2,  slug),
               excerpt        = COALESCE(?3,  excerpt),
               description    = COALESCE(?4,  description),
               price_cents    = COALESCE(?5,  price_cents),
               sale_price_cents = COALESCE(?6, sale_price_cents),
               thumbnail_url  = COALESCE(?7,  thumbnail_url),
               hero_image_url = COALESCE(?8,  hero_image_url),
               published      = COALESCE(?9,  published),
               visibility     = COALESCE(?10, visibility),
               tags           = COALESCE(?11, tags),
               category_id    = COALESCE(?12, category_id),
               is_featured    = COALESCE(?13, is_featured),
               order_index    = COALESCE(?14, order_index),
               sections       = COALESCE(?15, sections),
               hide_default_sections = COALESCE(?16, hide_default_sections),
               media_id       = COALESCE(?17, media_id),
               slider_id      = COALESCE(?18, slider_id),
               seo_og_image   = COALESCE(?19, seo_og_image),
               updated_at     = unixepoch()
             WHERE id = ?20",
            crate::turso_params![
                data.title.clone(),
                data.slug.clone(),
                data.excerpt.clone(),
                data.description.clone(),
                data.price_cents,
                data.sale_price_cents,
                data.thumbnail_url.clone(),
                data.hero_image_url.clone(),
                data.published.map(|b| if b { 1i64 } else { 0i64 }),
                data.visibility.clone(),
                data.tags.clone(),
                data.category_id.clone(),
                data.is_featured.map(|b| if b { 1i64 } else { 0i64 }),
                data.order_index,
                data.sections.clone(),
                data.hide_default_sections.map(|b| if b { 1i64 } else { 0i64 }),
                data.media_id.clone(),
                data.slider_id.clone(),
                data.seo_og_image.clone(),
                product_id
            ],
        )
        .await?;
        self.get_product(product_id).await
    }

    // ── Analytics summary ─────────────────────────────────────────────────────

    pub async fn get_analytics_summary(&self, profile_id: &str) -> Result<AnalyticsSummary> {
        let conn = self.conn()?;

        // Profile-level analytics
        let mut rows = conn
            .query(
                "SELECT total_views, total_clicks, total_sales, total_earnings,
                    views_7d, views_30d, clicks_7d, clicks_30d
             FROM profile_analytics WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;

        let (
            total_views,
            total_clicks,
            total_sales,
            total_earnings,
            views_7d,
            views_30d,
            clicks_7d,
            clicks_30d,
        ) = if let Some(row) = rows.next().await? {
            (
                row.get::<i64>(0).unwrap_or(0),
                row.get::<i64>(1).unwrap_or(0),
                row.get::<i64>(2).unwrap_or(0),
                row.get::<i64>(3).unwrap_or(0),
                row.get::<Option<String>>(4).unwrap_or(None),
                row.get::<Option<String>>(5).unwrap_or(None),
                row.get::<Option<String>>(6).unwrap_or(None),
                row.get::<Option<String>>(7).unwrap_or(None),
            )
        } else {
            (0, 0, 0, 0, None, None, None, None)
        };

        // Link count
        let mut link_rows = conn
            .query(
                "SELECT COUNT(*) FROM links WHERE profile_id = ?1 AND is_active = 1",
                crate::turso_params![profile_id],
            )
            .await?;
        let active_links = if let Some(r) = link_rows.next().await? {
            r.get::<i64>(0).unwrap_or(0)
        } else {
            0
        };

        // Product count
        let mut prod_rows = conn
            .query(
                "SELECT COUNT(*) FROM products WHERE profile_id = ?1 AND published = 1",
                crate::turso_params![profile_id],
            )
            .await?;
        let active_products = if let Some(r) = prod_rows.next().await? {
            r.get::<i64>(0).unwrap_or(0)
        } else {
            0
        };

        Ok(AnalyticsSummary {
            profile_id: profile_id.to_string(),
            total_views,
            total_clicks,
            total_sales,
            total_earnings_cents: total_earnings,
            active_links,
            active_products,
            views_7d: views_7d.unwrap_or_else(|| "[]".to_string()),
            views_30d: views_30d.unwrap_or_else(|| "[]".to_string()),
            clicks_7d: clicks_7d.unwrap_or_else(|| "[]".to_string()),
            clicks_30d: clicks_30d.unwrap_or_else(|| "[]".to_string()),
        })
    }
}

// ── Row helpers ───────────────────────────────────────────────────────────────

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileRow {
    pub id: String,
    pub user_id: String,
    pub slug: String,
    pub title: String,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub navigation_menu: Option<String>,
    pub footer_menu: Option<String>,
    pub enabled_categories: Option<String>,
    pub home_visibility: Option<String>,
    pub category_visibility: Option<String>,
    pub profile_theme: Option<String>,
    pub collect_emails: Option<String>,
    pub social_links: Option<String>,
    pub about: Option<String>,
    pub cover_images: Option<String>,
    pub support_email: Option<String>,
    pub is_primary: bool,
    pub welcome_video_url: Option<String>,
    pub form_id: Option<String>,
    pub about_visibility: Option<String>,
    pub landing_visibility: Option<String>,
    pub info_visibility: Option<String>,
    pub home_page: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsRow {
    pub id: String,
    pub profile_id: String,
    pub site_title: Option<String>,
    pub tagline: Option<String>,
    pub site_description: Option<String>,
    pub logo_url: Option<String>,
    pub favicon: Option<String>,
    pub og_title: Option<String>,
    pub og_description: Option<String>,
    pub og_image: Option<String>,
    pub canonical_url: Option<String>,
    pub robots: Option<String>,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub industry: Option<String>,
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkPageRow {
    pub id: String,
    pub profile_id: String,
    pub category_id: Option<String>,
    pub category_slug: String,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProfileData {
    pub slug: Option<String>,
    pub title: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub navigation_menu: Option<String>,
    pub social_links: Option<String>,
    pub about: Option<String>,
    pub support_email: Option<String>,
    pub enabled_categories: Option<String>,
    pub home_visibility: Option<String>,
    pub category_visibility: Option<String>,
    pub about_visibility: Option<String>,
    pub landing_visibility: Option<String>,
    pub info_visibility: Option<String>,
    pub home_page: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLinkData {
    pub profile_id: String,
    pub category_id: String,
    pub title: String,
    pub url: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub order_index: Option<i64>,
    pub keywords: Option<String>,
    pub slug: Option<String>,
    pub platform_name: Option<String>,
    pub logo_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateLinkData {
    pub title: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub order_index: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertSettingsData {
    pub profile_id: String,
    pub site_title: Option<String>,
    pub tagline: Option<String>,
    pub site_description: Option<String>,
    pub logo_url: Option<String>,
    pub favicon: Option<String>,
    pub og_title: Option<String>,
    pub og_description: Option<String>,
    pub og_image: Option<String>,
    pub canonical_url: Option<String>,
    pub robots: Option<String>,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub industry: Option<String>,
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertLinkPageData {
    pub profile_id: String,
    pub category_id: Option<String>,
    pub category_slug: String,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductRow {
    pub id: String,
    pub profile_id: String,
    pub user_id: String,
    pub product_type: String,
    pub title: String,
    pub slug: Option<String>,
    pub excerpt: Option<String>,
    pub description: Option<String>,
    pub price_cents: i64,
    pub sale_price_cents: Option<i64>,
    pub currency: String,
    pub published: bool,
    pub thumbnail_url: Option<String>,
    pub hero_image_url: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub visibility: String,
    pub tags: Option<String>,
    pub category_id: Option<String>,
    pub collection_id: Option<String>,
    pub is_featured: bool,
    pub order_index: i64,
    pub sections: String,
    pub hide_default_sections: bool,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProductData {
    pub profile_id: String,
    pub user_id: String,
    pub product_type: String,
    pub title: String,
    pub slug: Option<String>,
    pub excerpt: Option<String>,
    pub description: Option<String>,
    pub price_cents: Option<i64>,
    pub sale_price_cents: Option<i64>,
    pub currency: Option<String>,
    pub thumbnail_url: Option<String>,
    pub hero_image_url: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub visibility: Option<String>,
    pub tags: Option<String>,
    pub category_id: Option<String>,
    pub order_index: Option<i64>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProductData {
    pub title: Option<String>,
    pub slug: Option<String>,
    pub excerpt: Option<String>,
    pub description: Option<String>,
    pub price_cents: Option<i64>,
    pub sale_price_cents: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub hero_image_url: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub published: Option<bool>,
    pub visibility: Option<String>,
    pub tags: Option<String>,
    pub category_id: Option<String>,
    pub is_featured: Option<bool>,
    pub order_index: Option<i64>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSummary {
    pub profile_id: String,
    pub total_views: i64,
    pub total_clicks: i64,
    pub total_sales: i64,
    pub total_earnings_cents: i64,
    pub active_links: i64,
    pub active_products: i64,
    pub views_7d: String, // JSON array
    pub views_30d: String,
    pub clicks_7d: String,
    pub clicks_30d: String,
}

fn product_from_row(row: &crate::db::turso::TursoRow) -> Result<ProductRow> {
    Ok(ProductRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        user_id: row.get(2)?,
        product_type: row.get(3)?,
        title: row.get(4)?,
        slug: row.get(5)?,
        excerpt: row.get(6)?,
        description: row.get(7)?,
        price_cents: row.get::<i64>(8).unwrap_or(0),
        sale_price_cents: row.get(9)?,
        currency: row.get::<String>(10).unwrap_or_else(|_| "usd".to_string()),
        published: row.get::<i64>(11).unwrap_or(1) != 0,
        thumbnail_url: row.get(12)?,
        hero_image_url: row.get(13)?,
        visibility: row
            .get::<String>(14)
            .unwrap_or_else(|_| "published".to_string()),
        tags: row.get(15)?,
        category_id: row.get(16)?,
        collection_id: row.get(17)?,
        is_featured: row.get::<i64>(18).unwrap_or(0) != 0,
        order_index: row.get::<i64>(19).unwrap_or(0),
        sections: row.get::<Option<String>>(20).unwrap_or(None).unwrap_or_else(|| "[]".to_string()),
        hide_default_sections: row.get::<i64>(21).unwrap_or(0) != 0,
        created_at: row.get(22)?,
        updated_at: row.get(23)?,
        published_at: row.get(24)?,
        media_id: row.get(25)?,
        slider_id: row.get(26)?,
        seo_og_image: row.get(27)?,
    })
}
