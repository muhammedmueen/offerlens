"use client"

import { MessageSquareText } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"
import { NegotiationCard as NegotiationItem } from "@/components/ui/negotiation-card"
import type { NegotiationSuggestion } from "@/lib/api/types"

interface NegotiationBlueprintCardProps {
  suggestions: NegotiationSuggestion[]
}

/**
 * Map category to emoji
 */
const categoryEmojis: Record<string, string> = {
  salary: "💰",
  compensation: "💰",
  benefits: "🏥",
  flexibility: "📅",
  growth: "🚀",
  equity: "📈",
  default: "💡"
}

/**
 * Get emoji for category
 */
const getEmojiForCategory = (category: string): string => {
  const normalized = category.toLowerCase()
  return categoryEmojis[normalized] || categoryEmojis.default
}

/**
 * Map category string to valid category type
 */
const mapCategory = (category: string): 'salary' | 'benefits' | 'growth' | 'flexibility' => {
  const normalized = category.toLowerCase()
  if (normalized.includes('salary') || normalized.includes('compensation')) return 'salary'
  if (normalized.includes('benefit')) return 'benefits'
  if (normalized.includes('growth') || normalized.includes('career')) return 'growth'
  if (normalized.includes('flex') || normalized.includes('notice')) return 'flexibility'
  return 'benefits' // default
}

/**
 * Negotiation Blueprint Card Component
 * 
 * Displays actionable negotiation suggestions
 * Requirements: 3.3
 */
export function NegotiationBlueprintCard({ suggestions }: NegotiationBlueprintCardProps) {
  return (
    <FloatingCard icon={MessageSquareText} title="Negotiation Blueprint" delay={0.5}>
      <div className="space-y-3">
        {suggestions.map((item, index) => (
          <NegotiationItem
            key={item.id}
            emoji={getEmojiForCategory(item.category)}
            title={item.suggestion.split('.')[0]} // Use first sentence as title
            priority={item.priority}
            category={mapCategory(item.category)}
            suggestion={item.reasoning || item.suggestion}
            delay={0.6 + index * 0.1}
          />
        ))}
      </div>
    </FloatingCard>
  )
}
