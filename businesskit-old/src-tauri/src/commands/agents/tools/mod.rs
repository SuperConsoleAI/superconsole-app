// src-tauri/src/commands/agents/tools/mod.rs
//
// The agent's toolbelt. One registry of ToolSpecs, two transports:
//   1. In-app chat (chat.rs's native tool-calling loop) calls `execute()` in-process.
//   2. Desktop CLI parity (stdio JSON-RPC) proxies external CLIs into the SAME `execute()`.
// Both transports produce identical writes — no forked logic per surface.
//
// HARD RULE: every handler takes `&TursoConn` for the active profile's UserDB only.
// Nothing in this file or its submodules may reach CentralConn.
//
// Domain submodules:
//   - shop: inventory_receive_purchase_invoice, inventory_add_stock, inventory_get_levels, invoice_create, invoice_send
//   - crm: contact_create, contact_update
//   - content: blog_post_create
//   - helpers: common DB lookup, item/vendor resolution, warehouse resolution

pub mod content;
pub mod crm;
pub mod helpers;
pub mod pages;
pub mod shop;

use crate::db::turso::TursoConn;
use serde_json::{json, Value};

/// Per-call context. Deliberately does NOT carry a Central connection —
/// that's the enforcement point for Central=never / UserDB=only.
pub struct ToolCtx<'a> {
    pub user_db: &'a TursoConn,
    pub profile_id: String,
    pub agent_user_id: String,
    pub agent_name: String,
    pub media_attachment_id: Option<String>,
    pub media_attachment_url: Option<String>,
}

/// One tool the LLM (or an external CLI over MCP) can discover and call.
/// `input_schema` is plain JSON Schema, shown to the model so it knows how to call it.
#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: &'static str,
    pub domain: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

