import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS, OFFER_STATUS, POLLING_INTERVAL_MS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import ErrorState from "@/components/common/ErrorState";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = ["Uploading", "Reading Document", "Analyzing", "Scoring"];

const getStepIndex = (status: string) => {
  if (status === OFFER_STATUS.QUEUED) return 0;
  if (status === OFFER_STATUS.PROCESSING) return 2;
  if (status === OFFER_STATUS.COMPLETED) return 4;
  return -1;
};

const ProcessingPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);

  const { data, error, refetch } = useQuery({
    queryKey: ["offer-status", id],
    queryFn: () => api.get(ENDPOINTS.OFFER(id!)).then((r) => r.data.data),
    refetchInterval: POLLING_INTERVAL_MS,
    enabled: !!id,
  });

  useEffect(() => {
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.status === OFFER_STATUS.COMPLETED) {
      navigate(`/offers/${id}`, { replace: true });
    }
  }, [data?.status, id, navigate]);

  const stepIndex = data ? getStepIndex(data.status) : 1;

  if (data?.status === OFFER_STATUS.FAILED) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-lg px-4 py-24">
          <ErrorState
            message="Analysis failed. Please try again."
            onRetry={() => { navigate("/upload"); }}
          />
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
      <div className="container mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 skeu-emboss">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>

        <h1 className="text-xl font-bold mb-6 text-foreground">Analyzing your offer…</h1>

        <div className="w-full space-y-3 mb-8">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s} className={`flex items-center gap-3 rounded-xl p-3 transition-all ${active ? "skeu-card border-primary/30" : done ? "skeu-card" : "skeu-inset opacity-60"}`}>
                {done ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : active ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={`text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
              </div>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          {elapsed > 300
            ? "Something went wrong."
            : elapsed > 60
            ? "Still working on it. We'll keep trying."
            : elapsed > 30
            ? "Taking a bit longer than usual…"
            : "Usually takes 15–30 seconds"}
        </p>

        {elapsed > 300 && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => navigate("/upload")} className="cursor-pointer rounded-xl skeu-emboss">
              Try Again
            </Button>
            <Button variant="outline" onClick={() => navigate("/upload")} className="cursor-pointer rounded-xl skeu-emboss">
              Paste Text Manually
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default ProcessingPage;
