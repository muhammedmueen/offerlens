import { z } from 'zod';

export const envSchema = z.object({
    PORT: z.coerce.number().default(8000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // Must match the frontend dev server, which Vite serves on 8080. Defaulted to 3000,
    // so credentialed requests were blocked by CORS out of the box.
    CORS_ORIGIN: z.string().default('http://localhost:8080'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_CLOUD_CREDENTIALS: z.string().optional(),

    /**
     * Which provider serves AI calls by default.
     *
     * Gemini stays the default because it is the one with a usable free tier, which is what
     * the free plan is built on. Requests may override this per call in development — see
     * `resolveAiOverride`.
     */
    AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic', 'mock']).default('gemini'),

    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    /** Override the default model for a provider, without a code change. */
    OPENAI_MODEL: z.string().optional(),
    ANTHROPIC_MODEL: z.string().optional(),
    GEMINI_MODEL: z.string().optional(),

    /**
     * Allows the `X-AI-*` request headers to choose a provider, model and API key per call.
     *
     * Defaults to OFF, and is refused outright in production regardless of this value — an
     * endpoint that accepts arbitrary credentials and arbitrary model names is an abuse
     * vector, not a convenience. It exists so provider switching during development does not
     * mean editing `.env` and restarting.
     */
    ALLOW_AI_REQUEST_OVERRIDE: z.coerce.boolean().default(false),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    // Signs the guest identity cookie (ADR-001). Falls back to JWT_SECRET when unset so
    // existing local .env files keep working; set it explicitly in production.
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters').optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    STORAGE_PATH: z.string().default('./uploads'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /**
     * Number of proxy hops in front of the API, passed to Fastify's `trustProxy` (audit D10).
     *
     * A hop COUNT, not a boolean: `z.coerce.boolean()` reads any non-empty string — including
     * `"false"` — as true, which is exactly the trap `ALLOW_AI_REQUEST_OVERRIDE` fell into. 0
     * means off (Fastify gets `false`); behind the guide's single host nginx use 1. Capped at 5
     * so a typo cannot make Fastify trust an absurd chain. An unparseable value is rejected.
     */
    TRUST_PROXY: z
        .string()
        .optional()
        .transform((v) => (v === undefined || v === '' ? 0 : Number(v)))
        .pipe(z.number().int().min(0).max(5))
        .default(0),
});

export type Env = z.infer<typeof envSchema>;
