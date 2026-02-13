import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/common/LoadingState";
import BenefitsPie from "@/components/charts/BenefitsPie";
import { Loader2 } from "lucide-react";

const BenefitsPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["benefits", offerId],
    queryFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), {}).then((r) => r.data.data),
  });

  const mutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFER_BENEFITS(offerId), { overrides }),
  });

  if (isLoading) return <LoadingState rows={3} />;

  const benefits = data?.benefits || [];
  const pieData = benefits.map((b: any) => ({ name: b.name, value: overrides[b.name] ?? b.value ?? 0 }));
  const total = pieData.reduce((s: number, b: any) => s + b.value, 0);

  if (benefits.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No benefits data found. Your total comp = base CTC.</p>;
  }

  return (
    <div className="space-y-6 pt-4">
      <BenefitsPie data={pieData} />
      <p className="text-center text-sm text-muted-foreground">Total Benefits Value: <span className="font-bold text-foreground">₹{total.toLocaleString()}</span></p>

      <div className="space-y-3">
        {benefits.map((b: any) => (
          <div key={b.name} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <span className="text-sm flex-1">{b.name}</span>
            <Input
              type="number"
              className="w-28"
              value={overrides[b.name] ?? b.value ?? ""}
              onChange={(e) => setOverrides((p) => ({ ...p, [b.name]: Number(e.target.value) }))}
              placeholder="₹"
            />
          </div>
        ))}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="outline" className="w-full cursor-pointer">
        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Recalculate
      </Button>
    </div>
  );
};

export default BenefitsPanel;
