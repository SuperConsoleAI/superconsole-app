use super::user::UserDb;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

// ── Data Types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRecord {
    pub id: String,
    pub profile_id: String,
    pub media_id: Option<String>,
    pub user_id: String,
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub nav_active: bool,
    pub menu_active: bool,
    pub footer_active: bool,
    pub published: bool,
    pub sections: String,
    pub faq: Option<String>,
    pub ai_summary: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePageData {
    pub id: Option<String>,
    pub profile_id: String,
    pub media_id: Option<String>,
    pub user_id: String,
    pub title: String,
    pub slug: String,
    pub excerpt: Option<String>,
    pub sections: Option<String>,
    pub faq: Option<String>,
    pub published: Option<bool>,
    pub nav_active: Option<bool>,
    pub menu_active: Option<bool>,
    pub footer_active: Option<bool>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdatePageData {
    pub title: Option<String>,
    pub slug: Option<String>,
    pub media_id: Option<String>,
    pub excerpt: Option<String>,
    pub sections: Option<String>,
    pub faq: Option<String>,
    pub published: Option<bool>,
    pub nav_active: Option<bool>,
    pub menu_active: Option<bool>,
    pub footer_active: Option<bool>,
    pub ai_summary: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
}

// ── Row Helper ───────────────────────────────────────────────────────────────

pub fn page_from_row(row: &crate::db::turso::TursoRow) -> Result<PageRecord> {
    Ok(PageRecord {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        media_id: row.get(2)?,
        user_id: row.get(3)?,
        slug: row.get(4)?,
        title: row.get(5)?,
        excerpt: row.get(6)?,
        nav_active: row.get::<Option<i64>>(7)?.unwrap_or(1) != 0,
        menu_active: row.get::<Option<i64>>(8)?.unwrap_or(1) != 0,
        footer_active: row.get::<Option<i64>>(9)?.unwrap_or(1) != 0,
        published: row.get::<Option<i64>>(10)?.unwrap_or(0) != 0,
        sections: row
            .get::<Option<String>>(11)?
            .unwrap_or_else(|| "[]".to_string()),
        faq: row.get(12)?,
        ai_summary: row.get(13)?,
        seo_title: row.get(14)?,
        seo_description: row.get(15)?,
        seo_og_image: row.get(16)?,
        created_at: row.get::<Option<i64>>(17)?.unwrap_or(0),
        updated_at: row.get::<Option<i64>>(18)?.unwrap_or(0),
    })
}

// ── UserDb Impl ───────────────────────────────────────────────────────────────

impl UserDb {
    pub async fn get_pages(&self, profile_id: &str) -> Result<Vec<PageRecord>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, media_id, user_id, slug, title, excerpt, 
                        nav_active, menu_active, footer_active, published, sections, faq, ai_summary,
                        seo_title, seo_description, seo_og_image, created_at, updated_at
                 FROM pages
                 WHERE profile_id = ?1 ORDER BY updated_at DESC",
                crate::turso_params![profile_id.to_string()],
            )
            .await?;

        let mut pages = Vec::new();
        while let Some(row) = rows.next().await? {
            pages.push(page_from_row(&row)?);
        }
        Ok(pages)
    }

    pub async fn get_page(&self, profile_id: &str, id: &str) -> Result<PageRecord> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, media_id, user_id, slug, title, excerpt, 
                        nav_active, menu_active, footer_active, published, sections, faq, ai_summary,
                        seo_title, seo_description, seo_og_image, created_at, updated_at
                 FROM pages
                 WHERE id = ?1 OR (profile_id = ?2 AND id = ?1) LIMIT 1",
                crate::turso_params![id.to_string(), profile_id.to_string()],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            page_from_row(&row)
        } else {
            Err(anyhow::anyhow!("Page not found"))
        }
    }

    pub async fn get_page_by_slug(&self, profile_id: &str, slug: &str) -> Result<PageRecord> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, media_id, user_id, slug, title, excerpt, 
                        nav_active, menu_active, footer_active, published, sections, faq, ai_summary,
                        seo_title, seo_description, seo_og_image, created_at, updated_at
                 FROM pages
                 WHERE profile_id = ?1 AND slug = ?2 LIMIT 1",
                crate::turso_params![profile_id.to_string(), slug.to_string()],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            page_from_row(&row)
        } else {
            Err(anyhow::anyhow!("Page not found"))
        }
    }

    pub async fn create_page(&self, data: &CreatePageData) -> Result<PageRecord> {
        let id = data
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let conn = self.conn()?;

        conn.execute(
            "INSERT INTO pages
               (id, profile_id, media_id, user_id, slug, title, excerpt, sections, faq,
                published, nav_active, menu_active, footer_active,
                seo_title, seo_description, seo_og_image, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            crate::turso_params![
                id.clone(),
                data.profile_id.clone(),
                data.media_id.clone(),
                data.user_id.clone(),
                data.slug.clone(),
                data.title.clone(),
                data.excerpt.clone(),
                data.sections.clone().unwrap_or_else(|| "[]".to_string()),
                data.faq.clone().unwrap_or_else(|| "[]".to_string()),
                if data.published.unwrap_or(false) {
                    1
                } else {
                    0
                },
                if data.nav_active.unwrap_or(true) {
                    1
                } else {
                    0
                },
                if data.menu_active.unwrap_or(true) {
                    1
                } else {
                    0
                },
                if data.footer_active.unwrap_or(true) {
                    1
                } else {
                    0
                },
                data.seo_title.clone(),
                data.seo_description.clone(),
                data.seo_og_image.clone(),
                now,
                now
            ],
        )
        .await?;

        self.get_page(&data.profile_id, &id).await
    }

    pub async fn update_page(
        &self,
        profile_id: &str,
        id: &str,
        data: &UpdatePageData,
    ) -> Result<()> {
        let conn = self.conn()?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut updates = vec!["updated_at = ?".to_string()];
        let mut args: Vec<crate::db::turso::TursoParam> = vec![now.into()];

        if let Some(v) = &data.title {
            updates.push("title = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.slug {
            updates.push("slug = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.media_id {
            updates.push("media_id = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.excerpt {
            updates.push("excerpt = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.sections {
            updates.push("sections = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.faq {
            updates.push("faq = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.published {
            updates.push("published = ?".to_string());
            args.push(if *v { 1 } else { 0 }.into());
        }
        if let Some(v) = &data.nav_active {
            updates.push("nav_active = ?".to_string());
            args.push(if *v { 1 } else { 0 }.into());
        }
        if let Some(v) = &data.menu_active {
            updates.push("menu_active = ?".to_string());
            args.push(if *v { 1 } else { 0 }.into());
        }
        if let Some(v) = &data.footer_active {
            updates.push("footer_active = ?".to_string());
            args.push(if *v { 1 } else { 0 }.into());
        }
        if let Some(v) = &data.ai_summary {
            updates.push("ai_summary = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.seo_title {
            updates.push("seo_title = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.seo_description {
            updates.push("seo_description = ?".to_string());
            args.push(v.clone().into());
        }
        if let Some(v) = &data.seo_og_image {
            updates.push("seo_og_image = ?".to_string());
            args.push(v.clone().into());
        }

        args.push(profile_id.to_string().into());
        args.push(id.to_string().into());

        let sql = format!(
            "UPDATE pages SET {} WHERE profile_id = ? AND id = ?",
            updates.join(", ")
        );

        conn.execute(&sql, args).await?;
        Ok(())
    }

    pub async fn delete_page(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "DELETE FROM pages WHERE profile_id = ?1 AND id = ?2",
            crate::turso_params![profile_id.to_string(), id.to_string()],
        )
        .await?;
        Ok(())
    }
}
