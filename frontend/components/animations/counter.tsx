"use client"

import { useEffect, useRef, useState } from "react"
import { useInView } from "framer-motion"

interface CounterProps {
  end: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
  decimals?: number
}

export function Counter({ end, duration = 2, prefix = "", suffix = "", className, decimals = 0 }: CounterProps) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isInView || hasAnimated.current) return
    hasAnimated.current = true

    const startTime = Date.now()
    const endTime = startTime + duration * 1000

    const tick = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / (duration * 1000), 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(eased * end)

      if (now < endTime) {
        requestAnimationFrame(tick)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(tick)
  }, [isInView, end, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {count.toFixed(decimals)}
      {suffix}
    </span>
  )
}
