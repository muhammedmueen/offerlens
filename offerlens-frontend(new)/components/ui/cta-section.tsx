"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MagneticButton } from "@/components/animations/magnetic-button"

interface CTASectionProps {
  headline: string
  subtext: string
  buttonText: string
  buttonHref: string
}

export function CTASection({ headline, subtext, buttonText, buttonHref }: CTASectionProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="bg-secondary/50 section-padding">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6" style={{ paddingInline: "var(--container-padding)" }}>
        <motion.h2
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="text-fluid-3xl font-bold tracking-tight sm:text-fluid-4xl text-balance"
        >
          {headline}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="mt-4 text-muted-foreground text-balance text-fluid-base"
          style={{ lineHeight: "var(--leading-relaxed)" }}
        >
          {subtext}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.2, duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="mt-8"
        >
          <MagneticButton>
            <Link href={buttonHref}>
              <Button size="lg" className="gap-2 shadow-primary transition-smooth hover:shadow-primary-lg">
                {buttonText}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  )
}
