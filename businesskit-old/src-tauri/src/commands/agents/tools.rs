// src-tauri/src/commands/agents/tools.rs
//
// The agent's toolbelt. One registry of ToolSpecs, two transports:
//   1. In-app chat (chat.rs's native tool-calling loop) calls `execute()` in-process.
//   2. Desktop CLI parity (stdio JSON-RPC) proxies external CLIs into the SAME `execute()`.
// Both transports produce identical writes — no forked logic per surface.
//
// HARD RULE: every handler takes `&TursoConn` for the active profile's UserDB only.
// Nothing in this file may reach CentralConn.
//
// All operations execute against UserDB tables:
//   - shop: shop_items, shop_item_variants, shop_warehouses, shop_stock_adjustments, shop_stock_ledger
//   - shop-ops: shop_documents, shop_document_lines, shop_customers
//   - crm: crm_contacts
//   - content: content

use crate::db::turso::{TursoConn, TursoParam};
use crate::turso_params;
use serde_json::{json, Value};
use uuid::Uuid;

/// Per-call context. Deliberately does NOT carry a Central connection —
/// that's the enforcement point for Central=never / UserDB=only.
pub struct ToolCtx<'a> {
    pub user_db: &'a TursoConn,
    pub profile_id: String,
}

/// One tool the LLM (or an external CLI over MCP) can discover and call.
/// `input_schema` is plain JSON Schema, shown to the model so it knows how to call it.
#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

/// The full catalog, shared verbatim by chat.rs and future MCP servers for tool discovery.
pub fn registry() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "inventory_add_stock",
            description: "Add or adjust stock quantity for a SKU or item. Use for 'add N units of X', restocks, and manual corrections.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sku": { "type": "string", "description": "Item SKU or identifier" },
                    "quantity_delta": { "type": "integer", "description": "Positive to add stock, negative to remove." },
                    "location": { "type": "string", "description": "Optional warehouse name or location tag." }
                },
                "required": ["sku", "quantity_delta"]
            }),
        },
        ToolSpec {
            name: "inventory_get_levels",
            description: "Look up current stock levels, optionally filtered by SKU or category.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sku": { "type": "string", "description": "Optional SKU to filter by" },
                    "category": { "type": "string", "description": "Optional category name to filter by" }
                }
            }),
        },
        ToolSpec {
            name: "invoice_create",
            description: "Create an invoice for a customer with one or more line items.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "customer_id": { "type": "string", "description": "Customer ID, name, or email" },
                    "line_items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": { "type": "string" },
                                "quantity": { "type": "integer" },
                                "unit_price": { "type": "number" }
                            },
                            "required": ["description", "quantity", "unit_price"]
                        },
                        "description": "List of billed line items"
                    },
                    "due_date": { "type": "string", "description": "ISO 8601 date, optional." }
                },
                "required": ["customer_id", "line_items"]
            }),
        },
        ToolSpec {
            name: "invoice_send",
            description: "Send an already-created invoice to the customer.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "invoice_id": { "type": "string", "description": "Invoice ID or document number (e.g. INV-0001)" },
                    "channel": { "type": "string", "enum": ["email", "link"], "default": "email" }
                },
                "required": ["invoice_id"]
            }),
        },
        ToolSpec {
            name: "contact_create",
            description: "Create a new CRM contact.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Full name of the contact" },
                    "email": { "type": "string", "description": "Email address" },
                    "phone": { "type": "string", "description": "Phone number" },
                    "tags": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["name"]
            }),
        },
        ToolSpec {
            name: "contact_update",
            description: "Update fields on an existing CRM contact.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "contact_id": { "type": "string", "description": "Contact ID or email address" },
                    "fields": { "type": "object", "description": "Partial fields to update, e.g. { \"email\": \"...\", \"phone\": \"...\", \"company\": \"...\" }" }
                },
                "required": ["contact_id", "fields"]
            }),
        },
        ToolSpec {
            name: "blog_post_create",
            description: "Draft or publish a blog post from a title and brief/body.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Blog post title" },
                    "body_or_brief": { "type": "string", "description": "Full body content or brief to publish." },
                    "status": { "type": "string", "enum": ["draft", "publish"], "default": "draft" }
                },
                "required": ["title", "body_or_brief"]
            }),
        },
    ]
}

