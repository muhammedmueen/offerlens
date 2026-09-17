import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/common/LoadingState";
import BenefitsPie from "@/components/charts/BenefitsPie";
import { Loader2 } from "lucide-react";

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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["benefits", offerId],
    queryFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), {}).then((r) => r.data.data),
  });

  const recalculate = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), { overrides }).then((r) => r.data.data),
    // Refetch so the displayed totals reflect the server's recalculation rather than
    // leaving the user looking at stale numbers.
    onSuccess: () => refetch(),
  });

  if (isLoading) return <LoadingState rows={3} />;

  const breakdown: BenefitRow[] = Array.isArray(data?.breakdown) ? data.breakdown : [];
  const currency: string = data?.currency ?? "INR";
  const fmt = (n: number) => `${currency === "INR" ? "₹" : ""}${n.toLocaleString("en-IN")}`;

  if (breakdown.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {data?.message ?? "No benefits data found in your offer. Your total comp equals your base CTC."}
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
        <div className="rounded-xl p-3 skeu-inset">
          <p className="text-xs text-muted-foreground">Benefits value</p>
          <p className="text-lg font-bold text-foreground">{fmt(data?.benefitsValue ?? 0)}</p>
        </div>
        <div className="rounded-xl p-3 skeu-inset">
          <p className="text-xs text-muted-foreground">Total compensation</p>
          <p className="text-lg font-bold text-foreground">{fmt(data?.totalCompensation ?? 0)}</p>
        </div>
      </div>

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
    </div>
  );
};

export default BenefitsPanel;
