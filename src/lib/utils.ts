import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses SQLite datetime('now') UTC strings (e.g. "2026-09-27 09:51:31") or ISO strings
 * safely in UTC without treating them as local device time.
 */
export function parseUtcDate(s?: string | null): Date | null {
  if (!s) return null;
  const str = s.trim();
  if (!str) return null;
  // If no timezone suffix (Z, +HH:MM, or -HH:MM), append Z for UTC timestamps
  const iso = /([Z+-]\d\d:?\d\d|Z)$/i.test(str) ? str : str.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates elapsed human-readable duration between start and end (or now if active).
 */
export function formatDuration(start?: string | null, end?: string | null): string {
  const s = parseUtcDate(start);
  if (!s) return "—";
  const e = parseUtcDate(end) ?? new Date();
  const secs = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/**
 * Strips repeated :resume: and workspace id prefixes to return the underlying clean native session ID.
 */
export function extractCleanResumeId(raw?: string | null): string {
  if (!raw) return "";
  let s = raw.trim();
  while (s.includes(":resume:")) {
    s = s.slice(s.lastIndexOf(":resume:") + 8);
  }
  if (/^\d+:/.test(s)) {
    s = s.replace(/^\d+:/, "");
  }
  // Strip CLI prefixes if encoded in synthetic ID
  s = s.replace(/^(antigravity|claude|codex|grok|droid|warp|cursor|opencode)[:_-]/i, "");
  if (s.startsWith("tab-")) {
    return "";
  }
  // If it's a chained timestamp like "1790546990520-1790547016522", return the root parent timestamp
  if (/^\d+(-\d+)+$/.test(s)) {
    return s.split("-")[0];
  }
  return s.trim();
}

/**
 * Resolves the currently active or last selected workspace ID from search param or sessionStorage.
 */
export function getActiveWorkspaceFilter(paramWs?: number | null): number | null {
  if (typeof paramWs === "number" && !isNaN(paramWs) && paramWs > 0) {
    sessionStorage.setItem("superconsole-active-ws", String(paramWs));
    return paramWs;
  }
  const saved = sessionStorage.getItem("superconsole-active-ws");
  if (saved) {
    const n = Number(saved);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

export function setActiveWorkspaceFilter(id: number | null) {
  if (id && id > 0) {
    sessionStorage.setItem("superconsole-active-ws", String(id));
  } else {
    sessionStorage.removeItem("superconsole-active-ws");
  }
}


