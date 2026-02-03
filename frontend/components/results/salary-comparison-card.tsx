"use client"

import { TrendingUp } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"
import { SalaryComparisonBar } from "@/components/ui/salary-comparison-bar"
import type { SalaryComparison } from "@/lib/api/types"

interface SalaryComparisonCardProps {
  salaryComparison: SalaryComparison
  offeredSalary: number
}

/**
 * Salary Comparison Card Component
 * 
 * Displays market salary comparison with visual indicators
 * Requirements: 3.2
 */
export function SalaryComparisonCard({ salaryComparison, offeredSalary }: SalaryComparisonCardProps) {
  return (
    <FloatingCard icon={TrendingUp} title="Market Salary Comparison" delay={0.3}>
      <SalaryComparisonBar 
        yourSalary={offeredSalary} 
        marketLow={salaryComparison.range.min} 
        marketMid={salaryComparison.range.avg} 
        marketHigh={salaryComparison.range.max} 
      />
    </FloatingCard>
  )
}
