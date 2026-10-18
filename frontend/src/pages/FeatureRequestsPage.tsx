import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import type { FeatureRequest } from "@/types/api";
import { RATE_LIMITED_TEXT, isRateLimited } from "@/lib/quota";
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

// `value` is what the API filters on (its enum uses in_progress); `label` is what people read.
const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-stone-100 text-stone-700",
  planned: "bg-amber-50 text-amber-700",
  in_progress: "bg-cyan-50 text-cyan-800",
  done: "bg-green-50 text-green-700",
};

// Mirror the backend schema (feature-request.schema.ts), so a request the server would reject
// can't be submitted in the first place.
const TITLE_MIN = 5;
const TITLE_MAX = 200;
const DESC_MIN = 20;
const DESC_MAX = 2000;

const apiErrorCode = (err: unknown): string | undefined =>
  (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;

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
    queryFn: () =>
      api
        .get(ENDPOINTS.FEATURE_REQUESTS, { params: { sort, status: statusFilter || undefined, page } })
        .then((r) => r.data.data as FeatureRequest[]),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FEATURE_REQUESTS, { title, description }),
    onSuccess: () => { toast({ title: "Request submitted!" }); setDialogOpen(false); setTitle(""); setDescription(""); queryClient.invalidateQueries({ queryKey: ["feature-requests"] }); },
    onError: (err) =>
      toast({
        title: "Could not submit request",
        description: isRateLimited(err) ? RATE_LIMITED_TEXT : "Please check the fields and try again.",
        variant: "destructive",
      }),
  });

  const voteMutation = useMutation({
    mutationFn: (id: string) => api.post(ENDPOINTS.FEATURE_REQUEST_VOTE(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-requests"] }),
    onError: (err) => {
      if (apiErrorCode(err) === "ALREADY_VOTED") {
        // The server is the authority on who has voted; refetch so the button shows it.
        toast({ title: "Already voted", description: "You've already voted on this request." });
        queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
        return;
      }
      toast({
        title: "Could not record vote",
        description: isRateLimited(err) ? RATE_LIMITED_TEXT : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const requests = data ?? [];
  const titleLen = title.trim().length;
  const descLen = description.trim().length;
  const formValid = titleLen >= TITLE_MIN && descLen >= DESC_MIN;

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Feature Requests</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer rounded-md">
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
                <div className="space-y-2">
                  <Label htmlFor="fr-title">Title</Label>
                  <Input id="fr-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={TITLE_MIN} maxLength={TITLE_MAX} aria-describedby="fr-title-hint" />
                  <p id="fr-title-hint" className="text-xs text-muted-foreground">At least {TITLE_MIN} characters ({titleLen}/{TITLE_MAX})</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fr-description">Description</Label>
                  <textarea id="fr-description" aria-describedby="fr-description-hint" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={DESC_MIN} maxLength={DESC_MAX} className="min-h-[80px] w-full rounded-md border border-stone-300 bg-white p-3 text-sm focus-visible:border-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700" />
                  <p id="fr-description-hint" className="text-xs text-muted-foreground">At least {DESC_MIN} characters ({descLen}/{DESC_MAX})</p>
                </div>
                <Button type="submit" disabled={!formValid || submitMutation.isPending} className="w-full cursor-pointer rounded-md">
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
          {STATUS_FILTERS.map((s) => (
            <Button key={s.value} variant={statusFilter === s.value ? "secondary" : "ghost"} size="sm" onClick={() => { setStatusFilter(s.value); setPage(1); }} aria-pressed={statusFilter === s.value} className="cursor-pointer text-xs">{s.label}</Button>
          ))}
        </div>

        {isLoading ? <LoadingState rows={4} /> : error ? <ErrorState onRetry={() => refetch()} /> : requests.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No feature requests yet. Be the first!</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r, i) => (
              <MotionCard key={r.id} delay={i * 0.06} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <button
                  onClick={() => voteMutation.mutate(r.id)}
                  disabled={r.hasVoted || (voteMutation.isPending && voteMutation.variables === r.id)}
                  aria-pressed={r.hasVoted}
                  aria-label={`${r.hasVoted ? "Voted for" : "Vote for"} ${r.title}, ${r.voteCount} votes`}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1 text-xs transition-colors ${r.hasVoted ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-border hover:border-primary/50 cursor-pointer"}`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  <span className="font-bold">{r.voteCount}</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.title}</p>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                </div>
                {r.status && (
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize whitespace-nowrap ${STATUS_COLORS[r.status] || "bg-muted text-muted-foreground"}`}>
                    {r.status.replace("_", " ")}
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
