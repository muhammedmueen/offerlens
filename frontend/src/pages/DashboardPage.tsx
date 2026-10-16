import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import { ENDPOINTS, ITEMS_PER_PAGE } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Upload, GitCompare, BarChart3, Star, FileText, TrendingUp } from "lucide-react";
import MotionCard from "@/components/common/MotionCard";

const DashboardPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");

  const { data: dashStats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.get(ENDPOINTS.USER_DASHBOARD).then((r) => r.data.data),
  });

  const { data: offersData, isLoading: offersLoading, error: offersError, refetch } = useQuery({
    queryKey: ["user-offers", page, sort],
    queryFn: () => api.get(ENDPOINTS.USER_OFFERS, { params: { page, limit: ITEMS_PER_PAGE, sort } }).then((r) => r.data.data),
  });

  const stats = dashStats
    ? [
        { label: "Total Analyses", value: dashStats.totalAnalyses ?? 0, icon: FileText },
        { label: "Avg Score", value: dashStats.avgScore ?? "—", icon: BarChart3 },
        { label: "Best Score", value: dashStats.bestScore ?? "—", icon: Star },
        { label: "Active Offers", value: dashStats.activeOffers ?? 0, icon: TrendingUp },
      ]
    : [];

  const offers = offersData?.offers || offersData || [];
  const totalPages = offersData?.totalPages || 1;

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/upload")} className="cursor-pointer rounded-md">
              <Upload className="mr-2 h-4 w-4" /> Upload New
            </Button>
            <Button variant="outline" onClick={() => navigate("/compare")} className="cursor-pointer rounded-md">
              <GitCompare className="mr-2 h-4 w-4" /> Compare
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><LoadingState rows={1} /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <MotionCard key={s.label} delay={i * 0.08} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <s.icon className="h-4 w-4" />
                  <span className="text-xs">{s.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
              </MotionCard>
            ))}
          </div>
        )}

        {/* Offers Table */}
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="font-semibold text-foreground">Offer History</h2>
            <div className="flex gap-2">
              {["createdAt", "score"].map((s) => (
                <Button key={s} variant={sort === s ? "secondary" : "ghost"} size="sm" onClick={() => setSort(s)} className="cursor-pointer text-xs capitalize rounded-lg">
                  {s === "createdAt" ? "Date" : "Score"}
                </Button>
              ))}
            </div>
          </div>

          {offersLoading ? (
            <div className="p-4"><LoadingState rows={3} /></div>
          ) : offersError ? (
            <div className="p-4"><ErrorState onRetry={() => refetch()} /></div>
          ) : offers.length === 0 ? (
            <EmptyState title="No analyses yet" description="Upload your first offer letter to get started." actionLabel="Upload Your First Offer" actionTo="/upload" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o: any) => (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/offers/${o.id}`)}
                        className="border-b border-border transition-colors hover:bg-accent/50 cursor-pointer"
                      >
                        <td className="px-4 py-3">{new Date(o.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{o.company || "—"}</td>
                        <td className="px-4 py-3">{o.role || "—"}</td>
                        <td className="px-4 py-3">{o.score ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === "COMPLETED" ? "bg-green-50 text-green-700" : o.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="cursor-pointer rounded-lg">Prev</Button>
                  <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="cursor-pointer rounded-lg">Next</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default DashboardPage;
