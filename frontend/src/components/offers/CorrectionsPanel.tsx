import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/common/LoadingState";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const CorrectionsPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["corrections", offerId],
    queryFn: () => api.get(ENDPOINTS.OFFER_CORRECTIONS(offerId)).then((r) => r.data.data),
  });

  useEffect(() => {
    if (data?.fields) {
      const init: Record<string, string> = {};
      Object.entries(data.fields).forEach(([k, v]) => { init[k] = String(v ?? ""); });
      setFields(init);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => api.patch(ENDPOINTS.OFFER_CORRECTIONS(offerId), { fields }),
    onSuccess: () => toast({ title: "Corrections saved", description: "Thank you for improving our AI!" }),
  });

  if (isLoading) return <LoadingState rows={4} />;

  const fieldEntries = Object.entries(fields);

  return (
    <div className="space-y-4 pt-4">
      {fieldEntries.map(([key, val]) => (
        <div key={key} className="space-y-1">
          <Label className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</Label>
          <Input value={val} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} />
        </div>
      ))}

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
        {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save Corrections"}
      </Button>
    </div>
  );
};

export default CorrectionsPanel;
