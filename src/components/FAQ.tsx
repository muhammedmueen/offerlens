import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Is my data safe and private?",
    answer:
      "Absolutely! All analysis happens directly in your browser. Your offer letter data never leaves your device and is not stored anywhere. We don't have servers that process or save your information.",
  },
  {
    question: "How accurate is the salary comparison?",
    answer:
      "Our salary data is based on industry research and covers major roles across different experience levels. While it provides a solid benchmark, actual salaries can vary based on company size, location, and specific skills. Use it as a starting point for your negotiations.",
  },
  {
    question: "What red flags does OfferLens detect?",
    answer:
      "We scan for common concerning clauses including training bonds, non-compete agreements, bonus clawback clauses, extended notice periods (90+ days), high variable pay components, and inflated CTC structures with excessive reimbursements.",
  },
  {
    question: "Does this use AI to analyze my offer?",
    answer:
      "No, OfferLens uses rule-based analysis, not AI. This means consistent, predictable results every time. We pattern-match against known red flag keywords and compare your salary against our curated market data.",
  },
  {
    question: "Can I analyze offers for any job role?",
    answer:
      "Currently, we support Software Engineer, Data Analyst, UI/UX Designer, Product Manager, DevOps Engineer, Marketing Executive, Business Analyst, and HR Manager roles across multiple experience levels and major cities.",
  },
  {
    question: "Is OfferLens free to use?",
    answer:
      "Yes, OfferLens is completely free. You can analyze as many offer letters as you want without any cost or registration.",
  },
];

export function FAQ() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 sm:mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Everything you need to know about OfferLens
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-border rounded-xl px-4 sm:px-6 bg-card"
              >
                <AccordionTrigger className="text-left text-sm sm:text-base hover:no-underline py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
