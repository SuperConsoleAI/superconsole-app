import { lightTheme } from "./design-system";
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const normalizeUrl = (url: string) => {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
};

export interface ProfileThemeSettings {
  backgroundColor: string;
  cardColor: string;
  borderColor: string;
  textColor: string;
  inactiveTextColor: string;
  buttonColor: string;
  cardButtonColor: string;
  backgroundPattern: string;
  backgroundImageUrl: string;
  headingFont: string;
  bodyFont: string;
}

export interface ProfileThemePatternStyle {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
  backgroundBlendMode?: string;
}

export const PROFILE_THEME_FONTS = [
  "Inter",
  "Roboto",
  "Outfit",
  "Playfair Display",
  "Lora",
  "Montserrat",
  "Plus Jakarta Sans",
  "Oswald"
];

export interface ProfileThemePatternOption {
  id: string;
  label: string;
  description: string;
}

interface ProfileThemePatternConfig extends ProfileThemePatternOption {
  buildStyle: (theme: ProfileThemeSettings) => ProfileThemePatternStyle;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const fallbackTextColor = lightTheme.colors.textPrimary;
const fallbackButtonColor = lightTheme.colors.buttonPrimaryBackground;
const fallbackCardButtonColor = "#F5F5F5";

const toUpperHex = (value: string): string => value.startsWith("#") ? `#${value.slice(1).toUpperCase()}` : value.toUpperCase();

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }
  const normalized = hex.replace("#", "");
  const pairs = normalized.length === 8 ? normalized.slice(0, 6) : normalized;
  const r = Number.parseInt(pairs.slice(0, 2), 16);
  const g = Number.parseInt(pairs.slice(2, 4), 16);
  const b = Number.parseInt(pairs.slice(4, 6), 16);
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null;
  }
  return { r, g, b };
};

const toRgba = (hex: string, alpha: number): string => {
  if (hex.toLowerCase() === "transparent") {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const relativeLuminance = (hex: string): number | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return null;
  }
  const convert = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const r = convert(rgb.r);
  const g = convert(rgb.g);
  const b = convert(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const resolveButtonTextColor = (buttonHex: string, fallback = fallbackTextColor): string => {
  const trimmed = typeof buttonHex === "string" ? buttonHex.trim() : "";
  if (!trimmed || trimmed.toLowerCase() === "transparent") {
    return fallback;
  }
  const luminance = relativeLuminance(trimmed);
  if (luminance == null) {
    return fallback;
  }
  return luminance > 0.55 ? "#000000" : "#FFFFFF";
};

export const PROFILE_THEME_DEFAULT: ProfileThemeSettings = {
  backgroundColor: toUpperHex(lightTheme.colors.surface1),
  cardColor: toUpperHex(lightTheme.colors.surface2),
  borderColor: toUpperHex(lightTheme.colors.border),
  textColor: toUpperHex(lightTheme.colors.textPrimary),
  inactiveTextColor: toUpperHex(lightTheme.colors.textSecondary),
  buttonColor: toUpperHex(lightTheme.colors.buttonPrimaryBackground ?? fallbackButtonColor),
  cardButtonColor: toUpperHex(lightTheme.colors.cardButtonBackground ?? fallbackCardButtonColor),
  backgroundPattern: "none",
  backgroundImageUrl: "",
  headingFont: "Inter",
  bodyFont: "Inter",
};

const PATTERN_CONFIGS: ProfileThemePatternConfig[] = [
  {
    id: "none",
    label: "None",
    description: "Flat background color",
    buildStyle: () => ({}),
  },
  {
    id: "grid",
    label: "Soft Grid",
    description: "Subtle grid overlay inspired by shadcn backgrounds",
    buildStyle: (theme) => {
      const overlay = toRgba(theme.textColor ?? fallbackTextColor, 0.08);
      return {
        backgroundImage: `linear-gradient(90deg, ${overlay} 1px, transparent 1px), linear-gradient(0deg, ${overlay} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        backgroundRepeat: "repeat",
      };
    },
  },
  {
    id: "dots",
    label: "Soft Dots",
    description: "Radial dot grid pattern",
    buildStyle: (theme) => {
      const overlay = toRgba(theme.textColor ?? fallbackTextColor, 0.06);
      return {
        backgroundImage: `radial-gradient(${overlay} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
        backgroundRepeat: "repeat",
      };
    },
  },
  {
    id: "beams",
    label: "Beams",
    description: "Diagonal beams glow",
    buildStyle: (theme) => {
      const accentOverlay = toRgba(theme.buttonColor ?? PROFILE_THEME_DEFAULT.buttonColor, 0.22);
      const softOverlay = toRgba(theme.textColor ?? fallbackTextColor, 0.04);
      return {
        backgroundImage: `linear-gradient(-45deg, ${accentOverlay}, transparent 70%), linear-gradient(135deg, ${softOverlay}, transparent 60%)`,
        backgroundSize: "420px 420px",
        backgroundRepeat: "repeat",
        backgroundBlendMode: "soft-light",
      };
    },
  },
  {
    id: "noise",
    label: "Noise",
    description: "Fine grain noise texture",
    buildStyle: (theme) => {
      const overlay = toRgba(theme.textColor ?? fallbackTextColor, 0.03);
      return {
        backgroundImage: `radial-gradient(${overlay} 0.8px, transparent 0.8px)`,
        backgroundSize: "6px 6px",
        backgroundRepeat: "repeat",
      };
    },
  },
  {
    id: "wave",
    label: "Waves",
    description: "Layered wave pattern",
    buildStyle: (theme) => {
      const overlay = toRgba(theme.buttonColor ?? PROFILE_THEME_DEFAULT.buttonColor, 0.18);
      return {
        backgroundImage: `radial-gradient(ellipse at 20% 20%, ${overlay} 0%, transparent 60%), radial-gradient(ellipse at 80% 0%, ${overlay} 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, ${toRgba(theme.textColor ?? fallbackTextColor, 0.05)} 0%, transparent 60%)`,
        backgroundSize: "400px 400px, 360px 360px, 500px 500px",
        backgroundRepeat: "repeat",
      };
    },
  },
];

export const PROFILE_THEME_PATTERNS: ProfileThemePatternOption[] = PATTERN_CONFIGS.map(({ id, label, description }) => ({
  id,
  label,
  description,
}));

const PATTERN_MAP = new Map<string, ProfileThemePatternConfig>(PATTERN_CONFIGS.map((config) => [config.id, config]));

export const isValidThemeColor = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.toLowerCase() === "transparent") {
    return true;
  }
  return HEX_PATTERN.test(trimmed);
};

const normalizeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.toLowerCase() === "transparent") {
    return "transparent";
  }
  if (HEX_PATTERN.test(trimmed)) {
    return toUpperHex(trimmed);
  }
  return fallback;
};

