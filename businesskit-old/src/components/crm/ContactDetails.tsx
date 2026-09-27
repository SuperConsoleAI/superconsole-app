import { component$, $, useSignal, useStore, useStylesScoped$, useTask$ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { useLocation, useNavigate } from "@builder.io/qwik-city";
import type { ContactRow, GroupRow } from "~/lib/types";
import { SlideOver } from "~/components/SlideOver";

type SocialLink = { platform: string; url: string; username: string; followers: string };

export const ContactDetails = component$((props: {
  contact: ContactRow | null;
  isOpen: boolean;
  onClose$: any;
  groups?: GroupRow[];
}) => {
  useStylesScoped$(`
    .modal-body { padding: 1.5rem; flex: 1; box-sizing: border-box; }
    .modal-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary); }
    .fg { margin-bottom: 1.1rem; display: flex; flex-direction: column; }
    .lbl { font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.3rem; font-weight: 500; }
    .fi { width: 100%; box-sizing: border-box; border: 1px solid var(--border); padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem; }
    select.fi { height: 36px; }
    .fi:focus { outline: none; border-color: var(--accent); }
    .col2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.1rem; }
    .col3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.1rem; }
    .col2 .fg, .col3 .fg { margin: 0; }
    .sec { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.07em; margin: 1.25rem 0 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-save { background: var(--text-primary); color: var(--surface-1); padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 0.75rem; font-size: 0.875rem; }
    .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
    /* Groups */
    .groups-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .group-chip { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.625rem; border-radius: 2rem; border: 1px solid var(--border); background: var(--surface-1); cursor: pointer; font-size: 0.8125rem; transition: all 0.15s; user-select: none; }
    .group-chip.on { background: var(--text-primary); color: var(--surface-1); border-color: var(--text-primary); }
    /* Social rows */
    .social-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
    .social-row input { box-sizing: border-box; border: 1px solid var(--border); padding: 0.4rem 0.5rem; border-radius: 0.4rem; background: var(--surface-1); color: var(--text-primary); font-size: 0.8125rem; width: 100%; }
    .social-row input:focus { outline: none; border-color: var(--accent); }
    .btn-rm { background: none; border: none; color: var(--text-secondary); font-size: 1.25rem; cursor: pointer; padding: 0; line-height: 1; }
    .btn-add { display: flex; align-items: center; gap: 0.375rem; background: none; border: 1px dashed var(--border); color: var(--text-secondary); font-size: 0.8125rem; padding: 0.375rem 0.75rem; border-radius: 0.5rem; cursor: pointer; margin-top: 0.25rem; }
    .btn-add:hover { border-color: var(--accent); color: var(--accent); }
    /* Message box */
    .msg-box { background: var(--surface-3); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem; font-size: 0.8125rem; color: var(--text-secondary); white-space: pre-wrap; line-height: 1.5; }
    .view-link { color: var(--accent); text-decoration: none; font-size: 0.875rem; font-weight: 500; display: block; text-align: center; margin-top: 1rem; }
  `);

  const nav = useNavigate();
  const isSaving = useSignal(false);
  const errorMessage = useSignal("");

  const openSignal = useSignal(props.isOpen);
  useTask$(({ track }) => {
    track(() => props.isOpen);
    openSignal.value = props.isOpen;
  });

  const loc = useLocation();

  if (!props.isOpen && !props.contact) return null;
  const c = props.contact || ({} as any);

  // ── Groups state ─────────────────────────────────────────
  let initSelected: string[] = [];
  try { const p = JSON.parse(c.groups || "[]"); if (Array.isArray(p)) initSelected = p; } catch { /* */ }
  const selectedGroups = useSignal<string[]>(initSelected);

  // ── Social links state ───────────────────────────────────
  let initSocial: SocialLink[] = [];
  try {
    const p = JSON.parse(c.social_links || "[]");
    if (Array.isArray(p)) initSocial = p.map((s: any) => ({
      platform: s.platform || "", url: s.url || "",
      username: s.username || "", followers: String(s.followers ?? ""),
    }));
  } catch { /* */ }
  const links = useStore<{ rows: SocialLink[] }>({ rows: initSocial.length > 0 ? initSocial : [] });

  const toggleGroup = $((id: string) => {
    const cur = selectedGroups.value;
    selectedGroups.value = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  });

  const addLink = $(() => {
    links.rows = [...links.rows, { platform: "", url: "", username: "", followers: "" }];
  });

  const removeLink = $((i: number) => {
    links.rows = links.rows.filter((_, idx) => idx !== i);
  });



  const handleSubmit$ = $(async (e: SubmitEvent) => {

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    isSaving.value = true;
    errorMessage.value = "";

    try {
      const data = {
        first_name: formData.get("first_name") as string,
        last_name: formData.get("last_name") as string || null,
        email: formData.get("email") as string || null,
        phone: formData.get("phone") as string || null,
        company: formData.get("company") as string || null,
        job_title: formData.get("job_title") as string || null,
        lead_score: parseInt(formData.get("lead_score") as string || "0", 10),
        status: formData.get("status") as string || "lead",
        outreach_status: formData.get("outreach_status") as string || "new",
        icp_match: formData.get("icp_match") as string || "unknown",
        contact_type: formData.get("contact_type") as string || null,
        notes: formData.get("notes") as string || null,
        groups: JSON.stringify(selectedGroups.value),
        social_links: JSON.stringify(
          links.rows.map(r => ({
            platform: r.platform, url: r.url, username: r.username,
            ...(r.followers ? { followers: parseInt(r.followers) || 0 } : {}),
          }))
        ),
      };

      await invoke('update_contact', {
        id: c.id,
        data: data
      });

      props.onClose$();
      nav();
    } catch (err: any) {
      errorMessage.value = String(err);
    } finally {
      isSaving.value = false;
    }
  });

  return (
    <SlideOver
      open={openSignal}
      title="Edit Contact"
      width="50%"
      onClose$={props.onClose$}
    >
      <form preventdefault:submit onSubmit$={handleSubmit$}>
            {/* ── Name / Contact ── */}
            <div class="col2">
              <div class="fg"><label class="lbl">First Name *</label><input type="text" name="first_name" class="fi" value={c.first_name} required /></div>
              <div class="fg"><label class="lbl">Last Name</label><input type="text" name="last_name" class="fi" value={c.last_name || ""} /></div>
            </div>
            <div class="col2">
              <div class="fg"><label class="lbl">Email</label><input type="email" name="email" class="fi" value={c.email || ""} /></div>
              <div class="fg"><label class="lbl">Phone</label><input type="text" name="phone" class="fi" value={c.phone || ""} /></div>
            </div>
            <div class="col2">
              <div class="fg"><label class="lbl">Company</label><input type="text" name="company" class="fi" value={c.company || ""} /></div>
              <div class="fg"><label class="lbl">Job Title</label><input type="text" name="job_title" class="fi" value={c.job_title || ""} /></div>
            </div>
            <div class="col2">
              <div class="fg">
                <label class="lbl">Contact Type</label>
                <select name="contact_type" class="fi">
                  <option value="">— Select —</option>
                  <option value="brand" selected={c.contact_type === "brand"}>Brand</option>
                  <option value="agency" selected={c.contact_type === "agency"}>Agency</option>
                  <option value="influencer" selected={c.contact_type === "influencer"}>Influencer</option>
                  <option value="professional" selected={c.contact_type === "professional"}>Professional</option>
                </select>
              </div>
              <div class="fg">
                <label class="lbl">Lead Score</label>
                <input type="number" name="lead_score" class="fi" value={c.lead_score || 0} min="0" max="100" />
              </div>
            </div>

            {/* ── CRM State ── */}
            <p class="sec">CRM State</p>
            <div class="col3">
              <div class="fg">
                <label class="lbl">Status</label>
                <select name="status" class="fi">
                  <option value="lead" selected={c.status === "lead"}>Lead</option>
                  <option value="prospect" selected={c.status === "prospect"}>Prospect</option>
                  <option value="customer" selected={c.status === "customer"}>Customer</option>
                  <option value="churned" selected={c.status === "churned"}>Churned</option>
                  <option value="archived" selected={c.status === "archived"}>Archived</option>
                </select>
              </div>
              <div class="fg">
                <label class="lbl">ICP Match</label>
                <select name="icp_match" class="fi">
                  <option value="strong" selected={c.icp_match === "strong"}>Strong</option>
                  <option value="moderate" selected={c.icp_match === "moderate"}>Moderate</option>
                  <option value="weak" selected={c.icp_match === "weak"}>Weak</option>
                  <option value="unknown" selected={!c.icp_match || c.icp_match === "unknown"}>Unknown</option>
                </select>
              </div>
              <div class="fg">
                <label class="lbl">Outreach</label>
                <select name="outreach_status" class="fi">
                  <option value="new" selected={c.outreach_status === "new"}>New</option>
                  <option value="dm_sent" selected={c.outreach_status === "dm_sent"}>DM Sent</option>
                  <option value="email_sent" selected={c.outreach_status === "email_sent"}>Email Sent</option>
                  <option value="replied" selected={c.outreach_status === "replied"}>Replied</option>
                  <option value="call_booked" selected={c.outreach_status === "call_booked"}>Call Booked</option>
                  <option value="converted" selected={c.outreach_status === "converted"}>Converted</option>
                  <option value="not_interested" selected={c.outreach_status === "not_interested"}>Not Interested</option>
                </select>
              </div>
            </div>

            {/* ── Groups ── */}
            {(props.groups ?? []).length > 0 && (
              <>
                <p class="sec">Groups</p>
                <div class="groups-grid">
                  {(props.groups ?? []).map((g: any) => (
                    <button
                      key={g.id}
                      type="button"
                      class={["group-chip", selectedGroups.value.includes(g.id) ? "on" : ""]}
                      onClick$={() => toggleGroup(g.id)}
                    >
                      {g.icon && <span>{g.icon}</span>}
                      <span>{g.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── Social Presence ── */}
            <p class="sec">Social Presence</p>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:0.4rem;margin-bottom:0.25rem;">
              <span class="lbl">Platform</span>
              <span class="lbl">URL</span>
              <span class="lbl">@Username</span>
              <span class="lbl">Followers</span>
              <span></span>
            </div>
            {links.rows.map((row, i) => (
              <div class="social-row" key={i}>
                <input
                  type="text" placeholder="linkedin" value={row.platform}
                  onInput$={(e) => { links.rows[i].platform = (e.target as HTMLInputElement).value; }}
                />
                <input
                  type="url" placeholder="https://..." value={row.url}
                  onInput$={(e) => { links.rows[i].url = (e.target as HTMLInputElement).value; }}
                />
                <input
                  type="text" placeholder="@handle" value={row.username}
                  onInput$={(e) => { links.rows[i].username = (e.target as HTMLInputElement).value; }}
                />
                <input
                  type="number" placeholder="12400" value={row.followers}
                  onInput$={(e) => { links.rows[i].followers = (e.target as HTMLInputElement).value; }}
                />
                <button type="button" class="btn-rm" onClick$={() => removeLink(i)}>&times;</button>
              </div>
            ))}
            <button type="button" class="btn-add" onClick$={addLink}>
              <span style="font-size:1rem;font-weight:700;">+</span> Add Social Link
            </button>

            {/* ── Notes ── */}
            <div class="fg" style="margin-top:1.1rem;">
              <label class="lbl">Internal Notes</label>
              <textarea name="notes" class="fi" rows={3} style="resize:vertical">{c.notes || ""}</textarea>
            </div>

            {/* ── Initial Message (read-only) ── */}
            {c.message && (
              <>
                <p class="sec">Initial Message <span style="text-transform:none;font-weight:400;font-size:0.7rem;opacity:0.7;">(from form / landing page — read only)</span></p>
                <div class="msg-box">{c.message}</div>
              </>
            )}

            <button type="submit" class="btn-save" disabled={isSaving.value}>
              {isSaving.value ? "Saving..." : "Save Changes"}
            </button>
            {errorMessage.value && (
              <div style="color:var(--error);font-size:0.875rem;margin-top:0.5rem;text-align:center;">{errorMessage.value}</div>
            )}
      </form>

      {!loc.url.pathname.includes(c.id) && (
        <a
          href="#"
          class="view-link"
          style="display: block; margin-top: 1rem;"
          onClick$={(e) => {
            e.preventDefault();
            window.sessionStorage.setItem("__bk_view_contact_id", c.id);
            nav("/dashboard/crm/default/");
          }}
        >
          View Full Profile (Timeline & Deals) →
        </a>
      )}
    </SlideOver>
  );
});
