import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronUp, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MotionCard from "@/components/common/MotionCard";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400",
  planned: "bg-yellow-500/10 text-yellow-400",
  "in progress": "bg-primary/10 text-primary",
  done: "bg-green-500/10 text-green-400",
};

const FeatureRequestsPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState("votes");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["feature-requests", sort, statusFilter, page],
    queryFn: () => api.get(ENDPOINTS.FEATURE_REQUESTS, { params: { sort, status: statusFilter || undefined, page } }).then((r) => r.data.data),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FEATURE_REQUESTS, { title, description }),
    onSuccess: () => { toast({ title: "Request submitted!" }); setDialogOpen(false); setTitle(""); setDescription(""); queryClient.invalidateQueries({ queryKey: ["feature-requests"] }); },
  });

  const voteMutation = useMutation({
    mutationFn: (id: string) => api.post(ENDPOINTS.FEATURE_REQUEST_VOTE(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-requests"] }),
  });

  const requests = data?.requests || data || [];

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Feature Requests</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
                <Plus className="mr-1 h-4 w-4" /> Submit Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Feature Request</DialogTitle>
                <DialogDescription>
                  Tell us what would make OfferLens more useful. Others can vote on it.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Description</Label><textarea value={description} onChange={(e) => setDescription(e.target.value)} required className="min-h-[80px] w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <Button type="submit" disabled={submitMutation.isPending} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
                  {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Submit
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["votes", "newest"].map((s) => (
            <Button key={s} variant={sort === s ? "secondary" : "ghost"} size="sm" onClick={() => setSort(s)} className="cursor-pointer capitalize text-xs">{s === "votes" ? "Most Voted" : "Newest"}</Button>
          ))}
          <div className="mx-2 w-px bg-border" />
          {["", "open", "planned", "in progress", "done"].map((s) => (
            <Button key={s} variant={statusFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setStatusFilter(s)} className="cursor-pointer capitalize text-xs">{s || "All"}</Button>
          ))}
        </div>

        {isLoading ? <LoadingState rows={4} /> : error ? <ErrorState onRetry={() => refetch()} /> : requests.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No feature requests yet. Be the first!</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r: any, i: number) => (
              <MotionCard key={r.id} delay={i * 0.06} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <button
                  onClick={() => voteMutation.mutate(r.id)}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-border px-2 py-1 text-xs hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <ChevronUp className="h-4 w-4" />
                  <span className="font-bold">{r.votes ?? 0}</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.title}</p>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                </div>
                {r.status && (
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize whitespace-nowrap ${STATUS_COLORS[r.status.toLowerCase()] || "bg-muted text-muted-foreground"}`}>
                    {r.status}
                  </span>
                )}
              </MotionCard>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default FeatureRequestsPage;
