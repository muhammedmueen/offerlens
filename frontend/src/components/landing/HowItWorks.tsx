import { Upload, ScanSearch, Gauge } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Landing Section A — "How it works". Three equal cards reusing the §7 Card recipe; step 02
 * carries the `.in-focus` lens treatment (the examination motif). Purely presentational: no
 * data fetching, no API. Icon tiles are decorative (aria-hidden); the steps are real text.
 */
const steps: { n: string; title: string; body: string; icon: LucideIcon; focus?: boolean }[] = [
  { n: "01", title: "Drop the letter", body: "A PDF, a photo, or pasted text. Up to 10 MB. No signup to start.", icon: Upload },
  { n: "02", title: "We examine it", body: "We read it line by line, flag the clauses, and model the pay.", icon: ScanSearch, focus: true },
  { n: "03", title: "You get a verdict", body: "A deterministic 0–100 score, the flags, and what to ask for.", icon: Gauge },
];

const HowItWorks = () => (
  <section className="py-16 lg:py-24">
    <div className="container mx-auto max-w-6xl px-4 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// 01 — how it works</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
        Three steps, no account needed
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map(({ n, title, body, icon: Icon, focus }) => (
          <div
            key={n}
            className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${focus ? "in-focus" : ""}`}
          >
            <p className="font-mono text-xs tracking-widest text-cyan-700">{n}</p>
            <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50">
              <Icon className="h-6 w-6 text-cyan-700" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-medium text-stone-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">{body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
