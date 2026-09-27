import { component$, $, useSignal, useTask$ } from "@builder.io/qwik";
import type { PropFunction } from "@builder.io/qwik";
import { LuLink2, LuType, LuBold, LuItalic, LuRotateCcw, LuX, LuScan, LuMousePointer2, LuBoxSelect } from "@qwikest/icons/lucide";

export interface TooltipState {
  x: number;
  y: number;
  fieldName: string;
  propertyType: 'image' | 'link' | 'box' | 'text' | 'button' | 'color';
  sectionIndex: number;
  currentValue: string;
  currentColor?: string;
  colorField?: string;
  defaultColor?: string;
  defaultBgColor?: string;
  weight?: string;
  style?: string;
  color?: string;
}

export interface SectionEditorTooltipProps {
  tooltip: TooltipState | null;
  onClose$: PropFunction<() => void>;
  onUpdate$: PropFunction<(field: string, value: string, sectionIndex: number, propertyType?: 'text' | 'color' | 'image' | 'link') => void>;
}

const getValidColor = (c?: string) => {
  if (!c || c === 'transparent') return '#000000';
  if (c.startsWith('var(')) return '#000000';
  return c;
};

const getDisplayBackground = (c?: string, propertyType?: string, fallback?: string) => {
  if (!c || c === 'transparent') {
    if (fallback) return fallback;
    if (propertyType === 'color') return 'var(--surface-1)';
    if (propertyType === 'box') return 'var(--surface-2)';
    return 'repeating-linear-gradient(45deg, #eee 0, #eee 25%, #fff 0, #fff 50%)';
  }
  if (c.startsWith('var(')) return c;
  return c;
};

