// src/lib/haptics.ts
//
// What it is:
//   UI helper for triggering haptic and tactile feedback on profile/org switching and key interactive controls.
// What it does:
//   - Uses Web Vibration API (`navigator.vibrate`) for mobile devices and supported webviews.
//   - Synthesizes a subtle, pleasant tactile audio pulse via Web Audio API (`AudioContext`) for desktop environments (macOS/Windows) where physical vibration motors are absent.
// Flow:
//   UI elements (e.g. AppSidebar profile switcher) call `triggerHaptic('selection' | 'medium' | 'success')`.
//   The function attempts native vibration, followed by a fast <20ms tactile sound pulse.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Trigger haptic and tactile feedback for user actions.
 * @param type 'light' | 'medium' | 'heavy' | 'success' | 'selection' | 'error'
 */
export function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "selection" | "error" = "selection") {
  if (typeof window === "undefined") return;

  // 1. Web Vibration API (mobile devices / supported WebViews)
  if (typeof navigator !== "undefined" && "vibrate" in navigator && typeof navigator.vibrate === "function") {
    try {
      switch (type) {
        case "light":
        case "selection":
          navigator.vibrate(12);
          break;
        case "medium":
          navigator.vibrate(25);
          break;
        case "heavy":
          navigator.vibrate(40);
          break;
        case "success":
          navigator.vibrate([12, 30, 20]);
          break;
        case "error":
          navigator.vibrate([40, 40, 40]);
          break;
      }
    } catch {
      /* ignore vibration errors */
    }
  }

  // 2. Web Audio API Tactile Pulse (Desktop macOS / Windows / fallback)
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "light" || type === "selection") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.015);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
      osc.start(now);
      osc.stop(now + 0.015);
    } else if (type === "medium") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.022);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
      osc.start(now);
      osc.stop(now + 0.022);
    } else if (type === "heavy" || type === "success") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.035);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    }
  } catch {
    /* ignore audio synthesis errors */
  }
}
