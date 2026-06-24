const fs = require('fs');
let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Imports
if (!code.includes('ConnectorManager')) {
    code = code.replace(/import \{ CommandsView \} from "\.\/CommandDialog";/, 'import { CommandsView } from "./CommandDialog";\nimport { ConnectorManager } from "./SettingsPage";\nimport { Plug } from "lucide-react";');
}

// State
code = code.replace(/useState<"plugins" \| "hooks" \| "skills" \| "commands">/, 'useState<"plugins" | "hooks" | "skills" | "commands" | "connectors">');

// Toggle pill
const commandsTabBtn = `
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

const connectorsTabBtn = `
          <button
            onClick={() => setTab("connectors")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "connectors" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Plug className="h-3.5 w-3.5" strokeWidth={1} />
              Connectors
            </span>
          </button>`;

if (!code.includes('tab === "connectors" ?')) {
    code = code.replace(commandsTabBtn, commandsTabBtn + '\n' + connectorsTabBtn);
}

// Render content
const commandsContent = `{tab === "commands" && (
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

const connectorsContent = `
      {tab === "connectors" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope ? (
             <div className="px-5 py-4">
               <ConnectorManager scope={scope.type} scopeId={scope.id} category="connectors" />
             </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <Plug className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a scope to manage connectors.</p>
             </div>
          )}
        </ScrollArea>
      )}`;

if (!code.includes('tab === "connectors" && (')) {
    code = code.replace(commandsContent, commandsContent + '\n' + connectorsContent);
}

fs.writeFileSync('src/components/CustomizePage.tsx', code);
