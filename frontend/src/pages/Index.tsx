import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/layout/PageShell";
import { ArrowRight, Check, FlaskConical } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import Reveal from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import OfferUnderExamination from "@/components/landing/OfferUnderExamination";
import HowItWorks from "@/components/landing/HowItWorks";
import SampleResult from "@/components/landing/SampleResult";
import WhatWeCheck from "@/components/landing/WhatWeCheck";
import ClosingCta from "@/components/landing/ClosingCta";

// The landing hero realises the approved concept in .agents/tasks/offerlens-landing-hero.svg:
// an offer letter under examination (copy-left, document-right), honest machine copy, one CTA.
// Not the generic centered-headline template. Copy is the H1/subhead/sub-promises verbatim
// from the approved hero; the document illustration is decorative (aria-hidden) with the real
// verdict spoken by the surrounding text.

const subPromises = ["No signup to get your score", "We flag what, and quote why"];

// Reduced motion → opacity only, instant (no rise, no stagger), matching sectionEnter.
const fadeUp = (reduce: boolean): Variants =>
  reduce
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0 } } }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: (i: number) => ({
          opacity: 1,
          y: 0,
          transition: { delay: i * 0.08, duration: 0.5, ease: EASE },
        }),
      };

// The four approved sections below the hero. Each reveals once on scroll via the shared Reveal
// (calm, consistent fade + rise). Reduced motion is honoured inside Reveal.
const sections = [HowItWorks, SampleResult, WhatWeCheck, ClosingCta];

const LandingPage = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const heroItem = fadeUp(reduce);

  return (
    <PageShell>
      <section className="relative overflow-hidden bg-graph">
        <div className="container mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          {/* Copy + CTA */}
          <motion.div initial="hidden" animate="visible">
            <motion.p custom={0} variants={heroItem} className="font-mono text-xs uppercase tracking-widest text-cyan-700">
              // a lens on your offer
            </motion.p>

            <motion.h1
              custom={1}
              variants={heroItem}
              className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl"
            >
              Is this offer actually <span className="text-cyan-700">good?</span>
            </motion.h1>

            <motion.p custom={2} variants={heroItem} className="mt-5 max-w-xl text-base leading-relaxed text-stone-700 sm:text-lg">
              We read the letter line by line — real salary benchmarks, the red flags most
              people miss, and a deterministic 0–100 score. Nothing fabricated.
            </motion.p>

            <motion.ul custom={3} variants={heroItem} className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-6">
              {subPromises.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-50">
                    <Check className="h-3 w-3 text-green-700" aria-hidden="true" />
                  </span>
                  {p}
                </li>
              ))}
            </motion.ul>

            <motion.div custom={4} variants={heroItem} className="mt-8">
              <Button
                onClick={() => navigate("/upload")}
                className="h-11 rounded-md bg-cyan-700 px-6 text-base font-medium text-white hover:bg-cyan-800 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Drop or paste your offer
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
              <p className="mt-4 font-mono text-xs text-stone-500">
                // pdf, image, or paste the text · up to 10 MB
              </p>
            </motion.div>

            {/* Modelled-not-verified honesty chip (dashed violet .estimate treatment). */}
            <motion.div
              custom={5}
              variants={heroItem}
              className="mt-8 flex max-w-md items-start gap-3 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4"
            >
              <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-violet-700">Modelled numbers stay labelled.</p>
                <p className="mt-0.5 text-sm text-stone-700">
                  We never dress an estimate up as a verified figure.
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* The offer under examination (decorative illustration). */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.2, ease: EASE }}
            className="hidden lg:block"
          >
            <OfferUnderExamination />
          </motion.div>
        </div>
      </section>

      {/* The four approved sections below the hero. Each reveals once on scroll, consistently. */}
      {sections.map((Section, i) => (
        <Reveal key={i}>
          <Section />
        </Reveal>
      ))}
    </PageShell>
  );
};

export default LandingPage;
