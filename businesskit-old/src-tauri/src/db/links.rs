// src-tauri/src/db/links.rs
use super::user::UserDb;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

// ── Data Types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkRow {
    pub id: String,
    pub profile_id: String,
    pub category_id: String,
    pub title: String,
    pub url: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub order_index: Option<i64>,
    pub is_active: bool,
    pub keywords: Option<String>,
    pub hidden_from_profile: bool,
    pub sale_price: Option<String>,
    pub price: Option<String>,
    pub button_text: Option<String>,
    pub location: Option<String>,
    pub date: Option<String>,
    pub collection_name: Option<String>,
    pub slug: Option<String>,
    pub platform_name: Option<String>,
    pub logo_url: Option<String>,
    pub video_url: Option<String>,
    pub in_app: bool,
    pub category_slug: Option<String>,
    pub post_url: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLinkData {
    pub profile_id: String,
    pub category_id: String,
    pub title: String,
    pub url: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub logo_url: Option<String>,
    pub video_url: Option<String>,
    pub keywords: Option<String>,
    pub platform_name: Option<String>,
    pub slug: Option<String>,
    pub order_index: Option<i64>,
    pub post_url: Option<Vec<String>>,
    pub sale_price: Option<String>,
    pub price: Option<String>,
    pub button_text: Option<String>,
    pub location: Option<String>,
    pub date: Option<String>,
    pub collection_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateLinkData {
    pub title: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub logo_url: Option<String>,
    pub video_url: Option<String>,
    pub order_index: Option<i64>,
    pub is_active: Option<bool>,
    pub keywords: Option<String>,
    pub platform_name: Option<String>,
    pub slug: Option<String>,
    pub post_url: Option<Vec<String>>,
    pub sale_price: Option<String>,
    pub price: Option<String>,
    pub button_text: Option<String>,
    pub location: Option<String>,
    pub date: Option<String>,
    pub collection_name: Option<String>,
}

// ── Row Helper ───────────────────────────────────────────────────────────────

pub fn link_from_row(row: &crate::db::turso::TursoRow) -> Result<LinkRow> {
    Ok(LinkRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        category_id: row.get(2)?,
        title: row.get(3)?,
        url: row.get(4)?,
        description: row.get(5)?,
        image_url: row.get(6)?,
        order_index: row.get(7)?,
        // Use Option<i64> to gracefully handle NULLs in SQLite without crashing
        is_active: row.get::<Option<i64>>(8)?.unwrap_or(1) != 0,
        keywords: row.get(9)?,
        hidden_from_profile: row.get::<Option<i64>>(10)?.unwrap_or(0) != 0,
        sale_price: row.get(11)?,
        price: row.get(12)?,
        button_text: row.get(13)?,
        location: row.get(14)?,
        date: row.get(15)?,
        collection_name: row.get(16)?,
        slug: row.get(17)?,
        platform_name: row.get(18)?,
        logo_url: row.get(19)?,
        in_app: row.get::<Option<i64>>(20)?.unwrap_or(0) != 0,
        category_slug: row.get(21).unwrap_or(None),
        video_url: row.get(22)?,
        post_url: row
            .get::<Option<String>>(23)?
            .and_then(|s| serde_json::from_str(&s).ok()),
    })
}

// ── UserDb Impl ───────────────────────────────────────────────────────────────

