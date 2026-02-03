"use client"

import { Wallet } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"
import { Counter } from "@/components/animations/counter"

interface TakeHomeCardProps {
  takeHome: number
}

/**
 * Take-Home Card Component
 * 
 * Displays estimated take-home salary calculation
 * Requirements: 3.4
 */
export function TakeHomeCard({ takeHome }: TakeHomeCardProps) {
  const monthlyTakeHome = Math.round(takeHome / 12)

  return (
    <FloatingCard icon={Wallet} title="Estimated Take-Home Salary" delay={0.4}>
      <div className="text-center py-6">
        <div className="text-4xl mb-2">💰</div>
        <p className="text-sm text-muted-foreground mb-2">
          Monthly Take-Home (approx.)
        </p>
        <p className="text-4xl font-bold text-foreground">
          ₹
          <Counter end={monthlyTakeHome} duration={1.5} />
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Based on ~70% take-home ratio after deductions
        </p>
      </div>
    </FloatingCard>
  )
}
