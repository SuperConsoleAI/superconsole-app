// src/db/turso.rs
// Turso HTTP API client — replaces libsql for ALL remote DB connections.
// WHY: libsql uses rustls-native-certs which fails on iOS sandbox.
// reqwest with rustls-tls bundles Mozilla CA (webpki-roots) — works everywhere.
// API: https://docs.turso.tech/sdk/http/reference

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

// ── Connection ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct TursoConn {
    pipeline_url: String,
    auth_header: String,
    client: reqwest::Client,
}

use reqwest::dns::{Addrs, Name, Resolve};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
pub struct DynamicDnsResolver {
    resolver: hickory_resolver::TokioAsyncResolver,
}

impl DynamicDnsResolver {
    pub fn new() -> Self {
        use hickory_resolver::config::*;
        let mut config = ResolverConfig::google();
        // Add Cloudflare (1.1.1.1) and Quad9 (9.9.9.9) as additional fallback resolvers
        config.add_name_server(NameServerConfig::new(
            SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::new(1, 1, 1, 1)), 53),
            Protocol::Udp,
        ));
        config.add_name_server(NameServerConfig::new(
            SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::new(9, 9, 9, 9)), 53),
            Protocol::Udp,
        ));
        let resolver = hickory_resolver::TokioAsyncResolver::tokio(
            config,
            ResolverOpts::default(),
        );
        Self { resolver }
    }
}

impl Resolve for DynamicDnsResolver {
    fn resolve(&self, name: Name) -> reqwest::dns::Resolving {
        let clean_domain = name.as_str().trim_end_matches('.').to_string();
        let host = clean_domain.split(':').next().unwrap_or(&clean_domain).to_string();
        let resolver = self.resolver.clone();
        Box::pin(async move {
            // 1. Try system DNS first (Android Bionic netd / OS native DNS)
            if let Ok(std_addrs) = tokio::net::lookup_host(format!("{}:443", host)).await {
                let addrs: Vec<SocketAddr> = std_addrs.collect();
                if !addrs.is_empty() {
                    return Ok(Box::new(addrs.into_iter()) as Addrs);
                }
            }

            // 2. Fallback to hickory multi-provider public DNS (Google, Cloudflare, Quad9)
            if let Ok(lookup) = resolver.lookup_ip(&host).await {
                let addrs: Vec<SocketAddr> = lookup.into_iter().map(|ip| SocketAddr::new(ip, 443)).collect();
                if !addrs.is_empty() {
                    return Ok(Box::new(addrs.into_iter()) as Addrs);
                }
            }

            Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Failed to resolve DNS for {}", host),
            )) as Box<dyn std::error::Error + Send + Sync>)
        })
    }
}

