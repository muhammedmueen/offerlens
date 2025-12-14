"use client"

import { useRef, type ReactNode } from "react"
import { motion, useScroll, useTransform } from "framer-motion"

interface ParallaxSectionProps {
  children: ReactNode
  className?: string
  speed?: number
  direction?: "up" | "down"
}

export function ParallaxSection({ children, className, speed = 0.5, direction = "up" }: ParallaxSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const multiplier = direction === "up" ? -1 : 1
  const y = useTransform(scrollYProgress, [0, 1], [100 * speed * multiplier, -100 * speed * multiplier])

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  )
}

// Floating element with parallax and subtle rotation
export function FloatingElement({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      animate={{
        y: [0, -15, 0],
        rotate: [0, 2, 0],
      }}
      transition={{
        duration: 6,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
