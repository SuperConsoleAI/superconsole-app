import { component$, useSignal, $, useContext, useTask$ } from "@builder.io/qwik";
import { LuImage, LuFileEdit, LuCalendar, LuTimer, LuSend, LuX } from "@qwikest/icons/lucide";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SocialContext } from "~/routes/dashboard/social/layout";

interface ComposeSocialPostsProps {
  editingPost: any; // Signal<any | null>
  onPostCreated$: any; // QRL<() => void>
  PLATFORM_ICONS: Record<string, string>;
  ZERNIO_LOGO_WRAPPED: string;
}

export const ComposeSocialPosts = component$<ComposeSocialPostsProps>((props) => {
  const socialStore = useContext(SocialContext);
  const accounts = socialStore.accounts.filter((a) => a.isConnected);
  const uniqueAccounts = accounts.filter((a, idx, arr) => arr.findIndex(x => x.id === a.id) === idx);

  const content = useSignal("");
  const mode = useSignal<"draft" | "schedule" | "queue" | "publish">("draft");
  const scheduledFor = useSignal("");
  const selectedAccIds = useSignal<string[]>([]);
  const selectedImage = useSignal<string | null>(null);
  const submitting = useSignal(false);

  useTask$(({ track }) => {
    const post = track(() => props.editingPost.value);
    if (post) {
      content.value = post.content || "";
      const st = (post.status || "").toLowerCase();
      let initMode: "draft" | "schedule" | "queue" | "publish" = "draft";
      if (st === "published") initMode = "publish";
      else if (st === "queued" || st === "queue" || post.mode === "queue") initMode = "queue";
      else if (st === "scheduled" || st === "schedule" || post.mode === "schedule" || (post.scheduledFor && Number(post.scheduledFor) > 0)) initMode = "schedule";

      mode.value = initMode;

      if (mode.value === "schedule" && post.scheduledFor) {
        const ts = Number(post.scheduledFor);
        const d = new Date(ts > 9999999999 ? ts : ts * 1000);
        if (!isNaN(d.getTime())) {
          const pad = (n: number) => n.toString().padStart(2, '0');
          scheduledFor.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
          scheduledFor.value = "";
        }
      } else {
        scheduledFor.value = "";
      }
      const accId = post.accountId || post.account_id;
      if (accId) {
        selectedAccIds.value = [String(accId)];
      } else {
        selectedAccIds.value = [];
      }
      try {
        const items = JSON.parse(post.mediaUrls || post.mediaItems || "[]");
        if (items.length > 0) selectedImage.value = items[0].url || items[0];
        else selectedImage.value = null;
      } catch {
        selectedImage.value = null;
      }
    } else {
      content.value = "";
      mode.value = "draft";
      scheduledFor.value = "";
      selectedImage.value = null;
      selectedAccIds.value = [];
    }
  });

  const toggleAccount = $((id: string) => {
    const cur = selectedAccIds.value;
    selectedAccIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  });

  const handleImageUpload = $(async () => {
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpeg', 'jpg', 'gif', 'webp'] }]
      });
      if (file) {
        const selected = Array.isArray(file) ? file[0] : file;
        selectedImage.value = typeof selected === 'string' ? selected : (selected as any).path;
      }
    } catch (e) {
      console.error("Failed to open dialog", e);
    }
  });

  const handleCancelEdit = $(() => {
    props.editingPost.value = null;
  });

  const submitAction = $(async (connId?: string) => {
    if (!content.value.trim() || (mode.value !== "draft" && selectedAccIds.value.length === 0)) return;
    submitting.value = true;
    try {
      let scheduled_for = null;
      if (mode.value === "schedule" && scheduledFor.value) {
        scheduled_for = Math.floor(new Date(scheduledFor.value).getTime() / 1000);
      }

      let accIdsToProcess = selectedAccIds.value;
      if (connId && mode.value !== "draft") {
        accIdsToProcess = selectedAccIds.value.filter(id => {
          const acc = accounts.find((a: any) => String(a.id) === String(id));
          const cId = acc?.connectionId || acc?.connection_id;
          if (cId) return String(cId) === String(connId);
          return String(acc?.id) === String(connId);
        });
      }

      if (props.editingPost.value) {
        await invoke("update_social_post", {
          id: props.editingPost.value.id,
          data: {
            content: content.value,
            mediaItems: selectedImage.value || null,
            scheduledFor: scheduled_for,
            mode: mode.value,
          }
        }).catch(async (e) => {
          console.warn("update_social_post failed/missing:", e);
        });
      } else {
        for (const accountId of accIdsToProcess) {
          const account = accounts.find((a: any) => a.id === accountId);
          if (!account) continue;

          await invoke("create_social_post", {
            data: {
              accountId: account.id,
              platform: account.platform,
              content: content.value,
              mediaItems: selectedImage.value || null,
              scheduledFor: scheduled_for,
              groupId: null,
              mode: mode.value,
              connectionId: connId && socialStore.connections.some(c => c.id === connId) ? connId : undefined,
            }
          });
        }
      }

      if (mode.value === "draft" || props.editingPost.value) {
        content.value = "";
        selectedAccIds.value = [];
        selectedImage.value = null;
        mode.value = "draft";
        props.editingPost.value = null;
      } else {
        selectedAccIds.value = selectedAccIds.value.filter(id => !accIdsToProcess.includes(id));
        if (selectedAccIds.value.length === 0) {
          content.value = "";
          selectedImage.value = null;
          mode.value = "draft";
          props.editingPost.value = null;
        }
      }

      await props.onPostCreated$();
    } catch (e) {
      console.error("Failed to submit post", e);
      alert("Failed to submit post: " + String(e));
    } finally {
      submitting.value = false;
    }
  });

  return (
    <div class="compose-panel" style="background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; padding:1.25rem; height:fit-content; position:sticky; top:0;">
      <div class="compose-title" style="font-size:1rem; font-weight:600; color:var(--text-primary); margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
        {props.editingPost.value ? "✏️ Edit Post" : "✏️ Compose Post"}
      </div>

      <textarea
        class="compose-textarea"
        style="width:100%; min-height:120px; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-primary); font-size:0.875rem; padding:0.75rem; resize:vertical; font-family:inherit; line-height:1.5; box-sizing:border-box;"
        placeholder="What do you want to share?"
        value={content.value}
        onInput$={(e) => content.value = (e.target as HTMLTextAreaElement).value}
      />
      <div class="compose-tools" style="display:flex; align-items:center; justify-content:space-between; margin-top:0.5rem;">
        <button type="button" class="tool-btn" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.25rem; border-radius:0.25rem; display:flex;" title="Add Image" onClick$={handleImageUpload}>
          <LuImage style="width:1.2rem;height:1.2rem;" />
        </button>
        <div class="char-count" style="font-size:0.7rem; color:var(--text-secondary); text-align:right;">{content.value.length} / 2200</div>
      </div>

      {selectedImage.value && (
        <div style="margin-top:0.75rem; position:relative; width:100%; height:160px; border-radius:0.5rem; overflow:hidden; border:1px solid var(--border); background:var(--surface-3); display:flex; align-items:center; justify-content:center;">
          {selectedImage.value.match(/\\.(mp4|webm)$/i) ? (
            <video src={selectedImage.value.startsWith('http') ? selectedImage.value : convertFileSrc(selectedImage.value)} style="width:100%; height:100%; object-fit:cover;" muted autoplay loop playsInline />
          ) : (
            <img src={selectedImage.value.startsWith('http') ? selectedImage.value : convertFileSrc(selectedImage.value)} style="width:100%; height:100%; object-fit:cover;" alt="Media preview" width="400" height="160" />
          )}
          <button
            onClick$={() => selectedImage.value = null}
            style="position:absolute; top:0.4rem; right:0.4rem; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer;"
            title="Remove media"
          >
            <LuX style="width:0.9rem;height:0.9rem;" />
          </button>
          <div style="position:absolute; bottom:0; left:0; width:100%; background:linear-gradient(transparent, rgba(0,0,0,0.7)); padding:1rem 0.5rem 0.25rem; font-size:0.7rem; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={selectedImage.value}>
            {selectedImage.value}
          </div>
        </div>
      )}

      <div class="compose-mode-tabs" style="display:flex; gap:0.25rem; margin-top:0.75rem; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; padding:0.25rem;">
        {(["draft", "schedule", "queue", "publish"] as const).map((m) => (
          <button key={m} class={`compose-mode-tab${mode.value === m ? " active" : ""}`} onClick$={() => mode.value = m} style={`flex:1; display:flex; align-items:center; justify-content:center; gap:0.4rem; padding:0.375rem 0.25rem; border-radius:0.375rem; font-size:0.75rem; font-weight:500; cursor:pointer; border:none; background:${mode.value === m ? 'var(--button-primary-bg)' : 'transparent'}; color:${mode.value === m ? 'var(--button-primary-text)' : 'var(--text-secondary)'}; transition:all 0.15s;`}>
            {m === "draft" && <LuFileEdit style="width:0.875rem;height:0.875rem;" />}
            {m === "schedule" && <LuCalendar style="width:0.875rem;height:0.875rem;" />}
            {m === "queue" && <LuTimer style="width:0.875rem;height:0.875rem;" />}
            {m === "publish" && <LuSend style="width:0.875rem;height:0.875rem;" />}
            {m === "draft" ? "Draft" : m === "schedule" ? "Schedule" : m === "queue" ? "Queue" : "Now"}
          </button>
        ))}
      </div>

      {mode.value === "schedule" && (
        <>
          <div class="section-label" style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-top:0.75rem; margin-bottom:0.35rem;">Scheduled for</div>
          <input
            type="datetime-local"
            class="compose-input"
            style="width:100%;box-sizing:border-box; padding:0.4rem 0.75rem; background:var(--surface-2); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-primary); font-size:0.8rem;"
            value={scheduledFor.value}
            onChange$={(e) => scheduledFor.value = (e.target as HTMLInputElement).value}
          />
        </>
      )}

      {mode.value !== "draft" && accounts.length > 0 && (
        <>
          <div class="section-label" style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-top:0.75rem; margin-bottom:0.35rem;">Publish to</div>
          <div class="account-checkbox-list" style="display:flex; flex-direction:column; gap:0.4rem; max-height:140px; overflow-y:auto; margin-top:0.5rem;">
            {uniqueAccounts.map((a: any) => {
              return (
                <label key={a.id} class="account-check-item" style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-primary); cursor:pointer;">
                  <input
                    type="checkbox"
                    checked={selectedAccIds.value.includes(a.id)}
                    onChange$={() => toggleAccount(a.id)}
                  />
                  <div style="width:0.8rem;height:0.8rem;display:flex;align-items:center;justify-content:center;opacity:0.8;" dangerouslySetInnerHTML={props.PLATFORM_ICONS[a.platform] || props.PLATFORM_ICONS.default} />
                  {a.displayName || a.platform}
                  {a.username && (
                    <span style="color:var(--text-secondary);font-size:0.7rem;margin-left:auto;">
                      {a.username.startsWith('@') ? a.username : `@${a.username}`}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </>
      )}

      {(() => {
        const isSubmitting = submitting.value;
        const isDisabled = !content.value.trim() || (!props.editingPost.value && mode.value !== "draft" && selectedAccIds.value.length === 0) || isSubmitting;
        const btnText = isSubmitting
          ? "Saving…"
          : props.editingPost.value
            ? mode.value === "draft" ? "Draft this post" : mode.value === "schedule" ? "Update Schedule" : mode.value === "queue" ? "Add this Post to Queue" : "Post this now"
            : mode.value === "draft"
              ? "Save Draft"
              : mode.value === "schedule"
                ? "Schedule"
                : mode.value === "queue"
                  ? "Add to Queue"
                  : "Publish Now";

        const uniqueConns: any[] = [];
        for (const id of selectedAccIds.value) {
          const matchedAccs = accounts.filter((a: any) => String(a.id) === String(id));
          let hasAnyConn = false;
          for (const acc of matchedAccs) {
            const connId = acc?.connectionId || acc?.connection_id;
            if (connId) {
              hasAnyConn = true;
              if (!uniqueConns.some(c => String(c.id) === String(connId))) {
                const conn = socialStore.connections.find((c: any) => String(c.id) === String(connId));
                if (conn) uniqueConns.push(conn);
              }
            }
          }

          if (!hasAnyConn && !uniqueConns.some(c => String(c.id) === String(id))) {
            uniqueConns.push({ id: matchedAccs[0].id, service: matchedAccs[0].platform, name: matchedAccs[0].displayName || matchedAccs[0].platform });
          }
        }
        return (
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem;">
            {(!isDisabled && mode.value !== "draft" && uniqueConns.length > 0) ? (
              uniqueConns.map((conn: any) => {
                const isZernio = conn?.service?.toLowerCase().includes("zernio");
                const icon = isZernio ? props.ZERNIO_LOGO_WRAPPED : (props.PLATFORM_ICONS[conn?.service?.toLowerCase()] || props.ZERNIO_LOGO_WRAPPED);
                const providerName = isZernio ? "Zernio" : (conn.service?.charAt(0).toUpperCase() + conn.service?.slice(1));
                const name = conn.name || conn.label || providerName;

                const connAccs = selectedAccIds.value.map(id => {
                  const matchedAccs = accounts.filter((a: any) => String(a.id) === String(id));
                  return matchedAccs.find(a => {
                    const cId = a?.connectionId || a?.connection_id;
                    return cId ? String(cId) === String(conn.id) : String(a.id) === String(conn.id);
                  });
                }).filter(Boolean);

                return (
                  <button
                    key={conn.id}
                    class="btn-full"
                    style={`width:100%; padding:0.625rem; border-radius:0.5rem; background:var(--button-primary-bg); color:var(--button-primary-text); font-size:0.875rem; font-weight:600; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; flex-wrap:wrap; opacity: ${submitting.value ? '0.5' : '1'};`}
                    disabled={submitting.value}
                    onClick$={() => submitAction(conn.id)}
                  >
                    <div style="display:flex; align-items:center; gap:0.2rem;">
                      {connAccs.map((a: any) => {
                        const accIcon = props.PLATFORM_ICONS[a?.platform?.toLowerCase()] || props.ZERNIO_LOGO_WRAPPED;
                        return (
                          <div key={a?.id} style="display:flex; align-items:center; gap:0.2rem; background:rgba(0,0,0,0.1); padding:0.2rem 0.4rem; border-radius:0.25rem;">
                            <div style="width:0.8rem; height:0.8rem; display:flex; align-items:center;" dangerouslySetInnerHTML={accIcon} />
                            <span style="font-size:0.6rem; font-weight:400;">{a?.username || a?.displayName || a?.platform}</span>
                          </div>
                        )
                      })}
                    </div>

                    <span>{mode.value === "schedule" ? "Schedule via" : "Publish via"}</span>

                    <div style="display:flex; align-items:center; gap:0.2rem; background:var(--surface-3); color:var(--text-primary); padding:0.2rem 0.4rem; border-radius:0.25rem;">
                      <div style="width:1rem; height:1rem; display:flex; align-items:center;" dangerouslySetInnerHTML={icon} />
                      <span style="font-size:0.65rem; font-weight:700;">{name}</span>
                    </div>
                  </button>
                )
              })
            ) : (
              <button
                class="btn-full"
                style={`width:100%; padding:0.625rem; border-radius:0.5rem; background:var(--button-primary-bg); color:var(--button-primary-text); font-size:0.875rem; font-weight:600; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; flex-wrap:wrap; opacity: ${isDisabled ? '0.5' : '1'};`}
                disabled={isDisabled}
                onClick$={() => submitAction()}
              >
                {btnText}
              </button>
            )}

            {props.editingPost.value && (
              <button
                onClick$={handleCancelEdit}
                style="width:100%; padding:0.625rem; border-radius:0.5rem; background:transparent; border:1px solid var(--border); color:var(--text-secondary); font-size:0.875rem; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center;"
              >
                Cancel Edit
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
});
