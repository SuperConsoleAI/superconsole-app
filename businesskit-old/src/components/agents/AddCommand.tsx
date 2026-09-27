// src/components/agents/AddCommand.tsx
//
// Standalone SlideOver panel component for creating and editing Agent Commands.
// Integrates AgentToolsPicker for tool scoping with "by default no tool selected".

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuLoader } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { AgentToolsPicker, type ToolCatalogItem } from "./AgentToolsPicker";
import { createAgentCommand, updateAgentCommand } from "~/lib/ipc";
import type { AgentCommand, CreateAgentCommandPayload } from "~/lib/types";

export interface AddCommandProps {
  open: Signal<boolean>;
  editingCommand: Signal<AgentCommand | null>;
  defaultDomain?: string;
  toolsCatalog?: ToolCatalogItem[];
  onSaved$: PropFunction<(cmd: AgentCommand) => void>;
  onClose$?: PropFunction<() => void>;
}

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill, var(--surface-1))",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export const AddCommand = component$<AddCommandProps>(({
  open,
  editingCommand,
  defaultDomain = "shop",
  toolsCatalog,
  onSaved$,
  onClose$,
}) => {
  const fName           = useSignal("");
  const fSlash          = useSignal("");
  const fDomain         = useSignal<"shop" | "crm" | "content" | "system">("shop");
  const fDescription    = useSignal("");
  const fPromptTemplate = useSignal("");
  // By default no tool selected as requested
  const fSelectedTools  = useSignal<string[]>([]);
  const saving          = useSignal(false);
  const error           = useSignal<string | null>(null);

  // Sync state whenever editingCommand changes or panel opens
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const isOpen = track(() => open.value);
    const cmd = track(() => editingCommand.value);

    if (isOpen) {
      if (cmd) {
        fName.value = cmd.name;
        fSlash.value = cmd.slash;
        fDomain.value = (cmd.domainTags[0] || "shop") as any;
        fDescription.value = cmd.description || "";
        fPromptTemplate.value = cmd.promptTemplate || "";
        fSelectedTools.value = [...cmd.requiredTools];
      } else {
        fName.value = "";
        fSlash.value = "";
        fDomain.value = (defaultDomain !== "all" ? defaultDomain : "shop") as any;
        fDescription.value = "";
        fPromptTemplate.value = "";
        // By default no tool selected
        fSelectedTools.value = [];
      }
      error.value = null;
    }
  });

  const handleSave = $(async () => {
    if (!fName.value.trim()) {
      error.value = "Command name is required";
      return;
    }
    let slash = fSlash.value.trim();
    if (!slash) {
      slash = "/" + fName.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    if (!slash.startsWith("/")) {
      slash = "/" + slash;
    }

    saving.value = true;
    error.value = null;

    try {
      const payload: CreateAgentCommandPayload = {
        name: fName.value.trim(),
        slash,
        domainTags: [fDomain.value],
        description: fDescription.value.trim() || undefined,
        promptTemplate: fPromptTemplate.value.trim() || undefined,
        requiredTools: fSelectedTools.value.length > 0 ? fSelectedTools.value : undefined,
      };

      let result: AgentCommand;
      if (editingCommand.value) {
        result = await updateAgentCommand(editingCommand.value.id, payload);
      } else {
        result = await createAgentCommand(payload);
      }

      await onSaved$(result);
      open.value = false;
      if (onClose$) {
        await onClose$();
      }
    } catch (e: any) {
      error.value = typeof e === "string" ? e : e.message || String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <SlideOver
      open={open}
      title={editingCommand.value ? "Edit Agent Command" : "New Agent Command"}
      subtitle="Configure slash command trigger, domain scope, and required tools."
      width="460px"
      onClose$={$(() => {
        open.value = false;
        if (onClose$) onClose$();
      })}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {error.value && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error, #ef4444)",
              fontSize: "0.8125rem",
            }}
          >
            {error.value}
          </div>
        )}

        <div>
          <label style={labelStyle}>Command Name *</label>
          <input
            type="text"
            placeholder="e.g. Scan Purchase Invoice, Check Restock"
            value={fName.value}
            onInput$={(e) => {
              fName.value = (e.target as HTMLInputElement).value;
              if (!editingCommand.value && !fSlash.value) {
                fSlash.value =
                  "/" +
                  (e.target as HTMLInputElement).value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
              }
            }}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Slash Command Trigger *</label>
          <input
            type="text"
            placeholder="e.g. /scan-invoice, /check-stock"
            value={fSlash.value}
            onInput$={(e) => {
              fSlash.value = (e.target as HTMLInputElement).value;
            }}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.875rem" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Primary Domain</label>
          <select
            value={fDomain.value}
            onChange$={(e) => {
              fDomain.value = (e.target as HTMLSelectElement).value as any;
            }}
            style={{
              ...inputStyle,
              cursor: "pointer",
              appearance: "none",
              backgroundImage: SELECT_ARROW,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.75rem center",
              paddingRight: "2.25rem",
            }}
          >
            <option value="shop">Shop & Stock (Inventory, Invoices, Pricing)</option>
            <option value="crm">CRM & Leads (Contacts, Clients, Vendors)</option>
            <option value="content">Content & CMS (Blog Posts, Articles)</option>
            <option value="system">System (Capabilities & Platform)</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Description (Optional)</label>
          <input
            type="text"
            placeholder="e.g. OCR and parse vendor invoice PDF to restock products"
            value={fDescription.value}
            onInput$={(e) => {
              fDescription.value = (e.target as HTMLInputElement).value;
            }}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Starter Prompt Template (Optional)</label>
          <textarea
            placeholder="Pre-fills composer text when command is clicked, e.g. /scan-invoice [Attached PDF]"
            value={fPromptTemplate.value}
            onInput$={(e) => {
              fPromptTemplate.value = (e.target as HTMLTextAreaElement).value;
            }}
            style={{
              ...inputStyle,
              height: "4.5rem",
              padding: "0.5rem 0.75rem",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* ── Tool Scoping Multi-Select via AgentToolsPicker ── */}
        <AgentToolsPicker
          selectedTools={fSelectedTools}
          domainContext={fDomain.value}
          tools={toolsCatalog}
          mode="picker"
        />

        {/* Form Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", paddingTop: "0.5rem" }}>
          <button
            type="button"
            disabled={saving.value}
            onClick$={handleSave}
            style={{
              flex: 1,
              height: "2.375rem",
              background: "var(--button-primary-bg, #3B82F6)",
              color: "var(--button-primary-text, #ffffff)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem; animation: spin 1s linear infinite;" /> Saving…
              </>
            ) : editingCommand.value ? (
              "Update Command"
            ) : (
              "Save Command"
            )}
          </button>
          <button
            type="button"
            onClick$={() => {
              open.value = false;
              if (onClose$) onClose$();
            }}
            style={{
              height: "2.375rem",
              padding: "0 1.25rem",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </SlideOver>
  );
});
