import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuth } from "@/store/auth";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import AuthGateModal from "@/components/common/AuthGateModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [newCategory, setNewCategory] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["forum-posts", page, category],
    queryFn: () => api.get(ENDPOINTS.FORUM_POSTS, { params: { page, category: category || undefined } }).then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FORUM_POSTS, { title: newTitle, body: newBody, category: newCategory }),
    onSuccess: () => { toast({ title: "Post created!" }); setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["forum-posts"] }); },
  });

  const posts = data?.posts || data || [];

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Forum</h1>
          <Button
            onClick={() => isAuthenticated ? setCreateOpen(true) : setAuthGateOpen(true)}
            className="brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn"
          >
            <Plus className="mr-1 h-4 w-4" /> New Post
          </Button>
        </div>

        {isLoading ? <LoadingState rows={4} /> : error ? <ErrorState onRetry={() => refetch()} /> : posts.length === 0 ? (
          <EmptyState title="No posts yet" description="Be the first to start a discussion!" />
        ) : (
          <div className="space-y-2">
            {posts.map((p: any, i: number) => (
              <MotionCard key={p.id} delay={i * 0.06}>
                <Link
                  to={`/forum/${p.id}`}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 cursor-pointer"
                >
                  <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.author?.name || "Anonymous"} · {new Date(p.createdAt).toLocaleDateString()} · {p.commentCount ?? 0} comments</p>
                  </div>
                </Link>
              </MotionCard>
            ))}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Post</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Category</Label><Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Negotiation" /></div>
              <div className="space-y-2"><Label>Body</Label><textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} required className="min-h-[100px] w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
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
  const [comment, setComment] = useState("");
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: post, isLoading, error, refetch } = useQuery({
    queryKey: ["forum-post", id],
    queryFn: () => api.get(ENDPOINTS.FORUM_POST(id!)).then((r) => r.data.data),
    enabled: !!id,
  });

  const commentMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.FORUM_POST_COMMENTS(id!), { body: comment }),
    onSuccess: () => { toast({ title: "Comment added!" }); setComment(""); queryClient.invalidateQueries({ queryKey: ["forum-post", id] }); },
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
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-sm whitespace-pre-wrap">{post.body}</p>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold">Comments ({post.comments?.length || 0})</h2>
          {(post.comments || []).map((c: any) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.author?.name || "Anonymous"} · {new Date(c.createdAt).toLocaleDateString()}</p>
              <p className="text-sm">{c.body}</p>
            </div>
          ))}

          {isAuthenticated ? (
            <form onSubmit={(e) => { e.preventDefault(); commentMutation.mutate(); }} className="flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" className="flex-1" required />
              <Button type="submit" disabled={commentMutation.isPending} className="brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
                {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comment"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <button onClick={() => setAuthGateOpen(true)} className="text-primary hover:underline cursor-pointer">Log in</button> to comment
            </p>
          )}
        </div>

        <AuthGateModal open={authGateOpen} onOpenChange={setAuthGateOpen} featureName="commenting" />
      </div>
    </PageShell>
  );
};

export default ForumListPage;
