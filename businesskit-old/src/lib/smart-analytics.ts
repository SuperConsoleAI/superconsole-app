/**
 * Smart Analytics System
 * Uses queues only when traffic is high or during peak periods
 */

export interface TrafficMetrics {
  requestsPerMinute: number;
  isPeakHour: boolean;
  isHighTraffic: boolean;
  shouldUseQueue: boolean;
}

export class SmartAnalytics {
  private static instance: SmartAnalytics;
  private requestCounts: Map<number, number> = new Map();
  private readonly HIGH_TRAFFIC_THRESHOLD = 500; // requests per minute

  private constructor() {
    // Clean up old request counts every minute
    setInterval(() => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      
      for (const [timestamp] of this.requestCounts) {
        if (timestamp < oneMinuteAgo) {
          this.requestCounts.delete(timestamp);
        }
      }
    }, 60000);
  }

  static getInstance(): SmartAnalytics {
    if (!SmartAnalytics.instance) {
      SmartAnalytics.instance = new SmartAnalytics();
    }
    return SmartAnalytics.instance;
  }

  recordRequest(): TrafficMetrics {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const currentCount = this.requestCounts.get(currentMinute) || 0;
    this.requestCounts.set(currentMinute, currentCount + 1);

    const requestsPerMinute = this.calculateRequestsPerMinute();
    const isHighTraffic = requestsPerMinute > this.HIGH_TRAFFIC_THRESHOLD;
    
    // Use queues only when traffic is high (irrespective of time)
    const shouldUseQueue = isHighTraffic;

    return {
      requestsPerMinute,
      isPeakHour: false, // No longer used
      isHighTraffic,
      shouldUseQueue,
    };
  }

  private calculateRequestsPerMinute(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    let totalRequests = 0;

    for (const [timestamp, count] of this.requestCounts) {
      if (timestamp >= oneMinuteAgo) {
        totalRequests += count;
      }
    }

    return totalRequests;
  }

  getTrafficMetrics(): TrafficMetrics {
    const requestsPerMinute = this.calculateRequestsPerMinute();
    const isHighTraffic = requestsPerMinute > this.HIGH_TRAFFIC_THRESHOLD;
    const shouldUseQueue = isHighTraffic;

    return {
      requestsPerMinute,
      isPeakHour: false, // No longer used
      isHighTraffic,
      shouldUseQueue,
    };
  }
}

// Smart analytics functions
function extractUTMParams(): { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null } {
  if (typeof window === "undefined") return { utmSource: null, utmMedium: null, utmCampaign: null };
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source"),
    utmMedium: p.get("utm_medium"),
    utmCampaign: p.get("utm_campaign"),
  };
}

export function trackLinkClickSmart(payload: {
  linkId: string;
  categorySlug?: string;
  targetUrl?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const smartAnalytics = SmartAnalytics.getInstance();
  const metrics = smartAnalytics.recordRequest();

  // Log traffic metrics for monitoring
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.log(`Traffic: ${metrics.requestsPerMinute}/min, Peak: ${metrics.isPeakHour}, High: ${metrics.isHighTraffic}, Queue: ${metrics.shouldUseQueue}`);
  }

  if (metrics.shouldUseQueue) {
    // Use batched analytics for high traffic
    try {
      const { trackLinkClickBatched } = require('./analytics-batcher');
      trackLinkClickBatched(payload);
    } catch (error) {
      console.warn("Batched analytics not available, using direct tracking", error);
      // Fallback to direct tracking
      trackLinkClickDirect(payload);
    }
  } else {
    // Use direct tracking for low traffic
    trackLinkClickDirect(payload);
  }
}

export function trackProfileVisitSmart(payload: {
  profileId: string;
  isUnique?: boolean;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const smartAnalytics = SmartAnalytics.getInstance();
  const metrics = smartAnalytics.recordRequest();

  if (metrics.shouldUseQueue) {
    // Use batched analytics for high traffic
    try {
      const { trackProfileVisitBatched } = require('./analytics-batcher');
      trackProfileVisitBatched(payload);
    } catch (error) {
      console.warn("Batched analytics not available, using direct tracking", error);
      // Fallback to direct tracking
      trackProfileVisitDirect(payload);
    }
  } else {
    // Use direct tracking for low traffic
    trackProfileVisitDirect(payload);
  }
}

// Direct tracking functions (no queue)
function trackLinkClickDirect(payload: {
  linkId: string;
  categorySlug?: string;
  targetUrl?: string;
}) {
  const { utmSource, utmMedium, utmCampaign } = extractUTMParams();
  const body = {
    type: "link-click" as const,
    linkId: payload.linkId,
    categorySlug: payload.categorySlug ?? null,
    targetUrl: payload.targetUrl ?? null,
    utmSource,
    utmMedium,
    utmCampaign,
    timestamp: Date.now(),
  };

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }

    void fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (error) {
    console.warn("Failed to send analytics event", error);
  }
}

function trackProfileVisitDirect(payload: {
  profileId: string;
  isUnique?: boolean;
}) {
  const body = {
    type: "profile-visit" as const,
    profileId: payload.profileId,
    isUnique: payload.isUnique ?? true,
    timestamp: Date.now(),
  };

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }

    void fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (error) {
    console.warn("Failed to send analytics event", error);
  }
}
