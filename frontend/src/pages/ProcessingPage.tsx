import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS, OFFER_STATUS, POLLING_INTERVAL_MS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import ErrorState from "@/components/common/ErrorState";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

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

            <h2 className="text-xl font-bold mb-3 text-foreground">
              {isRateLimitError ? "Rate Limit Exceeded" : "Analysis Failed"}
            </h2>

            <p className="text-muted-foreground mb-6">
              {getErrorMessage(data.failureReason)}
            </p>

            {isRateLimitError && (
              <div className="mb-6 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-left">
                <p className="font-medium mb-2">💡 Tips to avoid rate limits:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Wait 2-3 minutes before trying again</li>
                  <li>Switch to a different AI model (e.g., gemini-flash-lite-latest)</li>
                  <li>Use the model selector in the upload form</li>
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
              {isRateLimitError && (
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
        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50">
          {/* Reduced motion: pulse instead of spin (spec §7 / §8 motion). */}
          <Loader2 className="h-8 w-8 text-cyan-700 motion-safe:animate-spin motion-reduce:animate-pulse" />
        </div>

        <h1 className="text-xl font-bold mb-2 text-foreground">Reading your offer…</h1>
        <p className="mb-6 font-mono text-xs text-stone-500">
          // usually 15–30s. gemini can take up to ~3 min on a busy day.
        </p>

        <div className="w-full space-y-3 mb-8">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s} className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${active ? "border-cyan-200 bg-white shadow-sm" : done ? "border-stone-200 bg-white shadow-sm" : "border-stone-200 bg-stone-50 opacity-70"}`}>
                {done ? (
                  <CheckCircle className="h-5 w-5 text-green-700" />
                ) : active ? (
                  <Loader2 className="h-5 w-5 text-cyan-700 motion-safe:animate-spin motion-reduce:animate-pulse" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-stone-300" />
                )}
                <span className={`text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
              </div>
            );
          })}
        </div>

        <p className="font-mono text-sm text-stone-500" role="status" aria-live="polite">
          {gaveUp
            ? "This is taking longer than expected — your analysis may still be processing. Refresh in a minute, or check your dashboard."
            : elapsed > 60
            ? "Still working on it. We'll keep trying."
            : elapsed > 30
            ? "Taking a bit longer than usual…"
            : "Usually takes 15–30 seconds"}
        </p>

        {gaveUp && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="cursor-pointer">
              Go to Dashboard
            </Button>
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
