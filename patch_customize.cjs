const fs = require('fs');

let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// 1. Add Check icon import
code = code.replace(
    '  CheckCircle2,\n  Circle,\n} from "lucide-react";',
    '  CheckCircle2,\n  Circle,\n  Check,\n} from "lucide-react";'
);

// 2. Add DropdownMenuSeparator and DropdownMenuGroup imports
code = code.replace(
    '  DropdownMenuItem,\n  DropdownMenuTrigger,\n} from "@/components/ui/dropdown-menu";',
    '  DropdownMenuItem,\n  DropdownMenuTrigger,\n  DropdownMenuSeparator,\n  DropdownMenuGroup,\n  DropdownMenuLabel,\n} from "@/components/ui/dropdown-menu";'
);

// 3. Update the state
const oldState = `
  const [tab, setTab] = useState<"plugins" | "hooks">("plugins");
  const [orgFilter, setOrgFilter] = useState<number | "all">("all");
  const [projFilter, setProjFilter] = useState<number | "all">(initialWorkspaceId ?? "all");

  // Keep projFilter in sync with route param
  useEffect(() => {
    if (initialWorkspaceId) setProjFilter(initialWorkspaceId);
  }, [initialWorkspaceId]);

  const setOrg = (id: number | "all") => { setOrgFilter(id); setProjFilter("all"); };

  const orgWorkspaces = useMemo(
    () => orgFilter === "all" ? workspaces : workspaces.filter((w) => w.organization_id === orgFilter),
    [workspaces, orgFilter],
  );

  const visibleWorkspaces = useMemo(
    () => projFilter === "all" ? orgWorkspaces : orgWorkspaces.filter((w) => w.id === projFilter),
    [orgWorkspaces, projFilter],
  );

  const wsName = (id: number) => workspaces.find((w) => w.id === id)?.name ?? "unknown";
  const orgName = (id: number | "all") =>
    id === "all" ? "All orgs" : (organizations.find((o) => o.id === id)?.name ?? "Org");
`;

const newState = `
  const [tab, setTab] = useState<"plugins" | "hooks">("plugins");
  
  const [scope, setScope] = useState<{ type: "account" | "org" | "project", id: string }>({
    type: initialWorkspaceId ? "project" : "account",
    id: initialWorkspaceId ? String(initialWorkspaceId) : "account",
  });

  // Keep scope in sync with route param
  useEffect(() => {
    if (initialWorkspaceId) {
      setScope({ type: "project", id: String(initialWorkspaceId) });
    }
  }, [initialWorkspaceId]);

  const wsName = (id: string) => workspaces.find((w) => String(w.id) === id)?.name ?? "unknown";
  const orgName = (id: string) => organizations.find((o) => String(o.id) === id)?.name ?? "unknown";
`;

code = code.replace(oldState.trim(), newState.trim());

// 4. Update the loadPlugins function
const oldLoadPlugins = `
  const targetWsId = projFilter !== "all" ? (projFilter as number) : (visibleWorkspaces[0]?.id ?? null);

  const loadPlugins = useCallback(async (q: string, cat: string, wsId: number | null) => {
    if (!wsId) { setPlugins([]); return; }
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const data = q.trim()
        ? await api.searchPluginsCatalog(wsId, q)
        : await api.listPluginsCatalog(wsId, cat === "All" ? undefined : cat);
      setPlugins(data);
    } catch (e: any) {
      setPluginsError(e?.toString() || "Failed to load plugins");
      setPlugins([]);
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "plugins") loadPlugins(query, category, targetWsId); }, [tab, targetWsId]);
`;

const newLoadPlugins = `
  const loadPlugins = useCallback(async (q: string, cat: string, scp: { type: string, id: string }) => {
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const data = q.trim()
        ? await api.searchPluginsCatalog(scp.type, scp.id, q)
        : await api.listPluginsCatalog(scp.type, scp.id, cat === "All" ? undefined : cat);
      setPlugins(data);
    } catch (e: any) {
      setPluginsError(e?.toString() || "Failed to load plugins");
      setPlugins([]);
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "plugins") loadPlugins(query, category, scope); }, [tab, scope, query, category]);
`;