pub fn create_shared_http_client() -> reqwest::Client {
    let resolver = Arc::new(DynamicDnsResolver::new());
    reqwest::Client::builder()
        .user_agent("BusinessKit/1.0")
        .dns_resolver(resolver)
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub fn normalize_turso_url(raw_url: &str) -> String {
    let mut url = raw_url.trim().to_string();
    if url.starts_with("libsql://") {
        url = url.replacen("libsql://", "https://", 1);
    } else if url.starts_with("libsqi://") {
        url = url.replacen("libsqi://", "https://", 1);
    } else if url.starts_with("ws://") {
        url = url.replacen("ws://", "http://", 1);
    } else if url.starts_with("wss://") {
        url = url.replacen("wss://", "https://", 1);
    } else if !url.starts_with("http://") && !url.starts_with("https://") {
        url = format!("https://{}", url);
    }
    let mut cleaned = url.trim_end_matches('/').to_string();
    if cleaned.ends_with("/v2/pipeline") {
        cleaned = cleaned.trim_end_matches("/v2/pipeline").to_string();
        cleaned = cleaned.trim_end_matches('/').to_string();
    }
    cleaned
}

impl TursoConn {
    pub fn new(url: &str, token: &str) -> Self {
        let clean_base = normalize_turso_url(url);
        Self {
            pipeline_url: format!("{}/v2/pipeline", clean_base),
            auth_header: format!("Bearer {}", token.trim()),
            client: create_shared_http_client(),
        }
    }

    pub async fn send_pipeline_request(&self, body: &Value) -> Result<Value> {
        let mut attempts = 0;
        let max_attempts = 3;
        loop {
            attempts += 1;
            let res = self
                .client
                .post(&self.pipeline_url)
                .header("Authorization", &self.auth_header)
                .json(body)
                .send()
                .await;

            match res {
                Ok(resp) => {
                    let status = resp.status();
                    if (status.as_u16() == 429 || status.as_u16() == 502 || status.as_u16() == 503) && attempts < max_attempts {
                        let delay_ms = match attempts {
                            1 => 200 + (rand::random::<u64>() % 100),
                            2 => 800 + (rand::random::<u64>() % 200),
                            _ => 2000 + (rand::random::<u64>() % 400),
                        };
                        log::warn!("Turso HTTP {} — retry {}/{} in {}ms", status, attempts, max_attempts, delay_ms);
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    }
                    let parsed: Value = resp.json().await.map_err(|e| anyhow!("Turso response parse failed: {}", e))?;
                    return Ok(parsed);
                }
                Err(e) => {
                    if attempts < max_attempts {
                        let delay_ms = 300 * attempts;
                        log::warn!("Turso HTTP connection error: {} — retry {}/{} in {}ms", e, attempts, max_attempts, delay_ms);
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    }
                    return Err(anyhow!("Turso HTTP request failed after {} attempts: {}", attempts, e));
                }
            }
        }
    }

    pub async fn query(&self, sql: &str, params: Vec<TursoParam>) -> Result<TursoRows> {
        let args: Vec<Value> = params.iter().map(|p| p.to_json()).collect();
        let body = json!({
            "requests": [
                { "type": "execute", "stmt": { "sql": sql, "args": args } },
                { "type": "close" }
            ]
        });

        let resp = self.send_pipeline_request(&body).await?;

        let first = &resp["results"][0];
        if first["type"] == "error" {
            let msg = first["error"]["message"].as_str().unwrap_or("unknown Turso error");
            return Err(anyhow!("Turso query error: {}", msg));
        }

        let result = &first["response"]["result"];

        // Capture column names from response
        let col_names: Vec<String> = result["cols"]
            .as_array()
            .map(|cols| cols.iter().map(|c| c["name"].as_str().unwrap_or("").to_string()).collect())
            .unwrap_or_default();

        let raw_rows = result["rows"].as_array().cloned().unwrap_or_default();
        let rows: Vec<TursoRow> = raw_rows
            .iter()
            .map(|row| {
                let cells = row.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
                TursoRow {
                    cells: cells.iter().map(parse_cell).collect(),
                    col_names: col_names.clone(),
                }
            })
            .collect();

        Ok(TursoRows { rows, idx: 0 })
    }

    pub async fn execute(&self, sql: &str, params: Vec<TursoParam>) -> Result<u64> {
        let _ = self.query(sql, params).await?;
        Ok(0)
    }

    /// Prepared-statement shim — returns a TursoStmt that sends the query at call time.
    pub async fn prepare(&self, sql: &str) -> Result<TursoStmt> {
        Ok(TursoStmt { conn: self.clone(), sql: sql.to_string() })
    }

    /// Execute multiple semicolon-separated statements (DDL batches, seeds, etc.)
    /// Execute multiple full SQL statements without splitting on semicolons (safe for triggers)
    pub async fn execute_statements(&self, stmts: &[&str]) -> Result<()> {
        let requests: Vec<Value> = stmts
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| json!({ "type": "execute", "stmt": { "sql": s } }))
            .chain(std::iter::once(json!({ "type": "close" })))
            .collect();

        if requests.len() <= 1 { return Ok(()); }

        let body = json!({ "requests": requests });
        let resp = self.send_pipeline_request(&body).await?;

        if let Some(results) = resp["results"].as_array() {
            for r in results {
                if r["type"] == "error" {
                    log::warn!("execute_statements stmt error: {}", r["error"]["message"].as_str().unwrap_or("?"));
                }
            }
        }
        Ok(())
    }

    pub async fn execute_batch(&self, sql: &str) -> Result<()> {
        let stmts: Vec<Value> = sql
            .split(';')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| json!({ "type": "execute", "stmt": { "sql": s } }))
            .chain(std::iter::once(json!({ "type": "close" })))
            .collect();

        if stmts.len() <= 1 { return Ok(()); }

        let body = json!({ "requests": stmts });
        let resp = self.send_pipeline_request(&body).await?;

        if let Some(results) = resp["results"].as_array() {
            for r in results {
                if r["type"] == "error" {
                    log::warn!("execute_batch stmt error: {}", r["error"]["message"].as_str().unwrap_or("?"));
                }
            }
        }
        Ok(())
    }
}

// ── Prepared Statement ────────────────────────────────────────────────────────

pub struct TursoStmt {
    conn: TursoConn,
    sql: String,
}

