import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Info, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getQuotaError, quotaExhaustedText, isRateLimited, RATE_LIMITED_TEXT } from "@/lib/quota";
import type { NegotiationScript } from "@/types/api";

const TONES = ["professional", "assertive", "friendly"] as const;
const FOCUS_AREAS = ["salary", "joining_bonus", "benefits", "equity", "pto"] as const;

const NegotiationPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tone, setTone] = useState<string>("professional");
  const [focusAreas, setFocusAreas] = useState<string[]>(["salary"]);

  // NEG-2: persist the generated script in the react-query cache keyed by the generation
  // identity (offer + tone + focus), so closing and reopening the drawer rehydrates the last
  // result without firing another request. The passive query never fetches (enabled: false,
  // queryFn returns null); it is only a typed window into the cache that re-renders this
  // component when the cached script for the current key changes.
  // ponytail: per-session only — the query cache is in-memory, so a full page reload clears it.
  // Upgrade path: lift to a persisted cache (localStorage / query-persist) if it must survive reloads.
  const queryKey = ["negotiation", offerId, tone, focusAreas] as const;
  const { data: script } = useQuery<NegotiationScript | null>({
    queryKey,
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });

  const mutation = useMutation<NegotiationScript, unknown, void>({
    mutationFn: () => api.post(ENDPOINTS.OFFER_NEGOTIATE(offerId), { tone, focusAreas }).then((r) => r.data.data),
    // NEG-7: clear the previous script the moment a new generation starts, so a stale script
    // never sits under a loading/error state while the new request is in flight.
    onMutate: () => queryClient.setQueryData(queryKey, null),
    // NEG-2: persist the new script so a reopen can read it back without regenerating.
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
    // NEG-7: a failed later generation must not leave the old script on screen or copyable.
    onError: () => queryClient.setQueryData(queryKey, null),
  });

  const quotaError = getQuotaError(mutation.error);

  const toggleArea = (area: string) => {
    setFocusAreas((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
  };

  const handleCopy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${script.subject}\n\n${script.body}`);
      toast({ title: "Copied!" });
    } catch {
      toast({ title: "Couldn't copy", description: "Copy the text manually instead.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <Label>Tone</Label>
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TONES.map((t) => (
              <SelectItem key={t} value={t} className="cursor-pointer capitalize">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Focus Areas</Label>
        <div className="flex flex-wrap gap-3">
          {FOCUS_AREAS.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={focusAreas.includes(a)} onCheckedChange={() => toggleArea(a)} />
              <span className="capitalize">{a.replace("_", " ")}</span>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || focusAreas.length === 0} className="w-full cursor-pointer">
        {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : "Generate Script"}
      </Button>

      {/* Previously a failed request rendered nothing at all. */}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {quotaError
            ? quotaExhaustedText(quotaError)
            : isRateLimited(mutation.error)
              ? RATE_LIMITED_TEXT
              : "We couldn't generate a script right now. Please try again."}
        </p>
      )}

      {script && (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          {/* Why this is a template rather than a tailored script. The backend has always sent
              a `note` on the fallback paths and it was never rendered, so a user got an email
              full of [BRACKETS] with no explanation of what had gone wrong. Only the template
              arm of the union carries `note`. */}
          {script.type === "template" && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
              <p className="text-foreground">{script.note}</p>
            </div>
          )}
          <p className="text-sm font-semibold">Subject: {script.subject}</p>
          <pre className="whitespace-pre-wrap text-sm">{script.body}</pre>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="cursor-pointer">
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NegotiationPanel;
