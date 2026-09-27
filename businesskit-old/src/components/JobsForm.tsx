import {
  component$,
  useSignal,
  useStore,
  useTask$,
  type Signal,
  type PropFunction,
  $,
} from "@builder.io/qwik";
import { TipTapEditor } from "~/components/TipTapEditor";
import { SlideOver } from "~/components/SlideOver";
import { useAppContext } from "~/lib/app-context";
import { createJobListingIPC, updateJobListingIPC } from "~/lib/ipc";
import { LuSave, LuLoader } from "@qwikest/icons/lucide";
import type { JobListingRow } from "~/lib/types";

const slugifyClient = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export interface JobsFormProps {
  open: Signal<boolean>;
  editingJob: Signal<JobListingRow | null>;
  onSaved$: PropFunction<() => void>;
}

interface FormState {
  title: string;
  slug: string;
  company: string;
  location: string;
  locationType: string;
  employmentType: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  excerpt: string;
  description: string;
  requirements: string;
  published: boolean;
  imageUrl: string;
  additionalDetails: Array<{ key: string; value: string }>;
  expiresAt: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  company: "",
  location: "",
  locationType: "remote",
  employmentType: "full-time",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  excerpt: "",
  description: "",
  requirements: "",
  published: false,
  imageUrl: "",
  additionalDetails: [],
  expiresAt: "",
};

