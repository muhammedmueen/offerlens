import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import api from "@/services/api";
import { ENDPOINTS, FORUM_CATEGORIES } from "@/constants/api";
import type { ForumComment, ForumPostDetail, ForumPostSummary } from "@/types/api";
import { useAuth } from "@/store/auth";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import AuthGateModal from "@/components/common/AuthGateModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MotionCard from "@/components/common/MotionCard";

// Forum List
const ForumListPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<string>("general");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["forum-posts", page, category],
    queryFn: () => api.get(ENDPOINTS.FORUM_POSTS, { params: { page, category: category || undefined } }).then((r) => r.data.data as ForumPostSummary[]),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FORUM_POSTS, { title: newTitle, content: newBody, category: newCategory }),
    onSuccess: () => {
      toast({ title: "Post created!" });
      setCreateOpen(false);
      setNewTitle("");
      setNewBody("");
      setNewCategory("general");
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
    },
    onError: () => toast({ title: "Could not create post", description: "Please try again.", variant: "destructive" }),
  });

  const posts = data ?? [];

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Forum</h1>
          <Button
            onClick={() => isAuthenticated ? setCreateOpen(true) : setAuthGateOpen(true)}
            className="cursor-pointer rounded-md"
          >
            <Plus className="mr-1 h-4 w-4" /> New Post
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {["", ...FORUM_CATEGORIES].map((c) => (
            <Button
              key={c}
              variant={category === c ? "secondary" : "ghost"}
              size="sm"
              onClick={() => { setCategory(c); setPage(1); }}
              aria-pressed={category === c}
              className="cursor-pointer capitalize text-xs"
            >
              {c || "All"}
            </Button>
          ))}
        </div>

        {isLoading ? <LoadingState rows={4} /> : error ? <ErrorState onRetry={() => refetch()} /> : posts.length === 0 ? (
          <EmptyState title="No posts yet" description="Be the first to start a discussion!" />
        ) : (
          <div className="space-y-2">
            {posts.map((p, i) => (
              <MotionCard key={p.id} delay={i * 0.06}>
                <Link
                  to={`/forum/${p.id}`}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 cursor-pointer"
                >
                  <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.authorName || "Anonymous"} · {new Date(p.createdAt).toLocaleDateString()} · {p.commentCount ?? 0} comments</p>
                  </div>
                </Link>
              </MotionCard>
            ))}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Post</DialogTitle>
              <DialogDescription>
                Share an offer, a negotiation outcome, or a question with the community.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="post-title">Title</Label><Input id="post-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required minLength={3} maxLength={200} /></div>
              <div className="space-y-2">
                <Label htmlFor="post-category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger id="post-category" className="cursor-pointer capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORUM_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="cursor-pointer capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="post-body">Body</Label><textarea id="post-body" value={newBody} onChange={(e) => setNewBody(e.target.value)} required maxLength={10000} className="min-h-[100px] w-full rounded-md border border-stone-300 bg-white p-3 text-sm focus-visible:border-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700" /></div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full cursor-pointer rounded-md">
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Post
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AuthGateModal open={authGateOpen} onOpenChange={setAuthGateOpen} featureName="Forum posting" />
      </div>
    </PageShell>
  );
};

// Forum Post Detail
export const ForumPostPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: post, isLoading, error, refetch } = useQuery({
    queryKey: ["forum-post", id],
    queryFn: () => api.get(ENDPOINTS.FORUM_POST(id!)).then((r) => r.data.data as ForumPostDetail),
    enabled: !!id,
  });

  const commentMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FORUM_POST_COMMENTS(id!), { content: comment }),
    onSuccess: () => { toast({ title: "Comment added!" }); setComment(""); queryClient.invalidateQueries({ queryKey: ["forum-post", id] }); },
    onError: () => toast({ title: "Could not add comment", description: "Please try again.", variant: "destructive" }),
  });

  if (isLoading) return <PageShell><div className="container mx-auto max-w-3xl px-4 py-12"><LoadingState rows={4} /></div></PageShell>;
  if (error || !post) return <PageShell><div className="container mx-auto max-w-3xl px-4 py-12"><ErrorState onRetry={() => refetch()} /></div></PageShell>;

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">{post.title}</h1>
          <p className="text-xs text-muted-foreground">{post.author?.name || "Anonymous"} · {new Date(post.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="prose prose-sm max-w-none">
          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold">Comments ({post.comments?.length || 0})</h2>
          {(post.comments || []).map((c: ForumComment) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.authorName || "Anonymous"} · {new Date(c.createdAt).toLocaleDateString()}</p>
              <p className="text-sm whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}

          {isAuthenticated ? (
            <form onSubmit={(e) => { e.preventDefault(); commentMutation.mutate(); }} className="flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" className="flex-1" required maxLength={5000} />
              <Button type="submit" disabled={commentMutation.isPending} className="cursor-pointer rounded-md">
                {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comment"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to={`/login?returnUrl=${encodeURIComponent(pathname)}`} className="text-primary underline cursor-pointer">Log in</Link> to comment
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default ForumListPage;