/// The full catalog, shared verbatim by chat.rs and future MCP servers for tool discovery.
pub fn registry() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "inventory_receive_purchase_invoice",
            domain: "shop",
            description: "Receive inventory items from a vendor purchase invoice, vendor bill, or restock shipment. Records a formal Goods Receipt / Purchase document (doc_type='goods_receipt'), auto-creates missing products in shop_items with clean 10-char alphanumeric SKUs (e.g. '7PKFJ7I5ND'), updates item cost prices, selling prices / markup % (shop_items.price), MRP (default_mrp), taxes, packaging, and logs stock ledger movements with movement_type 'purchase'.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "vendor_name": { "type": "string", "description": "Supplier / Vendor company name (e.g. 'Sun Pharma Healthcare', 'Apple Inc.')" },
                    "invoice_number": { "type": "string", "description": "Vendor's invoice or bill number (e.g. 'INV-MED-44021', 'INV-APL-2026-089')" },
                    "invoice_date": { "type": "string", "description": "Invoice date (e.g. '2026-09-11' or ISO date), optional." },
                    "location": { "type": "string", "description": "Warehouse / store name, optional (defaults to Main Warehouse)." },
                    "media_id": { "type": "string", "description": "Associated media/attachment ID from uploaded invoice document, optional (automatically linked if user uploaded an invoice file)." },
                    "default_markup_pct": { "type": "number", "description": "Default markup % applied to cost_price to compute selling price for shop_items.price (e.g. 20 for cost + 20%), optional." },
                    "grand_total": { "type": "number", "description": "Total final invoice payable amount (after discounts and taxes, e.g. 5091.84), optional." },
                    "subtotal": { "type": "number", "description": "Pre-tax/discount subtotal, optional." },
                    "payment_status": { "type": "string", "enum": ["paid", "due", "partial", "confirmed"], "description": "Payment status of the invoice, optional (defaults to 'confirmed' or 'paid' if paid)." },
                    "payment_method": { "type": "string", "description": "Payment method (e.g. 'cash', 'bank_transfer', 'upi', 'credit'), optional." },
                    "payment_terms": { "type": "string", "description": "Payment terms (e.g. 'Net 30', 'Net 15', 'Immediate', 'Due on Receipt'), optional." },
                    "line_items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "item": { "type": "string", "description": "Item SKU, ID, or product name (e.g. 'URISPAS TAB', 'Apple Mac Mini', '7PKFJ7I5ND')" },
                                "sku": { "type": "string", "description": "Explicit product SKU code if provided on bill, optional." },
                                "quantity": { "type": "number", "description": "Billed quantity received (e.g. 50, 10)" },
                                "free_qty": { "type": "number", "description": "Free scheme quantity (e.g. 5 for 'buy 50 get 5 free'), optional." },
                                "scheme_on": { "type": "number", "description": "Scheme buy criteria quantity (e.g. 10 for buy 10, or 50 for buy 50), optional." },
                                "scheme_free": { "type": "number", "description": "Scheme free criteria quantity (e.g. 1 for get 1 free, or 5 for get 5 free), optional." },
                                "rate": { "type": "number", "description": "Base list price / rate before discounts (e.g. 120.00), optional." },
                                "discount": { "type": "number", "description": "Primary Trade discount % (e.g. 10 for 10%), optional." },
                                "discount2": { "type": "number", "description": "Secondary / Special discount % (e.g. 2 for 2%), optional." },
                                "tax": { "type": "number", "description": "GST / Tax % (e.g. 18 for 18%), optional." },
                                "tax_code": { "type": "string", "description": "Tax code label (e.g. 'GST 18%'), optional." },
                                "unit_cost": { "type": "number", "description": "Net unit cost after discounts/taxes if directly specified, optional." },
                                "selling_price": { "type": "number", "description": "Outward selling price for shop_items.price (e.g. 150.00), optional." },
                                "price": { "type": "number", "description": "Alias for selling_price, optional." },
                                "markup_pct": { "type": "number", "description": "Markup % on cost_price to compute selling price (e.g. 20 for cost + 20%), optional." },
                                "mrp": { "type": "number", "description": "Maximum Retail Price (default_mrp), optional." },
                                "batch_no": { "type": "string", "description": "Batch / Lot number (e.g. 'BATCH-SP991'), optional." },
                                "expiry_date": { "type": "string", "description": "Expiry date, optional." },
                                "pack_size": { "type": "string", "description": "Packaging size (e.g. '10x10', '10 TAB'), optional." },
                                "conversion_factor": { "type": "number", "description": "Units per pack (e.g. 10 tablets per strip), optional." },
                                "hsn_sac_code": { "type": "string", "description": "HSN/SAC code, optional." },
                                "barcode": { "type": "string", "description": "Barcode / EAN / UPC, optional." }
                            },
                            "required": ["item", "quantity"]
                        },
                        "description": "List of items received on the purchase invoice"
                    },
                    "notes": { "type": "string", "description": "Optional notes or comments." }
                },
                "required": ["vendor_name", "line_items"]
            }),
        },
        ToolSpec {
            name: "product_update_pricing",
            domain: "shop",
            description: "Directly update product pricing, selling price (shop_items.price), cost price (shop_items.cost_price), markup percentage, MRP, or discounts for an existing item by SKU, ID, or name.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sku": { "type": "string", "description": "Item SKU, product name, or ID (e.g. '7PKFJ7I5ND', 'Apple Mac Mini', 'item_...')" },
                    "selling_price": { "type": "number", "description": "New selling price (shop_items.price), optional." },
                    "price": { "type": "number", "description": "Alias for selling_price, optional." },
                    "cost_price": { "type": "number", "description": "New cost / purchase price (shop_items.cost_price), optional." },
                    "markup_pct": { "type": "number", "description": "Markup percentage on cost_price to compute selling price (e.g. 20 for cost + 20%), optional." },
                    "mrp": { "type": "number", "description": "Maximum Retail Price (default_mrp), optional." },
                    "discount_pct": { "type": "number", "description": "Default discount percentage, optional." }
                },
                "required": ["sku"]
            }),
        },
        ToolSpec {
            name: "inventory_add_stock",
            domain: "shop",
            description: "Add or adjust stock quantity for a SKU, product name, or item ID. Use for restocks, counts, or corrections.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sku": { "type": "string", "description": "Item SKU, product name, or identifier (e.g. 'Apple Mac Mini', '2B4FYFAVIO')" },
                    "quantity_delta": { "type": "number", "description": "Positive to add stock, negative to remove." },
                    "movement_type": { "type": "string", "enum": ["purchase", "adjustment"], "description": "Type of movement: 'purchase' for vendor restock or 'adjustment' for manual count/correction (default: 'adjustment')." },
                    "unit_cost": { "type": "number", "description": "Unit purchase cost if applicable." },
                    "vendor_name": { "type": "string", "description": "Vendor name if this is a purchase." },
                    "invoice_number": { "type": "string", "description": "Invoice reference number if applicable." },
                    "location": { "type": "string", "description": "Optional warehouse name or location tag." }
                },
                "required": ["sku", "quantity_delta"]
            }),
        },
        ToolSpec {
            name: "inventory_get_levels",
            domain: "shop",
            description: "Look up current stock levels, optionally filtered by SKU or category.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sku": { "type": "string", "description": "Optional SKU or product name to query specific item balance." },
                    "category": { "type": "string", "description": "Optional category name filter." }
                }
            }),
        },
        ToolSpec {
            name: "invoice_create",
            domain: "shop",
            description: "Create and draft a customer sales invoice in the shop billing system.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "customer_name": { "type": "string", "description": "Customer name or company name" },
                    "line_items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": { "type": "string" },
                                "quantity": { "type": "number" },
                                "unit_price": { "type": "number" }
                            },
                            "required": ["description", "quantity", "unit_price"]
                        }
                    },
                    "due_date": { "type": "string", "description": "Due date in YYYY-MM-DD format" }
                },
                "required": ["customer_name", "line_items"]
            }),
        },
        ToolSpec {
            name: "invoice_send",
            domain: "shop",
            description: "Mark a sales invoice as issued and ready for customer dispatch.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "invoice_id": { "type": "string", "description": "Invoice document ID or invoice number (e.g. 'doc_...' or 'INV-0001')" },
                    "recipient_email": { "type": "string", "description": "Customer email to send the invoice notification to" }
                },
                "required": ["invoice_id"]
            }),
        },
        ToolSpec {
            name: "contact_create",
            domain: "crm",
            description: "Create a new contact or lead in the CRM.",
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
            domain: "crm",
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
            domain: "content",
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
        ToolSpec {
            name: "page_create",
            domain: "pages",
            description: "Draft or create a new landing page or website page with title, slug, and optional markdown content.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Website page title (e.g. 'About Us', 'Pricing', 'Services')" },
                    "slug": { "type": "string", "description": "URL slug for the page (e.g. 'about', 'pricing'), optional" },
                    "excerpt": { "type": "string", "description": "Short summary or meta excerpt for the page, optional" },
                    "content": { "type": "string", "description": "Page body content or markdown sections, optional" },
                    "published": { "type": "boolean", "description": "Whether to publish immediately (defaults to false for draft)", "default": false }
                },
                "required": ["title"]
            }),
        },
        ToolSpec {
            name: "page_publish",
            domain: "pages",
            description: "Toggle published or draft status for a website page by ID or slug.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "page_id_or_slug": { "type": "string", "description": "Page ID or slug (e.g. 'about', 'page_xyz')" },
                    "published": { "type": "boolean", "description": "True to publish, false to unpublish/draft (defaults to true)", "default": true }
                },
                "required": ["page_id_or_slug"]
            }),
        },
        ToolSpec {
            name: "page_list",
            domain: "pages",
            description: "List all website pages, URLs, slugs, and publication statuses for the profile.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "published_only": { "type": "boolean", "description": "Filter to only show published pages, optional" }
                }
            }),
        },
        ToolSpec {
            name: "system_get_capabilities",
            domain: "system",
            description: "Discover all available BusinessKit platform capabilities, domains, tool counts, and features. Call when the user asks what abilities, tools, or domains exist.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "domain": { "type": "string", "description": "Optional domain filter (e.g. 'shop', 'crm', 'content', 'pages')" }
                }
            }),
        },
    ]
}

