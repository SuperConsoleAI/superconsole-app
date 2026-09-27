import React, { useState } from "react";
import {
  Search,
  RefreshCw,
  User,
  Building2,
  FolderGit2,
  Package,
  Layers,
} from "lucide-react";
import { type LocalDbTableSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LocalDBTablesProps {
  tables: LocalDbTableSummary[];
  selectedTable: string | null;
  onSelectTable: (tableName: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onlyCurrentUser: boolean;
}

type CategoryFilter = "all" | "account" | "org" | "project" | "catalog" | "system";

export const LocalDBTables: React.FC<LocalDBTablesProps> = ({
  tables,
  selectedTable,
  onSelectTable,
  loading,
  onRefresh,
  onlyCurrentUser,
}) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filteredTables = tables.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || t.category === category;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "account":
        return <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case "org":
        return <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case "project":
        return <FolderGit2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
      case "catalog":
        return <Package className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-72 bg-sidebar border-r border-sidebar-border select-none shrink-0">
      {/* Search Bar with Embedded Refresh Button */}
      <div className="p-2.5 space-y-2 border-b border-sidebar-border bg-sidebar">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 bg-background border border-input text-foreground text-xs rounded-md pl-8 pr-8 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground transition-colors"
          />
          <button
            onClick={onRefresh}
            disabled={loading}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Refresh Tables"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-primary")} />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1">
          {(["all", "account", "org", "project", "catalog"] as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-all capitalize",
                category === cat
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tables List */}
      <div className="flex-1 overflow-y-auto divide-y divide-sidebar-border/40 custom-scrollbar">
        {filteredTables.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {loading ? "Loading tables..." : "No tables found"}
          </div>
        ) : (
          filteredTables.map((tbl) => {
            const isSelected = selectedTable === tbl.name;
            const rowDisplay =
              onlyCurrentUser && tbl.hasUserId && tbl.userRowCount !== null
                ? `${tbl.userRowCount} / ${tbl.rowCount}`
                : `${tbl.rowCount}`;

            return (
              <button
                key={tbl.name}
                onClick={() => onSelectTable(tbl.name)}
                className={cn(
                  "w-full px-3 py-2 text-left flex items-center justify-between group transition-colors",
                  isSelected
                    ? "bg-accent font-medium text-accent-foreground border-l-2 border-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="shrink-0">{getCategoryIcon(tbl.category)}</span>
                  <span className="text-xs truncate font-mono">{tbl.name}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {tbl.hasUserId && (
                    <span
                      title="Has user_id column"
                      className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground"
                    >
                      user
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                      isSelected
                        ? "bg-primary/20 text-primary font-semibold"
                        : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground",
                    )}
                  >
                    {rowDisplay}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-sidebar-border text-[10px] text-muted-foreground flex items-center justify-between bg-sidebar">
        <span>{filteredTables.length} tables</span>
        <span className="font-mono text-muted-foreground/70">SQLite 3</span>
      </div>
    </div>
  );
};
