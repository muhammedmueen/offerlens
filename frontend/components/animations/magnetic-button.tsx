"use client"

import type React from "react"
import { useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"

interface MagneticButtonProps {
  children: ReactNode
  className?: string
  strength?: number
}

export function MagneticButton({ children, className, strength = 0.3 }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const shouldReduceMotion = useReducedMotion()

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current || shouldReduceMotion) return

    const { left, top, width, height } = ref.current.getBoundingClientRect()
    const x = (e.clientX - left - width / 2) * strength
    const y = (e.clientY - top - height / 2) * strength

    setPosition({ x, y })
  }

  const reset = () => setPosition({ x: 0, y: 0 })

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{
        type: "spring",
        stiffness: 150,
        damping: 15,
        mass: 0.1,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