/// Fast-Path Resolver for explicit slash commands.
/// Returns ONLY the exact tool(s) needed, eliminating context bloat.
pub fn tools_for_slash_command(message: &str) -> Option<Vec<ToolSpec>> {
    let trimmed = message.trim();
    let cmd = trimmed.split_whitespace().next().unwrap_or("");
    let all = registry();

    let target_name = match cmd {
        "/add-inventory-from-invoice" | "/receive-stock" => Some("inventory_receive_purchase_invoice"),
        "/update-price" | "/set-price" => Some("product_update_pricing"),
        "/check-stock" | "/inventory" => Some("inventory_get_levels"),
        "/adjust-stock" | "/stock-adjustment" => Some("inventory_add_stock"),
        "/create-invoice" | "/bill" => Some("invoice_create"),
        "/send-invoice" => Some("invoice_send"),
        "/add-contact" | "/create-lead" => Some("contact_create"),
        "/update-contact" => Some("contact_update"),
        "/draft-post" => Some("blog_post_create"),
        "/create-page" => Some("page_create"),
        "/publish-page" => Some("page_publish"),
        "/list-pages" => Some("page_list"),
        "/capabilities" | "/tools" | "/help" => Some("system_get_capabilities"),
        _ => None,
    };

    target_name.map(|name| all.into_iter().filter(|t| t.name == name).collect())
}

