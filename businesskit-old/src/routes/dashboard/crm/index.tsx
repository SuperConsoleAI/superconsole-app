import { component$, $, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead, useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuSearch, LuPlus, LuUser, LuRefreshCw } from "@qwikest/icons/lucide";

import { AddContact } from "~/components/crm/AddContact";
import { ContactDetails } from "~/components/crm/ContactDetails";
import type { ContactRow, GroupRow } from "~/lib/types";

const STYLES = `
  .crm-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }
  .filter-input-wrap {
    position: relative;
    flex: 1;
    min-width: 12rem;
    max-width: 22rem;
  }
  .filter-input {
    width: 100%;
    height: 2.25rem;
    padding-left: 2rem;
    padding-right: 0.75rem;
    background: var(--field-fill);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    box-sizing: border-box;
  }
  .filter-select {
    padding: 0 2rem 0 0.75rem;
    height: 2.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--text-primary);
    box-sizing: border-box;
    font-size: 0.875rem;
    appearance: none;
    outline: none;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    background-size: 1rem;
  }
  .score-bar-bg {
    width: 80px;
    height: 6px;
    background: var(--surface-3);
    border-radius: 3px;
    overflow: hidden;
  }
  .score-bar-fill {
    height: 100%;
    background: var(--accent);
  }
  @keyframes crm-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .crm-refresh-btn {
    height: 2.25rem;
    width: 2.25rem;
    padding: 0;
    border-radius: 0.375rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .crm-refresh-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }
  .crm-refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .crm-refresh-spinning {
    animation: crm-spin 0.8s linear infinite;
  }
`;

const thL = {
  padding: "0.625rem 0.75rem",
  textAlign: "left" as const,
  fontWeight: "600" as const,
  color: "var(--text-secondary)",
  fontSize: "0.75rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap" as const,
};
const thR = { ...thL, textAlign: "right" as const };

