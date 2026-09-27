import ampIcon from "./amp.svg";
import antigravityIcon from "./antigravity.svg";
import antigravityColorIcon from "./antigravity-color.svg";
import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";
import copilotIcon from "./copilot.svg";
import copilotWhiteIcon from "./copilot-white.svg";
import cursorAgentIcon from "./cursor.svg";
import droidIcon from "./droid.svg";
import droidWhiteIcon from "./droid-white.svg";
import geminiIcon from "./gemini.svg";
import mastracodeIcon from "./mastracode.svg";
import mastracodeWhiteIcon from "./mastracode-white.svg";
import opencodeIcon from "./opencode.svg";
import opencodeWhiteIcon from "./opencode-white.svg";
import piIcon from "./pi.svg";
import piWhiteIcon from "./pi-white.svg";
import supersetIcon from "./superset.svg";
import warpIcon from "./warp.svg";
import warpWhiteIcon from "./warp-white.svg";
import xaiIcon from "./xai.svg";
import xaiWhiteIcon from "./xai-white.svg";
import grokIcon from "./grok.svg";
import grokWhiteIcon from "./grok-white.svg";

export interface PresetIconSet {
	light: string;
	dark: string;
}

export const PRESET_ICONS: Record<string, PresetIconSet> = {
	amp: { light: ampIcon, dark: ampIcon },
	antigravity: { light: antigravityColorIcon, dark: antigravityColorIcon },
	claude: { light: claudeIcon, dark: claudeIcon },
	codex: { light: codexIcon, dark: codexWhiteIcon },
	copilot: { light: copilotIcon, dark: copilotWhiteIcon },
	cursor: { light: cursorAgentIcon, dark: cursorAgentIcon },
	"cursor-agent": { light: cursorAgentIcon, dark: cursorAgentIcon },
	droid: { light: droidIcon, dark: droidWhiteIcon },
	gemini: { light: geminiIcon, dark: geminiIcon },
	grok: { light: grokIcon, dark: grokWhiteIcon },
	"grok-build": { light: grokIcon, dark: grokWhiteIcon },
	mastracode: { light: mastracodeIcon, dark: mastracodeWhiteIcon },
	opencode: { light: opencodeIcon, dark: opencodeWhiteIcon },
	pi: { light: piIcon, dark: piWhiteIcon },
	superset: { light: supersetIcon, dark: supersetIcon },
	warp: { light: warpIcon, dark: warpWhiteIcon },
	"warp-agent": { light: warpIcon, dark: warpWhiteIcon },
	xai: { light: grokIcon, dark: grokWhiteIcon },
	"x-ai": { light: grokIcon, dark: grokWhiteIcon },
};

export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return isDark ? iconSet.dark : iconSet.light;
}

export {
	ampIcon,
	antigravityIcon,
	antigravityColorIcon,
	claudeIcon,
	codexIcon,
	codexWhiteIcon,
	copilotIcon,
	copilotWhiteIcon,
	cursorAgentIcon,
	droidIcon,
	droidWhiteIcon,
	geminiIcon,
	grokIcon,
	grokWhiteIcon,
	mastracodeIcon,
	mastracodeWhiteIcon,
	opencodeIcon,
	opencodeWhiteIcon,
	piIcon,
	piWhiteIcon,
	supersetIcon,
	warpIcon,
	warpWhiteIcon,
	xaiIcon,
	xaiWhiteIcon,
};

