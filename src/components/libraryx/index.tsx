import { useState } from "react";
import { Plug, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublishPluginDialog } from "./PublishPluginDialog";
import { PublishConnectorDialog } from "./PublishConnectorDialog";
import { PublishMcpDialog } from "./PublishMcpDialog";
import { PublishSkillDialog } from "./PublishSkillDialog";
import { PublishCommandDialog } from "./PublishCommandDialog";

export function LibrarySection() {
  const [pluginOpen, setPluginOpen] = useState(false);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card px-4 py-3">
        <h3 className="text-sm font-medium">Library Management</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Publish catalog data to the central Turso database.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="h-4 w-4 text-primary" />
            Plugins
          </div>
          <p className="text-[13px] text-muted-foreground">
            Publish an assembled plugin (skills, commands, MCPs, connectors) to the catalog.
          </p>
          <div className="mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={() => setPluginOpen(true)}>
              Publish Plugin
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4 text-primary" />
            Connectors
          </div>
          <p className="text-[13px] text-muted-foreground">
            Publish a new connector definition (OAuth or API Keys) to the catalog.
          </p>
          <div className="mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={() => setConnectorOpen(true)}>
              Publish Connector
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="h-4 w-4 text-primary" />
            MCPs
          </div>
          <p className="text-[13px] text-muted-foreground">
            Publish an MCP tool server definition to the catalog.
          </p>
          <div className="mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={() => setMcpOpen(true)}>
              Publish MCP
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="h-4 w-4 text-primary" />
            Skills
          </div>
          <p className="text-[13px] text-muted-foreground">
            Publish a skill (Agent context/instructions) to the catalog.
          </p>
          <div className="mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={() => setSkillOpen(true)}>
              Publish Skill
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="h-4 w-4 text-primary" />
            Commands
          </div>
          <p className="text-[13px] text-muted-foreground">
            Publish an autonomous command (Node, Python, Bash) to the catalog.
          </p>
          <div className="mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={() => setCommandOpen(true)}>
              Publish Command
            </Button>
          </div>
        </div>
      </div>

      <PublishPluginDialog open={pluginOpen} onClose={() => setPluginOpen(false)} />
      <PublishConnectorDialog open={connectorOpen} onClose={() => setConnectorOpen(false)} />
      <PublishMcpDialog open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <PublishSkillDialog open={skillOpen} onClose={() => setSkillOpen(false)} />
      <PublishCommandDialog open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
