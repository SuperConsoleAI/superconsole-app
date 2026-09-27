import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  Table as TableIcon,
  Layers,
  X,
} from "lucide-react";
import {
  api,
  type LocalDbTableSummary,
  type LocalDbTableSchema,
  type LocalDbTableDataResult,
} from "@/lib/api";
import { LocalDBTables } from "./LocalDBTables";
import { LocalDBData } from "./LocalDBData";
import { LocalDBSchema } from "./LocalDBSchema";
import { cn } from "@/lib/utils";

interface LocalDBStudioProps {
  onClose?: () => void;
  isModal?: boolean;
}

type StudioTab = "data" | "structure";

export const LocalDBStudio: React.FC<LocalDBStudioProps> = ({ onClose, isModal = false }) => {
  const [tables, setTables] = useState<LocalDbTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>("data");
  const [tablesLoading, setTablesLoading] = useState(false);

  // Data view state
  const [tableData, setTableData] = useState<LocalDbTableDataResult | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [onlyCurrentUser, setOnlyCurrentUser] = useState(true);

  // Schema view state
  const [schema, setSchema] = useState<LocalDbTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const list = await api.listLocalDbTables();
      setTables(list);
      if (list.length > 0 && !selectedTable) {
        setSelectedTable(list[0].name);
      }
    } catch (e) {
      console.error("Failed to list tables:", e);
    } finally {
      setTablesLoading(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const fetchData = useCallback(async () => {
    if (!selectedTable) return;
    setDataLoading(true);
    try {
      const res = await api.getLocalDbTableData({
        tableName: selectedTable,
        page,
        pageSize,
        search: search.trim() || undefined,
        sortCol: sortCol || undefined,
        sortDesc,
        onlyCurrentUser,
      });
      setTableData(res);
    } catch (e) {
      console.error(`Failed to fetch data for ${selectedTable}:`, e);
      setTableData(null);
    } finally {
      setDataLoading(false);
    }
  }, [selectedTable, page, pageSize, search, sortCol, sortDesc, onlyCurrentUser]);

  const fetchSchema = useCallback(async () => {
    if (!selectedTable) return;
    setSchemaLoading(true);
    try {
      const res = await api.getLocalDbTableSchema(selectedTable);
      setSchema(res);
    } catch (e) {
      console.error(`Failed to fetch schema for ${selectedTable}:`, e);
      setSchema(null);
    } finally {
      setSchemaLoading(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      setSearch("");
      setSortCol(null);
      setSortDesc(false);
      if (activeTab === "data") {
        fetchData();
      } else {
        fetchSchema();
      }
    }
  }, [selectedTable, activeTab]);

  useEffect(() => {
    if (activeTab === "data" && selectedTable) {
      fetchData();
    }
  }, [fetchData, activeTab, selectedTable]);

  useEffect(() => {
    if (activeTab === "structure" && selectedTable) {
      fetchSchema();
    }
  }, [fetchSchema, activeTab, selectedTable]);

  const currentTableSummary = tables.find((t) => t.name === selectedTable);

  const handleSortChange = (col: string) => {
    if (sortCol === col) {
      if (sortDesc) {
        setSortCol(null);
        setSortDesc(false);
      } else {
        setSortDesc(true);
      }
    } else {
      setSortCol(col);
      setSortDesc(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-background text-foreground font-sans select-none overflow-hidden",
        isModal
          ? "fixed inset-4 z-50 rounded-xl border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          : "h-full w-full border border-border rounded-lg",
      )}
    >
      {/* Top Header Bar — 3rem (48px) height */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold text-primary">
            <Database className="w-4 h-4" />
            <span>LocalDB Studio</span>
          </div>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-mono text-xs text-muted-foreground">
            {selectedTable ?? "No table selected"}
          </span>
        </div>

        {/* Tab Switcher: [Data] vs [Structure] */}
        <div className="flex items-center gap-1 bg-muted/60 border border-border rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("data")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
              activeTab === "data"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Data</span>
          </button>
          <button
            onClick={() => setActiveTab("structure")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
              activeTab === "structure"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Structure</span>
          </button>
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close LocalDB Studio"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Split Body: Sidebar on left, Content on right */}
      <div className="flex-1 flex overflow-hidden">
        <LocalDBTables
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={(tbl) => setSelectedTable(tbl)}
          loading={tablesLoading}
          onRefresh={fetchTables}
          onlyCurrentUser={onlyCurrentUser}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "data" ? (
            <LocalDBData
              data={tableData}
              loading={dataLoading}
              onRefresh={fetchData}
              search={search}
              onSearchChange={setSearch}
              page={page}
              onPageChange={setPage}
              pageSize={pageSize}
              sortCol={sortCol}
              sortDesc={sortDesc}
              onSortChange={handleSortChange}
              hasUserId={currentTableSummary?.hasUserId ?? false}
              onlyCurrentUser={onlyCurrentUser}
              onToggleCurrentUser={() => setOnlyCurrentUser(!onlyCurrentUser)}
            />
          ) : (
            <LocalDBSchema schema={schema} loading={schemaLoading} />
          )}
        </div>
      </div>
    </div>
  );
};