export const SectionEditorTooltip = component$<SectionEditorTooltipProps>((props) => {
  const inputValue = useSignal(props.tooltip?.currentValue || '');
  const colorValue = useSignal(props.tooltip?.currentColor || props.tooltip?.currentValue || props.tooltip?.defaultBgColor || '');
  const showLinkInput = useSignal(props.tooltip?.propertyType === 'image');
  const textWeight = useSignal(props.tooltip?.weight || '');
  const textStyle = useSignal(props.tooltip?.style || '');
  const textColor = useSignal(props.tooltip?.color || props.tooltip?.defaultColor || '');

  useTask$(({ track }) => {
    track(() => props.tooltip?.fieldName);
    track(() => props.tooltip?.sectionIndex);
    inputValue.value = props.tooltip?.currentValue || '';
    colorValue.value = props.tooltip?.currentColor || props.tooltip?.currentValue || props.tooltip?.defaultBgColor || '';
    showLinkInput.value = props.tooltip?.propertyType === 'image';
    textWeight.value = props.tooltip?.weight || 'normal';
    textStyle.value = props.tooltip?.style || 'normal';
    textColor.value = props.tooltip?.color || props.tooltip?.defaultColor || '';
  });

  const handleSave = $((type: 'color' | 'link', val?: string) => {
    if (!props.tooltip) return;
    if (type === 'color') {
      const targetField = props.tooltip.colorField || props.tooltip.fieldName;
      props.onUpdate$(targetField, val || colorValue.value, props.tooltip.sectionIndex, 'color');
    }
    if (type === 'link') {
      props.onUpdate$(props.tooltip.fieldName, inputValue.value, props.tooltip.sectionIndex, props.tooltip.propertyType as any);
      showLinkInput.value = false;
    }
  });

  const handleTextStyle = $((type: 'color' | 'weight' | 'style', val: string) => {
    if (!props.tooltip) return;

    // Toggle logic for weight and style
    if (type === 'weight') {
      val = textWeight.value === 'bold' ? '' : 'bold';
    }
    if (type === 'style') {
      val = textStyle.value === 'italic' ? '' : 'italic';
    }

    const fieldName = props.tooltip.fieldName + type.charAt(0).toUpperCase() + type.slice(1);
    props.onUpdate$(fieldName, val, props.tooltip.sectionIndex, 'text');

    // Update local state so it toggles visually immediately
    if (type === 'weight') textWeight.value = val;
    if (type === 'style') textStyle.value = val;
    if (type === 'color') textColor.value = val;
  });

  const handleResetText = $(() => {
    if (!props.tooltip) return;
    const baseField = props.tooltip.fieldName;

    if (props.tooltip.propertyType === 'color' || props.tooltip.propertyType === 'box' || props.tooltip.propertyType === 'button') {
      const targetField = props.tooltip.colorField || props.tooltip.fieldName;
      props.onUpdate$(targetField, '', props.tooltip.sectionIndex, 'color');
      colorValue.value = props.tooltip.defaultBgColor || '';
    }

    props.onUpdate$(baseField + 'Weight', '', props.tooltip.sectionIndex, 'text');
    props.onUpdate$(baseField + 'Style', '', props.tooltip.sectionIndex, 'text');
    props.onUpdate$(baseField + 'Color', '', props.tooltip.sectionIndex, 'text');

    textWeight.value = '';
    textStyle.value = '';
    textColor.value = props.tooltip.defaultColor || '';
  });

  if (!props.tooltip) return null;
  const tooltip = props.tooltip;

  return (
    <div
      class="editor-tooltip-overlay"
      onMouseDown$={(e) => e.stopPropagation()} // Prevent focus loss
      style={`
        position: fixed;
        top: calc(${tooltip.y}px + 1rem);
        left: ${Math.max(10, tooltip.x)}px;
        transform: translate(-50%, 0);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 6px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1000;
        pointer-events: auto;
      `}
    >
      <div style="display: flex; gap: 4px; align-items: center;">
        {(tooltip.propertyType === 'text' || tooltip.propertyType === 'button' || tooltip.propertyType === 'box') && (
          <>
            <button
              type="button"
              onMouseDown$={(e) => e.preventDefault()}
              onClick$={() => handleTextStyle('weight', 'bold')}
              style={`background: ${textWeight.value === 'bold' ? 'var(--accent)' : 'transparent'}; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: ${textWeight.value === 'bold' ? 'var(--surface-1)' : 'var(--text-primary)'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s;`}
              title="Bold"
            >
              <LuBold width={16} height={16} />
            </button>
            <button
              type="button"
              onMouseDown$={(e) => e.preventDefault()}
              onClick$={() => handleTextStyle('style', 'italic')}
              style={`background: ${textStyle.value === 'italic' ? 'var(--accent)' : 'transparent'}; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: ${textStyle.value === 'italic' ? 'var(--surface-1)' : 'var(--text-primary)'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s;`}
              title="Italic"
            >
              <LuItalic width={16} height={16} />
            </button>

            <div style="display: flex; align-items: center; border-radius: 4px; background: var(--surface-1); padding: 4px; border: 1px solid var(--border); gap: 4px;">
              <div title="Text Color" style="display: flex; align-items: center;">
                <LuType width={16} height={16} style="margin-right: 4px; color: var(--text-primary);" />
                <label
                  onMouseDown$={(e) => e.preventDefault()}
                  style={`width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer; display: block; overflow: hidden; background: ${getDisplayBackground(textColor.value, tooltip.propertyType)};`}
                >
                  <input
                    type="color"
                    value={getValidColor(textColor.value)}
                    onInput$={(e) => handleTextStyle('color', (e.target as HTMLInputElement).value)}
                    style="opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                  />
                </label>
              </div>
              <input
                type="text"
                value={textColor.value || ''}
                onInput$={(e) => { textColor.value = (e.target as HTMLInputElement).value; }}
                onChange$={() => handleTextStyle('color', textColor.value)}
                onBlur$={() => handleTextStyle('color', textColor.value)}
                placeholder="Default"
                style="width: 60px; font-size: 11px; background: transparent; border: none; color: var(--text-primary); outline: none; padding-left: 2px;"
              />
            </div>

          </>
        )}

        {(tooltip.propertyType === 'box' || tooltip.propertyType === 'color') && (
          <div style="display: flex; align-items: center; border-radius: 4px; background: var(--surface-1); padding: 4px; border: 1px solid var(--border); gap: 4px;">
            <div title="Color" style="display: flex; align-items: center;">
              {tooltip.propertyType === 'box' ? (
                <LuBoxSelect width={16} height={16} style="margin-right: 4px; color: var(--text-primary);" />
              ) : (
                <LuScan width={16} height={16} style="margin-right: 4px; color: var(--text-primary);" />
              )}
              <label
                onMouseDown$={(e) => e.preventDefault()}
                style={`width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer; display: block; overflow: hidden; background: ${getDisplayBackground(colorValue.value, tooltip.propertyType)};`}
              >
                <input
                  type="color"
                  value={getValidColor(colorValue.value)}
                  onInput$={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    colorValue.value = v;
                    handleSave('color', v);
                  }}
                  style="opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                />
              </label>
            </div>
            <input
              type="text"
              value={colorValue.value || ''}
              onInput$={(e) => { colorValue.value = (e.target as HTMLInputElement).value; }}
              onChange$={() => handleSave('color', colorValue.value)}
              onBlur$={() => handleSave('color', colorValue.value)}
              placeholder="Default"
              style="width: 70px; font-size: 11px; background: transparent; border: none; color: var(--text-primary); outline: none; padding-left: 2px;"
            />
          </div>
        )}

        {tooltip.propertyType === 'button' && (
          <>
            <div style="width: 1px; height: 20px; background: var(--border); margin: 0 4px;" />
            <div style="display: flex; align-items: center; border-radius: 4px; background: var(--surface-1); padding: 4px; border: 1px solid var(--border); gap: 4px;">
              <div title="Button Color" style="display: flex; align-items: center;">
                <LuMousePointer2 width={16} height={16} style="margin-right: 4px; color: var(--text-primary);" />
                <label
                  onMouseDown$={(e) => e.preventDefault()}
                  style={`width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer; display: block; overflow: hidden; background: ${getDisplayBackground(colorValue.value, tooltip.propertyType)};`}
                >
                  <input
                    type="color"
                    value={getValidColor(colorValue.value)}
                    onInput$={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      colorValue.value = v;
                      handleSave('color', v);
                    }}
                    style="opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                  />
                </label>
              </div>
              <input
                type="text"
                value={colorValue.value || ''}
                onInput$={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  colorValue.value = v;
                  handleSave('color', v);
                }}
                placeholder="Default"
                style="width: 70px; font-size: 11px; background: transparent; border: none; color: var(--text-primary); outline: none; padding-left: 2px;"
              />
            </div>
          </>
        )}

        {(tooltip.propertyType === 'link' || tooltip.propertyType === 'button' || tooltip.propertyType === 'image') && (
          <>
            <div style="width: 1px; height: 20px; background: var(--border); margin: 0 4px;" />
            <button
              type="button"
              onMouseDown$={(e) => e.preventDefault()}
              onClick$={() => showLinkInput.value = !showLinkInput.value}
              style={`background: ${showLinkInput.value ? 'var(--accent)' : 'transparent'}; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: ${showLinkInput.value ? 'var(--surface-1)' : 'var(--text-primary)'}; display: flex; align-items: center; justify-content: center;`}
              title="Edit Link/Media"
            >
              <LuLink2 width={16} height={16} />
            </button>
            {showLinkInput.value && (
              <div style="display: flex; align-items: center; gap: 4px; margin-left: 4px;">
                <input
                  type="text"
                  value={inputValue.value}
                  onInput$={(e) => inputValue.value = (e.target as HTMLInputElement).value}
                  onKeyDown$={(e) => {
                    if (e.key === 'Enter') handleSave('link');
                  }}
                  placeholder={tooltip.propertyType === 'image' ? "Image URL" : "URL"}
                  style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: 12px; min-width: 150px; outline: none;"
                />
                <button
                  type="button"
                  onClick$={() => handleSave('link')}
                  style="background: var(--accent); color: var(--surface-1); border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;"
                >
                  Save
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div style="display: flex; align-items: center; gap: 4px; margin-left: 8px;">
        <button
          type="button"
          onMouseDown$={(e) => e.preventDefault()}
          onClick$={handleResetText}
          style="background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: all 0.2s;"
          title="Reset to default"
          onMouseOver$={(e) => ((e.target as HTMLElement).style.color = 'var(--text-primary)', (e.target as HTMLElement).style.background = 'var(--surface-1)')}
          onMouseOut$={(e) => ((e.target as HTMLElement).style.color = 'var(--text-secondary)', (e.target as HTMLElement).style.background = 'transparent')}
        >
          <LuRotateCcw width={14} height={14} />
        </button>
        <button
          type="button"
          onClick$={() => props.onClose$()}
          style="background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center;"
        >
          <LuX width={16} height={16} />
        </button>
      </div>
    </div>
  );
});
