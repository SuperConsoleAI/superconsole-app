const fs = require('fs');

// 1. Fix CustomizePage.tsx
let cp = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Fix unused useMemo
cp = cp.replace('import { useState, useEffect, useCallback, useMemo } from "react";', 'import { useState, useEffect, useCallback } from "react";');

// Fix loadHooks
const oldLoadHooks = `  const loadHooks = useCallback(async (scopeType: string, scopeId: string) => {
    if (!wsId) { setHooks([]); return; }
    setHooksLoading(true);
    try { setHooks(await api.listHooks(wsId)); }
    catch { setHooks([]); }
    finally { setHooksLoading(false); }
  }, []);`;

const newLoadHooks = `  const loadHooks = useCallback(async (scopeType: string, scopeId: string) => {
    if (scopeType !== "project" || !scopeId || scopeId === "account") { setHooks([]); return; }
    setHooksLoading(true);
    try { setHooks(await api.listHooks(Number(scopeId))); }
    catch { setHooks([]); }
    finally { setHooksLoading(false); }
  }, []);`;

cp = cp.replace(oldLoadHooks, newLoadHooks);

// Fix wsName(scope)
cp = cp.replace('wsName={scope ? wsName(scope) : ""}', 'wsName={scope ? wsName(scope.id) : ""}');

// Fix HookEditor workspaceId
cp = cp.replace('workspaceId={scope}', 'workspaceId={Number(scope.id)}');

fs.writeFileSync('src/components/CustomizePage.tsx', cp);

// 2. Fix PublishPluginDialog.tsx
let pp = fs.readFileSync('src/components/libraryx/PublishPluginDialog.tsx', 'utf8');
pp = pp.replace('api.listPluginsCatalog(0).then', 'api.listPluginsCatalog("account", "account").then');
fs.writeFileSync('src/components/libraryx/PublishPluginDialog.tsx', pp);
