"use client"

import { motion } from "framer-motion"
import { Counter } from "@/components/animations/counter"
import { cn } from "@/lib/utils"

interface SalaryComparisonBarProps {
  yourSalary: number
  marketLow: number
  marketMid: number
  marketHigh: number
  currency?: string
  className?: string
}

export function SalaryComparisonBar({
  yourSalary,
  marketLow,
  marketMid,
  marketHigh,
  currency = "₹",
  className,
}: SalaryComparisonBarProps) {
  // Calculate position (0-100%)
  const range = marketHigh - marketLow
  const position = Math.max(0, Math.min(100, ((yourSalary - marketLow) / range) * 100))

  // Determine if salary is below, within, or above market
  // Requirement 10.5: Non-color indicators for salary status
  const isBelow = yourSalary < marketLow
  const isAbove = yourSalary > marketHigh
  const status = isBelow ? "Below Market" : isAbove ? "Above Market" : "Within Market"
  const statusColor = isBelow ? "text-destructive" : isAbove ? "text-success" : "text-primary"
  const statusIcon = isBelow ? "↓" : isAbove ? "↑" : "•"

  const formatSalary = (value: number) => {
    if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`
    if (value >= 100000) return `${(value / 100000).toFixed(1)}L`
    return value.toLocaleString()
  }

  return (
    <div className={cn("space-y-4", className)} role="region" aria-label="Salary comparison visualization">
      {/* Metrics Grid - Requirement 8.1, 8.2: Responsive grid layout */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Market Low</p>
          <p className="text-sm sm:text-base font-semibold">
            {currency}
            {formatSalary(marketLow)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Market Mid</p>
          <p className="text-sm sm:text-base font-semibold">
            {currency}
            {formatSalary(marketMid)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Market High</p>
          <p className="text-sm sm:text-base font-semibold">
            {currency}
            {formatSalary(marketHigh)}
          </p>
        </div>
      </div>

      {/* Comparison Bar */}
      <div className="relative pt-6 pb-2">
        {/* Your salary indicator */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="absolute -top-1 flex flex-col items-center"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        >
          <div className="text-xs font-medium text-primary mb-1">Your Offer</div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent border-t-primary" />
        </motion.div>

        {/* Bar */}
        <div className="h-3 rounded-full bg-gradient-to-r from-destructive/20 via-warning/20 to-success/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${position}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>

      {/* Result Box - Requirement 8.1: Responsive text sizing */}
      <div className="rounded-lg bg-secondary/50 p-3 sm:p-4 text-center">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">Your Salary</p>
        <p className="text-xl sm:text-2xl font-bold" aria-label={`Your salary is ${currency}${formatSalary(yourSalary)}`}>
          {currency}
          <Counter end={yourSalary / 100000} decimals={1} suffix="L" />
        </p>
        {/* Requirement 10.5: Non-color indicator (icon) for salary status */}
        <p className={cn("text-xs sm:text-sm font-medium mt-1", statusColor)} aria-label={`Status: ${status}`}>
          <span aria-hidden="true">{statusIcon}</span> {status}
        </p>
      </div>
    </div>
  )
}
