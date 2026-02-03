/**
 * Responsive Design Tests
 * 
 * Tests for responsive design implementation
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { renderHook, act } from "@testing-library/react"
import { useResponsive, useBreakpoint, useTouch } from "@/hooks/use-responsive"
import { useSwipe } from "@/hooks/use-swipe"

describe("Responsive Design", () => {
  describe("useResponsive hook", () => {
    beforeEach(() => {
      // Use fake timers for debounce testing
      jest.useFakeTimers()
      
      // Reset window size
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1024,
      })
      Object.defineProperty(window, "innerHeight", {
        writable: true,
        configurable: true,
        value: 768,
      })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it("should detect desktop screen size", () => {
      window.innerWidth = 1280
      const { result } = renderHook(() => useResponsive())

      expect(result.current.isDesktop).toBe(true)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isMobile).toBe(false)
    })

    it("should detect tablet screen size", () => {
      window.innerWidth = 768
      const { result } = renderHook(() => useResponsive())

      expect(result.current.isTablet).toBe(true)
      expect(result.current.isDesktop).toBe(false)
      expect(result.current.isMobile).toBe(false)
    })

    it("should detect mobile screen size", () => {
      window.innerWidth = 375
      const { result } = renderHook(() => useResponsive())

      expect(result.current.isMobile).toBe(true)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isDesktop).toBe(false)
    })

    it("should update on window resize", () => {
      const { result } = renderHook(() => useResponsive())

      // Start at desktop
      window.innerWidth = 1280
      act(() => {
        window.dispatchEvent(new Event("resize"))
      })

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(200)
      })

      expect(result.current.isDesktop).toBe(true)

      // Resize to mobile
      window.innerWidth = 375
      act(() => {
        window.dispatchEvent(new Event("resize"))
      })

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(200)
      })

      expect(result.current.isMobile).toBe(true)
    })

    it("should detect touch capability", () => {
      // Mock touch support
      Object.defineProperty(window, "ontouchstart", {
        writable: true,
        configurable: true,
        value: {},
      })

      const { result } = renderHook(() => useResponsive())

      expect(result.current.isTouch).toBe(true)
    })
  })

  describe("useBreakpoint hook", () => {
    it("should detect mobile breakpoint", () => {
      window.innerWidth = 375
      const { result } = renderHook(() => useBreakpoint("mobile"))

      expect(result.current).toBe(false)
    })

    it("should detect tablet breakpoint", () => {
      window.innerWidth = 768
      const { result } = renderHook(() => useBreakpoint("tablet"))

      expect(result.current).toBe(false)
    })
  })

  describe("useTouch hook", () => {
    it("should detect touch devices", () => {
      Object.defineProperty(navigator, "maxTouchPoints", {
        writable: true,
        configurable: true,
        value: 5,
      })

      const { result } = renderHook(() => useTouch())

      expect(result.current).toBe(true)
    })
  })

  describe("useSwipe hook", () => {
    it("should detect swipe left", () => {
      const onSwipeLeft = jest.fn()
      const { result } = renderHook(() =>
        useSwipe({ onSwipeLeft }, { threshold: 50 }),
      )

      // Simulate touch start
      const touchStart = new TouchEvent("touchstart", {
        touches: [{ clientX: 200, clientY: 100 } as Touch],
      })
      result.current.onTouchStart(touchStart)

      // Simulate touch end (swipe left)
      const touchEnd = new TouchEvent("touchend", {
        changedTouches: [{ clientX: 100, clientY: 100 } as Touch],
      })
      result.current.onTouchEnd(touchEnd)

      expect(onSwipeLeft).toHaveBeenCalled()
    })

    it("should detect swipe right", () => {
      const onSwipeRight = jest.fn()
      const { result } = renderHook(() =>
        useSwipe({ onSwipeRight }, { threshold: 50 }),
      )

      // Simulate touch start
      const touchStart = new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      })
      result.current.onTouchStart(touchStart)

      // Simulate touch end (swipe right)
      const touchEnd = new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 100 } as Touch],
      })
      result.current.onTouchEnd(touchEnd)

      expect(onSwipeRight).toHaveBeenCalled()
    })

    it("should not trigger swipe if below threshold", () => {
      const onSwipeLeft = jest.fn()
      const { result } = renderHook(() =>
        useSwipe({ onSwipeLeft }, { threshold: 50 }),
      )

      // Simulate touch start
      const touchStart = new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      })
      result.current.onTouchStart(touchStart)

      // Simulate touch end (small movement)
      const touchEnd = new TouchEvent("touchend", {
        changedTouches: [{ clientX: 120, clientY: 100 } as Touch],
      })
      result.current.onTouchEnd(touchEnd)

      expect(onSwipeLeft).not.toHaveBeenCalled()
    })
  })
})