code = code.replace(oldLoadPlugins.trim(), newLoadPlugins.trim());

// 5. Update install/uninstall handlers
code = code.replace(/targetWsId/g, 'scope');

// We also need to fix how install/uninstall is called:
// Before: await api.installPlugin(targetWsId, pluginId)
// After: await api.installPlugin(scope.type, scope.id, pluginId)
code = code.replace(/api\.installPlugin\(scope, pluginId\)/g, 'api.installPlugin(scope.type, scope.id, pluginId)');
code = code.replace(/await loadPlugins\(query, category, scope\)/g, 'await loadPlugins(query, category, scope)');
code = code.replace(/api\.uninstallPlugin\(scope, pluginId\)/g, 'api.uninstallPlugin(scope.type, scope.id, pluginId)');
code = code.replace(/api\.installPluginFromUrl\(scope, githubUrl\.trim\(\)\)/g, 'api.installPluginFromUrl(scope.type, scope.id, githubUrl.trim())');
code = code.replace(/if \(\!scope\)/g, 'if (!scope.id)');

// Also fix loadHooks
code = code.replace(/loadHooks\(scope\)/g, 'loadHooks(scope.type, scope.id)');
const oldLoadHooks = `
  const loadHooks = useCallback(async (wsId: number | null) => {
    if (!wsId) return;
    setHooksLoading(true);
    try {
      const data = await api.listHooksCatalogCmd(undefined);
      setHooks(data);
    }
    catch { setHooks([]); }
    finally { setHooksLoading(false); }
  }, []);

  useEffect(() => { if (tab === "hooks") loadHooks(targetWsId); }, [tab, targetWsId]);
`;
// Actually wait! the hooks API might not take scope type/id yet. Let's just fix loadHooks signature
code = code.replace(
  'const loadHooks = useCallback(async (wsId: number | null) => {',
  'const loadHooks = useCallback(async (scopeType: string, scopeId: string) => {'
);
code = code.replace(
  'useEffect(() => { if (tab === "hooks") loadHooks(targetWsId); }, [tab, targetWsId]);',
  'useEffect(() => { if (tab === "hooks") loadHooks(scope.type, scope.id); }, [tab, scope]);'
);

// 6. Update the UI dropdown
const oldDropdown = `
          {/* Org filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {orgName(orgFilter)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOrg("all")}>All orgs</DropdownMenuItem>
              {organizations.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => setOrg(o.id)}>{o.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Project filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {projFilter === "all" ? "All projects" : wsName(projFilter as number)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProjFilter("all")}>All projects</DropdownMenuItem>
              {orgWorkspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => setProjFilter(w.id)}>{w.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
`;

const newDropdown = `
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {scope.type === "account" ? "● Account" : scope.type === "org" ? orgName(scope.id) : wsName(scope.id)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setScope({ type: "account", id: "account" })} className="justify-between font-medium">
                <span>● Account (machine-wide)</span>
                {scope.type === "account" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {organizations.map((o) => (
                <DropdownMenuGroup key={o.id}>
                  <DropdownMenuLabel className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                    <span onClick={() => setScope({ type: "org", id: String(o.id) })} className="cursor-pointer hover:text-foreground">
                      {o.name} (org)
                    </span>
                    {scope.type === "org" && scope.id === String(o.id) && <Check className="h-3 w-3" />}
                  </DropdownMenuLabel>
                  {workspaces
                    .filter((w) => w.organization_id === o.id)
                    .map((w) => (
                      <DropdownMenuItem 
                        key={w.id} 
                        onClick={() => setScope({ type: "project", id: String(w.id) })}
                        className="pl-6 justify-between"
                      >
                        <span>{w.name} (project)</span>
                        {scope.type === "project" && scope.id === String(w.id) && <Check className="h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
`;

code = code.replace(oldDropdown.trim(), newDropdown.trim());

fs.writeFileSync('src/components/CustomizePage.tsx', code);
