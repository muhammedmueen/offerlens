import { useState } from "react";
import { useParams } from "react-router-dom";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, GitCompare, TrendingUp, Pencil, Share2, Lock, CheckCircle, FileText, Copy } from "lucide-react";
import NegotiationPanel from "@/components/offers/NegotiationPanel";
import BenefitsPanel from "@/components/offers/BenefitsPanel";
import CareerPathPanel from "@/components/offers/CareerPathPanel";
import CorrectionsPanel from "@/components/offers/CorrectionsPanel";

type DrawerType = "negotiate" | "benefits" | "career" | "corrections" | null;

const ResultsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState("");
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);

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

  return (
    <PageShell>
      <div className="container mx-auto max-w-4xl px-4 py-8 pb-28 space-y-8">
        {!isAuthenticated && <GuestBanner expiresAt={a.expiresAt} />}

        {a.ocrConfidence && a.ocrConfidence < 0.7 && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-50 p-4 text-sm skeu-emboss">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-foreground">We had trouble reading parts of your offer. Some data may be inaccurate.</p>
          </div>
        )}

        {/* Score Header */}
        <div className="flex flex-col items-center gap-4 rounded-2xl p-8 md:flex-row md:items-start md:gap-8 skeu-card">
          <ScoreGauge score={a.score ?? 0} />
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-xl font-bold text-foreground">{a.company || "Company"}</h1>
            <p className="text-muted-foreground">{a.role || "Role"}{a.location ? ` · ${a.location}` : ""}</p>
            {a.scoreMethod === "estimated" && (
              <p className="mt-2 text-xs text-muted-foreground italic">Estimated score — limited market data</p>
            )}
          </div>
        </div>

        {/* Salary Comparison */}
        {a.salaryComparison && (
          <section className="rounded-2xl p-6 skeu-card">
            <h2 className="font-semibold mb-4 text-foreground">Salary Comparison</h2>
            <SalaryBar
              min={a.salaryComparison.min}
              p25={a.salaryComparison.p25}
              median={a.salaryComparison.median}
              p75={a.salaryComparison.p75}
              max={a.salaryComparison.max}
              userSalary={a.salaryComparison.userSalary}
              label={a.salaryComparison.percentile ? `Your offer is at the ${a.salaryComparison.percentile}th percentile` : undefined}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {a.salaryComparison.source || "AI-estimated range"}
            </p>
          </section>
        )}

        {/* Red Flags */}
        <section className="rounded-2xl p-6 skeu-card">
          <h2 className="font-semibold mb-4 text-foreground">Red Flags</h2>
          {a.redFlags?.length > 0 ? (
            <div className="space-y-3">
              {a.redFlags.map((rf: any, i: number) => {
                const severity = rf.severity?.toLowerCase();
                const bgColor = severity === "high" ? "bg-red-50 border-red-200" : severity === "medium" ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200";
                return (
                  <div key={i} className={`rounded-xl border p-4 ${bgColor} skeu-emboss`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold uppercase ${severity === "high" ? "text-red-600" : severity === "medium" ? "text-yellow-600" : "text-green-600"}`}>
                        {rf.severity}
                      </span>
                      <h3 className="font-medium text-sm text-foreground">{rf.title}</h3>
                    </div>
                    {rf.excerpt && <p className="text-xs text-muted-foreground italic mb-1">"{rf.excerpt}"</p>}
                    <p className="text-sm text-muted-foreground">{rf.explanation}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <p className="text-sm">No red flags detected — looks like a clean offer!</p>
            </div>
          )}
        </section>

        {/* Negotiation Tips */}
        {a.negotiationTips?.length > 0 && (
          <section className="rounded-2xl p-6 skeu-card">
            <h2 className="font-semibold mb-4 text-foreground">Negotiation Tips</h2>
            <ul className="space-y-2">
              {a.negotiationTips.map((t: any, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">• {t.suggestion || t}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer rounded-xl skeu-emboss"
              onClick={() => requireAuth("Negotiation Scripts", "negotiate")}
            >
              {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
              Generate Negotiation Email
            </Button>
          </section>
        )}

        {/* Take-Home Breakdown */}
        {a.takeHome && (
          <section className="rounded-2xl p-6 skeu-card">
            <h2 className="font-semibold mb-4 text-foreground">Take-Home Breakdown</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Gross", value: a.takeHome.gross },
                { label: "Tax", value: a.takeHome.tax },
                { label: "PF", value: a.takeHome.pf },
                { label: "Net Take-Home", value: a.takeHome.net },
              ].map((item) => (
                <div key={item.label} className="rounded-xl p-4 text-center skeu-inset">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-bold text-foreground">₹{(item.value ?? 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Benefits */}
        {a.benefits?.length > 0 && (
          <section className="rounded-2xl p-6 skeu-card">
            <h2 className="font-semibold mb-4 text-foreground">Benefits Overview</h2>
            <div className="flex flex-wrap gap-2">
              {a.benefits.map((b: any, i: number) => (
                <span key={i} className="rounded-full bg-accent px-3 py-1 text-xs skeu-emboss">{b.name || b}</span>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer rounded-xl skeu-emboss"
              onClick={() => requireAuth("Benefits Calculator", "benefits")}
            >
              {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
              Calculate Full Benefits Value
            </Button>
          </section>
        )}
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 skeu-nav backdrop-blur-md border-t border-border">
        <div className="container mx-auto flex items-center justify-center gap-2 px-4 py-3 max-w-4xl flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownload} className="cursor-pointer rounded-xl skeu-emboss">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth("Compare Offers", null)} className="cursor-pointer rounded-xl skeu-emboss">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <GitCompare className="mr-1 h-4 w-4" /> Compare
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth("Career Path", "career")} className="cursor-pointer rounded-xl skeu-emboss">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <TrendingUp className="mr-1 h-4 w-4" /> Career
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth("Corrections", "corrections")} className="cursor-pointer rounded-xl skeu-emboss">
            {!isAuthenticated && <Lock className="mr-1 h-3 w-3" />}
            <Pencil className="mr-1 h-4 w-4" /> Correct
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare} className="cursor-pointer rounded-xl skeu-emboss">
            <Share2 className="mr-1 h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      {/* Drawers */}
      <Sheet open={activeDrawer === "negotiate"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Negotiation Script</SheetTitle></SheetHeader>
          <NegotiationPanel offerId={id!} />
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "benefits"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Benefits Calculator</SheetTitle></SheetHeader>
          <BenefitsPanel offerId={id!} />
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "career"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Career Path</SheetTitle></SheetHeader>
          <CareerPathPanel offerId={id!} />
        </SheetContent>
      </Sheet>
      <Sheet open={activeDrawer === "corrections"} onOpenChange={(o) => !o && setActiveDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Correct Data</SheetTitle></SheetHeader>
          <CorrectionsPanel offerId={id!} />
        </SheetContent>
      </Sheet>

      <AuthGateModal open={authGateOpen} onOpenChange={setAuthGateOpen} featureName={authGateFeature} />
    </PageShell>
  );
};

export default ResultsPage;
