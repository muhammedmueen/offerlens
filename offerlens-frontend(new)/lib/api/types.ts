/**
 * API Type Definitions
 * 
 * Type-safe interfaces for all API requests and responses
 */

/**
 * Analyze Offer Request
 */
export interface AnalyzeRequest {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
}

/**
 * Detected Red Flag
 */
export interface DetectedRedFlag {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  excerpt?: string;
}

/**
 * Salary Range
 */
export interface SalaryRange {
  min: number;
  avg: number;
  max: number;
}

/**
 * Salary Comparison
 */
export interface SalaryComparison {
  range: SalaryRange;
  comparison: 'below' | 'aligned' | 'above';
  difference: number;
  message: string;
}

/**
 * Negotiation Suggestion
 */
export interface NegotiationSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  suggestion: string;
  reasoning: string;
}

/**
 * Analyze Offer Response
 */
export interface AnalyzeResponse {
  redFlags: DetectedRedFlag[];
  salaryComparison: SalaryComparison;
  takeHome: number;
  negotiationSuggestions: NegotiationSuggestion[];
  analysisId: string;
}

/**
 * Text Extraction Response
 */
export interface TextExtractionResponse {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
}

/**
 * Feature Request Create
 */
export interface FeatureRequestCreate {
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
}

/**
 * Feature Request
 */
export interface FeatureRequest {
  id: string;
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
  status: 'submitted' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
  votes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature Request List Response
 */
export interface FeatureRequestListResponse {
  data: FeatureRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Metadata Response
 */
export interface MetadataResponse {
  roles?: string[];
  experienceLevels?: string[];
  cities?: string[];
}

/**
 * Health Check Response
 */
export interface HealthResponse {
  status: string;
}

/**
 * Upload Progress Callback
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Upload Options
 */
export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Forum Post
 * Requirement 14.2: Forum posts display all required fields
 */
export interface ForumPost {
  id: string;
  author: string;
  title: string;
  content: string;
  replies: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Forum Post List Response
 */
export interface ForumPostListResponse {
  data: ForumPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