/// Domain-scoped Tool Registry.
/// Filters tool definitions to only the active app domain (plus system discovery).
pub fn registry_for_domain(domain: Option<&str>) -> Vec<ToolSpec> {
    let d = domain.unwrap_or("all").trim().to_lowercase();
    let all = registry();

    if d == "all" || d.is_empty() {
        return all;
    }

    all.into_iter()
        .filter(|t| t.domain == d || t.domain == "system")
        .collect()
}

/// Tool-scoped Registry.
/// Filters tool definitions by exact tool names.
pub fn registry_for_tools(names: &[&str]) -> Vec<ToolSpec> {
    let all = registry();
    all.into_iter()
        .filter(|t| names.contains(&t.name))
        .collect()
}

/// Introspection summary of all platform capabilities.
pub fn capabilities_summary(filter_domain: Option<&str>) -> Value {
    let all = registry();
    let filter = filter_domain.map(|d| d.trim().to_lowercase());

    let domains = vec![
        ("shop", "Shop, inventory restock, purchase invoices, billing, and stock ledger"),
        ("crm", "Customer relationship management, leads, contacts, and outreach"),
        ("content", "Blog publishing, articles, media, and site content creation"),
        ("pages", "Website pages, landing pages, site content, and publishing"),
        ("system", "Platform introspection and agent system utilities"),
    ];

    let mut domain_list = Vec::new();
    for (d_name, d_desc) in domains {
        if let Some(ref f) = filter {
            if f != "all" && f != d_name {
                continue;
            }
        }

        let tools_in_domain: Vec<Value> = all
            .iter()
            .filter(|t| t.domain == d_name)
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description
                })
            })
            .collect();

        domain_list.push(json!({
            "domain": d_name,
            "description": d_desc,
            "tools_count": tools_in_domain.len(),
            "tools": tools_in_domain
        }));
    }

    json!({
        "total_tools": all.len(),
        "domains": domain_list
    })
}

