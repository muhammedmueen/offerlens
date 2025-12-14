"use client"

import { useState, useEffect } from "react"

/**
 * Responsive Design Hook
 * 
 * Provides utilities for responsive design including:
 * - Screen size detection (mobile, tablet, desktop)
 * - Touch capability detection
 * - Window resize handling
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

export interface ResponsiveState {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouch: boolean
  width: number
  height: number
}

const BREAKPOINTS = {
  mobile: 640, // sm breakpoint
  tablet: 1024, // lg breakpoint
} as const

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouch: false,
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  })

  useEffect(() => {
    // Requirement 8.5: Detect touch capability
    const checkTouch = () => {
      return (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore - for older browsers
        navigator.msMaxTouchPoints > 0
      )
    }

    // Requirement 8.4: Handle window resize
    const updateState = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isTouch = checkTouch()

      // Requirement 8.1, 8.2, 8.3: Detect screen sizes
      const isMobile = width < BREAKPOINTS.mobile
      const isTablet = width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet
      const isDesktop = width >= BREAKPOINTS.tablet

      setState({
        isMobile,
        isTablet,
        isDesktop,
        isTouch,
        width,
        height,
      })
    }

    // Initial check
    updateState()

    // Requirement 8.4: Listen for resize events with debouncing
    let timeoutId: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(updateState, 150)
    }

    window.addEventListener("resize", handleResize, { passive: true })
    
    // Also listen for orientation changes on mobile
    window.addEventListener("orientationchange", updateState, { passive: true })

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", updateState)
    }
  }, [])

  return state
}

/**
 * Hook for detecting specific breakpoint
 */
export function useBreakpoint(breakpoint: keyof typeof BREAKPOINTS): boolean {
  const { width } = useResponsive()
  return width >= BREAKPOINTS[breakpoint]
}

/**
 * Hook for detecting if device is touch-enabled
 */
export function useTouch(): boolean {
  const { isTouch } = useResponsive()
  return isTouch
}
