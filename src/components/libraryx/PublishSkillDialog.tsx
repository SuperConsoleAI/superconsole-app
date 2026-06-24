import { useState } from "react";
import { Upload, X } from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "@/components/ui/button";

export function PublishSkillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name || !githubUrl || !description || !author) {
      setResult({ ok: false, msg: "Name, GitHub URL, Description, and Author are required." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      await api.submitToSkillCatalog(
        name.trim(),
        description.trim(),
        category.trim(),
        tags.split(",").map(t => t.trim()).filter(Boolean),
        githubUrl.trim(),
        "", // readme
        author.trim()
      );
      setResult({ ok: true, msg: "Skill published successfully." });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, value: string, setValue: (v: string) => void, placeholder: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
          <span className="font-semibold">Publish Skill to Turso</span>
          <button className="ml-auto rounded p-1 hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            {field("Skill Name", name, setName, "my-skill")}
            {field("Author", author, setAuthor, "github-username")}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Short description of the skill..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            {field("Category", category, setCategory, "e.g. dev, ops")}
            {field("Tags (comma separated)", tags, setTags, "react, typescript")}
            
            <div className="col-span-2">
              {field("GitHub URL", githubUrl, setGithubUrl, "https://github.com/owner/repo/tree/main/skill")}
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
              {submitting ? "Publishing..." : "Publish Skill"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
