import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/common/LoadingState";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Fields a user may correct, as dotted paths from the analysis row.
 *
 * `CorrectionService.applyCorrections` resolves each `field` with a nested lookup against
 * the analysis record, so the path must be rooted there — `extractedData.role`, not `role`.
 */
const CORRECTABLE = [
  { path: "extractedData.companyName", label: "Company name", type: "text" },
  { path: "extractedData.role", label: "Role", type: "text" },
  { path: "extractedData.location", label: "Location", type: "text" },
  { path: "extractedData.compensation.totalCTC", label: "Total CTC", type: "number" },
  { path: "extractedData.noticePeriod", label: "Notice period", type: "text" },
  { path: "extractedData.probationPeriod", label: "Probation period", type: "text" },
] as const;

const readPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

/**
 * RLHF corrections drawer.
 *
 * Was broken in both directions. It read `data.fields` from `GET .../corrections`, which
 * returns an array of previously submitted corrections and has no `fields` key — so no
 * inputs ever rendered. And it submitted `{ fields: {...} }` where the endpoint requires
 * `{ corrections: [{ field, correctedValue }] }`, so saving would have been rejected.
 *
 * It now seeds the inputs from the analysis (what the AI extracted) and submits only the
 * values the user actually changed, which is what the endpoint's `changed` count means.
 */
const CorrectionsPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["analysis", offerId],
    queryFn: () => api.get(ENDPOINTS.OFFER_ANALYSIS(offerId)).then((r) => r.data.data),
  });

  // Previously submitted corrections, shown as history.
  const { data: history } = useQuery({
    queryKey: ["corrections", offerId],
    queryFn: () => api.get(ENDPOINTS.OFFER_CORRECTIONS(offerId)).then((r) => r.data.data),
  });

  useEffect(() => {
    if (!analysis) return;
    const seeded: Record<string, string> = {};
    for (const f of CORRECTABLE) {
      const v = readPath(analysis, f.path);
      seeded[f.path] = v === null || v === undefined ? "" : String(v);
    }
    setValues(seeded);
    setOriginal(seeded);
  }, [analysis]);

  const mutation = useMutation({
    mutationFn: () => {
      const corrections = CORRECTABLE
        .filter((f) => values[f.path] !== original[f.path])
        .map((f) => ({
          field: f.path,
          correctedValue:
            f.type === "number" && values[f.path] !== ""
              ? Number(values[f.path])
              : values[f.path],
        }));
      return api.patch(ENDPOINTS.OFFER_CORRECTIONS(offerId), { corrections }).then((r) => r.data.data);
    },
    onSuccess: (result) => {
      // The server applied the correction onto the analysis, so re-read it: the drawer re-seeds
      // from the refreshed analysis (showing the corrected value) and the ResultsPage, which
      // shares ["analysis", offerId], refreshes its score/benefits/take-home too.
      // ponytail: we rely on invalidation + one extra GET rather than setQueryData. Ceiling: one
      // refetch per save. Upgrade path: return the updated analysis from the PATCH and setQueryData.
      if (result?.changed) {
        queryClient.invalidateQueries({ queryKey: ["analysis", offerId] });
        queryClient.invalidateQueries({ queryKey: ["corrections", offerId] });
      }
      toast({
        title: result?.changed ? "Corrections applied" : "No changes to save",
        description: result?.changed
          ? `${result.correctionsApplied} correction${result.correctionsApplied === 1 ? "" : "s"} applied to this analysis.`
          : "The values you submitted match what we already had.",
      });
      setOriginal(values);
    },
    onError: () =>
      toast({ title: "Could not save", description: "Please try again.", variant: "destructive" }),
  });

  if (isLoading) return <LoadingState rows={4} />;

  const changedCount = CORRECTABLE.filter((f) => values[f.path] !== original[f.path]).length;
  const historyCount = Array.isArray(history) ? history.length : 0;

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-muted-foreground">
        Correct anything the analysis got wrong. Only changed fields are submitted.
      </p>

      {CORRECTABLE.map((f) => (
        <div key={f.path} className="space-y-1">
          <Label htmlFor={f.path}>{f.label}</Label>
          <Input
            id={f.path}
            type={f.type}
            value={values[f.path] ?? ""}
            placeholder="Not detected"
            onChange={(e) => setValues((p) => ({ ...p, [f.path]: e.target.value }))}
          />
        </div>
      ))}

      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || changedCount === 0}
        className="w-full cursor-pointer"
      >
        {mutation.isPending
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
          : changedCount === 0
            ? "No changes yet"
            : `Save ${changedCount} correction${changedCount === 1 ? "" : "s"}`}
      </Button>

      {historyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {historyCount} correction{historyCount === 1 ? "" : "s"} previously submitted for this offer.
        </p>
      )}
    </div>
  );
};

export default CorrectionsPanel;
