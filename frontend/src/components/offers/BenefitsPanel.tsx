import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import BenefitsPie from "@/components/charts/BenefitsPie";
import { Loader2 } from "lucide-react";
import { getQuotaError, quotaExhaustedText, isRateLimited, RATE_LIMITED_TEXT } from "@/lib/quota";

interface BenefitRow {
  name: string;
  category: string;
  monetaryValue: number | null;
  details: string;
  isQuantifiable: boolean;
}

/**
 * Benefits calculator drawer.
 *
 * The API returns `{ totalCompensation, baseSalary, benefitsValue, breakdown, currency }`.
 * This panel read `data.benefits`, which does not exist — so the guarded `|| []` meant it
 * always showed "No benefits data found", regardless of what the calculator produced. It
 * also read `b.value` for amounts, where the field is `monetaryValue`.
 */
const BenefitsPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["benefits", offerId],
    queryFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), {}).then((r) => r.data.data),
    // A daily-limit 429 will not clear on retry; anything else gets the usual three.
    retry: (count, err) => !getQuotaError(err) && count < 3,
  });

  const recalculate = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), { overrides }).then((r) => r.data.data),
    // BEN-4: the recalculate response already contains the full result (totals + breakdown)
    // computed with the user's overrides. We must NOT refetch the no-override query here —
    // that plain refetch replaced the recalculated totals with the original ones, so the
    // headline snapped back while the inputs/pie kept the overrides. The display below reads
    // from `recalculate.data` once it exists, so success needs no extra work.
  });

  if (isLoading) return <LoadingState rows={3} />;

  // BEN-3: a failed request is NOT an empty offer. Only show the "no benefits" copy below
  // when the request SUCCEEDS with an empty breakdown; a query error gets a real error state.
  if (error) {
    const quotaError = getQuotaError(error);
    // No retry button for a used-up daily limit: retrying cannot succeed before the reset.
    if (quotaError) return <ErrorState message={quotaExhaustedText(quotaError)} />;
    if (isRateLimited(error)) return <ErrorState message={RATE_LIMITED_TEXT} onRetry={() => refetch()} />;
    return <ErrorState onRetry={() => refetch()} />;
  }

  const recalcQuotaError = getQuotaError(recalculate.error);
  // BEN-4: after a successful recalculate, show its result (totals + breakdown reflect the
  // user's overrides). Before that, show the original query's result. Single source of truth,
  // so the headline total no longer reverts out from under the inputs and pie.
  const view = recalculate.data ?? data;
  const breakdown: BenefitRow[] = Array.isArray(view?.breakdown) ? view.breakdown : [];
  const currency: string = view?.currency ?? "INR";
  const fmt = (n: number) => `${currency === "INR" ? "₹" : ""}${n.toLocaleString("en-IN")}`;

  if (breakdown.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {view?.message ?? "No benefits data found in your offer. Your total comp equals your base CTC."}
      </p>
    );
  }

  // Only quantified benefits can go in the chart; the rest are listed but not valued.
  const pieData = breakdown
    .map((b) => ({ name: b.name, value: overrides[b.name] ?? b.monetaryValue ?? 0 }))
    .filter((b) => b.value > 0);

  const unquantified = breakdown.filter(
    (b) => (overrides[b.name] ?? b.monetaryValue) === null || (overrides[b.name] ?? b.monetaryValue ?? 0) === 0,
  );

  return (
    <div className="space-y-6 pt-4">
      {pieData.length > 0 && <BenefitsPie data={pieData} />}

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Benefits value</p>
          <p className="text-lg font-bold text-foreground">{fmt(view?.benefitsValue ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Total compensation</p>
          <p className="text-lg font-bold text-foreground">
            {/* MONEY-10: an unknown total is "not stated", never ₹0. */}
            {view?.totalCompensation == null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">Not stated</span>
              </>
            ) : (
              fmt(view.totalCompensation)
            )}
          </p>
        </div>
      </div>

      {/* BEN-2 (Model A): make clear benefits are a breakdown of the CTC, not added on top. */}
      <p className="text-xs text-muted-foreground">
        Benefits are part of your CTC. Editing them changes the breakdown, not your total.
      </p>

      <div className="space-y-3">
        {breakdown.map((b) => (
          <div key={b.name} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-foreground">{b.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{b.category}</p>
              </div>
              <Input
                type="number"
                className="w-28"
                aria-label={`Value for ${b.name}`}
                value={overrides[b.name] ?? b.monetaryValue ?? ""}
                onChange={(e) =>
                  setOverrides((p) => ({ ...p, [b.name]: Number(e.target.value) }))
                }
                placeholder={currency === "INR" ? "₹" : currency}
              />
            </div>
            {b.details && <p className="mt-1 text-xs text-muted-foreground">{b.details}</p>}
          </div>
        ))}
      </div>

      {unquantified.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unquantified.length} benefit{unquantified.length === 1 ? "" : "s"} could not be valued
          automatically. Enter an amount above to include {unquantified.length === 1 ? "it" : "them"}.
        </p>
      )}

      <Button
        onClick={() => recalculate.mutate()}
        disabled={recalculate.isPending || isFetching}
        variant="outline"
        className="w-full cursor-pointer"
      >
        {recalculate.isPending || isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Recalculate with my values
      </Button>

      {/* BEN-3: a failed recalculate previously gave the user no feedback at all. */}
      {recalculate.error && (
        <p role="alert" className="text-sm text-destructive">
          {recalcQuotaError
            ? quotaExhaustedText(recalcQuotaError)
            : isRateLimited(recalculate.error)
              ? RATE_LIMITED_TEXT
              : "We couldn't recalculate with your values right now. Please try again."}
        </p>
      )}
    </div>
  );
};

export default BenefitsPanel;
