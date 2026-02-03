"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

type Priority = "high" | "medium" | "low"
type Category = "salary" | "benefits" | "growth" | "flexibility"

interface NegotiationCardProps {
  emoji: string
  title: string
  priority: Priority
  category: Category
  suggestion: string
  delay?: number
}

const priorityConfig = {
  high: {
    label: "High Priority",
    borderColor: "border-l-destructive",
    badgeClass: "bg-destructive text-destructive-foreground",
  },
  medium: {
    label: "Medium Priority",
    borderColor: "border-l-warning",
    badgeClass: "bg-warning text-warning-foreground",
  },
  low: {
    label: "Low Priority",
    borderColor: "border-l-muted",
    badgeClass: "bg-muted text-muted-foreground",
  },
}

const categoryLabels: Record<Category, string> = {
  salary: "Compensation",
  benefits: "Benefits",
  growth: "Career Growth",
  flexibility: "Flexibility",
}

export function NegotiationCard({ emoji, title, priority, category, suggestion, delay = 0 }: NegotiationCardProps) {
  const config = priorityConfig[priority]

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: -10, x: -20 }}
      whileInView={{ opacity: 1, rotateY: 0, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className={cn("rounded-lg border border-l-4 bg-card p-4", config.borderColor)}
    >
      <div className="flex gap-3">
        <span className="text-2xl" role="img" aria-hidden>
          {emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">{title}</h4>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", config.badgeClass)}>
              {config.label}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {categoryLabels[category]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{suggestion}</p>
        </div>
      </div>
    </motion.div>
  )
}
