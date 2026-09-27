import React, { useState } from "react";
import {
  Code,
  Copy,
  Check,
  Key,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { type LocalDbTableSchema } from "@/lib/api";

interface LocalDBSchemaProps {
  schema: LocalDbTableSchema | null;
  loading: boolean;
}

export const LocalDBSchema: React.FC<LocalDBSchemaProps> = ({ schema, loading }) => {
  const [copied, setCopied] = useState(false);
  const [showRawSql, setShowRawSql] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        Loading schema structure...
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        Select a table to view structure
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(schema.createStatement);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto custom-scrollbar bg-background">
      {/* Table Name Card */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-card border border-border">
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Table Name
          </div>
          <div className="text-base font-mono font-semibold text-primary">
            {schema.tableName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRawSql(!showRawSql)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-muted hover:bg-accent text-foreground transition-colors border border-border"
          >
            <Code className="w-3.5 h-3.5" />
            <span>{showRawSql ? "Hide SQL" : "View SQL"}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy DDL"}</span>
          </button>
        </div>
      </div>

      {/* Raw SQL Statement (Collapsible) */}
      {showRawSql && (
        <div className="p-4 rounded-lg bg-card border border-border font-mono text-xs text-foreground overflow-x-auto">
          <pre className="whitespace-pre-wrap leading-relaxed text-primary">
            {schema.createStatement}
          </pre>
        </div>
      )}

      {/* Columns Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
            <Layers className="w-4 h-4 text-primary" />
            <span>Columns ({schema.columns.length})</span>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-muted/60 border-b border-border text-[11px] text-muted-foreground">
              <tr>
                <th className="py-2.5 px-4 font-medium">#</th>
                <th className="py-2.5 px-4 font-medium">Column Name</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium">Constraints</th>
                <th className="py-2.5 px-4 font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {schema.columns.map((col) => (
                <tr key={col.cid} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-4 text-muted-foreground">{col.cid}</td>
                  <td className="py-2.5 px-4 font-medium text-foreground flex items-center gap-2">
                    {col.pk && (
                      <span title="Primary Key" className="inline-flex items-center">
                        <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      </span>
                    )}
                    <span>{col.name}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-foreground font-semibold text-[11px] border border-border">
                      {col.typeName || "ANY"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      {col.pk && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] border border-amber-500/30 font-medium">
                          PRIMARY KEY
                        </span>
                      )}
                      {col.notnull && (
                        <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive text-[10px] border border-destructive/30 font-medium">
                          NOT NULL
                        </span>
                      )}
                      {!col.notnull && !col.pk && (
                        <span className="text-muted-foreground text-[11px]">NULLABLE</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {col.dfltValue ? (
                      <span className="text-primary font-mono">{col.dfltValue}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <span>Indexes ({schema.indexes.length})</span>
        </div>

        {schema.indexes.length === 0 ? (
          <div className="p-4 rounded-lg bg-card border border-border text-xs text-muted-foreground text-center">
            No secondary indexes defined for this table.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border/60 font-mono text-xs">
            {schema.indexes.map((idx) => (
              <div
                key={idx.name}
                className="p-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">{idx.name}</span>
                  {idx.unique && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 text-[10px] border border-blue-500/30">
                      UNIQUE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-[11px]">Indexed columns:</span>
                  <span className="text-foreground bg-muted px-2 py-0.5 rounded text-[11px] border border-border">
                    {idx.columns.join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