export const isValidThemePattern = (value: unknown): value is string => typeof value === "string" && PATTERN_MAP.has(value);

const normalizePattern = (value: unknown): string => {
  if (typeof value === "string" && PATTERN_MAP.has(value)) {
    return value;
  }
  return "none";
};

export const sanitizeBackgroundImageUrl = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = normalizeUrl(trimmed);
  if (!isValidUrl(normalized)) {
    return "";
  }
  if (!normalized.toLowerCase().endsWith(".avif")) {
    return "";
  }
  return normalized;
};

export type ProfileThemeColorKey =
  | "backgroundColor"
  | "cardColor"
  | "borderColor"
  | "textColor"
  | "inactiveTextColor"
  | "buttonColor"
  | "cardButtonColor";

const normalizeFont = (value: unknown): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (PROFILE_THEME_FONTS.includes(trimmed)) {
      return trimmed;
    }
  }
  return "Inter";
};

export const PROFILE_THEME_COLOR_KEYS: ProfileThemeColorKey[] = [
  "backgroundColor",
  "cardColor",
  "borderColor",
  "textColor",
  "inactiveTextColor",
  "buttonColor",
  "cardButtonColor",
];

export function normalizeProfileTheme(input?: Partial<ProfileThemeSettings> | null): ProfileThemeSettings {
  const base = input ?? {};
  return {
    backgroundColor: normalizeColor(base.backgroundColor, PROFILE_THEME_DEFAULT.backgroundColor),
    cardColor: normalizeColor(base.cardColor, PROFILE_THEME_DEFAULT.cardColor),
    borderColor: normalizeColor(base.borderColor, PROFILE_THEME_DEFAULT.borderColor),
    textColor: normalizeColor(base.textColor, PROFILE_THEME_DEFAULT.textColor),
    inactiveTextColor: normalizeColor(base.inactiveTextColor, PROFILE_THEME_DEFAULT.inactiveTextColor),
    buttonColor: normalizeColor(base.buttonColor, PROFILE_THEME_DEFAULT.buttonColor),
    cardButtonColor: normalizeColor(base.cardButtonColor, PROFILE_THEME_DEFAULT.cardButtonColor),
    backgroundPattern: normalizePattern(base.backgroundPattern),
    backgroundImageUrl: sanitizeBackgroundImageUrl(base.backgroundImageUrl),
    headingFont: normalizeFont(base.headingFont),
    bodyFont: normalizeFont(base.bodyFont),
  };
}

export function serializeProfileTheme(theme?: Partial<ProfileThemeSettings> | null): string {
  return JSON.stringify(normalizeProfileTheme(theme));
}

export function deserializeProfileTheme(value: unknown): ProfileThemeSettings {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeProfileTheme(parsed as Partial<ProfileThemeSettings>);
    } catch (error) {
      console.warn("Failed to parse profile theme JSON", error);
      return PROFILE_THEME_DEFAULT;
    }
  }

  if (value && typeof value === "object") {
    return normalizeProfileTheme(value as Partial<ProfileThemeSettings>);
  }

  return PROFILE_THEME_DEFAULT;
}

export function resolvePatternStyle(patternId: string, theme: ProfileThemeSettings): ProfileThemePatternStyle {
  const config = PATTERN_MAP.get(patternId) ?? PATTERN_MAP.get("none")!;
  return config.buildStyle(theme);
}
