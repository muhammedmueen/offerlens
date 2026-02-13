import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TONES = ["professional", "assertive", "friendly"] as const;
const FOCUS_AREAS = ["salary", "joining_bonus", "benefits", "equity", "pto"] as const;

const NegotiationPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { toast } = useToast();
  const [tone, setTone] = useState<string>("professional");
  const [focusAreas, setFocusAreas] = useState<string[]>(["salary"]);
  const [script, setScript] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.OFFER_NEGOTIATE(offerId), { tone, focusAreas }).then((r) => r.data.data),
    onSuccess: (data) => setScript(data),
  });

  const toggleArea = (area: string) => {
    setFocusAreas((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
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

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || focusAreas.length === 0} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
        {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : "Generate Script"}
      </Button>

      {script && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          {script.subject && <p className="text-sm font-semibold">Subject: {script.subject}</p>}
          <pre className="whitespace-pre-wrap text-sm">{script.body || script.email || JSON.stringify(script, null, 2)}</pre>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(script.body || script.email || ""); toast({ title: "Copied!" }); }} className="cursor-pointer">
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NegotiationPanel;
