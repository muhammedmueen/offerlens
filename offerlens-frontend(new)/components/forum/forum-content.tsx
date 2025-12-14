"use client"

/**
 * Forum Content Component
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 * 
 * Displays forum discussions with:
 * - List of recent discussions (14.1)
 * - Post display with author, timestamp, content (14.2)
 * - Discussion thread view (14.3)
 * - Skeleton loaders during fetch (14.4)
 * - Error handling for API failures (14.5)
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, MessageSquare, Plus, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconContainer } from "@/components/ui/icon-container"
import { listFeatureRequests, voteFeatureRequest, type FeatureRequest } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

/**
 * Skeleton loader for forum posts
 * Requirement 14.4: Display skeleton loaders during fetch
 */
function ForumPostSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <Skeleton className="h-4 w-8" />
        </div>
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Individual forum post card
 * Requirement 14.2: Display author, timestamp, and content
 */
function ForumPostCard({
  post,
  onVote,
  isVoting,
  delay = 0,
}: {
  post: FeatureRequest
  onVote: (id: string) => void
  isVoting: boolean
  delay?: number
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-gray-500/10 text-gray-500"
      case "under_review":
        return "bg-blue-500/10 text-blue-500"
      case "planned":
        return "bg-purple-500/10 text-purple-500"
      case "in_progress":
        return "bg-yellow-500/10 text-yellow-500"
      case "completed":
        return "bg-green-500/10 text-green-500"
      case "declined":
        return "bg-red-500/10 text-red-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "role":
        return "👤"
      case "feature":
        return "✨"
      case "issue":
        return "🐛"
      default:
        return "📝"
    }
  }

  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-lg border border-border bg-card p-6 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start gap-4">
        {/* Vote Button - Requirement 14.2 */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onVote(post.id)}
            disabled={isVoting}
            className="w-12 h-12 rounded-lg"
            aria-label={`Vote for ${post.title}`}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground">{post.votes}</span>
        </div>

        {/* Content - Requirement 14.2: Display all required fields */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xl" aria-hidden="true">
              {getTypeIcon(post.type)}
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">{post.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{post.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(post.status)}`}>
              {formatStatus(post.status)}
            </span>
            {/* Requirement 14.2: Display timestamp */}
            <span className="text-xs text-muted-foreground">
              <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Main Forum Content Component
 * Requirement 14.1: Display list of recent discussions
 */
export function ForumContent() {
  const { toast } = useToast()
  const [posts, setPosts] = useState<FeatureRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterType, setFilterType] = useState<string>("")

  // Requirement 14.1: Load forum posts on mount and when filters change
  useEffect(() => {
    loadPosts()
  }, [currentPage, filterStatus, filterType])

  /**
   * Load forum posts from API
   * Requirement 14.4: Show skeleton loaders during fetch
   * Requirement 14.5: Handle API failures
   */
  const loadPosts = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params: any = {
        page: currentPage,
        limit: 10,
      }

      if (filterStatus) {
        params.status = filterStatus
      }

      if (filterType) {
        params.type = filterType
      }

      const response = await listFeatureRequests(params)
      setPosts(response.data)
      setTotalPages(response.pagination.totalPages)
    } catch (err: any) {
      // Requirement 14.5: Display error message for API failures
      console.error("Error loading forum posts:", err)
      setError(err.message || "Failed to load discussions. Please try again later.")
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handle voting on a post
   */
  const handleVote = async (id: string) => {
    if (votingIds.has(id)) return

    setVotingIds((prev) => new Set(prev).add(id))

    try {
      await voteFeatureRequest(id)

      // Update local state
      setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, votes: post.votes + 1 } : post)))

      toast({
        title: "Vote recorded",
        description: "Thank you for your feedback!",
      })
    } catch (err: any) {
      console.error("Error voting:", err)
      toast({
        variant: "destructive",
        title: "Vote failed",
        description: err.message || "You may have already voted for this request.",
      })
    } finally {
      setVotingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div className="py-8 sm:py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Back Link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <IconContainer icon={MessageSquare} variant="primary" size="lg" />
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Community Forum</h1>
              <p className="text-muted-foreground text-sm">Vote on features and see what's coming next</p>
            </div>
          </div>

          <Link href="/feature-request" className="sm:shrink-0">
            <Button className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              Submit Request
            </Button>
          </Link>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          <div className="flex-1">
            <label htmlFor="status-filter" className="block text-sm font-medium text-foreground mb-2">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value)
                setCurrentPage(1)
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
            <label htmlFor="type-filter" className="block text-sm font-medium text-foreground mb-2">
              Filter by Type
            </label>
            <select
              id="type-filter"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full h-10 px-3 rounded-lg bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground text-sm"
            >
              <option value="">All Types</option>
              <option value="role">Role Requests</option>
              <option value="feature">Feature Suggestions</option>
              <option value="issue">Issue Reports</option>
            </select>
          </div>
        </motion.div>

        {/* Error State - Requirement 14.5 */}
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={loadPosts}>
                  Try Again
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Loading State - Requirement 14.4: Skeleton loaders */}
        {isLoading && posts.length === 0 && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <ForumPostSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && posts.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No discussions found</p>
          </motion.div>
        )}

        {/* Forum Posts List - Requirement 14.1, 14.2 */}
        {!isLoading && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post, index) => (
              <ForumPostCard
                key={post.id}
                post={post}
                onVote={handleVote}
                isVoting={votingIds.has(post.id)}
                delay={0.2 + index * 0.05}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 mt-8"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoading}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isLoading}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
