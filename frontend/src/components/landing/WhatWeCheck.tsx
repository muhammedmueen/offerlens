import { ShieldCheck, Scale, FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AnnotationRule from "@/components/motion/AnnotationRule";

/**
 * Landing Section C — "What we check / honesty". Six category cards (the clauses) plus the
 * honesty promise strip. Reuses the §7 Card recipe, the accent left-rule / `.in-focus` motif
 * and lucide icons. Purely presentational.
 */
const categories: { title: string; body: string }[] = [
  { title: "Non-compete clauses", body: "How long, how broad, and whether it's paid." },
  { title: "Service bonds", body: "Lock-in periods and the money you'd owe to leave." },
  { title: "Clawback terms", body: "Bonuses or relocation you may have to repay." },
  { title: "Broad IP assignment", body: "Whether side projects and prior work are swept in." },
  { title: "Probation terms", body: "Length, notice period, and what's withheld during it." },
  { title: "Vague compensation", body: "\u201cVariable\u201d, \u201cnotional\u201d or TBD pay with no numbers." },
];

const promises: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ShieldCheck, title: "Nothing fabricated", body: "If we can't read it, we say so." },
  { icon: Scale, title: "A deterministic score", body: "Same letter in, same 0–100 out." },
  { icon: FlaskConical, title: "Modelled isn't verified", body: "Estimates stay labelled, always." },
];

const WhatWeCheck = () => (
  <section className="py-16 lg:py-24">
    <div className="container mx-auto max-w-6xl px-4 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// 03 — what we check</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
        The clauses most people skim past
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ title, body }) => (
          <div key={title} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-medium text-stone-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-700">{body}</p>
          </div>
        ))}
      </div>

      {/* Honesty promise strip — accent left rule + `.in-focus` wash. */}
      <div className="mt-6 rounded-2xl border border-stone-200 border-l-4 border-l-cyan-700 bg-white p-6 shadow-sm in-focus">
        <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// our promise</p>
        {/* Moment 5: the annotation rule draws in under the promise label on reveal. */}
        <AnnotationRule className="mt-1.5 w-16" />
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {promises.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-stone-900">{title}</p>
                <p className="mt-0.5 text-sm text-stone-700">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default WhatWeCheck;
