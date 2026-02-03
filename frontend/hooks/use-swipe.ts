"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Swipe Gesture Hook
 * 
 * Detects swipe gestures on touch devices
 * Requirement: 8.5 - Touch gesture support
 */

export interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

export interface SwipeOptions {
  threshold?: number // Minimum distance for swipe (default: 50px)
  timeout?: number // Maximum time for swipe (default: 300ms)
}

export function useSwipe(
  handlers: SwipeHandlers,
  options: SwipeOptions = {},
) {
  const { threshold = 50, timeout = 300 } = options
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    setIsSwiping(false)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!touchStart.current) return

    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.current.x)
    const deltaY = Math.abs(touch.clientY - touchStart.current.y)

    // If moved more than threshold, consider it a swipe
    if (deltaX > threshold || deltaY > threshold) {
      setIsSwiping(true)
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (!touchStart.current) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStart.current.x
    const deltaY = touch.clientY - touchStart.current.y
    const deltaTime = Date.now() - touchStart.current.time

    // Check if swipe was fast enough
    if (deltaTime > timeout) {
      touchStart.current = null
      setIsSwiping(false)
      return
    }

    // Determine swipe direction
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX > threshold || absY > threshold) {
      if (absX > absY) {
        // Horizontal swipe
        if (deltaX > 0) {
          handlers.onSwipeRight?.()
        } else {
          handlers.onSwipeLeft?.()
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          handlers.onSwipeDown?.()
        } else {
          handlers.onSwipeUp?.()
        }
      }
    }

    touchStart.current = null
    setIsSwiping(false)
  }

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    isSwiping,
  }
}

/**
 * Hook to attach swipe handlers to a ref element
 */
export function useSwipeRef<T extends HTMLElement>(
  handlers: SwipeHandlers,
  options?: SwipeOptions,
) {
  const ref = useRef<T>(null)
  const swipeHandlers = useSwipe(handlers, options)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    element.addEventListener("touchstart", swipeHandlers.onTouchStart, { passive: true })
    element.addEventListener("touchmove", swipeHandlers.onTouchMove, { passive: true })
    element.addEventListener("touchend", swipeHandlers.onTouchEnd, { passive: true })

    return () => {
      element.removeEventListener("touchstart", swipeHandlers.onTouchStart)
      element.removeEventListener("touchmove", swipeHandlers.onTouchMove)
      element.removeEventListener("touchend", swipeHandlers.onTouchEnd)
    }
  }, [swipeHandlers])

  return { ref, isSwiping: swipeHandlers.isSwiping }
}