function getStatusBadge(status: string) {
  switch ((status || "").toLowerCase()) {
    case "replied":
      return { label: "Replied", color: "#22c55e", bg: "rgba(34,197,94,0.1)" };
    case "meeting":
      return { label: "Meeting", color: "#6366f1", bg: "rgba(99,102,241,0.1)" };
    case "bounced":
      return { label: "Bounced", color: "var(--error)", bg: "rgba(239,68,68,0.12)" };
    case "sent":
      return { label: "Sent", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
    default:
      return { label: status || "None", color: "var(--text-secondary)", bg: "var(--surface-3)" };
  }
}

const fmtDate = (ts: number) => {
  if (!ts) return "—";
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const crmContactsSessionCache: { current: { contacts: ContactRow[]; groups: GroupRow[] } | null } = { current: null };

export default component$(() => {
  useStylesScoped$(STYLES);
  const nav = useNavigate();

  const contacts = useSignal<ContactRow[]>([]);
  const groups = useSignal<GroupRow[]>([]);
  const loading = useSignal(true);

  const searchQuery = useSignal("");
  const statusFilter = useSignal("");
  const icpFilter = useSignal("");

  const isAddOpen = useSignal(false);
  const selectedContact = useSignal<ContactRow | null>(null);
  const isRefreshing = useSignal(false);

  const fetchContacts = $(async () => {
    if (crmContactsSessionCache.current) {
      contacts.value = crmContactsSessionCache.current.contacts;
      groups.value = crmContactsSessionCache.current.groups;
      loading.value = false;
    } else {
      loading.value = true;
    }
    try {
      const [contactsData, groupsData] = await Promise.all([
        invoke<ContactRow[]>("list_contacts", { opts: { limit: 100 } }).catch(() => []),
        invoke<GroupRow[]>("list_crm_groups").catch(() => []),
      ]);
      contacts.value = contactsData || [];
      groups.value = groupsData || [];
      crmContactsSessionCache.current = { contacts: contacts.value, groups: groups.value };
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      loading.value = false;
    }
  });

  const handleRefresh = $(async () => {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      crmContactsSessionCache.current = null;
      const [contactsData, groupsData] = await Promise.all([
        invoke<ContactRow[]>("list_contacts", { opts: { limit: 100 } }).catch(() => []),
        invoke<GroupRow[]>("list_crm_groups").catch(() => []),
      ]);
      contacts.value = contactsData || [];
      groups.value = groupsData || [];
      crmContactsSessionCache.current = { contacts: contacts.value, groups: groups.value };
    } catch (err) {
      console.error("Failed to refresh contacts:", err);
    } finally {
      setTimeout(() => {
        isRefreshing.value = false;
      }, 400);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchContacts();
  });

  const filteredContacts = contacts.value.filter((c: ContactRow) => {
    let match = true;
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      const name = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      const comp = (c.company || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      if (!name.includes(q) && !comp.includes(q) && !email.includes(q)) match = false;
    }
    if (statusFilter.value && c.status !== statusFilter.value) match = false;
    if (icpFilter.value && c.icp_match !== icpFilter.value) match = false;
    return match;
  });

  return (
    <div class="crm-main">
      {/* ── Toolbar: [Search & Refresh] ----------- [Status & ICP Filters | Add Contact] ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {/* Search on left */}
        <div class="filter-input-wrap">
          <span
            style={{
              position: "absolute",
              left: "0.65rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-secondary)",
              pointerEvents: "none",
              display: "flex",
            }}
          >
            <LuSearch style={{ width: "14px", height: "14px" }} />
          </span>
          <input
            type="search"
            placeholder="Search name, company or email..."
            class="filter-input"
            value={searchQuery.value}
            onInput$={(e) => (searchQuery.value = (e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Refresh button next to search */}
        <button
          type="button"
          onClick$={handleRefresh}
          disabled={isRefreshing.value}
          class="crm-refresh-btn"
          title="Refresh contacts"
          aria-label="Refresh contacts"
        >
          <LuRefreshCw
            style={{ width: "0.9375rem", height: "0.9375rem" }}
            class={isRefreshing.value ? "crm-refresh-spinning" : ""}
          />
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Filters */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            class="filter-select"
            value={statusFilter.value}
            onChange$={(e) => (statusFilter.value = (e.target as HTMLSelectElement).value)}
          >
            <option value="">All Statuses</option>
            <option value="lead">Lead</option>
            <option value="prospect">Prospect</option>
            <option value="customer">Customer</option>
          </select>
          <select
            class="filter-select"
            value={icpFilter.value}
            onChange$={(e) => (icpFilter.value = (e.target as HTMLSelectElement).value)}
          >
            <option value="">All ICPs</option>
            <option value="strong">Strong</option>
            <option value="moderate">Moderate</option>
            <option value="weak">Weak</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>

        {/* Add Contact Button */}
        <button
          type="button"
          onClick$={() => (isAddOpen.value = true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0 0.875rem",
            height: "2.25rem",
            fontSize: "0.875rem",
            fontWeight: "600",
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <LuPlus style={{ width: "14px", height: "14px" }} />
          Add Contact
        </button>
      </div>

      {/* ── Table Container ─────────────────────────────────────────────────── */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Loading contacts...
        </div>
      ) : filteredContacts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
            <LuUser style={{ width: "2.5rem", height: "2.5rem", color: "var(--text-secondary)" }} />
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>
            No contacts found
          </div>
          <div style={{ fontSize: "0.8125rem" }}>Create contacts or adjust filters to view CRM leads.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                <th style={thL}>Contact</th>
                <th style={thL}>Lead Score</th>
                <th style={thL}>Added Date</th>
                <th style={{ ...thL, textAlign: "center" }}>Outreach Status</th>
                <th style={thL}>Status</th>
                <th style={thR}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact: ContactRow) => {
                const badge = getStatusBadge(contact.outreach_status || "");
                return (
                  <tr
                    key={contact.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
                    onClick$={() => (selectedContact.value = contact)}
                  >
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {contact.avatar_url ? (
                          <img src={contact.avatar_url} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <div
                            style={{
                              width: "2rem",
                              height: "2rem",
                              borderRadius: "50%",
                              background: "var(--accent-soft)",
                              color: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "600",
                              fontSize: "0.8125rem",
                              flexShrink: 0,
                            }}
                          >
                            {(contact.first_name || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: "500", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            {contact.first_name} {contact.last_name || ""}
                          </div>
                          {contact.company && (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{contact.company}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
                        <span style={{ minWidth: "1.25rem", fontWeight: "600", color: "var(--text-primary)" }}>{contact.lead_score || 0}</span>
                        <div class="score-bar-bg">
                          <div class="score-bar-fill" style={`width: ${Math.min(100, Math.max(0, contact.lead_score || 0))}%`} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      {fmtDate(contact.created_at as number)}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.color}33`,
                          borderRadius: "0.25rem",
                          padding: "0.15rem 0.5rem",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "var(--text-secondary)", textTransform: "capitalize", fontSize: "0.8125rem" }}>
                      {contact.status || "lead"}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick$={(e) => {
                          e.stopPropagation();
                          window.sessionStorage.setItem("__bk_view_contact_id", contact.id);
                          nav(`/dashboard/crm/default/`);
                        }}
                        style={{
                          padding: "0.25rem 0.625rem",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Footer: count ───────────────────────────────────────────────── */}
          <div style={{ padding: "0.75rem 0.875rem", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? "s" : ""}{searchQuery.value || statusFilter.value || icpFilter.value ? " (filtered)" : ""}
            </span>
          </div>
        </div>
      )}

      <AddContact
        isOpen={isAddOpen.value}
        onClose$={$(() => (isAddOpen.value = false))}
        onSave$={fetchContacts}
      />
      <ContactDetails
        contact={selectedContact.value}
        isOpen={selectedContact.value !== null}
        onClose$={$(() => (selectedContact.value = null))}
        groups={groups.value}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Contacts - CRM",
};
