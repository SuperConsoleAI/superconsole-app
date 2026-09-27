import { component$, useSignal, $, type PropFunction } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuMessageSquare, LuMail, LuPenLine, LuChevronDown, LuArrowUp } from "@qwikest/icons/lucide";

export const InboxCompose = component$((props: {
  contactId: string;
  onSent$?: PropFunction<() => void>;
}) => {
  const loading = useSignal(false);
  const type = useSignal<"dm" | "email" | "note">("email");
  const textValue = useSignal("");
  const isDropdownOpen = useSignal(false);

  const handleSubmit = $(async () => {

    if (!textValue.value.trim() || loading.value) return;

    loading.value = true;
    try {
      await invoke("log_activity", {
        data: {
          contact_id: props.contactId,
          type: type.value,
          direction: "outbound",
          sender: "you",
          body: textValue.value,
          subject: null,
          outcome: null
        }
      });
      textValue.value = "";
      if (props.onSent$) {
        props.onSent$();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      loading.value = false;
    }
  });

  return (
    <div style="padding:1rem;flex-shrink:0;background:var(--background);">

      <form preventdefault:submit onSubmit$={handleSubmit}>

        <div style="position:relative;display:flex;flex-direction:column;background:var(--surface-1);border:1px solid var(--border);border-radius:1rem;padding:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.05);transition:border-color 0.2s;">
          {/* Dropdown for Type on Top */}
          <div style="position:relative;display:flex;align-items:center;align-self:flex-start;margin-bottom:0.25rem;">
            <button
              type="button"
              onClick$={() => isDropdownOpen.value = !isDropdownOpen.value}
              style="display:flex;align-items:center;gap:0.375rem;background:transparent;border:none;border-radius:0.5rem;padding:0.25rem 0.5rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary);cursor:pointer;text-transform:capitalize;"
            >
              {type.value === "dm" ? <LuMessageSquare /> : type.value === "email" ? <LuMail /> : <LuPenLine />}
              <span>{type.value === "dm" ? "DM" : type.value === "email" ? "Email" : "Note"}</span>
              <LuChevronDown />
            </button>

            {isDropdownOpen.value && (
              <div style="position:absolute;bottom:100%;left:0;margin-bottom:0.25rem;background:var(--surface-1);border:1px solid var(--border);border-radius:0.5rem;padding:0.25rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:10;min-width:120px;">
                {(["dm", "email", "note"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick$={() => { type.value = t; isDropdownOpen.value = false; }}
                    style="display:flex;align-items:center;justify-content:flex-start;gap:0.5rem;width:100%;padding:0.5rem;background:transparent;border:none;border-radius:0.375rem;font-size:0.75rem;font-weight:500;color:var(--text-primary);cursor:pointer;text-align:left;text-transform:capitalize;"
                    onMouseEnter$={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
                    onMouseLeave$={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    {t === "dm" ? <LuMessageSquare /> : t === "email" ? <LuMail /> : <LuPenLine />}
                    <span>{t === "dm" ? "DM" : t === "email" ? "Email" : "Note"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            name="body"
            required
            rows={Math.max(1, Math.min(10, textValue.value.split('\\n').length))}
            value={textValue.value}
            placeholder={`Message...`}
            style="width:100%;background:transparent;border:none;outline:none;resize:none;min-height:24px;max-height:240px;font-size:0.875rem;padding:0.25rem 2.5rem 0.25rem 0.5rem;color:var(--text-primary);line-height:1.5;box-sizing:border-box;overflow-y:auto;"
            onInput$={(ev: any) => {
              textValue.value = ev.target.value;
              ev.target.style.height = 'auto';
              ev.target.style.height = (ev.target.scrollHeight) + 'px';
            }}
          ></textarea>

          {textValue.value.trim().length > 0 && (
            <button
              type="submit"
              disabled={loading.value}
              style="position:absolute;right:0.5rem;bottom:0.5rem;width:2.25rem;height:2.25rem;display:flex;align-items:center;justify-content:center;border-radius:0.5rem;background:var(--text-primary);color:var(--surface-1);border:none;cursor:pointer;transition:transform 0.1s;"
              onMouseDown$={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(0.95)')}
              onMouseUp$={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
              onMouseLeave$={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
            >
              {loading.value ? "..." : <LuArrowUp />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});