impl UserDb {
    pub async fn get_links(&self, profile_id: &str) -> Result<Vec<LinkRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT l.id, l.profile_id, l.category_id, l.title, l.url, l.description,
                        l.image_url, l.order_index, l.is_active, l.keywords,
                        l.hidden_from_profile, l.sale_price, l.price, l.button_text,
                        l.location, l.date, l.collection_name, l.slug, l.platform_name,
                        l.logo_url, l.in_app, c.slug as category_slug, l.video_url, l.post_url
                 FROM links l
                 LEFT JOIN categories c ON l.category_id = c.id
                 WHERE l.profile_id = ?1 ORDER BY l.order_index ASC",
                crate::turso_params![profile_id],
            )
            .await?;

        let mut links = Vec::new();
        while let Some(row) = rows.next().await? {
            links.push(link_from_row(&row)?);
        }
        Ok(links)
    }

    pub async fn create_link(&self, data: &CreateLinkData) -> Result<LinkRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn()?;
        let post_url_json = data
            .post_url
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());
        conn.execute(
            "INSERT INTO links
               (id, profile_id, category_id, title, url, description, image_url, logo_url, video_url,
                order_index, is_active, keywords, slug, platform_name, post_url, sale_price, price,
                button_text, location, date, collection_name,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20, unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                data.profile_id.clone(),
                data.category_id.clone(),
                data.title.clone(),
                data.url.clone(),
                data.description.clone(),
                data.image_url.clone(),
                data.logo_url.clone(),
                data.video_url.clone(),
                data.order_index,
                data.keywords.clone(),
                data.slug.clone(),
                data.platform_name.clone(),
                post_url_json,
                data.sale_price.clone(),
                data.price.clone(),
                data.button_text.clone(),
                data.location.clone(),
                data.date.clone(),
                data.collection_name.clone()
            ],
        )
        .await?;
        self.get_link(&id).await
    }

    pub async fn get_link(&self, link_id: &str) -> Result<LinkRow> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT l.id, l.profile_id, l.category_id, l.title, l.url, l.description,
                        l.image_url, l.order_index, l.is_active, l.keywords,
                        l.hidden_from_profile, l.sale_price, l.price, l.button_text,
                        l.location, l.date, l.collection_name, l.slug, l.platform_name,
                        l.logo_url, l.in_app, c.slug as category_slug, l.video_url, l.post_url
                 FROM links l
                 LEFT JOIN categories c ON l.category_id = c.id
                 WHERE l.id = ?1",
                crate::turso_params![link_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            link_from_row(&row)
        } else {
            Err(anyhow!("Link not found: {}", link_id))
        }
    }

    pub async fn update_link(&self, link_id: &str, data: &UpdateLinkData) -> Result<()> {
        let conn = self.conn()?;
        let post_url_json = data
            .post_url
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());
        conn.execute(
            "UPDATE links SET
               title = COALESCE(?1, title),
               url = COALESCE(?2, url),
               description = COALESCE(?3, description),
               image_url = COALESCE(?4, image_url),
               logo_url = COALESCE(?5, logo_url),
               video_url = COALESCE(?6, video_url),
               order_index = COALESCE(?7, order_index),
               is_active = COALESCE(?8, is_active),
               keywords = COALESCE(?9, keywords),
               platform_name = COALESCE(?10, platform_name),
               slug = COALESCE(?11, slug),
               post_url = COALESCE(?12, post_url),
               sale_price = COALESCE(?13, sale_price),
               price = COALESCE(?14, price),
               button_text = COALESCE(?15, button_text),
               location = COALESCE(?16, location),
               date = COALESCE(?17, date),
               collection_name = COALESCE(?18, collection_name),
               updated_at = unixepoch()
             WHERE id = ?19",
            crate::turso_params![
                data.title.clone(),
                data.url.clone(),
                data.description.clone(),
                data.image_url.clone(),
                data.logo_url.clone(),
                data.video_url.clone(),
                data.order_index,
                data.is_active.map(|b| if b { 1i64 } else { 0i64 }),
                data.keywords.clone(),
                data.platform_name.clone(),
                data.slug.clone(),
                post_url_json,
                data.sale_price.clone(),
                data.price.clone(),
                data.button_text.clone(),
                data.location.clone(),
                data.date.clone(),
                data.collection_name.clone(),
                link_id
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn delete_link(&self, link_id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM links WHERE id = ?1", crate::turso_params![link_id])
            .await?;
        Ok(())
    }
}
