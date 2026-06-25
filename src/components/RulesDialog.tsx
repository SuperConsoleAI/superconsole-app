import { useCallback, useEffect, useState } from "react";
import {
  
  Pencil,
  
  Trash2,
  List,
  Check,
} from "lucide-react";
import { api, type RuleFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PluginIcon } from "./PluginIcon";

export type RuleEditing = {
  slug: string;
  name: string;
  description: string;
  content: string;
  alwaysApply: boolean;
  isNew: boolean;
} | null;

export function RuleEditorDialog({
  workspaceId,
  editing,
  setEditing,
  onSaved
}: {
  workspaceId: number;
  editing: RuleEditing;
  setEditing: (e: RuleEditing) => void;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.slug.trim()) {
      setError("Slug is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const finalContent = `---\nname: ${editing.name || editing.slug}\ndescription: ${editing.description}\nalways_apply: ${editing.alwaysApply}\n---\n\n${editing.content}`;
      
      await api.writeRule(
        workspaceId,
        editing.slug.trim(),
        finalContent
      );
      setEditing(null);
      if (onSaved) onSaved();
      window.dispatchEvent(new Event("refresh-rules"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-4">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <List className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{editing.isNew ? "Create Rule" : "Edit Rule"}</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="rule-slug"
                  className="h-8 text-sm"
                  disabled={!editing.isNew}
                />
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Display Name"
                  className="h-8 text-sm"
                />
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="One-line description"
                  className="col-span-2 h-8 text-sm"
                />
                <div className="col-span-2 flex items-center gap-2 px-1 mt-1">
                  <input
                    type="checkbox"
                    id="alwaysApply"
                    checked={editing.alwaysApply}
                    onChange={(e) => setEditing({ ...editing, alwaysApply: e.target.checked })}
                    className="rounded border-gray-300 bg-background text-primary focus:ring-primary"
                  />
                  <label htmlFor="alwaysApply" className="text-sm font-medium text-muted-foreground">
                    Always apply this rule
                  </label>
                </div>
                <Textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="Rule logic goes here..."
                  className="col-span-2 min-h-[300px] font-mono text-xs mt-2"
                />
              </div>
            
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-8" onClick={save} disabled={busy || !editing.slug.trim()}>
                {editing.isNew ? "Create Rule" : "Save Rule"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RulesView({ workspaceId }: { workspaceId: number }) {
  const [rules, setRules] = useState<RuleFile[]>([]);
  const [editing, setEditing] = useState<RuleEditing>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listRules(workspaceId).then(setRules).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener('refresh-rules', onRefresh);
    return () => window.removeEventListener('refresh-rules', onRefresh);
  }, [refresh]);

  const openEditor = async (r: RuleFile) => {
    try {
      const fullRule = await api.readRule(workspaceId, r.slug);
      let body = fullRule.content;
      if (body.startsWith("---\n")) {
        const end = body.indexOf("\n---", 4);
        if (end !== -1) {
          body = body.slice(end + 4).trimStart();
        }
      }
      setEditing({
        slug: r.slug,
        name: r.name,
        description: r.description,
        content: body,
        alwaysApply: r.always_apply,
        isNew: false,
      });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteRule = async (slug: string) => {
    if (!confirm(`Delete rule ${slug}.mdc?`)) return;
    try {
      await api.deleteRule(workspaceId, slug);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-4">
            {error && <p className="text-xs text-destructive mb-4">{error}</p>}

      <RuleEditorDialog 
        workspaceId={workspaceId} 
        editing={editing} 
        setEditing={setEditing} 
        onSaved={refresh} 
      />

      <ScrollArea className="flex-1">
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rules yet. Create one to define contextual instructions.
          </p>
        ) : (
          <div>
            <table className="w-full text-left text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-4 py-2 font-medium text-xs text-muted-foreground w-full">Rules</th>
                  <th className="px-4 py-2 font-medium text-xs text-muted-foreground w-0 whitespace-nowrap text-right">Author</th>
                  <th className="px-4 py-2 font-medium text-xs text-muted-foreground w-0 whitespace-nowrap text-center">Apply Always</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rules.map((r) => (
                  <tr key={r.slug} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2"><List className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{r.name || r.slug}</span></div>
                        {r.description && <span className="text-xs text-muted-foreground">{r.description}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 w-0 whitespace-nowrap text-right">
                      {r.author ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <PluginIcon pluginId={r.author} className="h-4 w-4" />
                          <span className="text-xs font-medium">{r.author}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground block text-right">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 w-0 whitespace-nowrap text-center">
                      {r.always_apply ? (
                        <div className="flex justify-center"><Check className="h-4 w-4" /></div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditor(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete" onClick={() => deleteRule(r.slug)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
