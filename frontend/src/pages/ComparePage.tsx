import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const ComparePage = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: offersData, isLoading, error } = useQuery({
    queryKey: ["user-offers-compare"],
    queryFn: () => api.get(ENDPOINTS.USER_OFFERS, { params: { limit: 100 } }).then((r) => r.data.data),
  });

  const compareMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFERS_COMPARE, { offerIds: selectedIds }).then((r) => r.data.data),
  });

  const offers = (offersData?.offers || offersData || []).filter((o: any) => o.status === "COMPLETED");

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  if (isLoading) return <PageShell><div className="container mx-auto max-w-4xl px-4 py-12"><LoadingState rows={4} /></div></PageShell>;
  if (error) return <PageShell><div className="container mx-auto max-w-4xl px-4 py-12"><ErrorState /></div></PageShell>;

  if (offers.length < 2) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-4xl px-4 py-12">
          <EmptyState title="Not enough offers" description="You need at least 2 completed analyses to compare." actionLabel="Upload Another Offer" actionTo="/upload" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Compare Offers</h1>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Select 2–3 completed offers to compare</p>
          <div className="grid gap-2 md:grid-cols-2">
            {offers.map((o: any) => (
              <label
                key={o.id}
                className={`flex items-center gap-3 rounded-lg border p-4 transition-all cursor-pointer ${selectedIds.includes(o.id) ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"}`}
              >
                <Checkbox checked={selectedIds.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{o.company || "Unknown"} — {o.role || "Role"}</p>
                  <p className="text-xs text-muted-foreground">Score: {o.score ?? "—"}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Button
          onClick={() => compareMutation.mutate()}
          disabled={selectedIds.length < 2 || compareMutation.isPending}
          className="brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn"
        >
          {compareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Compare Selected
        </Button>

        {compareMutation.data && (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left">Metric</th>
                  {(compareMutation.data.offers || []).map((o: any) => (
                    <th key={o.id} className="px-4 py-3 text-left">{o.company || "Offer"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(compareMutation.data.rows || []).map((row: any) => (
                  <tr key={row.metric} className="border-b border-border">
                    <td className="px-4 py-3 font-medium">{row.metric}</td>
                    {row.values.map((v: any, i: number) => (
                      <td key={i} className={`px-4 py-3 ${row.winnerId && compareMutation.data.offers[i]?.id === row.winnerId ? "text-green-400 font-semibold" : ""}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {compareMutation.data.recommendation && (
              <div className="border-t border-border p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">AI Recommendation</p>
                <p>{compareMutation.data.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default ComparePage;
