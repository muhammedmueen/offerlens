import { Flag, AlertTriangle, Info, FlaskConical, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ScoreGauge from "@/components/charts/ScoreGauge";
import { ODBL_URL, SO_SURVEY_URL } from "@/constants/attribution";

/**
 * Landing Section B — "A sample result". A self-contained, OBVIOUSLY-EXAMPLE verdict that reuses
 * the LOOK of ScoreGauge, the ResultsPage red-flag item recipe and the BenchmarkNotice
 * public_survey (Modelled) branch — but is NOT wired to the API. Every number here is static
 * demo data, flagged by the "EXAMPLE ANALYSIS · sample data" badge, so it can never be mistaken
 * for a real or fabricated analysis (spec §2.1). Honest treatment is preserved verbatim: the
 * salary carries the dashed-violet Modelled treatment and the exact disclaimer string.
 */

// ponytail: a hardcoded demo object, not the live offer type — the sample must never import live
// analysis types or call the API. Shape kept minimal to render the recipe looks only.
const flags: { severity: "HIGH" | "MEDIUM" | "LOW"; word: string; icon: LucideIcon; box: string; text: string; title: string; quote: string; ask: string }[] = [
  {
    severity: "HIGH", word: "Red flag", icon: Flag,
    box: "border-stone-200 border-l-red-700 bg-red-50", text: "text-red-700",
    title: "Non-compete, 12 months, no carve-out",
    quote: "…shall not join any competing business…",
    ask: "a shorter term or garden-leave pay.",
  },
  {
    severity: "MEDIUM", word: "Check this", icon: AlertTriangle,
    box: "border-stone-200 border-l-amber-700 bg-amber-50", text: "text-amber-700",
    title: "6-month probation, benefits \u201cTBD\u201d",
    quote: "Benefits and leave policy to be confirmed…",
    ask: "benefits in writing before you sign.",
  },
  {
    severity: "LOW", word: "Note", icon: Info,
    box: "border-stone-200 border-l-stone-700 bg-stone-100", text: "text-stone-700",
    title: "ESOP described as \u201cnotional\u201d",
    quote: "…a notional grant of equity options…",
    ask: "strike price, vesting and total shares.",
  },
];

const breakdown: { label: string; pct: number; bar: string }[] = [
  { label: "Pay vs market", pct: 78, bar: "bg-green-700" },
  { label: "Clause risk", pct: 55, bar: "bg-amber-700" },
  { label: "Clarity", pct: 82, bar: "bg-green-700" },
];

const LINK =
  "underline underline-offset-2 text-cyan-700 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700";

const SampleResult = () => (
  <section className="py-16 lg:py-24">
    <div className="container mx-auto max-w-6xl px-4 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// 02 — a sample result</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          What a verdict looks like
        </h2>
        {/* Makes it unmistakable this is a demo, not a real/fabricated analysis (spec §2.1). */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-violet-300 bg-violet-50 px-2.5 py-1 font-mono text-xs uppercase tracking-wide text-violet-700">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          Example analysis · sample data
        </span>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Verdict card — reuses the ScoreGauge look (single solid band). */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm in-focus">
          <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">The verdict</p>
          <p className="mt-1.5 text-sm text-stone-700">Senior Backend Engineer · Bengaluru</p>

          <div className="mt-4 flex items-center gap-6">
            <ScoreGauge score={73} size={140} />
            <div>
              <p className="text-lg font-medium text-stone-900">decent, with caveats</p>
              <p className="mt-1 font-mono text-xs text-stone-500">// deterministic score</p>
            </div>
          </div>

          {/* Breakdown bars so the band never relies on colour alone. */}
          <dl className="mt-6 space-y-3">
            {breakdown.map(({ label, pct, bar }) => (
              <div key={label} className="grid grid-cols-[1fr_auto] items-baseline text-sm">
                <dt className="text-stone-700">{label}</dt>
                <dd className="font-mono tabular-nums text-stone-500">{pct}</dd>
                <dd aria-hidden="true" className="col-span-2 mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Red flags — reuses the ResultsPage recipe (border-l-4, icon + severity WORD). */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-stone-900">Red flags</h3>
          <div className="mt-4 space-y-3">
            {flags.map(({ severity, word, icon: Icon, box, text, title, quote, ask }) => (
              <div key={severity} className={`rounded-xl border border-l-4 p-4 shadow-sm ${box}`}>
                <div className="mb-1 flex items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${text}`} aria-hidden="true" />
                  <span className={`text-xs font-semibold uppercase ${text}`}>{severity} · {word}</span>
                </div>
                <h4 className="text-sm font-medium text-stone-900">{title}</h4>
                <p className="mt-1 font-mono text-xs italic text-stone-500">{quote}</p>
                <p className="mt-1 text-sm text-stone-700"><span className="font-medium">Ask for:</span> {ask}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modelled salary — reuses the BenchmarkNotice public_survey (Modelled) treatment:
          violet-700 text, dashed violet top rule, literal "Modelled", exact disclaimer. */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-stone-900">Salary benchmark</h3>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm text-stone-700">
            <span>Offer at <span className="font-mono tabular-nums font-medium text-stone-900">p60</span></span>
            <span className="font-mono tabular-nums text-stone-900">₹24L – ₹31L p.a.</span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-stone-100" aria-hidden="true">
            <div className="absolute left-0 top-0 h-full w-[60%] rounded-l-full bg-cyan-700/30" />
            <div className="absolute left-[60%] top-[-3px] h-[14px] w-1 -translate-x-1/2 rounded-full bg-cyan-700" />
          </div>
        </div>

        <aside
          aria-label="Salary benchmark source"
          className="mt-4 space-y-1 border-t border-dashed border-violet-200 pt-3 text-sm text-stone-700"
        >
          <p className="flex items-center gap-1.5 font-medium text-violet-700">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-wide">Modelled</span>
            <Globe className="h-4 w-4" aria-hidden="true" />
            Public survey, India-wide
          </p>
          <p>Modelled from public surveys, not offers in your city. n = 39 respondents.</p>
          <p>
            Contains information from the{" "}
            <a href={SO_SURVEY_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              Stack Overflow Developer Survey 2025
            </a>{" "}
            (Stack Exchange Inc.), made available under the{" "}
            <a href={ODBL_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open Database License (ODbL)
            </a>.
          </p>
        </aside>
      </div>
    </div>
  </section>
);

export default SampleResult;
