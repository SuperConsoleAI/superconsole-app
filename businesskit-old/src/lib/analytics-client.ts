export interface TrackLinkClickPayload {
  linkId?: string | null;
  categorySlug?: string | null;
  targetUrl?: string | null;
}

export interface TrackProfileVisitPayload {
  profileId?: string | null;
}

const TRACK_ENDPOINT = "/api/analytics/track";
const VISIT_CACHE_PREFIX = "analytics:profile-visit:";
const UNIQUE_VISITOR_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function trackLinkClick(payload: TrackLinkClickPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const linkId = typeof payload.linkId === "string" && payload.linkId.length > 0 ? payload.linkId : null;
  if (!linkId) {
    return;
  }

  // Use smart analytics that only uses queues during high traffic
  try {
    // Dynamic import for browser compatibility
    const smartAnalytics = await import('./smart-analytics').catch(() => null);
    if (smartAnalytics?.trackLinkClickSmart) {
      smartAnalytics.trackLinkClickSmart({
        linkId,
        categorySlug: payload.categorySlug || undefined,
        targetUrl: payload.targetUrl || undefined,
      });
      return;
    }
  } catch (error) {
    // Fallback to direct tracking if smart analytics fails
    console.warn("Smart analytics not available, using direct tracking", error);
    
    const body = {
      type: "link-click" as const,
      linkId,
      categorySlug: payload.categorySlug ?? null,
      targetUrl: payload.targetUrl ?? null,
      timestamp: Date.now(),
    };

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon(TRACK_ENDPOINT, blob);
      return;
    }

    void fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  }
}

export async function trackProfileVisit(payload: TrackProfileVisitPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const profileId = typeof payload.profileId === "string" && payload.profileId.length > 0 ? payload.profileId : null;
  if (!profileId) {
    return;
  }

  const now = Date.now();
  const cacheKey = `${VISIT_CACHE_PREFIX}${profileId}`;

  let isUnique = true;

  try {
    const lastValue = window.localStorage.getItem(cacheKey);
    if (lastValue) {
      const lastTimestamp = Number(lastValue);
      if (Number.isFinite(lastTimestamp)) {
        isUnique = now - lastTimestamp > UNIQUE_VISITOR_WINDOW_MS;
      }
    }

    if (isUnique) {
      window.localStorage.setItem(cacheKey, String(now));
    }
  } catch (error) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn("Failed to access visit cache", error);
    }
  }

  // Use smart analytics that only uses queues during high traffic
  try {
    // Dynamic import for browser compatibility
    const smartAnalytics = await import('./smart-analytics').catch(() => null);
    if (smartAnalytics?.trackProfileVisitSmart) {
      smartAnalytics.trackProfileVisitSmart({
        profileId,
        isUnique,
      });
      return;
    }
  } catch (error) {
    // Fallback to direct tracking if smart analytics fails
    console.warn("Smart analytics not available, using direct tracking", error);
    
    const body = {
      type: "profile-visit" as const,
      profileId,
      timestamp: now,
      isUnique,
    };

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon(TRACK_ENDPOINT, blob);
      return;
    }

    void fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  }
}