impl TursoStmt {
    pub async fn query(&self, params: Vec<TursoParam>) -> Result<TursoRows> {
        self.conn.query(&self.sql, params).await
    }
    pub async fn execute(&self, params: Vec<TursoParam>) -> Result<u64> {
        self.conn.execute(&self.sql, params).await
    }
}

// ── Cell value ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum CellValue {
    Text(String),
    Integer(i64),
    Float(f64),
    Null,
}

fn parse_cell(cell: &Value) -> CellValue {
    match cell["type"].as_str() {
        Some("text") => cell["value"].as_str()
            .map(|s| CellValue::Text(s.to_string()))
            .unwrap_or(CellValue::Null),
        Some("integer") => cell["value"].as_str()
            .and_then(|s| s.parse::<i64>().ok())
            .map(CellValue::Integer)
            .unwrap_or(CellValue::Null),
        Some("float") => cell["value"].as_f64()
            .map(CellValue::Float)
            .unwrap_or(CellValue::Null),
        _ => CellValue::Null,
    }
}

// ── Rows ──────────────────────────────────────────────────────────────────────

pub struct TursoRows {
    rows: Vec<TursoRow>,
    idx: usize,
}

impl TursoRows {
    pub async fn next(&mut self) -> Result<Option<TursoRow>> {
        if self.idx < self.rows.len() {
            let row = self.rows[self.idx].clone();
            self.idx += 1;
            Ok(Some(row))
        } else {
            Ok(None)
        }
    }
}

// ── Row ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TursoRow {
    pub(crate) cells: Vec<CellValue>,
    pub(crate) col_names: Vec<String>,
}

impl TursoRow {
    /// Get column value as type T. Same ergonomics as libsql Row::get::<T>(idx).
    pub fn get<T: FromCell>(&self, idx: i32) -> Result<T> {
        let cell = self.cells.get(idx as usize)
            .ok_or_else(|| anyhow!("column index {} out of range", idx))?;
        T::from_cell(cell)
    }

    /// Raw cell value — replaces libsql row.get_value(i).
    pub fn get_value(&self, idx: usize) -> &CellValue {
        self.cells.get(idx).unwrap_or(&CellValue::Null)
    }

    /// Alias of get_value for dynamic access patterns.
    pub fn get_cell(&self, idx: usize) -> &CellValue {
        self.get_value(idx)
    }

    /// Number of columns — replaces libsql row.column_count().
    pub fn column_count(&self) -> usize {
        self.cells.len()
    }

    /// Column name at index — replaces libsql row.column_name(i).
    pub fn column_name(&self, idx: i32) -> Option<&str> {
        self.col_names.get(idx as usize).map(|s| s.as_str())
    }
}

// ── Type conversion ───────────────────────────────────────────────────────────

pub trait FromCell: Sized {
    fn from_cell(c: &CellValue) -> Result<Self>;
}

impl FromCell for String {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Text(s) => Ok(s.clone()),
            CellValue::Integer(i) => Ok(i.to_string()),
            CellValue::Float(f) => Ok(f.to_string()),
            CellValue::Null => Err(anyhow!("expected String, got null")),
        }
    }
}
impl FromCell for Option<String> {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Null => Ok(None),
            CellValue::Text(s) => Ok(Some(s.clone())),
            CellValue::Integer(i) => Ok(Some(i.to_string())),
            CellValue::Float(f) => Ok(Some(f.to_string())),
        }
    }
}
impl FromCell for i64 {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Integer(i) => Ok(*i),
            CellValue::Text(s) => s.parse::<i64>().map_err(|e| anyhow!("parse i64: {}", e)),
            CellValue::Float(f) => Ok(*f as i64),
            CellValue::Null => Err(anyhow!("expected i64, got null")),
        }
    }
}
impl FromCell for Option<i64> {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Null => Ok(None),
            CellValue::Integer(i) => Ok(Some(*i)),
            CellValue::Text(s) => Ok(s.parse::<i64>().ok()),
            CellValue::Float(f) => Ok(Some(*f as i64)),
        }
    }
}
impl FromCell for i32 {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Integer(i) => Ok(*i as i32),
            CellValue::Text(s) => s.parse::<i32>().map_err(|e| anyhow!("parse i32: {}", e)),
            CellValue::Float(f) => Ok(*f as i32),
            CellValue::Null => Err(anyhow!("expected i32, got null")),
        }
    }
}
impl FromCell for Option<i32> {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Null => Ok(None),
            CellValue::Integer(i) => Ok(Some(*i as i32)),
            CellValue::Text(s) => Ok(s.parse::<i32>().ok()),
            CellValue::Float(f) => Ok(Some(*f as i32)),
        }
    }
}
impl FromCell for f64 {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Float(f) => Ok(*f),
            CellValue::Integer(i) => Ok(*i as f64),
            CellValue::Text(s) => s.parse::<f64>().map_err(|e| anyhow!("parse f64: {}", e)),
            CellValue::Null => Err(anyhow!("expected f64, got null")),
        }
    }
}
impl FromCell for Option<f64> {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Null => Ok(None),
            CellValue::Float(f) => Ok(Some(*f)),
            CellValue::Integer(i) => Ok(Some(*i as f64)),
            CellValue::Text(s) => Ok(s.parse::<f64>().ok()),
        }
    }
}
impl FromCell for u64 {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Integer(i) => Ok(*i as u64),
            CellValue::Text(s) => s.parse::<u64>().map_err(|e| anyhow!("parse u64: {}", e)),
            CellValue::Null => Err(anyhow!("expected u64, got null")),
            CellValue::Float(f) => Ok(*f as u64),
        }
    }
}
impl FromCell for bool {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Integer(i) => Ok(*i != 0),
            CellValue::Text(s) => Ok(s == "1" || s == "true"),
            _ => Ok(false),
        }
    }
}
impl FromCell for Option<bool> {
    fn from_cell(c: &CellValue) -> Result<Self> {
        match c {
            CellValue::Null => Ok(None),
            CellValue::Integer(i) => Ok(Some(*i != 0)),
            CellValue::Text(s) => Ok(Some(s == "1" || s == "true")),
            _ => Ok(None),
        }
    }
}

