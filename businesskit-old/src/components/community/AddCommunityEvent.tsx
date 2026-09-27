import {
  component$,
  useSignal,
  useStore,
  type PropFunction,
  $,
  useComputed$,
  Slot,
} from "@builder.io/qwik";
import { SlideOver } from "~/components/SlideOver";

export interface AddCommunityEventProps {
  onClose$: PropFunction<() => void>;
  onAdd$: PropFunction<(details: any) => void>;
}

interface FormState {
  title: string;
  description: string;
  dateStr: string;
  timeStr: string;
  duration: string;
  timezone: string;
  location: string;
  isRecurring: boolean;
  addReminder: boolean;
  accessType: string;
}

const inputStyle = {
  width: "100%",
  height: "40px",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};

const selectStyle = {
  ...inputStyle,
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  paddingRight: "2.25rem",
  cursor: "pointer",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const CustomRadio = component$<{ checked: boolean; onClick$: PropFunction<() => void> }>(({ checked, onClick$ }) => {
  return (
    <div onClick$={onClick$} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
      <div style={{
        width: "1.25rem",
        height: "1.25rem",
        borderRadius: "50%",
        border: checked ? "2px solid var(--accent)" : "2px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxSizing: "border-box",
        transition: "border-color 0.2s ease"
      }}>
        {checked && (
          <div style={{
            width: "0.625rem",
            height: "0.625rem",
            borderRadius: "50%",
            background: "var(--accent)",
          }} />
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <Slot />
      </div>
    </div>
  );
});

export const CustomCheckbox = component$<{ checked: boolean; onClick$: PropFunction<() => void> }>(({ checked, onClick$ }) => {
  return (
    <div onClick$={onClick$} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
      <div style={{
        width: "1.25rem",
        height: "1.25rem",
        borderRadius: "0.25rem",
        border: checked ? "2px solid var(--accent)" : "2px solid var(--border)",
        background: checked ? "var(--accent)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxSizing: "border-box",
        transition: "all 0.2s ease"
      }}>
        {checked && (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--button-primary-text, #fff)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <Slot />
      </div>
    </div>
  );
});

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

export const AddCommunityEvent = component$<AddCommunityEventProps>(({ onClose$, onAdd$ }) => {
  const today = new Date().toISOString().slice(0, 10);
  
  const form = useStore<FormState>({
    title: "",
    description: "",
    dateStr: today,
    timeStr: "",
    duration: "1 hour",
    timezone: "(GMT +05:30) Asia/Calcutta",
    location: "Skool call",
    isRecurring: false,
    addReminder: false,
    accessType: "all",
  });

  const isOpen = useSignal(true);
  
  const handleClose = $(() => {
    isOpen.value = false;
    setTimeout(() => onClose$(), 300);
  });

  const canAdd = useComputed$(() => form.title.trim().length > 0 && form.dateStr.length > 0);

  const handleAdd$ = $(() => {
    if (!canAdd.value) return;
    onAdd$({
      title: form.title,
      description: form.description,
      startsAt: `${form.dateStr}T${form.timeStr || "00:00"}`,
      duration: form.duration,
      timezone: form.timezone,
      location: form.location,
      isRecurring: form.isRecurring,
      addReminder: form.addReminder,
      accessType: form.accessType
    });
  });

  return (
    <SlideOver
      open={isOpen}
      title="Add Event"
      subtitle="Fill in the details below to schedule a new event."
      width="520px"
      onClose$={handleClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "5rem" }}>
        
        {/* ═══ Section 1 — Basic ═══════════════════════════════════════ */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            
            <div>
              <label style={labelStyle}>
                Title <span style={{ color: "var(--error)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onInput$={(e) => form.title = (e.target as HTMLInputElement).value}
                placeholder="Event Title"
                style={inputStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              />
              <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {form.title.length} / 30
              </div>
            </div>
            
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onInput$={(e) => form.description = (e.target as HTMLTextAreaElement).value}
                placeholder="Description of the event..."
                rows={4}
                style={{
                  ...inputStyle,
                  height: "auto",
                  resize: "vertical",
                  minHeight: "5rem",
                  fontFamily: "inherit",
                }}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              />
              <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {form.description.length} / 300
              </div>
            </div>

          </div>
        </div>

        {/* ═══ Section 2 — Schedule ═══════════════════════════════════════ */}
        <div>
          <SectionTitle>Schedule</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Date <span style={{ color: "var(--error)" }}>*</span></label>
              <input 
                type="date" 
                value={form.dateStr} 
                onInput$={(e) => form.dateStr = (e.target as HTMLInputElement).value}
                style={inputStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input 
                type="time" 
                value={form.timeStr} 
                onInput$={(e) => form.timeStr = (e.target as HTMLInputElement).value}
                style={inputStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              />
            </div>
            <div>
              <label style={labelStyle}>Duration</label>
              <select 
                value={form.duration} 
                onChange$={(e) => form.duration = (e.target as HTMLSelectElement).value}
                style={selectStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              >
                <option value="30 mins">30 mins</option>
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Timezone</label>
              <select 
                value={form.timezone} 
                onChange$={(e) => form.timezone = (e.target as HTMLSelectElement).value}
                style={selectStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              >
                <option value="(GMT +05:30) Asia/Calcutta">(GMT +05:30) Asia/Calcutta</option>
                <option value="(GMT +00:00) UTC">(GMT +00:00) UTC</option>
                <option value="(GMT -05:00) EST">(GMT -05:00) EST</option>
              </select>
            </div>
          </div>
          
          <div style={{ marginTop: "1rem" }}>
            <CustomCheckbox checked={form.isRecurring} onClick$={$(() => form.isRecurring = !form.isRecurring)}>
              Recurring event
            </CustomCheckbox>
          </div>
        </div>

        {/* ═══ Section 3 — Location & Access ═══════════════════════════════════════ */}
        <div>
          <SectionTitle>Location & Access</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            
            <div>
              <label style={labelStyle}>Location</label>
              <select 
                value={form.location} 
                onChange$={(e) => form.location = (e.target as HTMLSelectElement).value}
                style={selectStyle}
                onFocus$={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                onBlur$={(e) => (e.target as HTMLElement).style.borderColor = "var(--border)"}
              >
                <option value="Skool call">📺 Skool call</option>
                <option value="Zoom">📹 Zoom</option>
                <option value="Google Meet">🎥 Google Meet</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
              <CustomRadio checked={form.accessType === 'all'} onClick$={$(() => form.accessType = 'all')}>
                All members
              </CustomRadio>

              <CustomRadio checked={form.accessType === 'level'} onClick$={$(() => form.accessType = 'level')}>
                Members on/above 
                <select style={{ marginLeft: "auto", border: "none", background: "transparent", fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", outline: "none" }} onClick$={(e) => e.stopPropagation()}>
                  <option value="1">Level 1</option>
                  <option value="2">Level 2</option>
                  <option value="3">Level 3</option>
                </select>
              </CustomRadio>

              <CustomRadio checked={form.accessType === 'tier'} onClick$={$(() => form.accessType = 'tier')}>
                Members on/above 
                <select style={{ marginLeft: "auto", border: "none", background: "transparent", fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", outline: "none" }} onClick$={(e) => e.stopPropagation()}>
                  <option value="standard">Standard tier</option>
                  <option value="premium">Premium tier</option>
                </select>
              </CustomRadio>

              <CustomRadio checked={form.accessType === 'course'} onClick$={$(() => form.accessType = 'course')}>
                Members in 
                <select style={{ marginLeft: "auto", border: "none", background: "transparent", fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", outline: "none" }} onClick$={(e) => e.stopPropagation()}>
                  <option value="course1">This course</option>
                </select>
              </CustomRadio>
            </div>
            
            <div style={{ marginTop: "0.5rem" }}>
              <CustomCheckbox checked={form.addReminder} onClick$={$(() => form.addReminder = !form.addReminder)}>
                Remind members by email 1 day before
              </CustomCheckbox>
            </div>

          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          padding: "1rem 1.5rem",
          background: "var(--surface-2)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <button
          onClick$={handleClose}
          style={{
            padding: "0.5rem 1rem",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            fontWeight: "500",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick$={handleAdd$}
          disabled={!canAdd.value}
          style={{
            padding: "0.5rem 1.25rem",
            background: canAdd.value ? "var(--button-primary-bg, var(--accent))" : "var(--surface-3)",
            color: canAdd.value ? "var(--button-primary-text, #fff)" : "var(--text-muted)",
            border: "none",
            borderRadius: "0.375rem",
            fontWeight: "600",
            cursor: canAdd.value ? "pointer" : "not-allowed",
          }}
        >
          Save Event
        </button>
      </div>
    </SlideOver>
  );
});
