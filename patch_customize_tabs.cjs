const fs = require('fs');
let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Imports
if (!code.includes('SkillsView')) {
    code = code.replace(/import \{ PluginIcon \} from "\.\/PluginIcon";/, 'import { PluginIcon } from "./PluginIcon";\nimport { SkillsView } from "./SkillsDialog";\nimport { CommandsView } from "./CommandDialog";');
}
if (!code.includes('ScrollText')) {
    code = code.replace(/Webhook,/g, 'Webhook,\n  ScrollText,\n  TerminalSquare,');
}

// State
code = code.replace(/useState<"plugins" \| "hooks">/, 'useState<"plugins" | "hooks" | "skills" | "commands">');

// Toggle pill
const hooksTabBtn = `
          <button
            onClick={() => setTab("hooks")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "hooks" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Webhook className="h-3.5 w-3.5" strokeWidth={1} />
              Hooks
            </span>
          </button>`;

const newTabsBtn = `
          <button
            onClick={() => setTab("skills")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "skills" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <ScrollText className="h-3.5 w-3.5" strokeWidth={1} />
              Skills
            </span>
          </button>
          <button
            onClick={() => setTab("commands")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "commands" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <TerminalSquare className="h-3.5 w-3.5" strokeWidth={1} />
              Commands
            </span>
          </button>`;

if (!code.includes('tab === "skills"')) {
    code = code.replace(hooksTabBtn, hooksTabBtn + '\n' + newTabsBtn);
}

// Render content
const hooksContent = `{tab === "hooks" && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-5 py-4">
            {/* No workspace */}
            {!scope && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <Webhook className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">Select a project to manage lifecycle hooks.</p>
              </div>
            )}

            {/* Loading */}
            {hooksLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hooks…
              </div>
            )}

            {/* Hook rows */}
            {!hooksLoading && scope && Object.keys(HOOK_META).map((hookType) => (
              <HookRow
                key={hookType}
                hookType={hookType}
                hook={hooks.find((h) => h.hookType === hookType)}
                onEdit={() => setEditingHook(hookType)}
              />
            ))}
          </div>
        </ScrollArea>
      )}`;

const newTabsContent = `
      {tab === "skills" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope && scope.type === "project" ? (
             <SkillsView workspaceId={Number(scope.id)} />
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <ScrollText className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a project to manage skills.</p>
             </div>
          )}
        </ScrollArea>
      )}
      
      {tab === "commands" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope && scope.type === "project" ? (
             <CommandsView workspaceId={Number(scope.id)} />
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <TerminalSquare className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a project to manage commands.</p>
             </div>
          )}
        </ScrollArea>
      )}`;

if (!code.includes('tab === "skills" && (')) {
    code = code.replace(hooksContent, hooksContent + '\n' + newTabsContent);
}

fs.writeFileSync('src/components/CustomizePage.tsx', code);
