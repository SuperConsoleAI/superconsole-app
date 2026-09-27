// src/components/agents/index.ts
// Barrel export for shared agent components, types, and commands.

export * from "./agent-commands";
export * from "./MarkdownRenderer";
export * from "./ToolResultCard";
export * from "./DomainSelector";
export { AgentChatSidebar } from "./AgentChatSidebar";
export { AgentChatModal } from "./AgentChatModal";
export { AgentCliChatModal } from "./AgentCliChatModal";
export { AgentTerminalPanel } from "./AgentTerminalPanel";
export { CliCompose, type CliComposeProps } from "./CliCompose";
export { ChatCompose, type ChatComposeProps } from "./ChatCompose";
export { PtyTabBar, type PtyTab, type PtyTabBarProps } from "./PtyTabBar";
export {
  AgentSessionsSidebar,
  SessionIcon,
  SessionModeBadge,
  getSessionCliInfo,
  type AgentSessionsSidebarProps,
} from "./AgentSessionsSidebar";
export {
  NewChat,
  type NewChatProps,
  type NewChatMode,
  getModeLabel,
} from "./NewChat";
export { AgentTabs } from "./AgentTabs";
export { AddCommand, type AddCommandProps } from "./AddCommand";
export {
  AgentToolsPicker,
  type AgentToolsPickerProps,
  type ToolCatalogItem,
  DEFAULT_CATALOG_TOOLS,
  TOOL_DOMAIN_INFO,
} from "./AgentToolsPicker";
export { CommandSelector, type CommandSelectorProps } from "./CommandSelector";
