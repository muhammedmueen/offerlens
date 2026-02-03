"use client"

import { FileText } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"

interface OfferSummaryCardProps {
  offerText: string
  role: string
  experience: string
  city: string
  ctc: number
}

/**
 * Offer Summary Card Component
 * 
 * Displays extracted offer information
 * Requirements: 3.1
 */
export function OfferSummaryCard({ offerText, role, experience, city, ctc }: OfferSummaryCardProps) {
  return (
    <FloatingCard icon={FileText} title="Extracted Offer Summary" delay={0.1}>
      <div className="space-y-3">
        {/* Key Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Role</p>
            <p className="font-medium">{role}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Experience</p>
            <p className="font-medium">{experience}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Location</p>
            <p className="font-medium">{city}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">CTC</p>
            <p className="font-medium">₹{ctc.toLocaleString()} LPA</p>
          </div>
        </div>

        {/* Full Offer Text */}
        {offerText && (
          <>
            <div className="border-t" />
            <div className="max-h-[200px] overflow-y-auto rounded-lg bg-secondary/50 p-4 text-sm">
              <pre className="whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed">
                {offerText}
              </pre>
            </div>
          </>
        )}
      </div>
    </FloatingCard>
  )
}
