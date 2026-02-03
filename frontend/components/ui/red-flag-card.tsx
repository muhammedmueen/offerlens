"use client"

import { motion } from "framer-motion"
import { AlertTriangle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export type Severity = "destructive" | "warning" | "caution"

interface RedFlagCardProps {
  title: string
  description: string
  severity: Severity
  delay?: number
}

// Requirement 10.5: Non-color indicators for color-coded information
const severityConfig = {
  destructive: {
    icon: AlertTriangle,
    badge: "High Risk",
    ariaLabel: "High severity red flag",
    containerClass: "border-l-destructive bg-destructive-soft/50",
    iconClass: "text-destructive",
    badgeClass: "bg-destructive text-destructive-foreground",
  },
  warning: {
    icon: AlertCircle,
    badge: "Medium Risk",
    ariaLabel: "Medium severity red flag",
    containerClass: "border-l-warning bg-warning-soft/50",
    iconClass: "text-warning",
    badgeClass: "bg-warning text-warning-foreground",
  },
  caution: {
    icon: Info,
    badge: "Low Risk",
    ariaLabel: "Low severity red flag",
    containerClass: "border-l-caution bg-caution-soft/50",
    iconClass: "text-caution",
    badgeClass: "bg-caution text-caution-foreground",
  },
}

export function RedFlagCard({ title, description, severity, delay = 0 }: RedFlagCardProps) {
  const config = severityConfig[severity]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className={cn("flex gap-4 rounded-lg border-l-4 p-4", config.containerClass)}
      role="alert"
      aria-label={config.ariaLabel}
    >
      {/* Requirement 10.5: Icon provides non-color indicator for severity */}
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", config.iconClass)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h4 className="font-semibold text-sm">{title}</h4>
          {/* Requirement 10.5: Text badge provides non-color indicator */}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", config.badgeClass)} aria-label={`Severity: ${config.badge}`}>
            {config.badge}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  )
}
