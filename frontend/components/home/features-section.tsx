"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Shield, TrendingUp, MessageSquareText, FileSearch, Calculator, Target } from "lucide-react"
import { FloatingCard } from "@/components/ui/floating-card"
import { IconContainer } from "@/components/ui/icon-container"

const features = [
  {
    icon: FileSearch,
    title: "Smart Extraction",
    description: "AI automatically extracts key details like salary, benefits, and terms from your offer letter.",
  },
  {
    icon: Shield,
    title: "Red Flag Detection",
    description: "Identify concerning clauses, hidden restrictions, and potential deal-breakers instantly.",
  },
  {
    icon: TrendingUp,
    title: "Market Comparison",
    description: "See how your offer stacks up against market rates for your role, experience, and location.",
  },
  {
    icon: Calculator,
    title: "Take-Home Calculator",
    description: "Get an accurate estimate of your actual take-home pay after taxes and deductions.",
  },
  {
    icon: MessageSquareText,
    title: "Negotiation Scripts",
    description: "Receive personalized talking points and email templates to negotiate effectively.",
  },
  {
    icon: Target,
    title: "Priority Insights",
    description: "Know exactly which terms to focus on and what improvements to request first.",
  },
]

export function FeaturesSection() {
  const shouldReduceMotion = useReducedMotion()

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.1 : 0.5,
        ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
      },
    },
  }

  return (
    <section id="features" className="bg-secondary/30 py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8" style={{ paddingInline: "var(--container-padding)" }}>
        {/* Header - Requirement 8.1, 8.2, 8.3: Responsive spacing */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="text-center mb-8 sm:mb-10 md:mb-12"
        >
          <h2 className="text-fluid-3xl font-bold sm:text-fluid-4xl text-balance">
            Everything you need to evaluate your offer
          </h2>
          <p
            className="mt-4 text-muted-foreground max-w-2xl mx-auto text-fluid-base"
            style={{ lineHeight: "var(--leading-relaxed)" }}
          >
            Our AI analyzes every aspect of your job offer to give you the complete picture.
          </p>
        </motion.div>

        {/* Features Grid - Requirement 8.1, 8.2, 8.3: Responsive grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <FloatingCard className="h-full">
                <IconContainer icon={feature.icon} variant="primary" size="lg" className="mb-4" />
                <h3 className="font-semibold text-fluid-lg mb-2">{feature.title}</h3>
                <p className="text-fluid-sm text-muted-foreground" style={{ lineHeight: "var(--leading-relaxed)" }}>
                  {feature.description}
                </p>
              </FloatingCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