// ── Parameters ────────────────────────────────────────────────────────────────

pub enum TursoParam {
    Text(String),
    Integer(i64),
    Float(f64),
    Null,
}

impl TursoParam {
    fn to_json(&self) -> Value {
        match self {
            TursoParam::Text(s)    => json!({ "type": "text",    "value": s }),
            TursoParam::Integer(i) => json!({ "type": "integer", "value": i.to_string() }),
            TursoParam::Float(f)   => json!({ "type": "float",   "value": f }),
            TursoParam::Null       => json!({ "type": "null" }),
        }
    }
}

impl From<String>        for TursoParam { fn from(s: String)  -> Self { TursoParam::Text(s) } }
impl From<&str>          for TursoParam { fn from(s: &str)    -> Self { TursoParam::Text(s.to_string()) } }
impl From<&String>       for TursoParam { fn from(s: &String) -> Self { TursoParam::Text(s.clone()) } }
impl From<i64>           for TursoParam { fn from(i: i64)     -> Self { TursoParam::Integer(i) } }
impl From<i32>           for TursoParam { fn from(i: i32)     -> Self { TursoParam::Integer(i as i64) } }
impl From<u64>           for TursoParam { fn from(i: u64)     -> Self { TursoParam::Integer(i as i64) } }
impl From<f64>           for TursoParam { fn from(f: f64)     -> Self { TursoParam::Float(f) } }
impl From<bool>          for TursoParam { fn from(b: bool)    -> Self { TursoParam::Integer(b as i64) } }

impl From<Option<String>> for TursoParam {
    fn from(o: Option<String>) -> Self { o.map_or(TursoParam::Null, TursoParam::Text) }
}
impl From<Option<&str>> for TursoParam {
    fn from(o: Option<&str>) -> Self { o.map_or(TursoParam::Null, |s| TursoParam::Text(s.to_string())) }
}
impl From<Option<&String>> for TursoParam {
    fn from(o: Option<&String>) -> Self { o.map_or(TursoParam::Null, |s| TursoParam::Text(s.clone())) }
}
impl From<Option<i64>> for TursoParam {
    fn from(o: Option<i64>) -> Self { o.map_or(TursoParam::Null, TursoParam::Integer) }
}
impl From<Option<i32>> for TursoParam {
    fn from(o: Option<i32>) -> Self { o.map_or(TursoParam::Null, |i| TursoParam::Integer(i as i64)) }
}
impl From<Option<f64>> for TursoParam {
    fn from(o: Option<f64>) -> Self { o.map_or(TursoParam::Null, TursoParam::Float) }
}
impl From<Option<bool>> for TursoParam {
    fn from(o: Option<bool>) -> Self { o.map_or(TursoParam::Null, |b| TursoParam::Integer(b as i64)) }
}

/// Drop-in replacement for libsql::params![...]
#[macro_export]
macro_rules! turso_params {
    () => { vec![] };
    ($($x:expr),* $(,)?) => {
        vec![$($crate::db::turso::TursoParam::from($x)),*]
    };
}
