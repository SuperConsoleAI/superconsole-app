import { component$, useSignal } from "@builder.io/qwik";
import type { PropFunction } from "@builder.io/qwik";

export const EditableText = component$<{
  text: string;
  tag?: string;
  style?: string;
  class?: string;
  editable?: boolean;
  "data-section-key"?: string;
  "data-bg-field"?: string;
  onUpdate$?: PropFunction<(newText: string) => void>;
}>(({ text, tag = "div", style = "", class: className, editable = false, "data-section-key": sectionKey, "data-bg-field": bgField, onUpdate$ }) => {
  const Tag = tag as any;

  if (!editable) {
    return <Tag class={className} style={style} dangerouslySetInnerHTML={text} data-section-key={sectionKey} data-bg-field={bgField} />;
  }

  const editStyle = `
    ${style}
    outline: none;
    border: 1px dashed transparent;
    transition: all 0.2s;
    cursor: text;
  `;

  return (
    <Tag
      class={className}
      style={editStyle}
      contentEditable="true"
      dangerouslySetInnerHTML={text}
      data-section-key={sectionKey}
      data-bg-field={bgField}
      onInput$={(e: Event) => {
        const target = e.target as HTMLElement;
        if (onUpdate$) {
          onUpdate$(target.innerHTML);
        }
      }}
      onFocus$={(e: Event) => {
        const target = e.target as HTMLElement;
        target.style.border = "1px dashed var(--accent)";
        target.style.background = "rgba(var(--accent-rgb), 0.05)";
      }}
      onBlur$={(e: Event) => {
        const target = e.target as HTMLElement;
        target.style.border = "1px dashed transparent";
        target.style.background = "transparent";
      }}
    />
  );
});

