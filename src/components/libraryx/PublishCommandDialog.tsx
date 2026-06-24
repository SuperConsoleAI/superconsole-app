import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { api, type SubmitCommandInput } from "../../lib/api";
import { Button } from "@/components/ui/button";

const EMPTY_FORM = (): SubmitCommandInput => ({
  id: "",
  name: "",
  slash: "",
  description: "",
  author: "",
  category: "utility",
  githubUrl: "",
  content: "",
  iconUrl: "",
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function PublishCommandDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<SubmitCommandInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM());
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof SubmitCommandInput, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleNameChange = (v: string) => {
    setForm((f) => ({ ...f, name: v, id: f.id === slugify(f.name) || f.id === "" ? slugify(v) : f.id }));
  };

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.slash || !form.description || !form.githubUrl) {
      setResult({ ok: false, msg: "ID, Name, Slash, Description, and GitHub URL are required." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      await api.submitCommandToCloud({
        ...form,
        content: form.content || undefined,
        iconUrl: form.iconUrl || undefined,
      });
      setResult({ ok: true, msg: "Command published successfully." });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, k: keyof SubmitCommandInput, placeholder: string) => (
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
          <span className="font-semibold">Publish Command to Turso</span>
          <button className="ml-auto rounded p-1 hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            {field("Command ID (slug)", "id", "my-command")}
            {field("Name", "name", "My Command")}
            {field("Author", "author", "username")}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="utility">Utility</option>
                <option value="development">Development</option>
                <option value="system">System</option>
              </select>
            </div>
            {field("Slash Command", "slash", "/my-command")}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Short description of the command..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="col-span-2">
              {field("GitHub URL", "githubUrl", "https://github.com/owner/repo/blob/main/command.md")}
            </div>
            
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Pre-cached Content (Optional Markdown)</label>
              <textarea
                rows={4}
                placeholder="# Command Documentation..."
                value={form.content || ""}
                onChange={(e) => set("content", e.target.value)}
                className="font-mono text-xs resize-none rounded-md border bg-background px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="col-span-2">
              {field("Icon URL", "iconUrl", "https://…/icon.svg")}
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
              {submitting ? "Publishing..." : "Publish Command"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
