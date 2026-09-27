// src/components/agents/ToolResultCard.tsx
// Visual card displaying agent tool executions (in-flight, completed, failed) and structured data.

import { component$ } from "@builder.io/qwik";
import {
  LuPackage,
  LuFileText,
  LuUserCheck,
  LuPenTool,
  LuLayers,
  LuLoader,
} from "@qwikest/icons/lucide";

export interface UiToolAction {
  id: string;
  tool: string;
  args?: any;
  result?: any;
  status: "executing" | "completed" | "failed";
}

export interface ToolResultCardProps {
  tool: UiToolAction;
}

export const ToolResultCard = component$<ToolResultCardProps>(({ tool }) => {
  const isCompleted = tool.status === "completed";
  const isExecuting = tool.status === "executing";
  const isFailed = tool.status === "failed";

  const getToolIcon = () => {
    switch (tool.tool) {
      case "inventory_receive_purchase_invoice":
      case "inventory_add_stock":
      case "inventory_get_levels":
      case "product_update_pricing":
        return <LuPackage style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />;
      case "invoice_create":
      case "invoice_send":
        return <LuFileText style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />;
      case "contact_create":
      case "contact_update":
        return <LuUserCheck style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />;
      case "blog_post_create":
        return <LuPenTool style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />;
      default:
        return <LuLayers style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />;
    }
  };

  const getTitle = () => {
    switch (tool.tool) {
      case "inventory_receive_purchase_invoice":
        return "Purchase Invoice Received";
      case "product_update_pricing":
        return "Product Pricing Updated";
      case "inventory_add_stock":
        return "Stock Inventory Updated";
      case "inventory_get_levels":
        return "Stock Levels Query";
      case "invoice_create":
        return "Invoice Created";
      case "invoice_send":
        return "Invoice Sent";
      case "contact_create":
        return "CRM Contact Created";
      case "contact_update":
        return "CRM Contact Updated";
      case "blog_post_create":
        return "Content Published";
      default:
        return tool.tool;
    }
  };

  const formatValue = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      if (typeof v[0] === "object") {
        return v
          .map((item) => {
            const name = item.item_name || item.name || item.sku || "Item";
            const qty = item.quantity_received ?? item.quantity_delta ?? item.quantity_on_hand ?? item.qty;
            const cost = item.unit_cost ?? item.unit_price;
            const selling = item.selling_price;
            if (qty !== undefined && cost !== undefined && cost > 0) {
              const spStr = selling ? ` · Selling ₹${selling}` : "";
              return `${name} (+${qty} @ ₹${cost}${spStr})`;
            } else if (qty !== undefined) {
              return `${name} (${qty >= 0 ? "+" : ""}${qty})`;
            }
            return name;
          })
          .join(", ");
      }
      return v.join(", ");
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div style="border-radius:0.5rem;border:1px solid var(--border);background:var(--surface-2);overflow:hidden;display:flex;flex-direction:column;user-select:text;-webkit-user-select:text;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          background: "var(--surface-3)",
          borderBottom: tool.result ? "1px solid var(--border)" : "none",
          userSelect: "none",
        }}
      >
        <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;font-weight:600;color:var(--text-primary);">
          {getToolIcon()}
          <span>{getTitle()}</span>
        </div>

        <div>
          {isExecuting && (
            <span style="font-size:0.6875rem;color:var(--warning, #f59e0b);display:flex;align-items:center;gap:0.25rem;">
              <LuLoader style="width:0.625rem;height:0.625rem;animation:spin 1s linear infinite;" />
              Running
            </span>
          )}
          {isCompleted && (
            <span style="font-size:0.6875rem;font-weight:500;padding:1px 6px;border-radius:9999px;background:var(--success-soft, rgba(16,185,129,0.1));color:var(--success);border:1px solid rgba(16,185,129,0.2);">
              Applied
            </span>
          )}
          {isFailed && (
            <span style="font-size:0.6875rem;font-weight:500;padding:1px 6px;border-radius:9999px;background:var(--error-soft, rgba(239,68,68,0.1));color:var(--error);border:1px solid rgba(239,68,68,0.2);">
              Failed
            </span>
          )}
        </div>
      </div>

      {tool.result && (
        <div style="padding:0.5rem 0.75rem;font-family:monospace;font-size:0.6875rem;color:var(--text-secondary);overflow-x:auto;user-select:text;-webkit-user-select:text;line-height:1.55;">
          {typeof tool.result === "object" ? (
            <div style="display:flex;flex-direction:column;gap:3px;">
              {Object.entries(tool.result).map(([k, v]) => (
                <div key={k} style="display:flex;align-items:baseline;gap:0.5rem;">
                  <span style="color:var(--text-secondary);flex-shrink:0;">{k}:</span>
                  <span style="color:var(--text-primary);font-weight:500;word-break:break-word;">{formatValue(v)}</span>
                </div>
              ))}
            </div>
          ) : (
            String(tool.result)
          )}
        </div>
      )}
    </div>
  );
});
