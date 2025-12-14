"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"

export function Footer() {
  const currentYear = new Date().getFullYear()
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.footer
      initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
      className="border-t bg-background"
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
        <p className="text-fluid-sm text-muted-foreground">&copy; {currentYear} OfferLens. All rights reserved.</p>
        <nav className="flex items-center gap-6" aria-label="Footer navigation">
          <Link
            href="/forum"
            className="text-fluid-sm text-muted-foreground transition-smooth hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            aria-label="Go to forum"
          >
            Forum
          </Link>
          <Link
            href="/feature-request"
            className="text-fluid-sm text-muted-foreground transition-smooth hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            aria-label="Submit feedback"
          >
            Feedback
          </Link>
        </nav>
      </div>
    </motion.footer>
  )
}
