import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuth } from "@/store/auth";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import GuestBanner from "@/components/common/GuestBanner";
import AuthGateModal from "@/components/common/AuthGateModal";
import ScoreGauge from "@/components/charts/ScoreGauge";
import SalaryBar from "@/components/charts/SalaryBar";
import BenchmarkNotice from "@/components/salary/BenchmarkNotice";
import ContributeSalaryCard from "@/components/salary/ContributeSalaryCard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, GitCompare, TrendingUp, Pencil, Share2, Lock, CheckCircle, ShieldQuestion, Flag, Info } from "lucide-react";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/common/ConfidenceBadge";
import Reveal from "@/components/motion/Reveal";
import { motion, useReducedMotion } from "framer-motion";
import { flagsContainer, flagItem } from "@/lib/motion";
import NegotiationPanel from "@/components/offers/NegotiationPanel";
import BenefitsPanel from "@/components/offers/BenefitsPanel";
import CareerPathPanel from "@/components/offers/CareerPathPanel";
import CorrectionsPanel from "@/components/offers/CorrectionsPanel";

type DrawerType = "negotiate" | "benefits" | "career" | "corrections" | null;

const ResultsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState("");
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const reduce = useReducedMotion() ?? false;

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => api.get(ENDPOINTS.OFFER_ANALYSIS(id!)).then((r) => r.data.data),
    enabled: !!id,
  });

  const requireAuth = (feature: string, drawer: DrawerType) => {
    if (!isAuthenticated) {
      setAuthGateFeature(feature);
      setAuthGateOpen(true);
    } else {
      setActiveDrawer(drawer);
    }
  };

  const handleDownload = async () => {
    if (!isAuthenticated) {
      setAuthGateFeature("PDF Download");
      setAuthGateOpen(true);
      return;
    }
    try {
      const res = await api.get(ENDPOINTS.OFFER_REPORT(id!), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `offerlens-report-${id}.pdf`;
      a.click();
    } catch { /* ignore */ }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  if (isLoading) return <PageShell><div className="container mx-auto max-w-4xl px-4 py-12"><LoadingState rows={5} /></div></PageShell>;
  if (error) return <PageShell><div className="container mx-auto max-w-4xl px-4 py-12"><ErrorState onRetry={() => refetch()} /></div></PageShell>;
  if (!analysis) return null;

  const a = analysis;

  // The API returns the domain shape: company/role/location live under extractedData,
  // and market percentiles under salaryComparison.marketRange. This page previously read
  // flat aliases (a.company, a.score, a.negotiationTips) that the server never sent, so
  // the header rendered placeholders and the negotiation section threw on undefined.
  const extracted = a.extractedData ?? {};
  const market = a.salaryComparison?.marketRange;
  const negotiationSuggestions = a.negotiationSuggestions ?? [];

  /** Confidence for one field, or null when there is nothing to say about it. */
  const confidenceFor = (
    key: string,
  ): { level: ConfidenceLevel; reason: string } | null => a.confidence?.fields?.[key] ?? null;

  const Confidence: React.FC<{ field: string; label: string }> = ({ field, label }) => {
    const c = confidenceFor(field);
    return c ? <ConfidenceBadge level={c.level} reason={c.reason} label={label} /> : null;
  };

  return (
    <PageShell>
      <div className="container mx-auto max-w-4xl px-4 py-8 pb-28 space-y-8">
        {!isAuthenticated && <GuestBanner expiresAt={a.expiresAt} />}

        {/* Anything limiting the whole analysis — a scanned source, or a letter we no longer
            hold to check values against. Above the score, because it qualifies everything
            below it. */}
        {a.confidence?.caveat && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm">
            <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <p className="text-foreground">{a.confidence.caveat}</p>
          </div>
        )}

        {/* Reads the backend's verdict rather than re-deriving one. This was
            `ocrConfidence < 0.7`, a second threshold for the same idea that disagreed with the
            backend's OCR_MIN_CONFIDENCE of 0.6 — so a 0.65 scan was flagged here and treated as
            fine by the server. One owner now; the percentage is still shown because it is the
            detail a user can act on. */}
        {a.lowConfidence && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <p className="text-foreground">
              We had trouble reading parts of your offer
              {typeof a.ocrConfidence === "number"
                ? ` (${Math.round(a.ocrConfidence * 100)}% text-recognition confidence)`
                : ""}
              . It was analysed anyway, but check the values against your letter — especially the
              numbers.
            </p>
          </div>
        )}

        {/* Score Header — the verdict, the signature of the results page (spec §7).
            Moment 4: reveals on scroll (fires at once — it's above the fold); the gauge's own
            arc-sweep + count-up (Moment 1) plays within it. */}
        <Reveal className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-md in-focus md:flex-row md:items-start md:gap-8">
          <ScoreGauge score={a.score ?? 0} />
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-wrap items-baseline justify-center gap-2 md:justify-start">
              <h1 className="text-xl font-bold text-foreground">{extracted.companyName || "Company"}</h1>
              <Confidence field="companyName" label="Company name" />
            </div>
            <div className="flex flex-wrap items-baseline justify-center gap-2 md:justify-start">
              <p className="text-muted-foreground">
                {extracted.role || "Role"}{extracted.location ? ` · ${extracted.location}` : ""}
              </p>
              <Confidence field="role" label="Job title" />
            </div>
            {a.scoreLabel && (
              <p className="mt-1 text-sm font-medium capitalize text-foreground">{a.scoreLabel}</p>
            )}
            {/* The rubric's own note when a weight was redistributed. Falls back to the generic
                line for analyses stored before task 10, which have no breakdown. */}
            {a.scoringMethod === "fallback" && (
              <p className="mt-2 text-xs text-muted-foreground italic">
                {a.scoreNote ?? "Estimated score — limited market data"}
              </p>
            )}
          </div>
        </Reveal>

        {/* How the score was reached.
            A score with no explanation is an assertion. Each row shows the component's own
            0-100 mark and the weight actually applied — which shifts when a component has no
            data, so the weights are read from the response rather than hardcoded here. */}
        {a.scoreBreakdown?.length > 0 && (
          <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold mb-4 text-foreground">How this score was reached</h2>
            <ul className="space-y-3">
              {a.scoreBreakdown.map(
                (c: { key: string; label: string; value: number | null; weight: number; note: string }) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{c.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {c.value === null ? "not scored" : `${c.value}/100`}
                        {c.weight > 0 && (
                          <span className="ml-2 text-xs">· {c.weight}% of total</span>
                        )}
                      </span>
                    </div>
                    {c.value !== null && (
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={c.value}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${c.label}: ${c.value} out of 100`}
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${c.value}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>
                  </li>
                ),
              )}
            </ul>
          </Reveal>
        )}

        {/* Salary Comparison */}
        {market && (
          <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-foreground">Salary Comparison</h2>
              <Confidence field="salaryComparison" label="Salary benchmark" />
            </div>
            <SalaryBar
              p25={market.p25}
              p50={market.p50}
              p75={market.p75}
              p90={market.p90}
              userSalary={extracted.compensation?.totalCTC ?? undefined}
              hideOffer={!!a.salaryComparison?.percentileWithheld}
              label={
                a.salaryComparison?.offerPercentile
                  ? `Your offer is at the ${a.salaryComparison.offerPercentile}th percentile`
                  : undefined
              }
            />
            <BenchmarkNotice
              dataSource={a.salaryComparison?.dataSource}
              sampleSize={a.salaryComparison?.sampleSize}
              disclaimer={a.salaryComparison?.disclaimer}
              payBasis={a.salaryComparison?.payBasis}
              payMix={a.salaryComparison?.payMix}
              cityAdjustment={a.salaryComparison?.cityAdjustment}
            />
          </Reveal>
        )}

        {/* Red Flags — Moment 4 wraps the section (reveal on scroll); Moment 2 staggers the
            items within it (each fades + rises ~70ms apart, severity rule settling in). */}
        <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-foreground">Red Flags</h2>
            <Confidence field="redFlags" label="Red flags" />
          </div>
          {a.redFlags?.length > 0 ? (
            <motion.div
              className="space-y-3"
              variants={flagsContainer(reduce)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {a.redFlags.map((rf: any, i: number) => {
                const severity = rf.severity?.toLowerCase();
                // Severity is carried by icon + WORD + a solid left rule, never colour alone
                // (spec §3.2 / §7). Low/info is stone, so green stays reserved for Verified.
                const SevIcon = severity === "high" ? Flag : severity === "medium" ? AlertTriangle : Info;
                const box =
                  severity === "high"
                    ? "border-stone-200 border-l-red-700 bg-red-50"
                    : severity === "medium"
                      ? "border-stone-200 border-l-amber-700 bg-amber-50"
                      : "border-stone-200 border-l-stone-700 bg-stone-100";
                const sevText =
                  severity === "high" ? "text-red-700" : severity === "medium" ? "text-amber-700" : "text-stone-700";
                return (
                  <motion.div key={i} variants={flagItem(reduce)} className={`rounded-xl border border-l-4 p-4 shadow-sm ${box}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <SevIcon className={`h-4 w-4 shrink-0 ${sevText}`} aria-hidden="true" />
                      <span className={`text-xs font-semibold uppercase ${sevText}`}>
                        {rf.severity}
                      </span>
                      <h3 className="font-medium text-sm text-foreground">{rf.title}</h3>
                    </div>
                    {rf.matchedText && <p className="font-mono text-xs text-stone-500 italic mb-1">"{rf.matchedText}"</p>}
                    <p className="text-sm text-stone-700">{rf.explanation}</p>
                    {rf.suggestion && (
                      <p className="mt-2 text-sm text-foreground"><span className="font-medium">Suggestion:</span> {rf.suggestion}</p>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" aria-hidden="true" />
              <p className="text-sm">No red flags detected — looks like a clean offer!</p>
            </div>
          )}
        </Reveal>

        {/* Negotiation.
            NEG-3: the generate affordance must show even with no tips — a thin-data offer still
            gets the backend's template email — so the button lives outside the tips length
            guard while the tips list stays gated on having something to list. */}
        <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold mb-4 text-foreground">Negotiation Tips</h2>
          {negotiationSuggestions.length > 0 ? (
            <ul className="space-y-3">
              {negotiationSuggestions.map((t: any, i: number) => (
                <li key={i} className="text-sm">
                  <p className="font-medium text-foreground">
                    {t.component}
                    {t.priority && (
                      <span className="ml-2 text-xs uppercase text-muted-foreground">{t.priority} priority</span>
                    )}
                  </p>
                  {t.suggestedAsk && (
                    <p className="text-muted-foreground">
                      Ask for <span className="text-foreground">{t.suggestedAsk}</span>
                      {t.currentValue ? ` (currently ${t.currentValue})` : ""}
                    </p>
                  )}
                  {t.rationale && <p className="text-xs text-muted-foreground">{t.rationale}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              We found no specific tips for this offer, but you can still generate a negotiation email.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-4 cursor-pointer rounded-md"
            onClick={() => requireAuth("Negotiation Scripts", "negotiate")}
          >
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            Generate Negotiation Email
          </Button>
        </Reveal>

        {/* Take-Home.
            Computed from published FY 2026-27 slabs by the backend, not guessed by the model.
            It reports a RANGE rather than one number when PF is uncertain, and lists what it
            assumed — both are shown, because a single figure here would be false precision. */}
        {a.takeHome && (
          <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-foreground">Estimated Take-Home</h2>
              <div className="flex items-baseline gap-3">
                <Confidence field="takeHome" label="Take-home estimate" />
                <span className="text-xs text-muted-foreground">
                  New regime · {a.takeHome.rulesVersion}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Per month</p>
              <p className="text-2xl font-bold text-foreground">
                {a.takeHome.isExact ? (
                  <>₹{a.takeHome.netMonthly.high.toLocaleString("en-IN")}</>
                ) : (
                  <>
                    ₹{a.takeHome.netMonthly.low.toLocaleString("en-IN")}
                    {" – "}
                    ₹{a.takeHome.netMonthly.high.toLocaleString("en-IN")}
                  </>
                )}
              </p>
              {!a.takeHome.isExact && (
                <p className="mt-1 text-xs text-muted-foreground">
                  A range, because PF depends on your employer&apos;s policy
                </p>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Gross (annual)", value: a.takeHome.tax.grossAnnual },
                { label: "Income tax", value: a.takeHome.tax.totalTax },
                {
                  label: "Employee PF",
                  value: a.takeHome.employeePf.statutoryMinimum,
                  absent: "Not stated",
                },
                {
                  label: "Effective tax rate",
                  text: `${(a.takeHome.tax.effectiveRate * 100).toFixed(1)}%`,
                },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {row.text ??
                      (typeof row.value === "number"
                        ? `₹${row.value.toLocaleString("en-IN")}`
                        : (row.absent ?? "—"))}
                  </dd>
                </div>
              ))}
            </dl>

            {a.takeHome.assumptions?.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  What this assumes ({a.takeHome.assumptions.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {a.takeHome.assumptions.map((note: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {note}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Reveal>
        )}

        {/* Benefits.
            The chip list shows what the letter names; the checklist below shows what a normal
            offer has that this one does not. The second half is the useful part, and it is
            computed by set difference on the server rather than guessed by the model. */}
        <Reveal as="section" className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-foreground">Benefits Overview</h2>
            <Confidence field="benefits" label="Benefits list" />
          </div>

          {a.benefits?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {a.benefits.map((b: any, i: number) => (
                <span key={i} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700">{b.name || b}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This offer names no benefits at all.</p>
          )}

          {a.benefitsChecklist && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Against a standard offer
                <span className="ml-2 font-normal text-muted-foreground">
                  {a.benefitsChecklist.corePresent} of {a.benefitsChecklist.core.length} essentials
                </span>
              </h3>

              <ul className="space-y-2">
                {[...a.benefitsChecklist.core, ...a.benefitsChecklist.notable].map(
                  (entry: { key: string; label: string; present: boolean; why?: string }) => (
                    <li key={entry.key} className="flex gap-2 text-sm">
                      {entry.present ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                      )}
                      <div>
                        <span className={entry.present ? "text-foreground" : "text-muted-foreground"}>
                          {entry.label}
                        </span>
                        <span className="sr-only">
                          {entry.present ? " — mentioned" : " — not mentioned"}
                        </span>
                        {entry.why && (
                          <p className="text-xs text-muted-foreground">{entry.why}</p>
                        )}
                      </div>
                    </li>
                  ),
                )}
              </ul>

              <p className="mt-3 text-xs text-muted-foreground">
                Absence here means the letter is silent, not that you definitely won&apos;t get
                it. Silent means set by policy later, so it is worth asking in writing.
              </p>
            </div>
          )}

          <Button
            variant="outline"
            className="mt-4 cursor-pointer rounded-md"
            onClick={() => requireAuth("Benefits Calculator", "benefits")}
          >
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            Calculate Full Benefits Value
          </Button>
        </Reveal>

        {/* 5.4: optional, per-offer; decides its own visibility. Never posts until Send. */}
        <Reveal>
          <ContributeSalaryCard key={id} offerId={id!} analysis={a} />
        </Reveal>
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/90 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-center gap-2 px-4 py-3 max-w-4xl flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownload} className="cursor-pointer rounded-md">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => (isAuthenticated ? navigate("/compare") : requireAuth("Compare Offers", null))} className="cursor-pointer rounded-md">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <GitCompare className="mr-1 h-4 w-4" /> Compare
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth("Career Path", "career")} className="cursor-pointer rounded-md">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <TrendingUp className="mr-1 h-4 w-4" /> Career
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth("Corrections", "corrections")} className="cursor-pointer rounded-md">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <Pencil className="mr-1 h-4 w-4" /> Correct
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare} className="cursor-pointer rounded-md">
            <Share2 className="mr-1 h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      {/* Drawers.
          Each panel is wrapped in its own ErrorBoundary. These render AI-derived JSON, so a
          missing field is a realistic failure — and without a boundary it took the whole
          results page down (a `skills.map()` on an absent field white-screened the app).
          Each SheetContent also carries a SheetDescription: Radix warns when DialogContent
          has no accessible description, and screen readers announced only the title. */}
      <Sheet open={activeDrawer === "negotiate"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Negotiation Script</SheetTitle>
            <SheetDescription>
              A ready-to-send email drafted from the gaps found in this offer.
            </SheetDescription>
          </SheetHeader>
          <ErrorBoundary title="Negotiation script unavailable">
            <NegotiationPanel offerId={id!} />
          </ErrorBoundary>
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "benefits"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Benefits Calculator</SheetTitle>
            <SheetDescription>
              What your non-cash benefits are worth. Adjust any amount and recalculate.
            </SheetDescription>
          </SheetHeader>
          <ErrorBoundary title="Benefits calculator unavailable">
            <BenefitsPanel offerId={id!} />
          </ErrorBoundary>
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "career"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Career Path</SheetTitle>
            <SheetDescription>
              A projected five-year trajectory for this role, with skills and next steps.
            </SheetDescription>
          </SheetHeader>
          <ErrorBoundary title="Career path unavailable">
            <CareerPathPanel offerId={id!} />
          </ErrorBoundary>
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "corrections"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Correct Data</SheetTitle>
            <SheetDescription>
              Fix anything the analysis got wrong. Your corrections help improve extraction.
            </SheetDescription>
          </SheetHeader>
          <ErrorBoundary title="Corrections unavailable">
            <CorrectionsPanel offerId={id!} />
          </ErrorBoundary>
        </SheetContent>
      </Sheet>

      <AuthGateModal open={authGateOpen} onOpenChange={setAuthGateOpen} featureName={authGateFeature} />
    </PageShell>
  );
};

export default ResultsPage;
