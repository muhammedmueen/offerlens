"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Upload, Cpu, FileCheck } from "lucide-react"
import { IconContainer } from "@/components/ui/icon-container"

const steps = [
  {
    number: 1,
    icon: Upload,
    title: "Upload Your Offer",
    description: "Simply upload your offer letter or paste the text. We support PDF, DOC, and plain text formats.",
  },
  {
    number: 2,
    icon: Cpu,
    title: "AI Analysis",
    description: "Our AI scans the document, extracts key terms, and compares them against market data.",
  },
  {
    number: 3,
    icon: FileCheck,
    title: "Get Insights",
    description: "Receive a detailed report with red flags, salary analysis, and negotiation recommendations.",
  },
]

export function HowItWorksSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="section-padding">
      <div className="mx-auto max-w-4xl px-4 sm:px-6" style={{ paddingInline: "var(--container-padding)" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-fluid-3xl font-bold sm:text-fluid-4xl">How it works</h2>
          <p className="mt-4 text-muted-foreground text-fluid-base">Get insights in three simple steps</p>
        </motion.div>

        {/* Steps */}
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: shouldReduceMotion ? 0.1 : 0.5,
                delay: shouldReduceMotion ? 0 : index * 0.15,
                ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
              }}
              className="relative text-center"
            >
              {/* Connector Line - Hidden on mobile */}
              {index < steps.length - 1 && (
                <div className="absolute top-12 left-[60%] hidden w-[80%] h-0.5 bg-border md:block overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{
                      duration: shouldReduceMotion ? 0.1 : 0.8,
                      delay: shouldReduceMotion ? 0 : index * 0.15 + 0.3,
                      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
                    }}
                    className="h-full gradient-primary"
                  />
                </div>
              )}

              {/* Step Number Badge */}
              <motion.div
                initial={{ scale: shouldReduceMotion ? 1 : 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  type: shouldReduceMotion ? "tween" : "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: shouldReduceMotion ? 0 : index * 0.15,
                }}
                className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full gradient-primary text-primary-foreground font-bold text-fluid-lg shadow-primary"
              >
                {step.number}
              </motion.div>

              {/* Icon */}
              <div className="flex justify-center mb-4">
                <IconContainer icon={step.icon} variant="default" size="lg" />
              </div>

              <h3 className="font-semibold text-fluid-lg mb-2">{step.title}</h3>
              <p className="text-fluid-sm text-muted-foreground" style={{ lineHeight: "var(--leading-relaxed)" }}>
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
