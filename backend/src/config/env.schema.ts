import { z } from 'zod';

export const envSchema = z.object({
    PORT: z.coerce.number().default(8000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_CLOUD_CREDENTIALS: z.string().optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    // Signs the guest identity cookie (ADR-001). Falls back to JWT_SECRET when unset so
    // existing local .env files keep working; set it explicitly in production.
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters').optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    STORAGE_PATH: z.string().default('./uploads'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;