/// Single dispatch point for all tool calls.
pub async fn execute(tool_name: &str, args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    match tool_name {
        "inventory_add_stock" => inventory_add_stock(args, ctx).await,
        "inventory_get_levels" => inventory_get_levels(args, ctx).await,
        "invoice_create" => invoice_create(args, ctx).await,
        "invoice_send" => invoice_send(args, ctx).await,
        "contact_create" => contact_create(args, ctx).await,
        "contact_update" => contact_update(args, ctx).await,
        "blog_post_create" => blog_post_create(args, ctx).await,
        other => Err(format!("Unknown tool: {other}")),
    }
}

// ---------------------------------------------------------------------------
// 1. Shop Domain: inventory_add_stock & inventory_get_levels
// ---------------------------------------------------------------------------

async fn get_or_create_default_warehouse(conn: &TursoConn, profile_id: &str) -> Result<String, String> {
    let mut rows = conn
        .query(
            "SELECT id FROM shop_warehouses WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1",
            turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        return row.get::<String>(0).map_err(|e| e.to_string());
    }

    let wh_id = format!("wh_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    conn.execute(
        "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
         VALUES (?1, ?2, 'Main Warehouse', 'general', 1, 1)",
        turso_params![wh_id.clone(), profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(wh_id)
}

async fn inventory_add_stock(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let sku = args.get("sku").and_then(Value::as_str)
        .ok_or("Missing required field: sku")?;
    let delta = args.get("quantity_delta").and_then(Value::as_i64)
        .ok_or("Missing required field: quantity_delta")?;
    let location = args.get("location").and_then(Value::as_str);

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve item by SKU or ID
    let (item_id, item_name) = if let Some(row) = conn
        .query(
            "SELECT id, name FROM shop_items WHERE profile_id = ?1 AND (sku = ?2 OR id = ?2) LIMIT 1",
            turso_params![profile_id, sku],
        )
        .await
        .map_err(|e| e.to_string())?
        .next()
        .await
        .map_err(|e| e.to_string())?
    {
        (
            row.get::<String>(0).map_err(|e| e.to_string())?,
            row.get::<String>(1).unwrap_or_else(|_| "Unknown Item".to_string()),
        )
    } else {
        // Check variants
        let mut vrows = conn
            .query(
                "SELECT v.item_id, i.name FROM shop_item_variants v \
                 JOIN shop_items i ON v.item_id = i.id \
                 WHERE i.profile_id = ?1 AND v.sku = ?2 LIMIT 1",
                turso_params![profile_id, sku],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = vrows.next().await.map_err(|e| e.to_string())? {
            (
                row.get::<String>(0).map_err(|e| e.to_string())?,
                row.get::<String>(1).unwrap_or_else(|_| "Unknown Item".to_string()),
            )
        } else {
            // Auto-create item if it doesn't exist yet so the agent call succeeds
            let new_id = format!("item_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
            let new_name = format!("Item {}", sku);
            let slug = format!("item-{}", sku.to_lowercase().replace(' ', "-"));
            conn.execute(
                "INSERT INTO shop_items (id, profile_id, sku, name, slug, item_type, is_active) \
                 VALUES (?1, ?2, ?3, ?4, ?5, 'physical', 1)",
                turso_params![new_id.clone(), profile_id, sku, new_name.clone(), slug],
            )
            .await
            .map_err(|e| e.to_string())?;
            (new_id, new_name)
        }
    };

    // 2. Resolve warehouse
    let warehouse_id = if let Some(loc_name) = location {
        let mut wh_rows = conn
            .query(
                "SELECT id FROM shop_warehouses WHERE profile_id = ?1 AND name LIKE ?2 LIMIT 1",
                turso_params![profile_id, format!("%{}%", loc_name)],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = wh_rows.next().await.map_err(|e| e.to_string())? {
            row.get::<String>(0).map_err(|e| e.to_string())?
        } else {
            get_or_create_default_warehouse(conn, profile_id).await?
        }
    } else {
        get_or_create_default_warehouse(conn, profile_id).await?
    };

    // 3. Compute current balance from ledger
    let mut bal_rows = conn
        .query(
            "SELECT COALESCE(SUM(qty_in - qty_out), 0.0) FROM shop_stock_ledger \
             WHERE profile_id = ?1 AND item_id = ?2 AND warehouse_id = ?3",
            turso_params![profile_id, item_id.clone(), warehouse_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let current_bal: f64 = if let Some(row) = bal_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        0.0
    };

    let new_balance = current_bal + (delta as f64);
    let adj_id = format!("adj_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let ledger_id = format!("sl_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    // 4. Record adjustment
    conn.execute(
        "INSERT INTO shop_stock_adjustments \
         (id, profile_id, item_id, warehouse_id, adjustment_type, qty_change, reason) \
         VALUES (?1, ?2, ?3, ?4, 'agent_adjustment', ?5, 'Agent chat inventory adjustment')",
        turso_params![
            adj_id,
            profile_id,
            item_id.clone(),
            warehouse_id.clone(),
            delta as f64
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Append to stock ledger
    let (qty_in, qty_out) = if delta >= 0 {
        (delta as f64, 0.0)
    } else {
        (0.0, (-delta) as f64)
    };

    conn.execute(
        "INSERT INTO shop_stock_ledger \
         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, notes) \
         VALUES (?1, ?2, ?3, ?4, 'adjustment', ?5, ?6, ?7, 0, 'Agent updated inventory')",
        turso_params![
            ledger_id,
            profile_id,
            item_id.clone(),
            warehouse_id,
            qty_in,
            qty_out,
            new_balance
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({
        "sku": sku,
        "item_id": item_id,
        "item_name": item_name,
        "quantity_delta": delta,
        "updated_quantity": new_balance,
        "status": "success"
    }))
}

async fn inventory_get_levels(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let sku_filter = args.get("sku").and_then(Value::as_str);
    let cat_filter = args.get("category").and_then(Value::as_str);

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    let mut sql = String::from(
        "SELECT i.id, i.sku, i.name, COALESCE(SUM(l.qty_in - l.qty_out), 0.0) as qty_on_hand \
         FROM shop_items i \
         LEFT JOIN shop_stock_ledger l ON i.id = l.item_id AND l.profile_id = i.profile_id \
         WHERE i.profile_id = ?1 ",
    );

    let mut params: Vec<TursoParam> = vec![TursoParam::Text(profile_id.to_string())];
    let mut param_idx = 2;

    if let Some(sku) = sku_filter {
        sql.push_str(&format!("AND (i.sku LIKE ?{} OR i.id = ?{}) ", param_idx, param_idx));
        params.push(TursoParam::Text(format!("%{}%", sku)));
        param_idx += 1;
    }

    if let Some(cat) = cat_filter {
        sql.push_str(&format!(
            "AND i.category_id IN (SELECT id FROM shop_categories WHERE profile_id = ?1 AND (name LIKE ?{} OR slug LIKE ?{})) ",
            param_idx, param_idx
        ));
        params.push(TursoParam::Text(format!("%{}%", cat)));
    }

    sql.push_str("GROUP BY i.id, i.sku, i.name ORDER BY i.name ASC LIMIT 50");

    let mut rows = conn
        .query(&sql, params)
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let sku: Option<String> = row.get(1).unwrap_or(None);
        let name: String = row.get(2).unwrap_or_else(|_| "Unnamed Item".to_string());
        let qty: f64 = row.get(3).unwrap_or(0.0);

        items.push(json!({
            "id": id,
            "sku": sku,
            "name": name,
            "quantity_on_hand": qty
        }));
    }

    Ok(json!({ "items": items, "count": items.len() }))
}

// ---------------------------------------------------------------------------
// 2. Shop Ops Domain: invoice_create & invoice_send
// ---------------------------------------------------------------------------

async fn invoice_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let customer_ref = args.get("customer_id").and_then(Value::as_str)
        .ok_or("Missing required field: customer_id")?;
    let line_items = args.get("line_items").and_then(Value::as_array)
        .ok_or("Missing required field: line_items")?;
    let due_date = args.get("due_date").and_then(Value::as_str);

    if line_items.is_empty() {
        return Err("invoice_create requires at least one line item".into());
    }

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve or create customer
    let (customer_id, customer_name) = if let Some(row) = conn
        .query(
            "SELECT id, name FROM shop_customers WHERE profile_id = ?1 AND (id = ?2 OR name LIKE ?3 OR email = ?2) LIMIT 1",
            turso_params![profile_id, customer_ref, format!("%{}%", customer_ref)],
        )
        .await
        .map_err(|e| e.to_string())?
        .next()
        .await
        .map_err(|e| e.to_string())?
    {
        (
            row.get::<String>(0).map_err(|e| e.to_string())?,
            row.get::<String>(1).unwrap_or_else(|_| customer_ref.to_string()),
        )
    } else {
        // Create new customer
        let new_id = format!("cust_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
        conn.execute(
            "INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) \
             VALUES (?1, ?2, ?3, 'individual', 1)",
            turso_params![new_id.clone(), profile_id, customer_ref.to_string()],
        )
        .await
        .map_err(|e| e.to_string())?;
        (new_id, customer_ref.to_string())
    };

    // 2. Determine sequential document number (INV-0001)
    let pattern = "INV-%";
    let mut seq_rows = conn
        .query(
            "SELECT COALESCE(MAX(CAST(SUBSTR(doc_number, 5) AS INTEGER)), 0) \
             FROM shop_documents WHERE profile_id = ?1 AND doc_type = 'invoice' AND doc_number LIKE ?2",
            turso_params![profile_id, pattern],
        )
        .await
        .map_err(|e| e.to_string())?;

    let seq: i64 = if let Some(row) = seq_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<i64>(0).unwrap_or(0) + 1
    } else {
        1
    };
    let doc_number = format!("INV-{:04}", seq);
    let invoice_id = format!("doc_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    // 3. Compute totals and prepare lines
    let mut subtotal = 0.0_f64;
    struct PreparedLine {
        id: String,
        description: String,
        qty: f64,
        unit_price: f64,
        line_total: f64,
    }

    let mut prepared_lines = Vec::new();
    for item in line_items {
        let desc = item.get("description").and_then(Value::as_str).unwrap_or("Line item");
        let qty = item.get("quantity").and_then(Value::as_f64)
            .or_else(|| item.get("quantity").and_then(Value::as_i64).map(|q| q as f64))
            .unwrap_or(1.0);
        let unit_price = item.get("unit_price").and_then(Value::as_f64)
            .or_else(|| item.get("unit_price").and_then(Value::as_i64).map(|p| p as f64))
            .unwrap_or(0.0);
        let line_total = qty * unit_price;
        subtotal += line_total;

        prepared_lines.push(PreparedLine {
            id: format!("line_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]),
            description: desc.to_string(),
            qty,
            unit_price,
            line_total,
        });
    }

    let total = subtotal;
    let balance_due = total;
    let due_date_val = due_date.unwrap_or("");

    // 4. Insert shop_documents
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, doc_type, doc_number, customer_id, subtotal, tax_total, total, balance_due, status, due_date) \
         VALUES (?1, ?2, 'invoice', ?3, ?4, ?5, 0.0, ?6, ?7, 'issued', ?8)",
        turso_params![
            invoice_id.clone(),
            profile_id,
            doc_number.clone(),
            customer_id.clone(),
            subtotal,
            total,
            balance_due,
            due_date_val
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Insert shop_document_lines
    for (idx, line) in prepared_lines.iter().enumerate() {
        conn.execute(
            "INSERT INTO shop_document_lines \
             (id, document_id, profile_id, line_number, description, qty, unit_price, subtotal, total) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            turso_params![
                line.id.clone(),
                invoice_id.clone(),
                profile_id,
                (idx + 1) as i64,
                line.description.clone(),
                line.qty,
                line.unit_price,
                line.line_total,
                line.line_total
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(json!({
        "invoice_id": invoice_id,
        "doc_number": doc_number,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "subtotal": subtotal,
        "total": total,
        "status": "created",
        "lines_count": prepared_lines.len()
    }))
}

async fn invoice_send(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let invoice_id = args.get("invoice_id").and_then(Value::as_str)
        .ok_or("Missing required field: invoice_id")?;
    let channel = args.get("channel").and_then(Value::as_str).unwrap_or("email");

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // Check document exists
    let mut rows = conn
        .query(
            "SELECT id, doc_number, customer_id, total FROM shop_documents \
             WHERE profile_id = ?1 AND (id = ?2 OR doc_number = ?2) LIMIT 1",
            turso_params![profile_id, invoice_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let real_id: String = row.get(0).map_err(|e| e.to_string())?;
        let doc_number: String = row.get(1).map_err(|e| e.to_string())?;
        let total: f64 = row.get(3).unwrap_or(0.0);

        conn.execute(
            "UPDATE shop_documents SET status = 'sent', updated_at = strftime('%s','now') WHERE id = ?1 AND profile_id = ?2",
            turso_params![real_id.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

        Ok(json!({
            "invoice_id": real_id,
            "doc_number": doc_number,
            "total": total,
            "sent_via": channel,
            "status": "sent",
            "confirmation": format!("Invoice {} successfully sent via {}", doc_number, channel)
        }))
    } else {
        Err(format!("Invoice '{}' not found", invoice_id))
    }
}

// ---------------------------------------------------------------------------
// 3. CRM Domain: contact_create & contact_update
// ---------------------------------------------------------------------------

async fn contact_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let name = args.get("name").and_then(Value::as_str)
        .ok_or("Missing required field: name")?;
    let email = args.get("email").and_then(Value::as_str).unwrap_or("");
    let phone = args.get("phone").and_then(Value::as_str).unwrap_or("");
    let tags = args.get("tags").map(|t| t.to_string()).unwrap_or_else(|| "[]".to_string());

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // Split name into first and last
    let parts: Vec<&str> = name.split_whitespace().collect();
    let first_name = parts.first().copied().unwrap_or(name);
    let last_name = if parts.len() > 1 {
        parts[1..].join(" ")
    } else {
        String::new()
    };

    let contact_id = format!("ct_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    conn.execute(
        "INSERT INTO crm_contacts \
         (id, profile_id, first_name, last_name, email, phone, tags, status, outreach_status, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'lead', 'not_contacted', strftime('%s','now'), strftime('%s','now'))",
        turso_params![
            contact_id.clone(),
            profile_id,
            first_name,
            last_name,
            email,
            phone,
            tags
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({
        "contact_id": contact_id,
        "name": name,
        "email": email,
        "phone": phone,
        "status": "created"
    }))
}

async fn contact_update(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let contact_id = args.get("contact_id").and_then(Value::as_str)
        .ok_or("Missing required field: contact_id")?;
    let fields = args.get("fields").and_then(Value::as_object)
        .ok_or("Missing required field: fields")?;

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    if fields.is_empty() {
        return Ok(json!({ "contact_id": contact_id, "status": "no_changes" }));
    }

    let mut set_clauses = Vec::new();
    let mut params: Vec<TursoParam> = Vec::new();
    let mut idx = 1;

    for (k, v) in fields {
        let val_str = match v {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "1".into() } else { "0".into() },
            other => other.to_string(),
        };

        // Allowed safe columns in crm_contacts
        match k.as_str() {
            "first_name" | "last_name" | "email" | "phone" | "company" | "job_title" |
            "website" | "bio" | "status" | "outreach_status" | "notes" | "tags" => {
                set_clauses.push(format!("{} = ?{}", k, idx));
                params.push(TursoParam::Text(val_str));
                idx += 1;
            }
            _ => {}
        }
    }

    if set_clauses.is_empty() {
        return Err("No valid contact fields provided to update".into());
    }

    set_clauses.push("updated_at = strftime('%s','now')".to_string());

    let sql = format!(
        "UPDATE crm_contacts SET {} WHERE profile_id = ?{} AND (id = ?{} OR email = ?{})",
        set_clauses.join(", "),
        idx,
        idx + 1,
        idx + 1
    );
    params.push(TursoParam::Text(profile_id.to_string()));
    params.push(TursoParam::Text(contact_id.to_string()));

    conn.execute(&sql, params)
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({ "contact_id": contact_id, "status": "updated" }))
}

// ---------------------------------------------------------------------------
// 4. Content Domain: blog_post_create
// ---------------------------------------------------------------------------

async fn blog_post_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let title = args.get("title").and_then(Value::as_str)
        .ok_or("Missing required field: title")?;
    let body_or_brief = args.get("body_or_brief").and_then(Value::as_str)
        .ok_or("Missing required field: body_or_brief")?;
    let status_str = args.get("status").and_then(Value::as_str).unwrap_or("draft");

    let published = if status_str == "publish" || status_str == "published" {
        1i64
    } else {
        0i64
    };

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    let post_id = format!("post_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let slug = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");
    let clean_slug = if slug.is_empty() { format!("post-{}", &post_id[5..10]) } else { slug };

    conn.execute(
        "INSERT INTO content \
         (id, profile_id, slug, title, content, published, hidden, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        turso_params![
            post_id.clone(),
            profile_id,
            clean_slug.clone(),
            title,
            body_or_brief,
            published
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({
        "post_id": post_id,
        "title": title,
        "slug": clean_slug,
        "status": if published == 1 { "published" } else { "draft" }
    }))
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_contains_all_7_tools() {
        let tools = registry();
        assert_eq!(tools.len(), 7);
        let names: Vec<&str> = tools.iter().map(|t| t.name).collect();
        assert!(names.contains(&"inventory_add_stock"));
        assert!(names.contains(&"inventory_get_levels"));
        assert!(names.contains(&"invoice_create"));
        assert!(names.contains(&"invoice_send"));
        assert!(names.contains(&"contact_create"));
        assert!(names.contains(&"contact_update"));
        assert!(names.contains(&"blog_post_create"));
    }
}