/// Single dispatch point for all tool calls.
pub async fn execute(tool_name: &str, args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    match tool_name {
        "inventory_receive_purchase_invoice" => shop::inventory_receive_purchase_invoice(args, ctx).await,
        "product_update_pricing" => shop::product_update_pricing(args, ctx).await,
        "inventory_add_stock" => shop::inventory_add_stock(args, ctx).await,
        "inventory_get_levels" => shop::inventory_get_levels(args, ctx).await,
        "invoice_create" => shop::invoice_create(args, ctx).await,
        "invoice_send" => shop::invoice_send(args, ctx).await,
        "contact_create" => crm::contact_create(args, ctx).await,
        "contact_update" => crm::contact_update(args, ctx).await,
        "blog_post_create" => content::blog_post_create(args, ctx).await,
        "page_create" => pages::page_create(args, ctx).await,
        "page_publish" => pages::page_publish(args, ctx).await,
        "page_list" => pages::page_list(args, ctx).await,
        "system_get_capabilities" => {
            let dom = args.get("domain").and_then(Value::as_str);
            Ok(capabilities_summary(dom))
        }
        other => Err(format!("Unknown tool: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_contains_all_13_tools() {
        let tools = registry();
        assert_eq!(tools.len(), 13);
        let names: Vec<&str> = tools.iter().map(|t| t.name).collect();
        assert!(names.contains(&"inventory_receive_purchase_invoice"));
        assert!(names.contains(&"product_update_pricing"));
        assert!(names.contains(&"inventory_add_stock"));
        assert!(names.contains(&"inventory_get_levels"));
        assert!(names.contains(&"invoice_create"));
        assert!(names.contains(&"invoice_send"));
        assert!(names.contains(&"contact_create"));
        assert!(names.contains(&"contact_update"));
        assert!(names.contains(&"blog_post_create"));
        assert!(names.contains(&"page_create"));
        assert!(names.contains(&"page_publish"));
        assert!(names.contains(&"page_list"));
        assert!(names.contains(&"system_get_capabilities"));
    }

    #[test]
    fn test_fast_path_slash_command_resolves_single_tool() {
        let fast = tools_for_slash_command("/add-inventory-from-invoice Apple 5 pcs").unwrap();
        assert_eq!(fast.len(), 1);
        assert_eq!(fast[0].name, "inventory_receive_purchase_invoice");

        let fast_stock = tools_for_slash_command("/check-stock").unwrap();
        assert_eq!(fast_stock.len(), 1);
        assert_eq!(fast_stock[0].name, "inventory_get_levels");

        let fast_page = tools_for_slash_command("/create-page About Us").unwrap();
        assert_eq!(fast_page.len(), 1);
        assert_eq!(fast_page[0].name, "page_create");
    }

    #[test]
    fn test_domain_filtering() {
        let shop_tools = registry_for_domain(Some("shop"));
        assert_eq!(shop_tools.len(), 7); // 6 shop + 1 system
        assert!(shop_tools.iter().any(|t| t.name == "inventory_receive_purchase_invoice"));
        assert!(shop_tools.iter().any(|t| t.name == "product_update_pricing"));
        assert!(!shop_tools.iter().any(|t| t.name == "contact_create"));

        let crm_tools = registry_for_domain(Some("crm"));
        assert_eq!(crm_tools.len(), 3); // 2 crm + 1 system
        assert!(crm_tools.iter().any(|t| t.name == "contact_create"));

        let pages_tools = registry_for_domain(Some("pages"));
        assert_eq!(pages_tools.len(), 4); // 3 pages + 1 system
        assert!(pages_tools.iter().any(|t| t.name == "page_create"));
    }

    #[test]
    fn test_capabilities_summary() {
        let summary = capabilities_summary(None);
        assert_eq!(summary["total_tools"], 13);
        assert!(summary["domains"].is_array());
    }

    #[test]
    fn test_registry_for_tools() {
        let single = registry_for_tools(&["inventory_receive_purchase_invoice"]);
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].name, "inventory_receive_purchase_invoice");

        let multi = registry_for_tools(&["inventory_receive_purchase_invoice", "contact_create"]);
        assert_eq!(multi.len(), 2);
        let names: Vec<&str> = multi.iter().map(|t| t.name).collect();
        assert!(names.contains(&"inventory_receive_purchase_invoice"));
        assert!(names.contains(&"contact_create"));

        let empty = registry_for_tools(&["non_existent_tool"]);
        assert_eq!(empty.len(), 0);
    }
}
