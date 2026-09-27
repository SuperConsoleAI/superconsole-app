import {
  component$,
  useSignal,
  type QRL,
  type Signal,
  $,
} from "@builder.io/qwik";
import { 
  LuTrash2, LuPlus, LuChevronDown, LuChevronUp,
  LuDownload, LuGraduationCap, LuCalendar, LuList,
  LuUsers, LuWrench, LuHeartHandshake, LuVideo, LuPackage,
  LuFolder, LuUpload, LuSliders
} from "@qwikest/icons/lucide";
import { TipTapEditor } from "~/components/TipTapEditor";
import { TimezoneSelect } from "~/components/TimezoneSelect";
import { SlideOver } from "~/components/SlideOver";
import { designSystem } from "~/lib/design-system";
import { MediaPickerModal, type MediaItem as PickerMediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";
import { SliderPickerModal, type Slider as PickerSlider } from "~/components/media/SliderPickerModal";
import { SliderModal } from "~/components/media/SliderModal";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProductType =
  | "downloads"
  | "courses"
  | "event"
  | "listing"
  | "meeting"
  | "service"
  | "sponsorship"
  | "webinar";

export type DayAvailability = {
  enabled: boolean;
  from: string;
  to: string;
};

export type WebinarSlot = {
  date: string;
  time: string;
  totalSlotsLeft?: number;
};

export type Lesson = {
  id: string;
  title: string;
  content: string;
  order: number;
};

export type Module = {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
};

export interface ProductFormState {
  // ── Shared (all types) ─────────────────────────────────────────────────────
  title: string;
  slug: string;
  excerpt: string;
  price: string;
  salePrice: string;
  coverImageUrl: string;
  coverVideoUrl: string;
  media_id?: string;
  slider_id?: string;
  seo_og_image?: string;
  buttonText: string;
  /** Per-unit pricing label e.g. "per seat", "per hour" */
  unit: string;
  additionalDetails: Array<{ key: string; value: string }>;
  showTotalSales: boolean;
  /** Limited sales — enables capacity + waitlist fields */
  limitedSales: boolean;
  capacity: string;
  waitlistEnabled: boolean;
  /** CTA button — shown collapsed for all types */
  ctaButtonText: string;
  ctaButtonUrl: string;

  // ── courses ────────────────────────────────────────────────────────────────
  modules: Module[];

  // ── downloads ──────────────────────────────────────────────────────────────
  fileUrl: string;

  // ── event (→ event_settings JSON) ─────────────────────────────────────────
  eventStartDateTime: string;
  eventEndDateTime: string;
  eventTimezone: string;
  eventLocation: string;
  eventRequireApproval: boolean;

  // ── meeting (→ meeting_settings JSON) ───────────────────────────────────────
  meetingRequireApproval: boolean;
  meetingPlatform: string;
  meetingTimezone: string;
  meetingDuration: string;
  meetingMaxAttendees: string;
  meetingBreakBefore: string;
  meetingBreakAfter: string;
  meetingBookWithinDays: string;
  meetingAvailability: Record<string, DayAvailability>;

  // ── webinar (→ webinar_settings JSON) ─────────────────────────────────────
  webinarPlatform: string;
  webinarTimezone: string;
  webinarDuration: string;
  webinarSeatsPerSlot: string;
  webinarSlots: WebinarSlot[];

  // ── sponsorship ────────────────────────────────────────────────────────────
  platformName: string;
  platformUrl: string;
  postFrequency: string;
}

const DEFAULT_AVAILABILITY: Record<string, DayAvailability> = {
  monday: { enabled: false, from: "09:00", to: "17:00" },
  tuesday: { enabled: false, from: "09:00", to: "17:00" },
  wednesday: { enabled: false, from: "09:00", to: "17:00" },
  thursday: { enabled: false, from: "09:00", to: "17:00" },
  friday: { enabled: false, from: "09:00", to: "17:00" },
  saturday: { enabled: false, from: "09:00", to: "17:00" },
  sunday: { enabled: false, from: "09:00", to: "17:00" },
};

const DEFAULT_BUTTON_TEXT: Record<ProductType, string> = {
  downloads: "Get instant access",
  courses: "Enroll now",
  event: "Get tickets",
  listing: "I want this!",
  meeting: "Book meeting",
  service: "Get started",
  sponsorship: "Sponsor us",
  webinar: "Register now",
};

/** Export so routes can call resetForm() consistently */
export function defaultProductFormState(type: ProductType): ProductFormState {
  return {
    title: "",
    slug: "",
    excerpt: "",
    price: "",
    salePrice: "",
    coverImageUrl: "",
    coverVideoUrl: "",
    media_id: "",
    slider_id: "",
    seo_og_image: "",
    buttonText: DEFAULT_BUTTON_TEXT[type] ?? "Buy now",
    unit: "",
    additionalDetails: [],
    showTotalSales: false,
    limitedSales: false,
    capacity: "",
    waitlistEnabled: false,
    ctaButtonText: "",
    ctaButtonUrl: "",
    modules: [],
    fileUrl: "",
    eventStartDateTime: "",
    eventEndDateTime: "",
    eventTimezone: "America/New_York",
    eventLocation: "",
    eventRequireApproval: false,
    meetingRequireApproval: false,
    meetingPlatform: "google_meet",
    meetingTimezone: "America/New_York",
    meetingDuration: "30",
    meetingMaxAttendees: "1",
    meetingBreakBefore: "0",
    meetingBreakAfter: "0",
    meetingBookWithinDays: "90",
    meetingAvailability: { ...DEFAULT_AVAILABILITY },
    webinarPlatform: "zoom",
    webinarTimezone: "America/New_York",
    webinarDuration: "60",
    webinarSeatsPerSlot: "",
    webinarSlots: [],
    platformName: "",
    platformUrl: "",
    postFrequency: "",
  };
}

// ─── ProductFormProps ─────────────────────────────────────────────────────────

export interface ProductFormProps {
  open: Signal<boolean>;
  productType: ProductType;
  isEditing: boolean;
  isSaving: Signal<boolean>;
  formState: Signal<ProductFormState>;
  formErrors: Signal<Record<string, string>>;
  /** Rich-text content — managed separately for TipTapEditor */
  descriptionHtml: Signal<string>;
  slugManuallyEdited: Signal<boolean>;
  errorMessage?: string;
  onSave$: QRL<(e: Event) => void>;
  onCancel$: QRL<() => void>;
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

const { spacing, typography, borderRadius } = designSystem;

const inp = `padding:0.75rem 1rem;border-radius:${borderRadius.md};border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);font-size:${typography.sizes.sm};width:100%;min-width:0;box-sizing:border-box;height:2.75rem;`;
const inpErr = (err?: string) => inp + (err ? "border-color:var(--error);" : "");

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Reusable field label */
const FL = component$<{ label: string; required?: boolean; hint?: string; error?: string }>(
  ({ label, required, hint, error }) => (
    <div style="display:flex;flex-direction:column;gap:0.25rem;">
      <span style={`font-size:${typography.sizes.sm};font-weight:500;color:var(--text-primary);display:flex;gap:0.35rem;align-items:center;`}>
        {label}
        {required && <span style="color:var(--error);" aria-hidden>*</span>}
        {error && <span style={`font-size:${typography.sizes.xs};color:var(--error);`}>{error}</span>}
      </span>
      {hint && <span style={`font-size:${typography.sizes.xs};color:var(--text-secondary);`}>{hint}</span>}
    </div>
  )
);

// ─── Days ────────────────────────────────────────────────────────────────────

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ─── Main Component ───────────────────────────────────────────────────────────

export const ProductForm = component$<ProductFormProps>((props) => {
  const { open, productType, isEditing, isSaving, formState, formErrors, descriptionHtml, slugManuallyEdited } = props;

  const showCta = useSignal(false);
  const mediaPickerOpen = useSignal(false);
  const mediaModalOpen = useSignal(false);
  const activeMediaTarget = useSignal<"cover" | "seo">("cover");
  const sliderPickerOpen = useSignal(false);
  const sliderModalOpen = useSignal(false);
  const selectedSlider = useSignal<PickerSlider | null>(null);

  const getProductIcon = () => {
    switch (productType) {
      case "downloads": return LuDownload;
      case "courses": return LuGraduationCap;
      case "event": return LuCalendar;
      case "listing": return LuList;
      case "meeting": return LuUsers;
      case "service": return LuWrench;
      case "sponsorship": return LuHeartHandshake;
      case "webinar": return LuVideo;
      default: return LuPackage;
    }
  };

  const Icon = getProductIcon();

  const activeTab = useSignal<"Details" | "Curriculum">("Details");
  const expandedLessons = useSignal<Set<string>>(new Set());

  const addModule = $(() => {
    formState.value = {
      ...formState.value,
      modules: [
        ...formState.value.modules,
        {
          id: `module-${Date.now()}`,
          title: "",
          order: formState.value.modules.length,
          lessons: [],
        },
      ],
    };
  });

  const deleteModule = $((moduleId: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.filter((m) => m.id !== moduleId),
    };
  });

  const updateModuleTitle = $((moduleId: string, title: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)),
    };
  });

  const addLesson = $((moduleId: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.map((m) => {
        if (m.id === moduleId) {
          return {
            ...m,
            lessons: [
              ...m.lessons,
              {
                id: `lesson-${Date.now()}`,
                title: "",
                content: "",
                order: m.lessons.length,
              },
            ],
          };
        }
        return m;
      }),
    };
  });

  const deleteLesson = $((moduleId: string, lessonId: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.map((m) => {
        if (m.id === moduleId) {
          return { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) };
        }
        return m;
      }),
    };
  });

  const updateLessonTitle = $((moduleId: string, lessonId: string, title: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.map((m) => {
        if (m.id === moduleId) {
          return {
            ...m,
            lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, title } : l)),
          };
        }
        return m;
      }),
    };
  });

  const updateLessonContent = $((moduleId: string, lessonId: string, content: string) => {
    formState.value = {
      ...formState.value,
      modules: formState.value.modules.map((m) => {
        if (m.id === moduleId) {
          return {
            ...m,
            lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, content } : l)),
          };
        }
        return m;
      }),
    };
  });

  const toggleLesson = $((lessonId: string) => {
    const next = new Set(expandedLessons.value);
    if (next.has(lessonId)) next.delete(lessonId);
    else next.add(lessonId);
    expandedLessons.value = next;
  });

  const totalLessons = formState.value.modules.reduce((sum, m) => sum + m.lessons.length, 0);

  return (
    <SlideOver
      open={open}
      onClose$={$(() => {
        open.value = false;
        setTimeout(() => props.onCancel$(), 300);
      })}
      title={isEditing ? `Edit ${productType}` : `New ${productType}`}
      width="740px"
    >
      <div q:slot="icon" style="display:flex;align-items:center;justify-content:center;">
        <Icon style="width:1.25rem;height:1.25rem;color:var(--text-primary);" stroke-width="1.5" />
      </div>
      {productType === "courses" && (
        <div q:slot="header-tabs" style="display:flex;gap:0.25rem;background:var(--surface-3);padding:2px;border-radius:0.5rem;height:32px;align-items:center;box-sizing:border-box;margin-left:1rem;">
          <button
            type="button"
            onClick$={() => activeTab.value = "Details"}
            style={`padding:0 0.75rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;display:flex;align-items:center;height:100%;box-sizing:border-box;transition:background 0.15s;border:none;cursor:pointer;${activeTab.value === "Details" ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:var(--text-secondary);'}`}
          >
            Details
          </button>
          <button
            type="button"
            onClick$={() => activeTab.value = "Curriculum"}
            style={`padding:0 0.75rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;display:flex;align-items:center;height:100%;box-sizing:border-box;transition:background 0.15s;border:none;cursor:pointer;${activeTab.value === "Curriculum" ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:var(--text-secondary);'}`}
          >
            Curriculum
          </button>
        </div>
      )}
      <form
        preventdefault:submit
        onSubmit$={props.onSave$}
        style="display:flex;flex-direction:column;height:100%;color:var(--text-primary);background:var(--surface-2);"
      >
        {/* ── Form body ── */}
        <div style={`display:flex;flex-direction:column;gap:${spacing.lg};margin-bottom:3rem;`}>

          {/* Error banner */}
          {props.errorMessage && (
            <div style="padding:0.75rem 1rem;background:rgba(239,68,68,0.1);border:1px solid var(--error);border-radius:0.5rem;color:var(--error);font-size:0.875rem;">
              {props.errorMessage}
            </div>
          )}

          {activeTab.value === "Details" ? (
            <>


          {/* ── Title + Slug ── */}
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:0.75rem;">
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Title" required error={formErrors.value.title} />
              <input
                type="text"
                value={formState.value.title}
                onInput$={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  const auto = slugManuallyEdited.value ? formState.value.slug : slugify(v);
                  formState.value = { ...formState.value, title: v, slug: auto };
                }}
                placeholder="Product title"
                style={inpErr(formErrors.value.title)}
                required
              />
            </label>
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Slug" required error={formErrors.value.slug} />
              <input
                type="text"
                value={formState.value.slug}
                onFocus$={() => { slugManuallyEdited.value = true; }}
                onInput$={(e) => {
                  slugManuallyEdited.value = true;
                  formState.value = { ...formState.value, slug: slugify((e.target as HTMLInputElement).value) };
                }}
                placeholder="auto-generated-from-title"
                style={inpErr(formErrors.value.slug)}
              />
            </label>
          </div>

          {/* ── Price + Sale Price ── */}
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Base price (USD)" required error={formErrors.value.price} />
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.value.price}
                onInput$={(e) => { formState.value = { ...formState.value, price: (e.target as HTMLInputElement).value }; }}
                placeholder="49.00"
                style={inpErr(formErrors.value.price)}
              />
            </label>
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Sale price (optional)" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.value.salePrice}
                onInput$={(e) => { formState.value = { ...formState.value, salePrice: (e.target as HTMLInputElement).value }; }}
                placeholder="39.00"
                style={inp}
              />
            </label>
          </div>

          {/* ── Button Text + Unit (standalone columns side by side) ── */}
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Button text" hint={`Defaults to "${DEFAULT_BUTTON_TEXT[productType]}"`} />
              <input
                type="text"
                value={formState.value.buttonText}
                onInput$={(e) => { formState.value = { ...formState.value, buttonText: (e.target as HTMLInputElement).value }; }}
                placeholder={DEFAULT_BUTTON_TEXT[productType]}
                style={inp}
              />
            </label>
            <label style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Unit (optional)" hint="How many units you’re selling. Leave blank for unlimited." />
              <input
                type="number"
                min="0"
                value={formState.value.unit}
                onInput$={(e) => { formState.value = { ...formState.value, unit: (e.target as HTMLInputElement).value }; }}
                placeholder="1"
                style={inp}
              />
            </label>
          </div>

          {/* ── Type-specific settings ── */}
          <div style={`display:flex;flex-direction:column;gap:${spacing.lg};`}>

            {/* ── DOWNLOADS: File URL ── */}
            {productType === "downloads" && (
              <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
                <div style="padding:0.75rem 1rem;background:var(--background);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;">
                  <span>📁</span>
                  <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>File</span>
                </div>
                <div style={`padding:1rem;`}>
                  <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <FL label="File URL" required error={formErrors.value.fileUrl} hint="Direct link to the file — any format (ZIP, PDF, MP4, etc.)" />
                    <input
                      type="url"
                      value={formState.value.fileUrl}
                      onInput$={(e) => { formState.value = { ...formState.value, fileUrl: (e.target as HTMLInputElement).value }; }}
                      placeholder="https://cdn.example.com/files/product.zip"
                      style={inpErr(formErrors.value.fileUrl)}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* ── EVENT: Event Details ── */}
            {productType === "event" && (
              <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
                <div style="padding:0.75rem 1rem;background:var(--background);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;">
                  <span>📅</span>
                  <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>Event Details</span>
                </div>
                <div style={`padding:1rem;display:flex;flex-direction:column;gap:${spacing.md};`}>
                  {/* ── Timezone ── */}
                  <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <FL label="Timezone" />
                    <TimezoneSelect
                      value={formState.value.eventTimezone}
                      onTimezoneChange$={(tz) => { formState.value = { ...formState.value, eventTimezone: tz }; }}
                    />
                  </label>
                  {/* Start + End DateTime */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Start Date & Time" required error={formErrors.value.eventStartDateTime} />
                      <input
                        type="datetime-local"
                        value={formState.value.eventStartDateTime}
                        onInput$={(e) => { formState.value = { ...formState.value, eventStartDateTime: (e.target as HTMLInputElement).value }; }}
                        style={inpErr(formErrors.value.eventStartDateTime)}
                      />
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="End Date & Time" error={formErrors.value.eventEndDateTime} />
                      <input
                        type="datetime-local"
                        value={formState.value.eventEndDateTime}
                        onInput$={(e) => { formState.value = { ...formState.value, eventEndDateTime: (e.target as HTMLInputElement).value }; }}
                        style={inpErr(formErrors.value.eventEndDateTime)}
                      />
                    </label>
                  </div>
                  {/* Location */}
                  <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <FL label="Location" hint="Physical address or virtual meeting link" />
                    <input
                      type="text"
                      value={formState.value.eventLocation}
                      onInput$={(e) => { formState.value = { ...formState.value, eventLocation: (e.target as HTMLInputElement).value }; }}
                      placeholder="123 Main St, New York, NY or https://zoom.us/j/..."
                      style={inp}
                    />
                  </label>
                  {/* Capacity + Waitlist */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Capacity" hint="Max number of spots. Leave blank for unlimited." />
                      <input
                        type="number"
                        min="1"
                        value={formState.value.capacity}
                        onInput$={(e) => { formState.value = { ...formState.value, capacity: (e.target as HTMLInputElement).value }; }}
                        placeholder="100"
                        style={inp}
                      />
                    </label>
                    <div style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Enable Waitlist" hint="Let attendees join a waitlist when sold out" />
                      <div style={`display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;`}>
                        <button
                          type="button"
                          style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${formState.value.waitlistEnabled ? "var(--accent)" : "var(--border)"};background:${formState.value.waitlistEnabled ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s;`}
                          onClick$={() => { formState.value = { ...formState.value, waitlistEnabled: !formState.value.waitlistEnabled }; }}
                        >
                          <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${formState.value.waitlistEnabled ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:left 0.2s;`} />
                        </button>
                        <span style={`font-size:${typography.sizes.sm};color:var(--text-secondary);`}>{formState.value.waitlistEnabled ? "Enabled" : "Off"}</span>
                      </div>
                    </div>
                  </div>
                  {/* Require Approval */}
                  <div style={`padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:${borderRadius.md};display:flex;align-items:center;justify-content:space-between;`}>
                    <div>
                      <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Require Approval</p>
                      <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Manually approve each registration</p>
                    </div>
                    <button
                      type="button"
                      style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${formState.value.eventRequireApproval ? "var(--accent)" : "var(--border)"};background:${formState.value.eventRequireApproval ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s;`}
                      onClick$={() => { formState.value = { ...formState.value, eventRequireApproval: !formState.value.eventRequireApproval }; }}
                    >
                      <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${formState.value.eventRequireApproval ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:left 0.2s;`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── MEETING: Meeting Settings ── */}
            {productType === "meeting" && (
              <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
                <div style="padding:0.75rem 1rem;background:var(--background);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;">
                  <span>📅</span>
                  <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>Meeting Settings</span>
                </div>
                <div style={`padding:1rem;display:flex;flex-direction:column;gap:${spacing.md};`}>
                  {/* Platform + Timezone */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Platform" />
                      <select
                        value={formState.value.meetingPlatform}
                        onChange$={(e) => { formState.value = { ...formState.value, meetingPlatform: (e.target as HTMLSelectElement).value }; }}
                        style={inp}
                      >
                        <option value="google_meet">Google Meet</option>
                        <option value="zoom">Zoom</option>
                        <option value="teams">Microsoft Teams</option>
                        <option value="phone">Phone Call</option>
                        <option value="in_person">In Person</option>
                      </select>
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Timezone" />
                      <TimezoneSelect
                        value={formState.value.meetingTimezone}
                        onTimezoneChange$={(tz) => { formState.value = { ...formState.value, meetingTimezone: tz }; }}
                      />
                    </label>
                  </div>
                  {/* Duration + Max Attendees */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Duration (minutes)" />
                      <select
                        value={formState.value.meetingDuration}
                        onChange$={(e) => { formState.value = { ...formState.value, meetingDuration: (e.target as HTMLSelectElement).value }; }}
                        style={inp}
                      >
                        {["15", "20", "30", "45", "60", "90", "120"].map(d => <option key={d} value={d}>{d + " min"}</option>)}
                      </select>
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Max attendees" hint="Seats per slot" />
                      <input
                        type="number"
                        min="1"
                        value={formState.value.meetingMaxAttendees}
                        onInput$={(e) => { formState.value = { ...formState.value, meetingMaxAttendees: (e.target as HTMLInputElement).value }; }}
                        placeholder="1"
                        style={inp}
                      />
                    </label>
                  </div>
                  {/* Break Before + After */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Break before (min)" hint="Buffer time before slot" />
                      <input
                        type="number"
                        min="0"
                        value={formState.value.meetingBreakBefore}
                        onInput$={(e) => { formState.value = { ...formState.value, meetingBreakBefore: (e.target as HTMLInputElement).value }; }}
                        placeholder="0"
                        style={inp}
                      />
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Break after (min)" hint="Buffer time after slot" />
                      <input
                        type="number"
                        min="0"
                        value={formState.value.meetingBreakAfter}
                        onInput$={(e) => { formState.value = { ...formState.value, meetingBreakAfter: (e.target as HTMLInputElement).value }; }}
                        placeholder="0"
                        style={inp}
                      />
                    </label>
                  </div>
                  {/* Book within days */}
                  <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <FL label="Book within (days)" hint="How far in advance customers can book" />
                    <input
                      type="number"
                      min="1"
                      value={formState.value.meetingBookWithinDays}
                      onInput$={(e) => { formState.value = { ...formState.value, meetingBookWithinDays: (e.target as HTMLInputElement).value }; }}
                      placeholder="90"
                      style={inp}
                    />
                  </label>
                  {/* Availability grid */}
                  <div>
                    <FL label="Availability" hint="Set available hours for each day" />
                    <div style={`margin-top:0.5rem;display:flex;flex-direction:column;gap:0.375rem;`}>
                      {DAYS.map(day => {
                        const av = formState.value.meetingAvailability[day] ?? { enabled: false, from: "09:00", to: "17:00" };
                        return (
                          <div key={day} style="display:grid;grid-template-columns:100px 1fr 1fr;gap:0.5rem;align-items:center;">
                            <label style="display:flex;align-items:center;gap:0.375rem;cursor:pointer;">
                              <input
                                type="checkbox"
                                checked={av.enabled}
                                onChange$={(e) => {
                                  formState.value = {
                                    ...formState.value,
                                    meetingAvailability: {
                                      ...formState.value.meetingAvailability,
                                      [day]: { ...av, enabled: (e.target as HTMLInputElement).checked },
                                    },
                                  };
                                }}
                                style="accent-color:var(--accent);"
                              />
                              <span style={`font-size:${typography.sizes.sm};color:${av.enabled ? "var(--text-primary)" : "var(--text-secondary)"};text-transform:capitalize;`}>{day}</span>
                            </label>
                            {av.enabled ? (
                              <>
                                <input
                                  type="time"
                                  value={av.from}
                                  onInput$={(e) => {
                                    formState.value = {
                                      ...formState.value,
                                      meetingAvailability: {
                                        ...formState.value.meetingAvailability,
                                        [day]: { ...av, from: (e.target as HTMLInputElement).value },
                                      },
                                    };
                                  }}
                                  style={inp}
                                />
                                <input
                                  type="time"
                                  value={av.to}
                                  onInput$={(e) => {
                                    formState.value = {
                                      ...formState.value,
                                      meetingAvailability: {
                                        ...formState.value.meetingAvailability,
                                        [day]: { ...av, to: (e.target as HTMLInputElement).value },
                                      },
                                    };
                                  }}
                                  style={inp}
                                />
                              </>
                            ) : (
                              <span style={`font-size:${typography.sizes.xs};color:var(--text-secondary);grid-column:span 2;`}>Unavailable</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Require Approval */}
                  <div style={`padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:${borderRadius.md};display:flex;align-items:center;justify-content:space-between;`}>
                    <div>
                      <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Require Approval</p>
                      <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Manually approve each booking request</p>
                    </div>
                    <button
                      type="button"
                      style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${formState.value.meetingRequireApproval ? "var(--accent)" : "var(--border)"};background:${formState.value.meetingRequireApproval ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s;`}
                      onClick$={() => { formState.value = { ...formState.value, meetingRequireApproval: !formState.value.meetingRequireApproval }; }}
                    >
                      <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${formState.value.meetingRequireApproval ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:left 0.2s;`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── WEBINAR: Webinar Settings ── */}
            {productType === "webinar" && (
              <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
                <div style="padding:0.75rem 1rem;background:var(--background);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;">
                  <span>🎙️</span>
                  <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>Webinar Settings</span>
                </div>
                <div style={`padding:1rem;display:flex;flex-direction:column;gap:${spacing.md};`}>
                  {/* Platform + Timezone */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Meeting platform" />
                      <select
                        value={formState.value.webinarPlatform}
                        onChange$={(e) => { formState.value = { ...formState.value, webinarPlatform: (e.target as HTMLSelectElement).value }; }}
                        style={inp}
                      >
                        <option value="zoom">Zoom</option>
                        <option value="google_meet">Google Meet</option>
                        <option value="teams">Microsoft Teams</option>
                        <option value="youtube">YouTube Live</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Timezone" />
                      <TimezoneSelect
                        value={formState.value.webinarTimezone}
                        onTimezoneChange$={(tz) => { formState.value = { ...formState.value, webinarTimezone: tz }; }}
                      />
                    </label>
                  </div>
                  {/* Duration + Seats per slot */}
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Duration (minutes)" />
                      <select
                        value={formState.value.webinarDuration}
                        onChange$={(e) => { formState.value = { ...formState.value, webinarDuration: (e.target as HTMLSelectElement).value }; }}
                        style={inp}
                      >
                        {["30", "45", "60", "90", "120", "180"].map(d => <option key={d} value={d}>{d + " min"}</option>)}
                      </select>
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Seats per slot" hint="Leave blank for unlimited" />
                      <input
                        type="number"
                        min="1"
                        value={formState.value.webinarSeatsPerSlot}
                        onInput$={(e) => { formState.value = { ...formState.value, webinarSeatsPerSlot: (e.target as HTMLInputElement).value }; }}
                        placeholder="Unlimited"
                        style={inp}
                      />
                    </label>
                  </div>
                  {/* Webinar Slots */}
                  <div>
                    <FL
                      label="Webinar slots"
                      required
                      error={formErrors.value.slots}
                      hint="At least one date + time required"
                    />
                    <div style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.375rem;">
                      {formState.value.webinarSlots.map((slot, i) => (
                        <div key={i} style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.5rem;align-items:center;">
                          <input
                            type="date"
                            value={slot.date}
                            onInput$={(e) => {
                              const slots = [...formState.value.webinarSlots];
                              slots[i] = { ...slots[i], date: (e.target as HTMLInputElement).value };
                              formState.value = { ...formState.value, webinarSlots: slots };
                            }}
                            style={inp}
                          />
                          <input
                            type="time"
                            value={slot.time}
                            onInput$={(e) => {
                              const slots = [...formState.value.webinarSlots];
                              slots[i] = { ...slots[i], time: (e.target as HTMLInputElement).value };
                              formState.value = { ...formState.value, webinarSlots: slots };
                            }}
                            style={inp}
                          />
                          <button
                            type="button"
                            onClick$={() => {
                              formState.value = {
                                ...formState.value,
                                webinarSlots: formState.value.webinarSlots.filter((_, j) => j !== i),
                              };
                            }}
                            style={`padding:0.5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:${borderRadius.md};color:var(--error,#ef4444);cursor:pointer;display:flex;align-items:center;`}
                          >
                            <LuTrash2 style="width:15px;height:15px;" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick$={() => {
                          formState.value = {
                            ...formState.value,
                            webinarSlots: [...formState.value.webinarSlots, { date: "", time: "" }],
                          };
                        }}
                        style={`padding:0.625rem;background:var(--surface-1);border:1px dashed var(--border);border-radius:${borderRadius.md};color:var(--text-secondary);font-size:${typography.sizes.sm};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.375rem;`}
                      >
                        <LuPlus style="width:14px;height:14px;" />
                        Add slot
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SPONSORSHIP ── */}
            {productType === "sponsorship" && (
              <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
                <div style="padding:0.75rem 1rem;background:var(--background);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;">
                  <span>📢</span>
                  <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>Sponsorship Details</span>
                </div>
                <div style={`padding:1rem;display:flex;flex-direction:column;gap:${spacing.md};`}>
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.75rem;">
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Platform name" required error={formErrors.value.platformName} />
                      <input
                        type="text"
                        value={formState.value.platformName}
                        onInput$={(e) => { formState.value = { ...formState.value, platformName: (e.target as HTMLInputElement).value }; }}
                        placeholder="Newsletter, YouTube, Podcast…"
                        style={inpErr(formErrors.value.platformName)}
                      />
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.35rem;">
                      <FL label="Platform URL" />
                      <input
                        type="url"
                        value={formState.value.platformUrl}
                        onInput$={(e) => { formState.value = { ...formState.value, platformUrl: (e.target as HTMLInputElement).value }; }}
                        placeholder="https://youtube.com/@..."
                        style={inp}
                      />
                    </label>
                  </div>
                  <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <FL label="Post frequency" required error={formErrors.value.postFrequency} hint='e.g. "Weekly", "3× per month", "One-time"' />
                    <input
                      type="text"
                      value={formState.value.postFrequency}
                      onInput$={(e) => { formState.value = { ...formState.value, postFrequency: (e.target as HTMLInputElement).value }; }}
                      placeholder="Weekly"
                      style={inpErr(formErrors.value.postFrequency)}
                    />
                  </label>
                </div>
              </div>
            )}

          </div>{/* end type-specific */}

          {/* ── Excerpt ── */}
          <label style="display:flex;flex-direction:column;gap:0.35rem;">
            <FL label="Excerpt" hint="Short preview shown on cards and emails" />
            <textarea
              rows={2}
              value={formState.value.excerpt}
              onInput$={(e) => { formState.value = { ...formState.value, excerpt: (e.target as HTMLTextAreaElement).value }; }}
              placeholder="Brief description of what buyers get"
              style={inp + "resize:vertical;"}
            />
          </label>

          {/* ── Description (TipTap) ── */}
          <div style="display:flex;flex-direction:column;gap:0.35rem;">
            <FL label="Description" hint="Rich text — supports headings, lists, images, embeds" />
            <TipTapEditor
              value={descriptionHtml}
              placeholder="Describe what buyers receive..."
            />
          </div>

          {/* ── Media & SEO Images ── */}
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            {/* Cover Image & Video Row */}
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:0.75rem;">
              <div style="display:flex;flex-direction:column;gap:0.35rem;">
                <FL label="Cover Image URL" />
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="url"
                    value={formState.value.coverImageUrl}
                    onInput$={(e) => {
                      const newUrl = (e.target as HTMLInputElement).value;
                      const currentOg = formState.value.seo_og_image;
                      const prevCover = formState.value.coverImageUrl;
                      const shouldUpdateOg = !currentOg || currentOg === prevCover;
                      formState.value = {
                        ...formState.value,
                        coverImageUrl: newUrl,
                        seo_og_image: shouldUpdateOg ? newUrl : currentOg,
                      };
                    }}
                    placeholder="https://cdn.example.com/cover.jpg"
                    style={`${inp}flex:1;`}
                  />
                  <button
                    type="button"
                    title="Browse Media Library"
                    onClick$={() => {
                      activeMediaTarget.value = "cover";
                      mediaPickerOpen.value = true;
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "2.75rem",
                      height: "2.75rem",
                      padding: "0",
                      background: "var(--surface-3)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: borderRadius.md,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <LuFolder style="width:1rem;height:1rem;" />
                  </button>
                  <button
                    type="button"
                    title="Upload New Media"
                    onClick$={() => {
                      activeMediaTarget.value = "cover";
                      mediaModalOpen.value = true;
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "2.75rem",
                      height: "2.75rem",
                      padding: "0",
                      background: "var(--button-primary-bg)",
                      color: "var(--button-primary-text)",
                      border: "none",
                      borderRadius: borderRadius.md,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <LuUpload style="width:1rem;height:1rem;" />
                  </button>
                </div>
                {formState.value.coverImageUrl && (
                  <div style={{ position: "relative", marginTop: "0.25rem" }}>
                    <img
                      src={formState.value.coverImageUrl}
                      alt="Cover preview"
                      width="300"
                      height="96"
                      style={{
                        width: "100%",
                        height: "6rem",
                        objectFit: "cover",
                        borderRadius: borderRadius.md,
                        border: "1px solid var(--border)",
                      }}
                      onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <button
                      type="button"
                      onClick$={() => {
                        formState.value = { ...formState.value, coverImageUrl: "", media_id: "" };
                      }}
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "4px",
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "50%",
                        width: "1.25rem",
                        height: "1.25rem",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div style="display:flex;flex-direction:column;gap:0.35rem;">
                <FL label="Cover Video URL" />
                <input
                  type="url"
                  value={formState.value.coverVideoUrl}
                  onInput$={(e) => { formState.value = { ...formState.value, coverVideoUrl: (e.target as HTMLInputElement).value }; }}
                  placeholder="https://youtube.com/watch?v=..."
                  style={inp}
                />
              </div>
            </div>

            {/* Gallery Image Slider (slider_id) */}
            <div style="display:flex;flex-direction:column;gap:0.35rem;">
              <FL label="Gallery Image Slider (Product Carousel)" hint="Select or create a gallery slider" />
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="text"
                  value={formState.value.slider_id || ""}
                  onInput$={(e) => { formState.value = { ...formState.value, slider_id: (e.target as HTMLInputElement).value }; }}
                  placeholder="slider_id (e.g. sld_12345)"
                  style={`${inp}flex:1;`}
                />
                <button
                  type="button"
                  title="Pick Existing Slider"
                  onClick$={() => { sliderPickerOpen.value = true; }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.75rem",
                    height: "2.75rem",
                    padding: "0",
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: borderRadius.md,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuSliders style="width:1rem;height:1rem;" />
                </button>
                <button
                  type="button"
                  title="Create New Slider"
                  onClick$={() => { sliderModalOpen.value = true; }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.75rem",
                    height: "2.75rem",
                    padding: "0",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: borderRadius.md,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <LuPlus style="width:1rem;height:1rem;" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Limited sales ── */}
          <div style={`border:1px solid ${formState.value.limitedSales ? "var(--accent)" : "var(--border)"};border-radius:${borderRadius.lg};overflow:hidden;transition:border-color 0.2s;`}>
            <div
              style="padding:0.875rem 1rem;background:var(--background);display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
              onClick$={() => { formState.value = { ...formState.value, limitedSales: !formState.value.limitedSales }; }}
            >
              <div>
                <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Limited sales</p>
                <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Set a sales cap and optionally enable a waitlist</p>
              </div>
              <button
                type="button"
                style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${formState.value.limitedSales ? "var(--accent)" : "var(--border)"};background:${formState.value.limitedSales ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s;`}
                onClick$={(e) => { e.stopPropagation(); formState.value = { ...formState.value, limitedSales: !formState.value.limitedSales }; }}
              >
                <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${formState.value.limitedSales ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:left 0.2s;`} />
              </button>
            </div>
            {formState.value.limitedSales && (
              <div style={`padding:1rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:${spacing.md};`}>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                  <FL label="Capacity" required hint="Total number of sales / seats available" error={formErrors.value.capacity} />
                  <input
                    type="number"
                    min="1"
                    value={formState.value.capacity}
                    onInput$={(e) => { formState.value = { ...formState.value, capacity: (e.target as HTMLInputElement).value }; }}
                    placeholder="100"
                    style={inpErr(formErrors.value.capacity)}
                  />
                </label>
                <div style={`padding:0.875rem 1rem;background:var(--background);border:1px solid var(--border);border-radius:${borderRadius.md};display:flex;align-items:center;justify-content:space-between;`}>
                  <div>
                    <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Enable Waitlist</p>
                    <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Accept signups after capacity is full</p>
                  </div>
                  <button
                    type="button"
                    style={`position:relative;width:40px;height:22px;border-radius:11px;border:1px solid ${formState.value.waitlistEnabled ? "var(--accent)" : "var(--border)"};background:${formState.value.waitlistEnabled ? "var(--accent)" : "var(--surface-3)"};padding:0;flex-shrink:0;cursor:pointer;transition:all 0.2s;`}
                    onClick$={() => { formState.value = { ...formState.value, waitlistEnabled: !formState.value.waitlistEnabled }; }}
                  >
                    <div style={`position:absolute;top:50%;transform:translateY(-50%);left:${formState.value.waitlistEnabled ? "calc(100% - 18px)" : "2px"};width:16px;height:16px;border-radius:50%;background:var(--surface-2);transition:left 0.2s;`} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── CTA Button (optional external link) ── */}
          <div style={`border:1px solid var(--border);border-radius:${borderRadius.lg};overflow:hidden;`}>
            <button
              type="button"
              style="width:100%;padding:0.875rem 1rem;background:var(--background);border:none;display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
              onClick$={() => { showCta.value = !showCta.value; }}
            >
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span>🔗</span>
                <span style={`font-size:${typography.sizes.sm};font-weight:600;color:var(--text-primary);`}>CTA Button</span>
                <span style={`font-size:${typography.sizes.xs};color:var(--text-secondary);`}>(optional external link)</span>
              </div>
              {showCta.value
                ? <LuChevronUp style="width:16px;height:16px;color:var(--text-secondary);" />
                : <LuChevronDown style="width:16px;height:16px;color:var(--text-secondary);" />
              }
            </button>
            {showCta.value && (
              <div style={`padding:1rem;border-top:1px solid var(--border);display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:0.75rem;`}>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                  <FL label="Button text" />
                  <input
                    type="text"
                    value={formState.value.ctaButtonText}
                    onInput$={(e) => { formState.value = { ...formState.value, ctaButtonText: (e.target as HTMLInputElement).value }; }}
                    placeholder="Learn more"
                    style={inp}
                  />
                </label>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                  <FL label="Button URL" />
                  <input
                    type="url"
                    value={formState.value.ctaButtonUrl}
                    onInput$={(e) => { formState.value = { ...formState.value, ctaButtonUrl: (e.target as HTMLInputElement).value }; }}
                    placeholder="https://example.com"
                    style={inp}
                  />
                </label>
              </div>
            )}
          </div>

          {/* ── Additional Details ── */}
          <div style="display:flex;flex-direction:column;gap:0.35rem;">
            <FL label="Additional details" hint="Key-value pairs shown on product page (e.g. Access: Lifetime)" />
            <div style="margin-top:0.375rem;display:flex;flex-direction:column;gap:0.5rem;">
              {formState.value.additionalDetails.map((d, i) => (
                <div key={i} style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.5rem;align-items:center;">
                  <input
                    type="text"
                    value={d.key}
                    onInput$={(e) => {
                      const nd = [...formState.value.additionalDetails];
                      nd[i] = { ...nd[i], key: (e.target as HTMLInputElement).value };
                      formState.value = { ...formState.value, additionalDetails: nd };
                    }}
                    placeholder="Key (e.g. Access)"
                    style={inp}
                  />
                  <input
                    type="text"
                    value={d.value}
                    onInput$={(e) => {
                      const nd = [...formState.value.additionalDetails];
                      nd[i] = { ...nd[i], value: (e.target as HTMLInputElement).value };
                      formState.value = { ...formState.value, additionalDetails: nd };
                    }}
                    placeholder="Value (e.g. Lifetime)"
                    style={inp}
                  />
                  <button
                    type="button"
                    onClick$={() => {
                      formState.value = {
                        ...formState.value,
                        additionalDetails: formState.value.additionalDetails.filter((_, j) => j !== i),
                      };
                    }}
                    style={`padding:0.5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:${borderRadius.md};color:var(--error,#ef4444);cursor:pointer;display:flex;align-items:center;`}
                  >
                    <LuTrash2 style="width:15px;height:15px;" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick$={() => {
                  formState.value = {
                    ...formState.value,
                    additionalDetails: [...formState.value.additionalDetails, { key: "", value: "" }],
                  };
                }}
                style={`padding:0.625rem;background:var(--surface-1);border:1px dashed var(--border);border-radius:${borderRadius.md};color:var(--text-secondary);font-size:${typography.sizes.sm};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.375rem;`}
              >
                <LuPlus style="width:14px;height:14px;" />
                Add detail
              </button>
            </div>
          </div>

          {/* ── Show total sales ── */}
          <label
            style={`display:flex;align-items:center;justify-content:space-between;padding:1rem 1.125rem;border-radius:${borderRadius.lg};border:2px solid ${formState.value.showTotalSales ? "var(--accent)" : "var(--border)"};background:var(--surface-2);cursor:pointer;transition:border-color 0.2s;`}
          >
            <div>
              <p style="margin:0;font-size:0.875rem;font-weight:500;color:var(--text-primary);">Show total sales</p>
              <p style="margin:0.125rem 0 0;font-size:0.75rem;color:var(--text-secondary);">Display sales count on product page</p>
            </div>
            <div style={`position:relative;width:3.5rem;height:2rem;background:${formState.value.showTotalSales ? "var(--accent)" : "var(--border)"};border-radius:2rem;transition:background 0.3s;flex-shrink:0;`}>
              <input
                type="checkbox"
                checked={formState.value.showTotalSales}
                onChange$={(e) => { formState.value = { ...formState.value, showTotalSales: (e.target as HTMLInputElement).checked }; }}
                style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;z-index:1;"
              />
              <div style={`position:absolute;top:0.175rem;left:${formState.value.showTotalSales ? "1.675rem" : "0.175rem"};width:1.65rem;height:1.65rem;background:white;border-radius:50%;transition:left 0.3s;box-shadow:0 2px 4px rgba(0,0,0,0.2);pointer-events:none;`} />
            </div>
          </label>

          </>
          ) : productType === "courses" ? (
            <div style="display:flex;flex-direction:column;gap:1.5rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                  <h3 style="margin:0;font-size:1rem;font-weight:600;color:var(--text-primary);">Course Curriculum</h3>
                  <p style="margin:0.25rem 0 0;font-size:0.875rem;color:var(--text-secondary);">Organize your course into modules and lessons.</p>
                </div>
                <button
                  type="button"
                  onClick$={addModule}
                  style={`height: 2rem; display: flex; align-items: center; justify-content: center; padding: 0 1rem; border-radius: 0.375rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem; font-weight: 500; cursor: pointer; gap: 0.375rem;`}
                >
                  <LuPlus style="width:14px;height:14px;" />
                  Add Module
                </button>
              </div>

              {formState.value.modules.map((module, moduleIndex) => (
                <div key={module.id} style={`border:1px solid var(--border);border-radius:${borderRadius.lg};background:var(--surface-1);overflow:hidden;`}>
                  <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);background:var(--surface-2);display:flex;align-items:center;gap:0.75rem;">
                    <LuChevronDown style="width:16px;height:16px;color:var(--text-secondary);cursor:move;" />
                    <input
                      type="text"
                      value={module.title}
                      onInput$={(e) => updateModuleTitle(module.id, (e.target as HTMLInputElement).value)}
                      placeholder={`Module ${moduleIndex + 1} title`}
                      style="flex:1;background:transparent;border:none;outline:none;font-size:0.9375rem;font-weight:600;color:var(--text-primary);"
                    />
                    <button
                      type="button"
                      onClick$={() => deleteModule(module.id)}
                      style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0.25rem;"
                    >
                      <LuTrash2 style="width:16px;height:16px;" />
                    </button>
                  </div>

                  <div style="display:flex;flex-direction:column;">
                    {module.lessons.map((lesson, lessonIndex) => {
                      const isExpanded = expandedLessons.value.has(lesson.id);
                      return (
                        <div key={lesson.id} style="border-bottom:1px solid var(--border);last-child{border-bottom:none;}">
                          <div
                            onClick$={() => toggleLesson(lesson.id)}
                            style="padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;cursor:pointer;background:var(--surface-1);"
                          >
                            <span style="color:var(--text-secondary);display:flex;align-items:center;">
                              {isExpanded ? <LuChevronUp style="width:16px;height:16px;" /> : <LuChevronDown style="width:16px;height:16px;" />}
                            </span>
                            <input
                              type="text"
                              value={lesson.title}
                              onInput$={(e) => updateLessonTitle(module.id, lesson.id, (e.target as HTMLInputElement).value)}
                              onClick$={(e) => e.stopPropagation()}
                              placeholder={`Lesson ${lessonIndex + 1} title`}
                              style="flex:1;background:transparent;border:none;outline:none;font-size:0.875rem;font-weight:500;color:var(--text-primary);"
                            />
                            <button
                              type="button"
                              onClick$={(e) => { e.stopPropagation(); deleteLesson(module.id, lesson.id); }}
                              style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0.25rem;"
                            >
                              <LuTrash2 style="width:14px;height:14px;" />
                            </button>
                          </div>
                          {isExpanded && (
                            <div style="padding:1rem;background:var(--surface-2);border-top:1px solid var(--border);">
                              <div style="margin-bottom:0.5rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Lesson Content</div>
                              <TipTapEditor
                                value={lesson.content}
                                onChange$={(html: string) => updateLessonContent(module.id, lesson.id, html)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style="padding:0.75rem 1rem;">
                      <button
                        type="button"
                        onClick$={() => addLesson(module.id)}
                        style="background:transparent;border:none;color:var(--accent);font-size:0.8125rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:0.375rem;padding:0;"
                      >
                        <LuPlus style="width:14px;height:14px;" />
                        Add Lesson
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {formState.value.modules.length === 0 && (
                <div style="padding:2rem;text-align:center;background:var(--surface-2);border:1px dashed var(--border);border-radius:0.5rem;">
                  <p style="margin:0;color:var(--text-secondary);font-size:0.875rem;">Create your first online course with modules and lessons.</p>
                  <button
                    type="button"
                    onClick$={addModule}
                    style={`margin-top:1rem;height: 2rem; display: inline-flex; align-items: center; justify-content: center; padding: 0 1rem; border-radius: 0.375rem; border: none; background: var(--button-primary-bg, var(--accent)); color: var(--button-primary-text, #fff); font-size: 0.875rem; font-weight: 500; cursor: pointer;`}
                  >
                    Add First Module
                  </button>
                </div>
              )}

              {formState.value.modules.length > 0 && (
                <div style="display:flex;gap:1rem;font-size:0.875rem;color:var(--text-secondary);margin-top:0.5rem;">
                  <div>Modules: <strong style="color:var(--text-primary);">{formState.value.modules.length}</strong></div>
                  <div>Total Lessons: <strong style="color:var(--text-primary);">{totalLessons}</strong></div>
                </div>
              )}
            </div>
          ) : null}

        </div>
        {/* end scrollable body */}

        {/* ── Footer ── */}
        <div style="position: sticky; bottom: -1.5rem; margin: 0 -1.5rem -1.5rem; padding: 0.7rem 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.75rem; background: var(--surface-2); z-index: 10;">
          <button
            type="button"
            onClick$={props.onCancel$}
            style="height: 2rem; display: flex; align-items: center; justify-content: center; padding: 0 1rem; border-radius: 0.375rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 150ms ease;"
            onMouseOver$={(e) => ((e.target as HTMLElement).style.background = "var(--surface-3)")}
            onMouseOut$={(e) => ((e.target as HTMLElement).style.background = "var(--surface-1)")}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving.value}
            style={`height: 2rem; display: flex; align-items: center; justify-content: center; padding: 0 1rem; border-radius: 0.375rem; border: none; background: var(--button-primary-bg, var(--accent)); color: var(--button-primary-text, #fff); font-size: 0.875rem; font-weight: 500; cursor: ${isSaving.value ? "not-allowed" : "pointer"}; gap: 0.375rem; opacity: ${isSaving.value ? 0.7 : 1}; transition: all 150ms ease;`}
          >
            {isSaving.value ? "Saving…" : isEditing ? "Update" : "Create"}
          </button>
        </div>
      </form>

      <MediaPickerModal
        open={mediaPickerOpen}
        filterType="image"
        onSelected$={$((item: PickerMediaItem) => {
          if (activeMediaTarget.value === "cover") {
            const currentOg = props.formState.value.seo_og_image;
            const prevCover = props.formState.value.coverImageUrl;
            const shouldUpdateOg = !currentOg || currentOg === prevCover;
            props.formState.value = {
              ...props.formState.value,
              coverImageUrl: item.url,
              media_id: item.id,
              seo_og_image: shouldUpdateOg ? item.url : currentOg,
            };
          } else {
            props.formState.value = {
              ...props.formState.value,
              seo_og_image: item.url,
            };
          }
          mediaPickerOpen.value = false;
        })}
      />

      <MediaModal
        open={mediaModalOpen}
        onUploaded$={$((media: PickerMediaItem) => {
          if (activeMediaTarget.value === "cover") {
            const currentOg = props.formState.value.seo_og_image;
            const prevCover = props.formState.value.coverImageUrl;
            const shouldUpdateOg = !currentOg || currentOg === prevCover;
            props.formState.value = {
              ...props.formState.value,
              coverImageUrl: media.url,
              media_id: media.id,
              seo_og_image: shouldUpdateOg ? media.url : currentOg,
            };
          } else {
            props.formState.value = {
              ...props.formState.value,
              seo_og_image: media.url,
            };
          }
          mediaModalOpen.value = false;
        })}
      />

      <SliderPickerModal
        open={sliderPickerOpen}
        onSelected$={$((slider: PickerSlider) => {
          props.formState.value = {
            ...props.formState.value,
            slider_id: slider.id,
          };
          selectedSlider.value = slider;
          sliderPickerOpen.value = false;
        })}
        onCreateRequested$={$(() => {
          sliderPickerOpen.value = false;
          sliderModalOpen.value = true;
        })}
      />

      <SliderModal
        open={sliderModalOpen}
        onSaved$={$((slider: PickerSlider) => {
          props.formState.value = {
            ...props.formState.value,
            slider_id: slider.id,
          };
          selectedSlider.value = slider;
          sliderModalOpen.value = false;
        })}
      />
    </SlideOver>
  );
});
