1. Turso Database Support in

LocalDBSQLEditor.tsx
Question: "We support Turso of which only current logged-in user or also invited project/org Turso DB owned by User B?"

Here is how SuperConsole's architecture handles Turso databases:

Scope Where it Queries Whose Data is Available?
Target: userdb (in SQL Editor) Directly hits the remote Turso LibSQL URL via

resolve_userdb_config
Only the currently logged-in user's private Turso database (libsql://user-{userId}.turso.io or custom DB configured in Settings → UserDB).
Target: localdb (in SQL Editor) Queries local SQLite (superconsole.db) Both Current User AND Invited Projects/Orgs (owned by User B)!
How Invited Projects/Orgs Owned by User B Work:
Tenant Isolation: In LibSQL / Turso, auth tokens grant access to a single database URL. User A cannot connect directly to User B's personal Turso database because User B's private credentials are never exposed to User A for tenant isolation and security.
Local Synced Team Data: When User B invites User A to an Organization or Project:
Central Cloud registers User A in org_members or project_members.
SuperConsole's background

sync_manager.rs
 automatically synchronizes User B's shared workspaces, project settings, LLM keys, connectors, memories, and wikis into User A's local SQLite database.
When User A selects LocalDB in

LocalDBSQLEditor.tsx
, all data from User B's invited projects is available to query.
Shared Team Remote Databases: If an organization configures a shared Turso database connector in org_connectors / project_connectors, team members connect to that shared database using the organization-scoped credentials.
