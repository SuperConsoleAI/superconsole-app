//! Vector Memory Store — Native Semantic RAG and Vector Search for AI Agents
//!
//! Stores agent memories and vector embeddings locally with high-performance
//! pure-Rust cosine similarity search, with zero external C dynamic library collisions.
//! Compatible with remote libSQL / Turso cloud databases.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryVectorEntry {
    pub id: String,
    pub workspace_id: i64,
    pub category: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryVectorMatch {
    pub id: String,
    pub workspace_id: i64,
    pub category: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub distance: f64,
    pub score: f64,
}

#[derive(Clone)]
pub struct VectorMemoryStore {
    conn: Arc<Mutex<Connection>>,
    #[allow(dead_code)]
    db_path: PathBuf,
}

fn encode_vector(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for val in v {
        bytes.extend_from_slice(&val.to_le_bytes());
    }
    bytes
}

fn decode_vector(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let xf = *x as f64;
        let yf = *y as f64;
        dot += xf * yf;
        norm_a += xf * xf;
        norm_b += yf * yf;
    }
    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

impl VectorMemoryStore {
    /// Initialize the local vector memory database.
    pub async fn init(path: impl AsRef<Path>) -> Result<Self, String> {
        let p = path.as_ref().to_path_buf();
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(&p).map_err(|e| format!("Failed to open vector DB: {}", e))?;
        let store = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: p,
        };
        store.ensure_tables()?;
        Ok(store)
    }

    fn ensure_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memory_vectors (
                id           TEXT PRIMARY KEY,
                workspace_id INTEGER NOT NULL DEFAULT 0,
                category     TEXT NOT NULL,
                slug         TEXT NOT NULL,
                title        TEXT NOT NULL,
                summary      TEXT NOT NULL,
                content      TEXT NOT NULL,
                embedding    BLOB NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_mem_vectors_ws ON memory_vectors (workspace_id);
            CREATE INDEX IF NOT EXISTS idx_mem_vectors_cat ON memory_vectors (category);",
        )
        .map_err(|e| format!("Failed to create memory_vectors tables: {}", e))?;
        Ok(())
    }

    /// Upsert an agent memory entry with its embedding vector.
    pub async fn upsert(
        &self,
        id: &str,
        workspace_id: i64,
        category: &str,
        slug: &str,
        title: &str,
        summary: &str,
        content: &str,
        embedding: &[f32],
    ) -> Result<(), String> {
        let blob = encode_vector(embedding);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO memory_vectors (id, workspace_id, category, slug, title, summary, content, embedding)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                category = excluded.category,
                slug = excluded.slug,
                title = excluded.title,
                summary = excluded.summary,
                content = excluded.content,
                embedding = excluded.embedding",
            params![
                id,
                workspace_id,
                category,
                slug,
                title,
                summary,
                content,
                blob
            ],
        )
        .map_err(|e| format!("Failed to upsert memory vector: {}", e))?;

        Ok(())
    }

    /// Perform semantic similarity search ordered by cosine similarity.
    pub async fn search(
        &self,
        workspace_id: Option<i64>,
        embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<MemoryVectorMatch>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        struct RawRow {
            id: String,
            workspace_id: i64,
            category: String,
            slug: String,
            title: String,
            summary: String,
            content: String,
            raw_embedding: Vec<u8>,
        }

        let mut rows_data = Vec::new();
        if let Some(ws_id) = workspace_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workspace_id, category, slug, title, summary, content, embedding
                     FROM memory_vectors WHERE workspace_id = ?1",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![ws_id], |row| {
                    Ok(RawRow {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        category: row.get(2)?,
                        slug: row.get(3)?,
                        title: row.get(4)?,
                        summary: row.get(5)?,
                        content: row.get(6)?,
                        raw_embedding: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            for r in mapped {
                if let Ok(item) = r {
                    rows_data.push(item);
                }
            }
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workspace_id, category, slug, title, summary, content, embedding
                     FROM memory_vectors",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| {
                    Ok(RawRow {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        category: row.get(2)?,
                        slug: row.get(3)?,
                        title: row.get(4)?,
                        summary: row.get(5)?,
                        content: row.get(6)?,
                        raw_embedding: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            for r in mapped {
                if let Ok(item) = r {
                    rows_data.push(item);
                }
            }
        }

        let mut scored_matches = Vec::new();
        for row in rows_data {
            let stored_vec = decode_vector(&row.raw_embedding);
            let sim = cosine_similarity(embedding, &stored_vec);
            let distance = (1.0 - sim).max(0.0);
            let score = sim.max(0.0);

            scored_matches.push(MemoryVectorMatch {
                id: row.id,
                workspace_id: row.workspace_id,
                category: row.category,
                slug: row.slug,
                title: row.title,
                summary: row.summary,
                content: row.content,
                distance,
                score,
            });
        }

        // Sort by distance ascending (closest match first)
        scored_matches.sort_by(|a, b| {
            a.distance
                .partial_cmp(&b.distance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        if scored_matches.len() > limit.max(1) {
            scored_matches.truncate(limit.max(1));
        }

        Ok(scored_matches)
    }

    /// Delete a memory vector by ID.
    pub async fn delete(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM memory_vectors WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete memory vector: {}", e))?;
        Ok(())
    }

    /// List memories stored in vector store.
    pub async fn list(
        &self,
        workspace_id: Option<i64>,
        limit: usize,
    ) -> Result<Vec<MemoryVectorEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut entries = Vec::new();

        if let Some(ws) = workspace_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workspace_id, category, slug, title, summary, content, created_at
                     FROM memory_vectors WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![ws, limit.max(1) as i64], |row| {
                    Ok(MemoryVectorEntry {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        category: row.get(2)?,
                        slug: row.get(3)?,
                        title: row.get(4)?,
                        summary: row.get(5)?,
                        content: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            for r in mapped {
                if let Ok(entry) = r {
                    entries.push(entry);
                }
            }
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workspace_id, category, slug, title, summary, content, created_at
                     FROM memory_vectors ORDER BY created_at DESC LIMIT ?1",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![limit.max(1) as i64], |row| {
                    Ok(MemoryVectorEntry {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        category: row.get(2)?,
                        slug: row.get(3)?,
                        title: row.get(4)?,
                        summary: row.get(5)?,
                        content: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            for r in mapped {
                if let Ok(entry) = r {
                    entries.push(entry);
                }
            }
        }

        Ok(entries)
    }

    /// Sync or query remote memories from Turso Cloud UserDB using the libSQL client
    #[allow(dead_code)]
    pub async fn sync_to_cloud(
        &self,
        cfg: &crate::cloud::TursoConfig,
    ) -> Result<usize, String> {
        let conn = crate::cloud::libsql_connect(cfg).await?;
        let _ = conn
            .execute(
                "CREATE TABLE IF NOT EXISTS agent_memory_vectors (
                    id           TEXT PRIMARY KEY,
                    workspace_id INTEGER NOT NULL DEFAULT 0,
                    category     TEXT NOT NULL,
                    slug         TEXT NOT NULL,
                    title        TEXT NOT NULL,
                    summary      TEXT NOT NULL,
                    content      TEXT NOT NULL,
                    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
                )",
                (),
            )
            .await;

        let local_entries = self.list(None, 500).await?;
        let count = local_entries.len();
        for entry in local_entries {
            let _ = conn
                .execute(
                    "INSERT INTO agent_memory_vectors (id, workspace_id, category, slug, title, summary, content)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        summary = excluded.summary,
                        content = excluded.content",
                    libsql::params![
                        entry.id,
                        entry.workspace_id,
                        entry.category,
                        entry.slug,
                        entry.title,
                        entry.summary,
                        entry.content
                    ],
                )
                .await;
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_vector_memory_store_lifecycle() {
        let temp = NamedTempFile::new().unwrap();
        let store = VectorMemoryStore::init(temp.path()).await.unwrap();

        // 1. Upsert entries with 3-dimensional mock embeddings
        let emb1 = vec![1.0, 0.0, 0.0];
        store
            .upsert(
                "mem_01",
                1,
                "decisions",
                "use-turso",
                "Why we use Turso",
                "Turso provides embedded replicas and vector search.",
                "Full architectural decision record on Turso and libSQL.",
                &emb1,
            )
            .await
            .unwrap();

        let emb2 = vec![0.0, 1.0, 0.0];
        store
            .upsert(
                "mem_02",
                1,
                "patterns",
                "auth-flow",
                "WorkOS Auth Flow",
                "Handling loopback redirects on port 4666.",
                "Detailed instructions for WorkOS authentication tokens.",
                &emb2,
            )
            .await
            .unwrap();

        // 2. Query similar to emb1 [1.0, 0.0, 0.0]
        let query_emb = vec![0.95, 0.05, 0.0];
        let matches = store.search(Some(1), &query_emb, 2).await.unwrap();

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].id, "mem_01");
        assert!(matches[0].distance < 0.06);
        assert!(matches[0].score > 0.94);

        // 3. List
        let list = store.list(Some(1), 10).await.unwrap();
        assert_eq!(list.len(), 2);

        // 4. Delete
        store.delete("mem_01").await.unwrap();
        let remaining = store.list(Some(1), 10).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "mem_02");
    }
}
