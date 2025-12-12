import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  listFeatureRequests,
  voteFeatureRequest,
  FeatureRequest,
  FeatureRequestListResponse,
} from "@/lib/api";
import { Loader2, ThumbsUp, MessageSquare, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * FeedbackForum Component
 * Requirements: 14.1, 14.2, 14.3, 14.4
 * 
 * Displays public feedback forum where users can:
 * - View feature requests
 * - Vote on requests
 * - Filter by status and type
 * - See status labels
 */

export function FeedbackForum() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRequests();
  }, [filterStatus, filterType, currentPage]);

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: any = {
        page: currentPage,
        limit: 10,
      };

      if (filterStatus) {
        params.status = filterStatus;
      }

      if (filterType) {
        params.type = filterType;
      }

      const response: FeatureRequestListResponse = await listFeatureRequests(params);
      setRequests(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (err: any) {
      console.error('Error loading feature requests:', err);
      setError(err.message || 'Failed to load feature requests');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (id: string) => {
    if (votingIds.has(id)) return;

    setVotingIds(prev => new Set(prev).add(id));

    try {
      await voteFeatureRequest(id);
      
      // Update local state
      setRequests(prev =>
        prev.map(req =>
          req.id === id ? { ...req, votes: req.votes + 1 } : req
        )
      );

      toast({
        title: "Vote recorded",
        description: "Thank you for your feedback!",
      });
    } catch (err: any) {
      console.error('Error voting:', err);
      toast({
        variant: "destructive",
        title: "Vote failed",
        description: err.message || "You may have already voted for this request.",
      });
    } finally {
      setVotingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-gray-500/10 text-gray-500';
      case 'under_review':
        return 'bg-blue-500/10 text-blue-500';
      case 'planned':
        return 'bg-purple-500/10 text-purple-500';
      case 'in_progress':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'completed':
        return 'bg-green-500/10 text-green-500';
      case 'declined':
        return 'bg-red-500/10 text-red-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'role':
        return '👤';
      case 'feature':
        return '✨';
      case 'issue':
        return '🐛';
      default:
        return '📝';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (isLoading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={loadRequests} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filter by Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-10 px-3 rounded-lg bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground text-sm"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-2">
            Filter by Type
          </label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-10 px-3 rounded-lg bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground text-sm"
          >
            <option value="">All Types</option>
            <option value="role">Role Requests</option>
            <option value="feature">Feature Suggestions</option>
            <option value="issue">Issue Reports</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No feature requests found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="floating-card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Vote Button */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVote(request.id)}
                    disabled={votingIds.has(request.id)}
                    className="w-12 h-12 rounded-lg"
                  >
                    {votingIds.has(request.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-4 h-4" />
                    )}
                  </Button>
                  <span className="text-sm font-medium text-foreground">
                    {request.votes}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xl">{getTypeIcon(request.type)}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">
                        {request.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {request.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(
                        request.status
                      )}`}
                    >
                      {formatStatus(request.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || isLoading}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || isLoading}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
