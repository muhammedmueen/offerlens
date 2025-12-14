"use client"

import { motion } from "framer-motion"
import { ChevronUp, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FeatureRequestCardProps {
  id: string
  title: string
  description: string
  votes: number
  comments: number
  status: "planned" | "in-progress" | "completed" | "under-review"
  category: string
  onVote?: (id: string) => void
  hasVoted?: boolean
  delay?: number
}

const statusConfig = {
  planned: { label: "Planned", class: "bg-primary/10 text-primary" },
  "in-progress": { label: "In Progress", class: "bg-warning-soft text-warning" },
  completed: { label: "Completed", class: "bg-success-soft text-success" },
  "under-review": { label: "Under Review", class: "bg-secondary text-muted-foreground" },
}

export function FeatureRequestCard({
  id,
  title,
  description,
  votes,
  comments,
  status,
  category,
  onVote,
  hasVoted = false,
  delay = 0,
}: FeatureRequestCardProps) {
  const statusInfo = statusConfig[status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="flex gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      {/* Vote Button */}
      <div className="flex flex-col items-center">
        <Button
          variant={hasVoted ? "default" : "outline"}
          size="sm"
          className="h-auto flex-col gap-0.5 px-3 py-2"
          onClick={() => onVote?.(id)}
        >
          <ChevronUp className="h-4 w-4" />
          <span className="text-sm font-semibold">{votes}</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="font-semibold">{title}</h3>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.class)}>
            {statusInfo.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{description}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5">{category}</span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {comments}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