export const EditableImage = component$<{
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  style?: string;
  class?: string;
  editable?: boolean;
  onUpdate$?: PropFunction<(newSrc: string) => void>;
}>(({ src, alt = "Image", width, height, style = "", class: className, editable = false, onUpdate$ }) => {
  const isEditing = useSignal(false);
  const tempUrl = useSignal(src);

  if (!editable) {
    return <img src={src} alt={alt} width={width} height={height} style={style} class={className} />;
  }

  return (
    <div style="position: relative; display: inline-block; width: 100%; height: 100%;">
      <img src={src} alt={alt} width={width} height={height} style={style} class={className} />
      <button
        type="button"
        onClick$={() => {
          tempUrl.value = src;
          isEditing.value = true;
        }}
        style="position: absolute; top: 8px; right: 8px; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer; box-shadow: none; z-index: 10;"
      >
        Change Image
      </button>

      {isEditing.value && (
        <div style="position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
          <div style="background: var(--surface-1); padding: 24px; border-radius: 8px; width: 400px; max-width: 90vw; display: flex; flex-direction: column; gap: 16px; box-shadow: none;">
            <h3 style="margin: 0; font-size: 1.125rem; color: var(--text-primary); font-weight: 600;">Update Image URL</h3>
            <input
              type="text"
              value={tempUrl.value}
              onInput$={(e: Event) => {
                tempUrl.value = (e.target as HTMLInputElement).value;
              }}
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-2); color: var(--text-primary); box-sizing: border-box;"
              placeholder="https://..."
            />
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
              <button
                type="button"
                onClick$={() => isEditing.value = false}
                style="padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer;"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick$={() => {
                  isEditing.value = false;
                  if (onUpdate$) {
                    onUpdate$(tempUrl.value);
                  }
                }}
                style="padding: 8px 16px; border: none; border-radius: 4px; background: var(--accent); color: var(--surface-1); font-weight: 500; cursor: pointer;"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const EditableVideo = component$<{
  src: string;
  style?: string;
  class?: string;
  width?: number;
  height?: number;
  editable?: boolean;
  onUpdate$?: PropFunction<(newSrc: string) => void>;
}>(({ src, style = "", class: className, width, height, editable = false, onUpdate$ }) => {
  const isEditing = useSignal(false);
  const tempUrl = useSignal(src);

  const getYouTubeId = (url: string) => {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/,
      /youtube\.com\/watch\?.*v=([^&\s]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const isLikelyVideoUrl = (url: string) => {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
  };

  const renderVideo = () => {
    if (!src) {
      if (!editable) return null;
      return (
        <div style="width: 100%; height: 360px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; border: 1px dashed var(--border); border-radius: 8px;">
          <span style="color: var(--text-secondary);">No Media Selected</span>
        </div>
      );
    }

    const youtubeId = getYouTubeId(src);
    if (youtubeId) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title="Video"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullscreen
          style={style}
          class={className}
        />
      );
    }

    if (isLikelyVideoUrl(src)) {
      return (
        <video controls playsInline preload="metadata" style={style} class={className}>
          <source src={src} />
        </video>
      );
    }

    return (
      <img src={src} alt="Media" width={width} height={height} style={style} class={className} />
    );
  };

  if (!editable) {
    return <div style="position: relative; width: 100%;">{renderVideo()}</div>;
  }

  return (
    <div style="position: relative; width: 100%;">
      {renderVideo()}
      <button
        type="button"
        onClick$={() => {
          tempUrl.value = src;
          isEditing.value = true;
        }}
        style="position: absolute; top: 8px; right: 8px; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10;"
      >
        Change Media
      </button>

      {isEditing.value && (
        <div style="position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
          <div style="background: var(--surface-1); padding: 24px; border-radius: 8px; width: 400px; max-width: 90vw; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <h3 style="margin: 0; font-size: 1.125rem; color: var(--text-primary); font-weight: 600;">Update Media URL</h3>
            <input
              type="text"
              value={tempUrl.value}
              onInput$={(e: Event) => {
                tempUrl.value = (e.target as HTMLInputElement).value;
              }}
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-2); color: var(--text-primary); box-sizing: border-box;"
              placeholder="https://..."
            />
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
              <button
                type="button"
                onClick$={() => isEditing.value = false}
                style="padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer;"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick$={() => {
                  isEditing.value = false;
                  if (onUpdate$) {
                    onUpdate$(tempUrl.value);
                  }
                }}
                style="padding: 8px 16px; border: none; border-radius: 4px; background: var(--accent); color: var(--surface-1); font-weight: 500; cursor: pointer;"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const EditableButton = component$<{
  text: string;
  url?: string;
  style?: string;
  class?: string;
  editable?: boolean;
  onUpdate$?: PropFunction<(newData: { text: string; url?: string }) => void>;
}>(({ text, url = "#", style = "", class: className, editable = false, onUpdate$ }) => {
  const isEditingUrl = useSignal(false);
  const tempUrl = useSignal(url);

  if (!editable) {
    if (!text && !url) return null;
    return (
      <a href={url} class={className} style={style}>
        {text}
      </a>
    );
  }

  return (
    <div style="position: relative; display: inline-block;">
      <div
        class={className}
        style={`${style} outline: none; border: 1px dashed transparent; cursor: text; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;`}
        contentEditable="true"
        onInput$={(e: Event) => {
          const target = e.target as HTMLElement;
          if (onUpdate$) {
            onUpdate$({ text: target.innerHTML, url });
          }
        }}
        onFocus$={(e: Event) => {
          const target = e.target as HTMLElement;
          target.style.border = "1px dashed var(--accent)";
        }}
        onBlur$={(e: Event) => {
          const target = e.target as HTMLElement;
          target.style.border = "1px dashed transparent";
        }}
        dangerouslySetInnerHTML={text}
      />
      <button
        type="button"
        onClick$={() => {
          tempUrl.value = url;
          isEditingUrl.value = true;
        }}
        style="position: absolute; top: -30px; right: 0; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer; box-shadow: none; z-index: 10;"
        title="Edit Link URL"
      >
        🔗
      </button>

      {isEditingUrl.value && (
        <div style="position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
          <div style="background: var(--surface-1); padding: 24px; border-radius: 8px; width: 400px; max-width: 90vw; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <h3 style="margin: 0; font-size: 1.125rem; color: var(--text-primary); font-weight: 600;">Update Link URL</h3>
            <input
              type="text"
              value={tempUrl.value}
              onInput$={(e: Event) => {
                tempUrl.value = (e.target as HTMLInputElement).value;
              }}
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-2); color: var(--text-primary); box-sizing: border-box;"
              placeholder="https://..."
            />
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
              <button
                type="button"
                onClick$={() => isEditingUrl.value = false}
                style="padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer;"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick$={() => {
                  isEditingUrl.value = false;
                  if (onUpdate$) {
                    onUpdate$({ text, url: tempUrl.value });
                  }
                }}
                style="padding: 8px 16px; border: none; border-radius: 4px; background: var(--accent); color: var(--surface-1); font-weight: 500; cursor: pointer;"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
