"use client"

import { motion } from "framer-motion"
import { useAnimations } from "@/hooks/use-animations"
import type { ReactNode } from "react"

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  delay?: number
  variant?: "fadeUp" | "fadeIn" | "scaleIn" | "slideInLeft" | "slideInRight"
}

/**
 * Scroll reveal component that animates elements when they come into view
 * Requirement 9.1: Home page load animations with staggered timing
 */
export function ScrollReveal({ 
  children, 
  className, 
  delay = 0,
  variant = "fadeUp" 
}: ScrollRevealProps) {
  const { variants, shouldReduceMotion } = useAnimations()

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={variants[variant]}
      transition={{
        delay: shouldReduceMotion ? 0 : delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