const inputStyle = {
  width: "100%",
  height: "2.625rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: "0.75rem",
        fontWeight: "600",
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "0.875rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

export const JobsForm = component$((props: JobsFormProps) => {
  const { open, editingJob, onSaved$ } = props;
  const app = useAppContext();
  
  const form = useStore<FormState>({ ...EMPTY_FORM });
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const isEditMode = useSignal(false);

  useTask$(({ track }) => {
    const job = track(() => editingJob.value);
    const isOpen = track(() => open.value);

    if (!isOpen) {
      Object.assign(form, EMPTY_FORM);
      error.value = null;
      saving.value = false;
      isEditMode.value = false;
      return;
    }

    if (job) {
      isEditMode.value = true;
      form.title = job.title;
      form.slug = job.slug;
      form.company = job.company;
      form.location = job.location;
      form.locationType = job.location_type;
      form.employmentType = job.employment_type;
      form.salaryMin = job.salary_min?.toString() || "";
      form.salaryMax = job.salary_max?.toString() || "";
      form.salaryCurrency = job.salary_currency;
      form.excerpt = job.excerpt || "";
      form.description = job.description;
      form.requirements = job.requirements || "";
      form.published = job.published;
      form.imageUrl = job.image_url || "";
      form.expiresAt = job.expires_at ? job.expires_at.split('T')[0] : "";

      try {
        const details = job.additional_details ? JSON.parse(job.additional_details) : [];
        form.additionalDetails = Array.isArray(details) ? details : [];
      } catch {
        form.additionalDetails = [];
      }
    } else {
      isEditMode.value = false;
      Object.assign(form, EMPTY_FORM);
    }
    error.value = null;
  });

  const handleSave$ = $(async () => {
    if (!form.title.trim() || !form.company.trim()) {
      error.value = "Title and Company are required.";
      return;
    }

    saving.value = true;
    error.value = null;

    try {
      const activeProfile = app.profiles.value.find(p => p.id === app.activeProfileId.value);
      const userId = activeProfile?.user_id || "system";

      const formData: any = {
        user_id: userId,
        title: form.title.trim(),
        slug: form.slug.trim() || slugifyClient(form.title),
        company: form.company.trim(),
        location: form.location.trim(),
        location_type: form.locationType,
        employment_type: form.employmentType,
        salary_min: form.salaryMin ? Number(form.salaryMin) : null,
        salary_max: form.salaryMax ? Number(form.salaryMax) : null,
        salary_currency: form.salaryCurrency,
        excerpt: form.excerpt.trim() || null,
        description: form.description.trim(),
        requirements: form.requirements.trim() || null,
        published: form.published,
        image_url: form.imageUrl.trim() || null,
        additional_details: form.additionalDetails.length > 0 ? JSON.stringify(form.additionalDetails) : null,
        expires_at: form.expiresAt.trim() || null,
      };

      if (isEditMode.value && editingJob.value) {
        await updateJobListingIPC(editingJob.value.id, formData);
      } else {
        await createJobListingIPC(formData);
      }

      await onSaved$();
      open.value = false;
    } catch (e) {
      console.error("Save error:", e);
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <SlideOver
      open={open}
      title={isEditMode.value ? `Edit Job` : `Add Job`}
      subtitle={isEditMode.value ? "Update the details below and save." : "Fill in the details below to add a new job listing."}
      width="50vw"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        
        {error.value && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
              lineHeight: "1.5",
            }}
          >
            {error.value}
          </div>
        )}

        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label style={labelStyle}>Job Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onInput$={(e) => { form.title = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
              <div>
                <label style={labelStyle}>Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onInput$={(e) => { form.slug = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="auto-generated"
                />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label style={labelStyle}>Company *</label>
                <input
                  type="text"
                  value={form.company}
                  onInput$={(e) => { form.company = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label style={labelStyle}>Location *</label>
                <input
                  type="text"
                  value={form.location}
                  onInput$={(e) => { form.location = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="e.g. New York, NY"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionTitle>Job Details</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label style={labelStyle}>Location Type</label>
                <select
                  value={form.locationType}
                  onChange$={(e) => { form.locationType = (e.target as HTMLSelectElement).value; }}
                  style={inputStyle}
                >
                  <option value="remote">Remote</option>
                  <option value="on-site">On-site</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Employment Type</label>
                <select
                  value={form.employmentType}
                  onChange$={(e) => { form.employmentType = (e.target as HTMLSelectElement).value; }}
                  style={inputStyle}
                >
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
              <div>
                <label style={labelStyle}>Min Salary</label>
                <input
                  type="number"
                  value={form.salaryMin}
                  onInput$={(e) => { form.salaryMin = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <label style={labelStyle}>Max Salary</label>
                <input
                  type="number"
                  value={form.salaryMax}
                  onInput$={(e) => { form.salaryMax = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="e.g. 80000"
                />
              </div>
              <div>
                <label style={labelStyle}>Currency</label>
                <input
                  type="text"
                  value={form.salaryCurrency}
                  onInput$={(e) => { form.salaryCurrency = (e.target as HTMLInputElement).value; }}
                  style={inputStyle}
                  placeholder="USD"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Excerpt</label>
              <textarea
                value={form.excerpt}
                onInput$={(e) => { form.excerpt = (e.target as HTMLTextAreaElement).value; }}
                style={{ ...inputStyle, height: "auto", resize: "vertical", minHeight: "4rem", padding: "0.625rem 0.75rem" }}
                placeholder="Short summary for the list view..."
              />
            </div>
            
            <div>
              <label style={labelStyle}>Description *</label>
              <TipTapEditor
                value={form.description}
                onChange$={(val: string) => { form.description = val; }}
                placeholder="Full job description..."
              />
            </div>

            <div>
              <label style={labelStyle}>Requirements</label>
              <TipTapEditor
                value={form.requirements}
                onChange$={(val: string) => { form.requirements = val; }}
                placeholder="Job requirements..."
              />
            </div>
          </div>
        </div>

        <div>
          <SectionTitle>Settings</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Expires At</label>
              <input
                type="date"
                value={form.expiresAt}
                onInput$={(e) => { form.expiresAt = (e.target as HTMLInputElement).value; }}
                style={inputStyle}
              />
            </div>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={form.published}
                onChange$={(e) => { form.published = (e.target as HTMLInputElement).checked; }}
              />
              Publish immediately
            </label>
          </div>
        </div>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            bottom: "-1.5rem",
            margin: "0 -1.5rem -1.5rem",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick$={handleSave$}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Saving...
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                {editingJob.value ? "Save Changes" : "Add Job"}
              </>
            )}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});
