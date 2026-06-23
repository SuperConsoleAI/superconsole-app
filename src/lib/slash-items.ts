import { api, MEMORY_CATEGORIES } from "@/lib/api";

export interface SlashItem {
  value: string;       // The token to insert, e.g. "/skill:blog-writer"
  label: string;       // Display label (same as value for most)
  description: string; // Secondary text shown in dropdown
  group: string;       // Group header
  source: "command" | "skill" | "context" | "wiki" | "agent" | "memory" | "connector" | "session";
}

/** Ordered group names — defines the fixed anchor link order. */
export const SLASH_GROUPS = [
  "Skills",
  "Connectors",
  "Agents",
  "Commands",
  "Context",
  "Memory",
  "Wiki",
  "Sessions",
] as const;

export type SlashGroup = (typeof SLASH_GROUPS)[number];

/**
 * Load the full slash-token vocabulary for a workspace.
 * Returns items ordered: Skills → Connectors → Agents → Commands → Context → Memory → Wiki → Sessions.
 */
export async function loadSlashItems(workspaceId: number): Promise<SlashItem[]> {
  const [commands, skills, contextFiles, wikiPages, agents, connectors, sessionLogs] =
    await Promise.allSettled([
      api.listCommands(workspaceId),
      api.listSkills(workspaceId),
      api.listContextFiles(workspaceId),
      api.listWiki(workspaceId),
      api.listAgents(workspaceId),
      api.listConnectors("project", String(workspaceId)),
      api.listSessionLogFiles(workspaceId),
    ]);

  const items: SlashItem[] = [];

  // Skills — active only
  if (skills.status === "fulfilled") {
    for (const s of skills.value.filter((x) => x.active)) {
      items.push({
        value: `/skill:${s.name}`,
        label: `/skill:${s.name}`,
        description: s.description || "Skill",
        group: "Skills",
        source: "skill",
      });
    }
  }

  // Connectors
  if (connectors.status === "fulfilled") {
    for (const c of connectors.value) {
      items.push({
        value: `/connector:${c.service}`,
        label: `/connector:${c.service}`,
        description: c.service,
        group: "Connectors",
        source: "connector",
      });
    }
  }

  // Agents
  if (agents.status === "fulfilled") {
    for (const a of agents.value) {
      items.push({
        value: `/agent:${a.name}`,
        label: `/agent:${a.name}`,
        description: a.description || "Agent",
        group: "Agents",
        source: "agent",
      });
    }
  }

  // Commands
  if (commands.status === "fulfilled") {
    for (const c of commands.value) {
      items.push({
        value: c.slash,
        label: c.slash,
        description: c.description || c.name,
        group: "Commands",
        source: "command",
      });
    }
  }

  // Context files
  if (contextFiles.status === "fulfilled") {
    for (const f of contextFiles.value) {
      items.push({
        value: `/context:${f.slug}`,
        label: `/context:${f.slug}`,
        description: f.name,
        group: "Context",
        source: "context",
      });
    }
  }

  // Memory categories — static
  for (const cat of MEMORY_CATEGORIES) {
    items.push({
      value: `/memory:${cat.id}`,
      label: `/memory:${cat.id}`,
      description: `Project ${cat.label.toLowerCase()}`,
      group: "Memory",
      source: "memory",
    });
  }

  // Wiki pages
  if (wikiPages.status === "fulfilled") {
    for (const p of wikiPages.value) {
      items.push({
        value: `/wiki:${p.slug}`,
        label: `/wiki:${p.slug}`,
        description: p.title,
        group: "Wiki",
        source: "wiki",
      });
    }
  }

  // Sessions — structured session logs saved to .superconsole/sessions/
  if (sessionLogs.status === "fulfilled") {
    for (const s of sessionLogs.value.slice(0, 20)) {
      const label = s.summary || s.agentName || s.id;
      items.push({
        value: `/session:${s.id}`,
        label: `/session:${s.id}`,
        description: `${label}${s.date ? ` · ${s.date}` : ""}`,
        group: "Sessions",
        source: "session",
      });
    }
  }

  return items;
}

/**
 * Filter slash items against the current query string.
 */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.startsWith("/") ? query.slice(1).toLowerCase() : query.toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.value.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q),
  );
}

/**
 * Group a flat list of SlashItems by their `group` field, preserving order of
 * first occurrence. Returns an array of [groupName, items[]] tuples.
 */
export function groupSlashItems(items: SlashItem[]): [string, SlashItem[]][] {
  const map = new Map<string, SlashItem[]>();
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group)!.push(item);
  }
  return Array.from(map.entries());
}
