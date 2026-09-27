import { component$, useStylesScoped$, useSignal, $, type PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

export interface CreateCommunityPostProps {
  communityName: string;
  userAvatar?: string;
  userName?: string;
  categories: { id: string; name: string }[];
  onCreate$?: PropFunction<(payload: { title: string; body: string; categoryId: string }) => void>;
  isCreating?: boolean;
}

const { typography, spacing, borderRadius, shadows, transitions } = designSystem;

const STYLES = `
  .create-collapsed {
    display: flex;
    align-items: center;
    gap: ${spacing.sm};
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    padding: ${spacing.md};
    cursor: text;
    transition: box-shadow ${transitions.fast}, border-color ${transitions.fast};
    margin-bottom: ${spacing.lg};
    box-sizing: border-box;
    width: 100%;
  }
  .create-collapsed:hover {
    box-shadow: ${shadows.sm};
    border-color: var(--accent);
  }
  .cc-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: var(--text-secondary);
  }
  .cc-placeholder {
    color: var(--text-secondary);
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.medium};
    flex: 1;
  }

  .create-expanded {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    padding: ${spacing.xl};
    margin-bottom: ${spacing.lg};
    animation: fadeIn 0.2s ease-out forwards;
    box-sizing: border-box;
    width: 100%;
  }
  .ce-header {
    display: flex;
    align-items: center;
    gap: ${spacing.sm};
    margin-bottom: ${spacing.lg};
  }
  .ce-header-text {
    font-size: ${typography.sizes.base};
    color: var(--text-secondary);
  }
  .ce-header-text strong {
    color: var(--text-primary);
    font-weight: ${typography.weights.semibold};
  }
  .ce-title-input {
    width: 100%;
    font-size: 1.4rem;
    font-weight: ${typography.weights.bold};
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
    margin-bottom: ${spacing.md};
  }
  .ce-title-input::placeholder { color: var(--text-muted); }
  
  .ce-body-input {
    width: 100%;
    min-height: 120px;
    font-size: ${typography.sizes.base};
    line-height: 1.5;
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    margin-bottom: ${spacing.lg};
    font-family: inherit;
  }
  .ce-body-input::placeholder { color: var(--text-muted); }

  .ce-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: ${spacing.md};
  }
  .ce-tools {
    display: flex;
    gap: ${spacing.md};
    color: var(--text-secondary);
    font-size: 1.1rem;
  }
  .ce-tool { cursor: pointer; transition: color 0.15s; }
  .ce-tool:hover { color: var(--text-primary); }

  .ce-actions {
    display: flex;
    align-items: center;
    gap: ${spacing.sm};
  }
  .ce-category-select {
    padding: 0.5rem 1rem;
    border-radius: ${borderRadius.pill};
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    cursor: pointer;
    outline: none;
  }
  .ce-btn-cancel {
    background: transparent;
    border: none;
    padding: 0.5rem 1rem;
    font-weight: ${typography.weights.bold};
    color: var(--text-secondary);
    cursor: pointer;
  }
  .ce-btn-cancel:hover { color: var(--text-primary); }
  
  .ce-btn-post {
    padding: 0.6rem 1.5rem;
    border-radius: ${borderRadius.md};
    border: none;
    font-weight: ${typography.weights.bold};
    font-size: ${typography.sizes.sm};
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .ce-btn-post.ready {
    background: var(--button-primary-bg, var(--accent));
    color: var(--button-primary-text, #fff);
  }
  .ce-btn-post.disabled {
    background: var(--surface-3);
    color: var(--text-secondary);
    cursor: not-allowed;
  }
  .ce-btn-post.ready:hover { opacity: 0.9; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export const CreateCommunityPost = component$<CreateCommunityPostProps>((props) => {
  useStylesScoped$(STYLES);
  const isExpanded = useSignal(false);
  
  const title = useSignal("");
  const body = useSignal("");
  const categoryId = useSignal("");

  const handlePost$ = $(() => {
    if (!body.value.trim()) return;
    props.onCreate$?.({
      title: title.value,
      body: body.value,
      categoryId: categoryId.value || "",
    });
    isExpanded.value = false;
    title.value = "";
    body.value = "";
    categoryId.value = "";
  });

  const uName = props.userName || "Guest";
  const AvatarEl = props.userAvatar ? (
    <img src={props.userAvatar} class="cc-avatar" alt="Avatar" width="38" height="38" />
  ) : (
    <div class="cc-avatar">{uName[0]?.toUpperCase()}</div>
  );

  if (!isExpanded.value) {
    return (
      <div class="create-collapsed" onClick$={() => { isExpanded.value = true; }}>
        {AvatarEl}
        <span class="cc-placeholder">Write something...</span>
      </div>
    );
  }

  const isReady = body.value.trim().length > 0;

  return (
    <div class="create-expanded">
      <div class="ce-header">
        {AvatarEl}
        <div class="ce-header-text">
          <strong>{uName}</strong> posting in <strong>{props.communityName}</strong>
        </div>
      </div>

      <input
        type="text"
        class="ce-title-input"
        placeholder="Title"
        value={title.value}
        onInput$={(e) => title.value = (e.target as HTMLInputElement).value}
      />

      <textarea
        class="ce-body-input"
        placeholder="Write something..."
        value={body.value}
        onInput$={(e) => body.value = (e.target as HTMLTextAreaElement).value}
      />

      <div class="ce-footer">
        <div class="ce-tools">
          <span class="ce-tool">📎</span>
          <span class="ce-tool">🔗</span>
          <span class="ce-tool">▶️</span>
          <span class="ce-tool">📊</span>
          <span class="ce-tool">😀</span>
          <span class="ce-tool" style="font-size:0.8rem;font-weight:900;display:flex;align-items:center;">GIF</span>
        </div>

        <div class="ce-actions">
           {props.categories && props.categories.length > 0 && (
            <select class="ce-category-select" value={categoryId.value} onChange$={(e) => categoryId.value = (e.target as HTMLSelectElement).value}>
              <option value="">Select a category</option>
              {props.categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
           )}
          <button type="button" class="ce-btn-cancel" onClick$={() => isExpanded.value = false}>CANCEL</button>
          <button 
            type="button" 
            class={`ce-btn-post ${isReady ? "ready" : "disabled"}`}
            disabled={!isReady || props.isCreating}
            onClick$={handlePost$}
          >
            {props.isCreating ? "POSTING..." : "POST"}
          </button>
        </div>
      </div>
    </div>
  );
});
