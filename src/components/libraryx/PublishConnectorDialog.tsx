import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { api, type SubmitConnectorInput } from "../../lib/api";
import { Button } from "@/components/ui/button";

const EMPTY_FORM = (): SubmitConnectorInput => ({
  id: "",
  name: "",
  description: "",
  category: "integrations",
  authType: "api_key",
  oauthUrl: "",
  apiKeyFields: "[]",
  docsUrl: "",
  iconUrl: "",
  scope: "project",
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function PublishConnectorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<SubmitConnectorInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM());
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof SubmitConnectorInput, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleNameChange = (v: string) => {
    setForm((f) => ({ ...f, name: v, id: f.id === slugify(f.name) || f.id === "" ? slugify(v) : f.id }));
  };

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.description) {
      setResult({ ok: false, msg: "ID, Name, and Description are required." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      await api.submitConnectorToCloud({
        ...form,
        oauthUrl: form.oauthUrl || undefined,
        iconUrl: form.iconUrl || undefined,
        docsUrl: form.docsUrl || undefined,
      });
      setResult({ ok: true, msg: "Connector published successfully." });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, k: keyof SubmitConnectorInput, placeholder: string) => (
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
          <span className="font-semibold">Publish Connector to Turso</span>
          <button className="ml-auto rounded p-1 hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            {field("Connector ID (slug)", "id", "github")}
            {field("Name", "name", "GitHub")}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Short description of the connector…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="integrations">Integrations</option>
                <option value="connectors">Connectors</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Auth Type</label>
              <select
                value={form.authType}
                onChange={(e) => set("authType", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="api_key">API Key</option>
                <option value="oauth">OAuth</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Scope</label>
              <select
                value={form.scope}
                onChange={(e) => set("scope", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="account">Account</option>
                <option value="org">Organisation</option>
                <option value="project">Project</option>
              </select>
            </div>

            {field("Icon URL", "iconUrl", "https://…/icon.svg")}
            <div className="col-span-2">
              {field("Docs URL", "docsUrl", "https://docs.example.com")}
            </div>
            {form.authType === "oauth" && (
              <div className="col-span-2">
                {field("OAuth URL", "oauthUrl", "https://oauth.example.com/login")}
              </div>
            )}
            {form.authType === "api_key" && (
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">API Key Fields (JSON)</label>
                <textarea
                  rows={3}
                  value={form.apiKeyFields}
                  onChange={(e) => set("apiKeyFields", e.target.value)}
                  className="font-mono text-[10px] resize-none rounded-md border bg-background px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
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
              {submitting ? "Publishing..." : "Publish Connector"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
