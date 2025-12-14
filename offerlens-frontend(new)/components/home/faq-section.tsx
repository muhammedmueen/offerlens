"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
  {
    question: "Is my offer letter data secure?",
    answer:
      "Absolutely. We use bank-level encryption and never store your documents permanently. Your data is processed in real-time and deleted immediately after analysis.",
  },
  {
    question: "How accurate is the market salary comparison?",
    answer:
      "Our salary data is sourced from multiple industry databases and updated regularly. We factor in role, experience level, location, and company size for the most accurate comparison.",
  },
  {
    question: "What file formats do you support?",
    answer:
      "We support PDF, DOC, DOCX, and plain text formats. You can also paste the offer letter content directly if you don't have a file.",
  },
  {
    question: "Can I use OfferLens for international offers?",
    answer:
      "Yes! We support offers from multiple countries and currencies. Our market data covers major job markets globally.",
  },
  {
    question: "How long does the analysis take?",
    answer:
      "Most analyses are completed within 30 seconds. Complex documents with multiple pages may take slightly longer.",
  },
  {
    question: "Is there a limit to how many offers I can analyze?",
    answer:
      "Currently, the service is free to use with no limits. We may introduce premium features in the future for power users.",
  },
]

export function FAQSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="section-padding">
      <div className="mx-auto max-w-2xl px-4 sm:px-6" style={{ paddingInline: "var(--container-padding)" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="text-fluid-3xl font-bold sm:text-fluid-4xl">Frequently Asked Questions</h2>
          <p className="mt-4 text-muted-foreground text-fluid-base">Everything you need to know about OfferLens</p>
        </motion.div>

        {/* Accordion */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: shouldReduceMotion ? 0.1 : 0.5 }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-fluid-base hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent
                  className="text-muted-foreground text-fluid-sm"
                  style={{ lineHeight: "var(--leading-relaxed)" }}
                >
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}
