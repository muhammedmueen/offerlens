/**
 * Analytics utility for tracking events with Vercel Analytics
 * Handles privacy preferences and development mode
 */

import { track } from "@vercel/analytics"

/**
 * Check if analytics should be enabled
 * Disabled in development and when user has opted out
 */
export function isAnalyticsEnabled(): boolean {
  // Disable in development
  if (process.env.NODE_ENV === "development") {
    return false
  }

  // Check for Do Not Track browser setting
  if (typeof window !== "undefined" && navigator.doNotTrack === "1") {
    return false
  }

  // Check for user privacy preference in localStorage
  if (typeof window !== "undefined") {
    const privacyPreference = localStorage.getItem("analytics-consent")
    if (privacyPreference === "false") {
      return false
    }
  }

  return true
}

/**
 * Track a custom event
 * @param eventName - Name of the event to track
 * @param properties - Optional properties to include with the event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  if (!isAnalyticsEnabled()) {
    console.log(`[Analytics Disabled] Event: ${eventName}`, properties)
    return
  }

  try {
    track(eventName, properties)
  } catch (error) {
    console.error("Failed to track event:", error)
  }
}

/**
 * Track page view
 * Note: Vercel Analytics automatically tracks page views,
 * but this can be used for manual tracking if needed
 */
export function trackPageView(
  pageName: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("page_view", {
    page: pageName,
    ...properties,
  })
}

/**
 * Track conversion event (successful offer analysis)
 */
export function trackConversion(
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("conversion", {
    type: "offer_analysis_complete",
    ...properties,
  })
}

/**
 * Track feature request submission
 */
export function trackFeatureRequest(
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("feature_request_submitted", properties)
}

/**
 * Track file upload
 */
export function trackFileUpload(
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("file_uploaded", properties)
}

/**
 * Track error events
 */
export function trackError(
  error: Error,
  context?: Record<string, string | number | boolean | null>
): void {
  trackEvent("error", {
    message: error.message,
    stack: error.stack || null,
    ...context,
  })
}

/**
 * Set user privacy preference for analytics
 * @param consent - Whether user consents to analytics
 */
export function setAnalyticsConsent(consent: boolean): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("analytics-consent", consent.toString())
  }
}

/**
 * Get user privacy preference for analytics
 */
export function getAnalyticsConsent(): boolean | null {
  if (typeof window !== "undefined") {
    const consent = localStorage.getItem("analytics-consent")
    if (consent === null) return null
    return consent === "true"
  }
  return null
}
