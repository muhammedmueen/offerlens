/**
 * Response shapes the pages depend on, written from the backend services, not from what the UI
 * wished it got. The pages used to read these through `any`, which is how field renames shipped
 * unnoticed. Backend counterparts are noted so a change on either side is easy to follow.
 */

/** backend/src/modules/feature-request/feature-request.service.ts */
export type FeatureRequestStatus = "open" | "planned" | "in_progress" | "done" | "rejected";

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  voteCount: number;
  /** Matched on the caller's guest/browser id, so false when the cookie is gone. */
  hasVoted: boolean;
  createdAt: string;
}

/** backend/src/modules/forum/forum.service.ts */
export interface ForumPostSummary {
  id: string;
  title: string;
  category: string;
  viewCount: number | null;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
  commentCount: number | string;
}

export interface ForumComment {
  id: string;
  content: string;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
  authorId: string | null;
}

export interface ForumPostDetail {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
  author?: { id: string; name: string | null; avatarUrl: string | null };
  comments: ForumComment[];
}

/** backend/src/modules/user/user.service.ts: GET /users/me/offers */
export interface UserOfferSummary {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  /** Null until the offer has been analysed. */
  score: number | null;
  scoreLabel: string | null;
  /** From the analysis; null when it could not be read from the letter. */
  company: string | null;
  /** From the analysis, else the role typed at upload. */
  role: string | null;
}

export interface UserOffersPage {
  offers: UserOfferSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** backend/src/modules/user/user.service.ts: GET /users/me/dashboard */
export interface DashboardStats {
  totalOffers: number;
  completedAnalyses: number;
  averageScore: number | null;
  bestScore: number | null;
}

/** backend/src/modules/negotiation/negotiation.service.ts: POST /offers/:id/negotiate */
export interface NegotiationSuggestion {
  component: string;
  currentValue: string;
  suggestedAsk: string;
  rationale: string;
  priority: "high" | "medium" | "low";
}

export type NegotiationScript =
  | { type: "personalized"; subject: string; body: string; suggestions: NegotiationSuggestion[] }
  | { type: "template"; subject: string; body: string; note: string; suggestions: NegotiationSuggestion[] };
