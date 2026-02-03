"use client"

import { AlertTriangle, CheckCircle } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"
import { RedFlagCard } from "@/components/ui/red-flag-card"
import type { DetectedRedFlag } from "@/lib/api/types"

interface RedFlagsCardProps {
  redFlags: DetectedRedFlag[]
}

/**
 * Map API severity to UI severity
 * Requirements: 3.1
 */
const mapSeverity = (severity: 'high' | 'medium' | 'low'): 'destructive' | 'warning' | 'caution' => {
  switch (severity) {
    case 'high':
      return 'destructive'
    case 'medium':
      return 'warning'
    case 'low':
      return 'caution'
    default:
      return 'caution'
  }
}

/**
 * Red Flags Card Component
 * 
 * Displays detected red flags from offer analysis
 * Requirements: 3.1, 3.5
 */
export function RedFlagsCard({ redFlags }: RedFlagsCardProps) {
  return (
    <FloatingCard icon={AlertTriangle} title="Red Flag Scanner" delay={0.2}>
      {redFlags.length > 0 ? (
        <div className="space-y-3">
          {redFlags.map((flag, index) => (
            <RedFlagCard
              key={flag.id}
              title={flag.title}
              description={flag.description}
              severity={mapSeverity(flag.severity)}
              delay={0.3 + index * 0.1}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-success-soft/50 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-success" />
          <p className="font-medium text-sm text-success">
            No red flags detected in your offer letter!
          </p>
        </div>
      )}
    </FloatingCard>
  )
}
