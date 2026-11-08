import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import type { UserOffersPage } from "@/types/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

/**
 * Shapes returned by POST /offers/compare.
 *
 * Typed because this page and the API had drifted apart entirely: the page read `data.rows`
 * and rendered `data.recommendation` directly into a paragraph, while the service returned
 * neither `rows` nor a string. The table came out empty and rendering an object as a React
 * child threw, so the page died inside its error boundary on every comparison.
 */
interface CompareOffer {
  id: string;
  company: string | null;
  role: string | null;
  score: number;
  scoreLabel: string;
  comparableScore: number | null;
}

interface CompareRow {
  metric: string;
  values: string[];
  winnerId: string | null;
  note?: string;
}

const ComparePage = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: offersData, isLoading, error } = useQuery({
    queryKey: ["user-offers-compare"],
    queryFn: () => api.get(ENDPOINTS.USER_OFFERS, { params: { limit: 100 } }).then((r) => r.data.data as UserOffersPage),
  });

  const compareMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFERS_COMPARE, { offerIds: selectedIds }).then((r) => r.data.data),
  });

  const offers = (offersData?.offers ?? []).filter((o) => o.status === "COMPLETED");

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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {offers.map((o) => (
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
          className="cursor-pointer"
        >
          {compareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Compare Selected
        </Button>

        {compareMutation.isError && <ErrorState />}

        {compareMutation.data && (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Offers compared dimension by dimension. Winning values are marked.
              </caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 text-left">Metric</th>
                  {(compareMutation.data.offers || []).map((o: CompareOffer) => (
                    <th scope="col" key={o.id} className="px-4 py-3 text-left">
                      <span className="block text-foreground">{o.company || "Offer"}</span>
                      {o.role && <span className="block font-normal">{o.role}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(compareMutation.data.rows || []).map((row: CompareRow) => (
                  <tr key={row.metric} className="border-b border-border align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.metric}
                      {/* Why a row could not be compared. Without it, an un-highlighted row
                          looks like a tie rather than missing data. */}
                      {row.note && (
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {row.note}
                        </span>
                      )}
                    </th>
                    {row.values.map((v: string, i: number) => {
                      const isWinner = !!row.winnerId && compareMutation.data.offers[i]?.id === row.winnerId;
                      return (
                        <td key={i} className={`px-4 py-3 ${isWinner ? "font-semibold text-green-700" : ""}`}>
                          {v}
                          {/* Not colour alone — the marker survives greyscale and colour
                              blindness, and screen readers announce it. */}
                          {isWinner && <span className="ml-1" aria-label="best value">✓</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {compareMutation.data.basis?.note && (
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                {compareMutation.data.basis.note}
              </p>
            )}

            {compareMutation.data.recommendation && (
              <div className="border-t border-border p-4 text-sm">
                <p className="mb-1 font-semibold text-foreground">
                  {compareMutation.data.recommendation.company
                    ? `On the numbers: ${compareMutation.data.recommendation.company}`
                    : "On the numbers: too close to call"}
                </p>
                <p className="text-muted-foreground">{compareMutation.data.recommendation.reason}</p>

                {/* What the recommended offer loses on. The table already ticks every win, so
                    repeating those here was eight bullet points of sales pitch; this is the
                    half a candidate can act on. */}
                {compareMutation.data.recommendation.tradeoffs?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {compareMutation.data.recommendation.tradeoffs.map((t: string, i: number) => (
                      <li key={i} className="text-muted-foreground">• {t}</li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs italic text-muted-foreground">
                  {compareMutation.data.recommendation.caveat}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default ComparePage;
