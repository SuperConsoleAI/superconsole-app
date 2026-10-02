import React, { useState } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Users,
  Eye,
  EyeOff,
  X,
  Copy,
  Check,
} from "lucide-react";
import { type LocalDbTableDataResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LocalDBDataProps {
  data: LocalDbTableDataResult | null;
  loading: boolean;
  onRefresh: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  page: number;
  onPageChange: (newPage: number) => void;
  pageSize: number;
  sortCol: string | null;
  sortDesc: boolean;
  onSortChange: (col: string) => void;
  hasUserId: boolean;
  onlyCurrentUser: boolean;
  onToggleCurrentUser: () => void;
}

export const LocalDBData: React.FC<LocalDBDataProps> = ({
  data,
  loading,
  onRefresh,
  search,
  onSearchChange,
  page,
  onPageChange,
  pageSize,
  sortCol,
  sortDesc,
  onSortChange,
  hasUserId,
  onlyCurrentUser,
  onToggleCurrentUser,
}) => {
  const [inspectedCell, setInspectedCell] = useState<{
    col: string;
    value: any;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());

  const toggleRevealCell = (cellKey: string) => {
    setRevealedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  };

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 1;
  const startRow = data && data.totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = data ? Math.min(page * pageSize, data.totalCount) : 0;

  const handleCopyInspected = () => {
    if (!inspectedCell) return;
    const text =
      typeof inspectedCell.value === "object"
        ? JSON.stringify(inspectedCell.value, null, 2)
        : String(inspectedCell.value);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCellContent = (col: string, val: any, rowIdx: number, row: any[]) => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground/60 italic">NULL</span>;
    }
    if (typeof val === "boolean") {
      return (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-semibold",
            val
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-muted text-muted-foreground",
          )}
        >
          {val ? "TRUE" : "FALSE"}
        </span>
      );
    }

    const lowerCol = col.toLowerCase();
    const isSecretCol = [
      "credentials_encrypted",
      "credentials_enc",
      "token_encrypted",
      "api_token",
      "token",
      "password",
      "secret",
    ].includes(lowerCol);

    let isSecretRow = false;
    if (lowerCol === "value" && data?.columns) {
      const isSecretIdx = data.columns.findIndex((c) => c.toLowerCase() === "is_secret");
      if (isSecretIdx !== -1) {
        const flag = row[isSecretIdx];
        isSecretRow = flag === 1 || flag === "1" || flag === true;
      }
    }

    const isSecret = isSecretCol || isSecretRow;
    const cellKey = `${rowIdx}:${col}`;
    const isRevealed = revealedCells.has(cellKey);

    if (isSecret && !isRevealed) {
      return (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="tracking-widest text-muted-foreground/70 select-none">••••••••••••</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleRevealCell(cellKey);
            }}
            className="p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
            title="Reveal secret"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (isSecret && isRevealed) {
      const str = String(val);
      return (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-foreground max-w-[200px] truncate">{str}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleRevealCell(cellKey);
            }}
            className="p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
            title="Mask secret"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
          {str.length > 50 && (
            <button
              type="button"
              onClick={() => setInspectedCell({ col, value: str })}
              className="text-primary hover:underline text-[11px]"
              title="Inspect full value"
            >
              more
            </button>
          )}
        </div>
      );
    }

    if (typeof val === "object") {
      const jsonStr = JSON.stringify(val);
      return (
        <button
          onClick={() => setInspectedCell({ col, value: val })}
          className="text-amber-500 hover:text-amber-400 hover:underline flex items-center gap-1 font-mono text-xs max-w-[240px] truncate"
          title="Click to expand JSON"
        >
          <Eye className="w-3 h-3 shrink-0" />
          <span className="truncate">{jsonStr}</span>
        </button>
      );
    }
    const str = String(val);
    if (str.length > 50) {
      return (
        <button
          onClick={() => setInspectedCell({ col, value: str })}
          className="text-foreground hover:text-primary text-left font-mono text-xs max-w-[240px] truncate hover:underline"
          title="Click to view full text"
        >
          {str.slice(0, 48)}...
        </button>
      );
    }
    return <span className="text-foreground font-mono text-xs">{str}</span>;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Controls Bar — 3rem (48px) height */}
      <div className="h-12 px-3 border-b border-border flex items-center justify-between gap-3 bg-card/60 shrink-0">
        <div className="flex items-center gap-2.5 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search in table..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-8 bg-background border border-input text-foreground text-xs rounded-md pl-8 pr-2.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground transition-colors"
            />
          </div>

          {hasUserId && (
            <button
              onClick={onToggleCurrentUser}
              className={cn(
                "flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-all shrink-0",
                onlyCurrentUser
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground border-border",
              )}
              title={
                onlyCurrentUser
                  ? "Showing only current user records (WHERE user_id = me)"
                  : "Showing all records in local database"
              }
            >
              {onlyCurrentUser ? (
                <User className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span>{onlyCurrentUser ? "My Records" : "All Records"}</span>
            </button>
          )}
        </div>

        {/* Pagination & Refresh Controls */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
            <span>
              {startRow} - {endRow} of {data?.totalCount ?? 0}
            </span>
            <div className="flex items-center gap-1 border border-border rounded-md bg-background p-0.5">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[11px] text-muted-foreground">
                {page} / {Math.max(1, totalPages)}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 h-8 w-8 inline-flex items-center justify-center rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 border border-border"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-primary")} />
          </button>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-background">
        {loading && !data ? (
          <div className="flex-1 h-full flex items-center justify-center text-muted-foreground text-xs">
            Loading table records...
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 p-8">
            <div>No records found in this table.</div>
            {onlyCurrentUser && (
              <button
                onClick={onToggleCurrentUser}
                className="text-primary hover:underline text-[11px]"
              >
                Switch to "All Records" to view records from other accounts/workspaces
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-card border-b border-border z-10 text-[11px] font-mono text-muted-foreground shadow-sm">
              <tr>
                <th className="py-2 px-3 border-r border-border w-12 text-center text-muted-foreground/70 bg-card">
                  #
                </th>
                {data.columns.map((col) => {
                  const isSorted = sortCol === col;
                  return (
                    <th
                      key={col}
                      onClick={() => onSortChange(col)}
                      className="py-2 px-3 border-r border-border cursor-pointer hover:bg-muted/50 hover:text-foreground transition-colors select-none group whitespace-nowrap bg-card"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(isSorted && "text-primary font-semibold")}>
                          {col}
                        </span>
                        <span className="text-muted-foreground/60 group-hover:text-foreground">
                          {isSorted ? (
                            sortDesc ? (
                              <ArrowDown className="w-3 h-3 text-primary" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-muted/30 transition-colors group border-b border-border/40"
                >
                  <td className="py-2 px-3 border-r border-border/60 text-center text-[10px] font-mono text-muted-foreground/70 bg-card/30">
                    {(page - 1) * pageSize + rowIdx + 1}
                  </td>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="py-2 px-3 border-r border-border/60 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {renderCellContent(data.columns[cellIdx], cell, rowIdx, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cell Content Inspection Modal */}
      {inspectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-2 font-mono text-xs text-foreground">
                <span className="text-muted-foreground">Column:</span>
                <span className="text-primary font-semibold">{inspectedCell.col}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyInspected}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-muted hover:bg-accent text-foreground transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  onClick={() => setInspectedCell(null)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1 font-mono text-xs bg-muted/20 text-foreground">
              <pre className="whitespace-pre-wrap break-all">
                {typeof inspectedCell.value === "object"
                  ? JSON.stringify(inspectedCell.value, null, 2)
                  : String(inspectedCell.value)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
