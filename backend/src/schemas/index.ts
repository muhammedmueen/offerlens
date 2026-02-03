import { z } from 'zod';

/**
 * Zod schemas for API request validation
 * Requirements: 1.3, 6.3
 */

// Analysis request schema
export const analyzeRequestSchema = z.object({
  offerText: z.string().min(100, 'Offer text must be at least 100 characters').max(50000, 'Offer text too long'),
  role: z.string().min(1, 'Role is required'),
  experience: z.string().min(1, 'Experience level is required'),
  ctc: z.number().positive('CTC must be a positive number'),
  city: z.string().min(1, 'City is required'),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

// Text extraction request schema
export const extractTextRequestSchema = z.object({
  fileType: z.enum(['pdf', 'image'], { errorMap: () => ({ message: 'File type must be pdf or image' }) }),
  fileName: z.string().min(1, 'File name is required'),
});

export type ExtractTextRequest = z.infer<typeof extractTextRequestSchema>;

// Feature request schema
export const featureRequestSchema = z.object({
  type: z.enum(['role', 'feature', 'issue'], { errorMap: () => ({ message: 'Type must be role, feature, or issue' }) }),
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description too long'),
  userEmail: z.string().email('Invalid email address').optional(),
});

export type FeatureRequestCreate = z.infer<typeof featureRequestSchema>;

// Feature request query schema
export const featureRequestQuerySchema = z.object({
  status: z.enum(['submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined']).optional(),
  type: z.enum(['role', 'feature', 'issue']).optional(),
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional().default('1'),
  limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional().default('20'),
});

export type FeatureRequestQuery = z.infer<typeof featureRequestQuerySchema>;

// Vote request schema
export const voteRequestSchema = z.object({
  id: z.string().uuid('Invalid feature request ID'),
});

export type VoteRequest = z.infer<typeof voteRequestSchema>;

// Admin login schema
export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLogin = z.infer<typeof adminLoginSchema>;

// Salary benchmark schema
export const salaryBenchmarkSchema = z.object({
  role: z.string().min(1, 'Role is required'),
  experienceLevel: z.string().min(1, 'Experience level is required'),
  city: z.string().min(1, 'City is required'),
  minSalary: z.number().positive('Min salary must be positive'),
  avgSalary: z.number().positive('Avg salary must be positive'),
  maxSalary: z.number().positive('Max salary must be positive'),
  effectiveDate: z.string().datetime().or(z.date()),
}).refine((data) => data.minSalary <= data.avgSalary && data.avgSalary <= data.maxSalary, {
  message: 'Salary range must be: min <= avg <= max',
});

export type SalaryBenchmarkCreate = z.infer<typeof salaryBenchmarkSchema>;

// Red flag rule schema
export const redFlagRuleSchema = z.object({
  ruleId: z.string().min(1, 'Rule ID is required'),
  severity: z.enum(['high', 'medium', 'low'], { errorMap: () => ({ message: 'Severity must be high, medium, or low' }) }),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(1, 'Description is required'),
  keywords: z.array(z.string().min(1)).min(1, 'At least one keyword is required'),
  active: z.boolean().optional().default(true),
});

export type RedFlagRuleCreate = z.infer<typeof redFlagRuleSchema>;

// Feature request status update schema
export const featureRequestStatusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined']),
  adminNote: z.string().max(1000, 'Admin note too long').optional(),
});

export type FeatureRequestStatusUpdate = z.infer<typeof featureRequestStatusSchema>;

// UUID param schema
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export type UuidParam = z.infer<typeof uuidParamSchema>;
