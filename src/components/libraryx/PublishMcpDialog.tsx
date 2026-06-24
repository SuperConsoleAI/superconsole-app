import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { api, type SubmitMcpInput } from "../../lib/api";
import { Button } from "@/components/ui/button";

const EMPTY_FORM = (): SubmitMcpInput => ({
  id: "supabase",
  name: "Supabase",
  description: "Connect your Supabase projects to Cursor, Claude, Windsurf, and other AI assistants.",
  author: "supabase",
  category: "apis",
  type: "http",
  url: "https://mcp.supabase.com/mcp",
  command: "npx",
  args: '["-y", "@modelcontextprotocol/server-postgres"]',
  env: "{}",
  requiredEnvVars: "[]",
  githubUrl: "https://github.com/supabase/mcp",
  iconUrl: "https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo.svg",
  docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function PublishMcpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<SubmitMcpInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM());
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof SubmitMcpInput, v: string | boolean) =>
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
      const isHttp = form.type === "http";
      await api.submitMcpToCloud({
        ...form,
        url: isHttp ? form.url : undefined,
        command: isHttp ? undefined : form.command,
        args: isHttp ? "[]" : form.args,
        env: isHttp ? "{}" : form.env,
        iconUrl: form.iconUrl || undefined,
        docsUrl: form.docsUrl || undefined,
      });
      setResult({ ok: true, msg: "MCP published successfully." });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, k: keyof SubmitMcpInput, placeholder: string) => (
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
          <span className="font-semibold">Publish MCP to Turso</span>
          <button className="ml-auto rounded p-1 hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            {field("MCP ID (slug)", "id", "my-mcp")}
            {field("Name", "name", "My MCP")}
            {field("Author", "author", "username")}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="tools">Tools</option>
                <option value="data">Data</option>
                <option value="apis">APIs</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Short description of the MCP..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="col-span-2">
              {field("GitHub URL", "githubUrl", "https://github.com/owner/repo")}
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="http">HTTP (Remote Server)</option>
                <option value="stdio">STDIO (Local Command)</option>
              </select>
            </div>
            
            {form.type === "http" && (
              <div className="col-span-1">
                {field("HTTP URL", "url", "https://mcp.supabase.com/mcp")}
              </div>
            )}

            {form.type === "stdio" && (
              <>
                {field("Install Command", "command", "npx")}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Install Args (JSON Array)</label>
                  <input
                    type="text"
                    placeholder='["-y", "@modelcontextprotocol/server-postgres"]'
                    value={form.args}
                    onChange={(e) => set("args", e.target.value)}
                    className="font-mono text-xs h-7 rounded-md border bg-background px-2.5 outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Env Vars (JSON Object)</label>
                  <input
                    type="text"
                    placeholder='{"GITHUB_TOKEN": ""}'
                    value={form.env}
                    onChange={(e) => set("env", e.target.value)}
                    className="font-mono text-xs h-7 rounded-md border bg-background px-2.5 outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </>
            )}

            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Required Env Vars (JSON Array)</label>
              <input
                type="text"
                placeholder='["DATABASE_URL"]'
                value={form.requiredEnvVars}
                onChange={(e) => set("requiredEnvVars", e.target.value)}
                className="font-mono text-xs h-7 rounded-md border bg-background px-2.5 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {field("Icon URL", "iconUrl", "https://…/icon.svg")}
            {field("Docs URL", "docsUrl", "https://docs.example.com")}
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
              {submitting ? "Publishing..." : "Publish MCP"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
