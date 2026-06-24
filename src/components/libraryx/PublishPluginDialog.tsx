import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { api, type SubmitPluginInput } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

const EMPTY_FORM: SubmitPluginInput = {
  id: "",
  name: "",
  description: "",
  author: "",
  version: "1.0.0",
  category: "productivity",
  featured: false,
  skillIds: "[]",
  mcpIds: "[]",
  commandIds: "[]",
    skillsUrl: "[]",
    mcpUrl: "[]",
    commandsUrl: "[]",
    hooksUrl: "[]",
  connectorAuth: "[]",
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function PublishPluginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<SubmitPluginInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [skillsCat, setSkillsCat] = useState<any[]>([]);
  const [mcpCat, setMcpCat] = useState<any[]>([]);
  const [commandsCat, setCommandsCat] = useState<any[]>([]);
  const [connectorsCat, setConnectorsCat] = useState<any[]>([]);
  const [pluginsCat, setPluginsCat] = useState<any[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<string>("");

  useEffect(() => {
    if (open) {
      api.fetchSkillCatalog().then(setSkillsCat).catch(console.error);
      api.listMcpCatalog().then(setMcpCat).catch(console.error);
      api.listCommandsCatalog().then(setCommandsCat).catch(console.error);
      api.listConnectorCatalog().then(setConnectorsCat).catch(console.error);
      // Fetch existing plugins for the edit dropdown (using workspace 0 or any since it's global catalog)
      api.listPluginsCatalog("account", "account").then(setPluginsCat).catch(console.error);
      setForm(EMPTY_FORM);
      setSelectedPluginId("");
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof SubmitPluginInput, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleNameChange = (v: string) => {
    setForm((f) => ({ ...f, name: v, id: f.id === slugify(f.name) || f.id === "" ? slugify(v) : f.id }));
  };

  const handlePluginSelect = (pid: string) => {
    setSelectedPluginId(pid);
    if (!pid) {
      setForm(EMPTY_FORM);
      return;
    }
    const p = pluginsCat.find(x => x.id === pid);
    if (p) {
      setForm({
        id: p.id,
        name: p.name,
        description: p.description,
        author: p.author,
        version: p.version,
        category: p.category,
        featured: p.featured,
        skillIds: p.skillIds || "[]",
        skillsUrl: p.skillsUrl || "[]",
        mcpUrl: p.mcpUrl || "[]",
        commandsUrl: p.commandsUrl || "[]",
        hooksUrl: p.hooksUrl || "[]",
        mcpIds: p.mcpIds || "[]",
        commandIds: p.commandIds || "[]",
        connectorAuth: p.connectorAuth || "[]",
      });
    }
  };

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.description) {
      setResult({ ok: false, msg: "ID, Name, and Description are required." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      await api.submitPluginToCloud(form);
      setResult({ ok: true, msg: "Plugin published successfully." });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, k: keyof SubmitPluginInput, placeholder: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={(form[k] as string) || ""}
        onChange={(e) => {
          if (k === "name") handleNameChange(e.target.value);
          else set(k, e.target.value);
        }}
        className="h-7 rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <Upload className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <span className="font-semibold">Publish Plugin to Turso</span>
          <button className="ml-auto rounded p-1 hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1 border-b bg-accent/30 px-5 py-3">
            <label className="text-[11px] font-medium text-muted-foreground">Edit Existing Plugin</label>
            <select
              value={selectedPluginId}
              onChange={(e) => handlePluginSelect(e.target.value)}
              className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Create New Plugin --</option>
              {pluginsCat.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            {field("Plugin ID (slug)", "id", "my-plugin")}
            {field("Name", "name", "My Plugin")}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Short description of what this plugin bundles..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {field("Author", "author", "username")}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="productivity">Productivity</option>
                <option value="development">Development</option>
                <option value="design">Design</option>
              </select>
            </div>
            
            {field("GitHub URL", "githubUrl", "https://github.com/.../plugin")}
            {/* Skills */}
            <MultiSelectDropdown
              label="Skills"
              options={skillsCat}
              selectedIds={(() => {
                try {
                  return JSON.parse(form.skillIds);
                } catch {
                  return [];
                }
              })()}
              onChange={(ids: string[]) => {
                set("skillIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const s = skillsCat.find(x => x.id === id);
                  return s && s.githubUrl ? s.githubUrl : null;
                }).filter(Boolean);
                set("skillsUrl", JSON.stringify(urls));
              }}
            />

            {/* MCPs */}
            <MultiSelectDropdown
              label="MCP Tools"
              options={mcpCat}
              selectedIds={(() => {
                try {
                  return JSON.parse(form.mcpIds);
                } catch {
                  return [];
                }
              })()}
              onChange={(ids: string[]) => {
                set("mcpIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const m = mcpCat.find(x => x.id === id);
                  if (m && m.installCommand === "npx") {
                    return { id: m.id, type: "npx", package: m.githubUrl || "", env: m.installArgs ? JSON.parse(m.installArgs) : {} };
                  } else if (m) {
                    return { id: m.id, type: "stdio", command: m.installCommand, args: m.installArgs ? JSON.parse(m.installArgs) : [], env: {} };
                  }
                  return null;
                }).filter(Boolean);
                set("mcpUrl", JSON.stringify(urls));
              }}
            />

            {/* Commands */}
            <MultiSelectDropdown
              label="Commands"
              options={commandsCat}
              selectedIds={(() => {
                try {
                  return JSON.parse(form.commandIds);
                } catch {
                  return [];
                }
              })()}
              onChange={(ids: string[]) => {
                set("commandIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const c = commandsCat.find(x => x.id === id);
                  return c && c.githubUrl ? c.githubUrl : null;
                }).filter(Boolean);
                set("commandsUrl", JSON.stringify(urls));
              }}
            />

            {/* Connector Auth */}
            <MultiSelectDropdown
              label="Connectors"
              options={connectorsCat}
              selectedIds={(() => {
                try {
                  return JSON.parse(form.connectorAuth).map((a: any) => typeof a === 'string' ? a : a.connector_id);
                } catch {
                  return [];
                }
              })()}
              onChange={(ids: string[]) => {
                const auths = ids.map((id: string) => ({
                  connector_id: id,
                  required: true,
                }));
                set("connectorAuth", JSON.stringify(auths));
              }}
            />

            <div className="col-span-2 mt-2 flex items-center gap-2 rounded-md border bg-accent/50 px-3 py-2">
              <input
                type="checkbox"
                id="featured"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
                className="rounded border-input text-primary"
              />
              <label htmlFor="featured" className="text-xs font-medium">
                Mark as Featured Plugin
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t px-5 py-3">
          {result && (
            <p className={`text-[13px] ${result.ok ? "text-green-500" : "text-destructive"}`}>
              {result.msg}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Publishing..." : selectedPluginId ? "Save Changes" : "Publish to Turso"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
