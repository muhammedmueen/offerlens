"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface FloatingCardProps {
  children: ReactNode
  className?: string
  icon?: LucideIcon
  title?: string
  delay?: number
}

export function FloatingCard({ children, className, icon: Icon, title, delay = 0 }: FloatingCardProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: shouldReduceMotion ? 0.1 : 0.5,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
      }}
      whileHover={
        shouldReduceMotion
          ? {}
          : {
              y: -4,
              transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
            }
      }
      className={cn(
        "rounded-2xl border bg-card p-6 shadow-elevated transition-smooth",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      {(Icon || title) && (
        <div className="mb-4 flex items-center gap-3">
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary-subtle">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          {title && <h3 className="font-semibold text-fluid-lg">{title}</h3>}
        </div>
      )}
      {children}
    </motion.div>
  )
}
