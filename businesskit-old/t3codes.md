flowchart TD

subgraph group_clients["Clients"]
  node_apps_web["Web App<br/>react client"]
  node_apps_desktop["Desktop App<br/>electron host"]
  node_apps_marketing["Marketing Site<br/>astro site"]
end

subgraph group_backend["Backend"]
  node_server_entry["Server Entry<br/>http/ws host<br/>[http.ts]"]
  node_orchestration["Orchestration<br/>event pipeline"]
  node_persistence[("Persistence<br/>sqlite store")]
  node_provider["Provider System<br/>agent runtime"]
  node_source_control["Source Control<br/>vcs integration"]
  node_workspace["Workspace<br/>fs model"]
  node_auth["Auth<br/>access control"]
  node_terminal["Terminal<br/>pty manager"]
  node_vcs["VCS<br/>git driver"]
  node_project["Project Setup<br/>project lifecycle"]
end

subgraph group_shared["Shared Packages"]
  node_contracts["Contracts<br/>schema package"]
  node_shared_pkg["Shared Utils<br/>common package"]
  node_client_runtime["Client Runtime<br/>env package"]
  node_effect_acp["ACP Protocol<br/>protocol package"]
  node_effect_codex["Codex Runtime<br/>protocol package"]
  node_ssh_pkg["SSH<br/>transport package"]
  node_tailscale_pkg["Tailscale<br/>connectivity package"]
end

subgraph group_external["External Systems"]
  node_git_hosts(("Git Hosts<br/>external services"))
  node_agent_clis(("Agent CLIs<br/>external runtimes"))
  node_remote_network(("Remote Access<br/>external connectivity"))
end

node_apps_web -->|"RPC/schema"| node_contracts
node_apps_web -->|"WebSocket/HTTP"| node_server_entry
node_apps_web -->|"env state"| node_client_runtime
node_apps_desktop -->|"hosts"| node_apps_web
node_apps_desktop -->|"manages"| node_server_entry
node_apps_desktop -->|"remote shell"| node_ssh_pkg
node_apps_desktop -->|"endpoint exposure"| node_tailscale_pkg
node_apps_marketing -.->|"content utils"| node_shared_pkg
node_server_entry -->|"routes"| node_orchestration
node_server_entry -->|"auth"| node_auth
node_orchestration -->|"events/projections"| node_persistence
node_orchestration -->|"commands"| node_provider
node_orchestration -->|"workspace data"| node_workspace
node_orchestration -->|"process state"| node_terminal
node_orchestration -->|"git ops"| node_vcs
node_provider -->|"ACP"| node_effect_acp
node_provider -->|"Codex protocol"| node_effect_codex
node_provider -->|"runs"| node_agent_clis
node_source_control -->|"host APIs"| node_git_hosts
node_source_control -->|"repository ops"| node_vcs
node_vcs -.->|"git primitives"| node_shared_pkg
node_auth -->|"sessions"| node_persistence
node_project -->|"setup"| node_workspace
node_project -->|"identity"| node_vcs
node_apps_web -->|"queries"| node_orchestration
node_apps_desktop -->|"connects"| node_remote_network
node_server_entry -->|"serves"| node_remote_network
node_apps_web -.->|"UI schemas"| node_contracts
node_apps_desktop -.->|"ipc schemas"| node_contracts

click node_apps_web "<https://github.com/pingdotgg/t3code/tree/main/apps/web>"
click node_apps_desktop "<https://github.com/pingdotgg/t3code/tree/main/apps/desktop>"
click node_apps_marketing "<https://github.com/pingdotgg/t3code/tree/main/apps/marketing>"
click node_server_entry "<https://github.com/pingdotgg/t3code/blob/main/apps/server/src/http.ts>"
click node_orchestration "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/orchestration>"
click node_persistence "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/persistence>"
click node_provider "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/provider>"
click node_source_control "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/sourceControl>"
click node_workspace "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/workspace>"
click node_auth "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/auth>"
click node_terminal "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/terminal>"
click node_vcs "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/vcs>"
click node_project "<https://github.com/pingdotgg/t3code/tree/main/apps/server/src/project>"
click node_contracts "<https://github.com/pingdotgg/t3code/tree/main/packages/contracts>"
click node_shared_pkg "<https://github.com/pingdotgg/t3code/tree/main/packages/shared>"
click node_client_runtime "<https://github.com/pingdotgg/t3code/tree/main/packages/client-runtime>"
click node_effect_acp "<https://github.com/pingdotgg/t3code/tree/main/packages/effect-acp>"
click node_effect_codex "<https://github.com/pingdotgg/t3code/tree/main/packages/effect-codex-app-server>"
click node_ssh_pkg "<https://github.com/pingdotgg/t3code/tree/main/packages/ssh>"
click node_tailscale_pkg "<https://github.com/pingdotgg/t3code/tree/main/packages/tailscale>"

classDef toneNeutral fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
classDef toneBlue fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
classDef toneAmber fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
classDef toneMint fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
classDef toneRose fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
classDef toneIndigo fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
classDef toneTeal fill:#ccfbf1,stroke:#0f766e,stroke-width:1.5px,color:#134e4a
class node_apps_web,node_apps_desktop,node_apps_marketing toneBlue
class node_server_entry,node_orchestration,node_persistence,node_provider,node_source_control,node_workspace,node_auth,node_terminal,node_vcs,node_project toneAmber
class node_contracts,node_shared_pkg,node_client_runtime,node_effect_acp,node_effect_codex,node_ssh_pkg,node_tailscale_pkg toneMint
class node_git_hosts,node_agent_clis,node_remote_network toneRose
