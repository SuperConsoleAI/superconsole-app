const fs = require('fs');

// 1. router.tsx
let router = fs.readFileSync('src/router.tsx', 'utf8');

if (!router.includes('const [customizeTab, setCustomizeTab]')) {
    router = router.replace(
      /const \[sidebarOpen, setSidebarOpen\] = useState\(true\);/,
      `const [sidebarOpen, setSidebarOpen] = useState(true);
  const [customizeTab, setCustomizeTab] = useState("plugins");

  useEffect(() => {
    const onTab = (e: any) => setCustomizeTab(e.detail);
    window.addEventListener("customize-tab", onTab);
    return () => window.removeEventListener("customize-tab", onTab);
  }, []);`
    );
}

// compute titleSuffix
if (!router.includes('let titleSuffix')) {
    router = router.replace(
      /const openedFile = activeTab\?\.cli === "file" \? activeTab\.relPath \?\? null : null;/,
      `const openedFile = activeTab?.cli === "file" ? activeTab.relPath ?? null : null;

  let titleSuffix: string | undefined = undefined;
  if (activeWorkspace) {
    if (activeTab) {
      if (activeTab.cli === "file" && activeTab.relPath) {
        titleSuffix = activeTab.relPath.split('/').pop();
      } else if (activeTab.cli) {
        titleSuffix = activeTab.cli.charAt(0).toUpperCase() + activeTab.cli.slice(1);
      }
    }
  } else if (customizeActive) {
    titleSuffix = customizeTab.charAt(0).toUpperCase() + customizeTab.slice(1);
  }`
    );
}

router = router.replace(
  /workspace=\{settingsActive \? null : \(activeWorkspace \?\? workspaces\.find\(w => w\.id === Number\(\(search as any\)\.ws\)\) \?\? null\)\}\n        isProjectPage=\{!!activeWorkspace\}/,
  `workspace={settingsActive ? null : (activeWorkspace ?? workspaces.find(w => w.id === Number((search as any).ws)) ?? null)}
        isProjectPage={!!activeWorkspace}
        titleSuffix={titleSuffix}`
);

fs.writeFileSync('src/router.tsx', router);

// 2. TopBar.tsx
let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

if (!topbar.includes('titleSuffix?: string;')) {
    topbar = topbar.replace(
      /isProjectPage\?: boolean;/,
      `isProjectPage?: boolean;
  titleSuffix?: string;`
    );
    topbar = topbar.replace(
      /isProjectPage,\n\}: TopBarProps\) \{/,
      `isProjectPage,
  titleSuffix,
}: TopBarProps) {`
    );
    topbar = topbar.replace(
      /<span className="truncate text-xs font-medium">\{workspace\.name\}<\/span>/,
      `<span className="truncate text-xs font-medium">
                {workspace.name} {titleSuffix && <span className="text-muted-foreground font-normal">— {titleSuffix}</span>}
              </span>`
    );
}

fs.writeFileSync('src/components/TopBar.tsx', topbar);

// 3. CustomizePage.tsx
let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

if (!custom.includes('"customize-tab"')) {
    custom = custom.replace(
      /const \[tab, setTab\] = useState<.*?>\("plugins"\);/,
      `const [tab, setTab] = useState<"plugins" | "hooks" | "skills" | "commands" | "connectors" | "mcp" | "rules">("plugins");
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("customize-tab", { detail: tab }));
  }, [tab]);`
    );
}

fs.writeFileSync('src/components/CustomizePage.tsx', custom);

