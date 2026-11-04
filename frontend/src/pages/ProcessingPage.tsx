import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS, OFFER_STATUS, POLLING_INTERVAL_MS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import ErrorState from "@/components/common/ErrorState";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { useAuth } from "@/store/auth";

const STEPS = ["Uploading", "Reading Document", "Analyzing", "Scoring"];

const getStepIndex = (status: string) => {
  if (status === OFFER_STATUS.QUEUED) return 0;
  if (status === OFFER_STATUS.PROCESSING) return 2;
  if (status === OFFER_STATUS.COMPLETED) return 4;
  return -1;
};

// Analyses can take ~3 min (gemini-3.5-flash). Give up a bit past that so a genuinely slow
// run still finishes, but a wedged poll does not spin forever.
const MAX_POLL_SECONDS = 300; // 5 min

const ProcessingPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  // Moment 3: presentational motion only — the scan line + step animations read off the
  // existing stepIndex; the poll below is untouched. Reduced motion holds everything static.
  const reduce = useReducedMotion() ?? false;

  const { data, error, refetch } = useQuery({
    queryKey: ["offer-status", id],
    queryFn: () => api.get(ENDPOINTS.OFFER(id!)).then((r) => r.data.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop on a terminal state…
      if (status === OFFER_STATUS.COMPLETED || status === OFFER_STATUS.FAILED) {
        return false;
      }
      // …and stop on an errored poll. query.state.data is undefined on error, so the status
      // check above can never catch it — without this the 3s interval reschedules forever.
      if (query.state.status === "error") {
        return false;
      }
      return POLLING_INTERVAL_MS;
    },
    // This poll owns its cadence: a failed tick must wait for the next interval, not refire
    // ~1s later via the global retry:1 (which, with the old undefined-blind predicate, is what
    // produced the request storm). Scoped here so other pages keep the global default.
    retry: false,
    // Hard cap: once we've given up, the query is disabled so no further ticks fire.
    enabled: !!id && !gaveUp,
  });

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed((p) => {
        const next = p + 1;
        if (next >= MAX_POLL_SECONDS) setGaveUp(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.status === OFFER_STATUS.COMPLETED) {
      navigate(`/offers/${id}`, { replace: true });
    }
  }, [data?.status, id, navigate]);

  const stepIndex = data ? getStepIndex(data.status) : 1;

  // Parse failure reason for better UX
  const getErrorMessage = (failureReason?: string | null) => {
    if (!failureReason) return "Analysis failed. Please try again.";
    
    if (failureReason.startsWith('RATE_LIMIT:')) {
      return failureReason.replace('RATE_LIMIT: ', '');
    } else if (failureReason.startsWith('INVALID_REQUEST:')) {
      return failureReason.replace('INVALID_REQUEST: ', '');
    } else if (failureReason.startsWith('AI_ERROR:')) {
      return failureReason.replace('AI_ERROR: ', '');
    }
    
    return failureReason;
  };

  const isRateLimitError = data?.failureReason?.includes('RATE_LIMIT') || data?.failureReason?.includes('rate limit');

  if (data?.status === OFFER_STATUS.FAILED) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-lg px-4 py-24">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-md">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
                <AlertCircle className="h-8 w-8 text-red-700" />
              </div>
            </div>

            <h1 className="text-xl font-bold mb-3 text-foreground">
              {isRateLimitError ? "Rate Limit Exceeded" : "Analysis Failed"}
            </h1>

            <p className="text-muted-foreground mb-6">
              {getErrorMessage(data.failureReason)}
            </p>

            {isRateLimitError && (
              <div className="mb-6 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-left">
                <p className="font-medium mb-2">💡 Tips to avoid rate limits:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Wait 2-3 minutes before trying again</li>
                  {/* The model selector exists only in development builds (UploadPage). */}
                  {import.meta.env.DEV && (
                    <>
                      <li>Switch to a different AI model (e.g., gemini-flash-lite-latest)</li>
                      <li>Use the model selector in the upload form</li>
                    </>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => navigate("/upload")}
                className="cursor-pointer"
              >
                Try Again
              </Button>
              {isRateLimitError && import.meta.env.DEV && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/upload")}
                  className="cursor-pointer"
                >
                  Change Model
                </Button>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-lg px-4 py-24">
          <ErrorState message="Could not load status." onRetry={() => refetch()} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell hideFooter>
      <div className="bg-graph">
      <div className="container mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        {/* Examination motif (Moment 3): a document glyph with a thin cyan scan line sweeping
            it — the lens reading the letter. Decorative (aria-hidden); it is an indeterminate
            working indicator (same role as the spinner), stops when the page redirects, and is
            static under reduced motion. The existing spinner stays as the labelled fallback. */}
        <div className="relative mb-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-cyan-200 bg-cyan-50" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-cyan-700/60" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
            <path d="M14 3v4h4" strokeLinejoin="round" />
            <path d="M8.5 11h7M8.5 14h7M8.5 17h4" strokeLinecap="round" />
          </svg>
          {reduce ? (
            <span className="absolute left-2 right-2 top-1/2 h-px bg-cyan-700" />
          ) : (
            // ponytail: a single one-shot sweep on each step change (keyed on stepIndex), not a
            // repeat:Infinity loop — the continuous "still working" signal is the spinner beside
            // it. Known ceiling: the scan re-sweeps only when the stage advances, so a long
            // stall shows the spinner alone; upgrade path is a determinate sweep if per-stage
            // progress is ever emitted. Honours the no-loop constraint.
            <motion.span
              key={stepIndex}
              className="absolute left-2 right-2 h-px bg-cyan-700"
              initial={{ top: "18%", opacity: 0 }}
              animate={{ top: ["18%", "82%"], opacity: [0, 0.9, 0] }}
              transition={{ duration: 1.1, ease: "easeInOut" }}
            />
          )}
        </div>

        <h1 className="text-xl font-bold mb-2 text-foreground">Reading your offer…</h1>
        <p className="mb-6 font-mono text-xs text-stone-500">
          // usually 15–30s. gemini can take up to ~3 min on a busy day.
        </p>

        <div className="w-full space-y-3 mb-8">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            // Moment 3: a newly-active row lifts once (y 2→0, 0.25s); the icon swap
            // (ring → spinner → check) crossfades instead of popping. Reduced motion: no lift,
            // instant icon swap (the existing spinner pulse fallback is preserved below).
            return (
              <motion.div
                key={s}
                initial={false}
                animate={reduce ? { y: 0 } : { y: active ? [2, 0] : 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${active ? "border-cyan-200 bg-white shadow-sm" : done ? "border-stone-200 bg-white shadow-sm" : "border-stone-200 bg-stone-50 opacity-70"}`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={done ? "done" : active ? "active" : "pending"}
                    initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="flex h-5 w-5 items-center justify-center"
                  >
                    {done ? (
                      <CheckCircle className="h-5 w-5 text-green-700" />
                    ) : active ? (
                      <Loader2 className="h-5 w-5 text-cyan-700 motion-safe:animate-spin motion-reduce:animate-pulse" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-stone-300" />
                    )}
                  </motion.span>
                </AnimatePresence>
                <span className={`text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
              </motion.div>
            );
          })}
        </div>

        <p className="font-mono text-sm text-stone-500" role="status" aria-live="polite">
          {gaveUp
            ? isAuthenticated
              ? "This is taking longer than expected — your analysis may still be processing. Refresh in a minute, or check your dashboard."
              // FLOW-3: guests have no dashboard (it is a protected route that sends them to login).
              : "This is taking longer than expected — your analysis may still be processing. Keep this page open and check again in a minute."
            : elapsed > 60
            ? "Still working on it. We'll keep trying."
            : elapsed > 30
            ? "Taking a bit longer than usual…"
            : "Usually takes 15–30 seconds"}
        </p>

        {gaveUp && (
          <div className="mt-4 flex gap-2">
            {isAuthenticated ? (
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="cursor-pointer">
                Go to Dashboard
              </Button>
            ) : (
              // Re-enables the poll for another 5 minutes: the analysis is probably still running,
              // and a re-upload could hit the guest limit while this one holds the slot.
              <Button
                variant="outline"
                onClick={() => {
                  setElapsed(0);
                  setGaveUp(false);
                }}
                className="cursor-pointer"
              >
                Check again
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/upload")} className="cursor-pointer">
              Try Again
            </Button>
          </div>
        )}
      </div>
      </div>
    </PageShell>
  );
};

export default ProcessingPage;
