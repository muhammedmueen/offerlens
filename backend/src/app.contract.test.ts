import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { offerRoutes } from '@/modules/offer/offer.routes.js';
import { analysisRoutes } from '@/modules/analysis/analysis.routes.js';
import { metadataRoutes } from '@/modules/metadata/metadata.routes.js';
import { featureRequestRoutes } from '@/modules/feature-request/feature-request.routes.js';
import { healthRoutes } from '@/modules/health/health.routes.js';
import { authRoutes } from '@/modules/auth/auth.routes.js';
import { userRoutes } from '@/modules/user/user.routes.js';
import { negotiationRoutes } from '@/modules/negotiation/negotiation.routes.js';
import { benefitsRoutes } from '@/modules/benefits/benefits.routes.js';
import { comparisonRoutes } from '@/modules/comparison/comparison.routes.js';
import { correctionRoutes } from '@/modules/correction/correction.routes.js';
import { salaryRoutes } from '@/modules/salary/salary.routes.js';
import { careerRoutes } from '@/modules/career/career.routes.js';
import { forumRoutes } from '@/modules/forum/forum.routes.js';
import type { AnalysisResponse } from '@/modules/analysis/analysis.types.js';

/**
 * Guards against frontend↔backend contract drift.
 *
 * Three separate breaks had shipped by the time this was written, all the same bug class:
 * the frontend's ENDPOINTS table and the Fastify route definitions drifted apart with
 * nothing watching.
 *
 *   - Salary Explorer called /salaries and /salaries/stats; the server served /salary.
 *   - OFFER_ANALYZE pointed at /offers/:id/analyze, which never existed.
 *   - ResultsPage read a.score and a.negotiationTips, which the server never sent.
 *
 * Note the last one: the PATH was correct and the SHAPE was wrong. A path-only check
 * would have missed it, which is why the response-key assertions below exist.
 *
 * Routes are registered without the plugin stack, so this needs no Postgres or Redis —
 * it inspects the route table rather than serving traffic.
 */

/**
 * Copy of frontend/src/constants/api.ts ENDPOINTS, with :params substituted for the
 * `:id` style Fastify uses. Kept as a literal rather than imported across package
 * boundaries — if the frontend changes, this test should fail loudly and be updated
 * deliberately.
 */
const FRONTEND_ENDPOINTS: Array<[method: string, path: string]> = [
    ['POST', '/auth/signup'],
    ['POST', '/auth/login'],
    ['POST', '/auth/google'],
    ['POST', '/auth/refresh'],
    ['POST', '/auth/logout'],

    ['GET', '/users/me'],
    ['DELETE', '/users/me'],
    ['GET', '/users/me/offers'],
    ['GET', '/users/me/dashboard'],

    ['POST', '/offers'],
    ['GET', '/offers/:id'],
    ['DELETE', '/offers/:id'],
    ['GET', '/offers/:id/analysis'],
    ['GET', '/offers/:id/report'],
    ['POST', '/offers/:id/negotiate'],
    ['POST', '/offers/:id/benefits'],
    ['POST', '/offers/extract'],
    ['POST', '/offers/extract-file'],
    ['GET', '/offers/:id/career-path'],
    ['PATCH', '/offers/:id/corrections'],
    ['GET', '/offers/:id/corrections'],
    ['POST', '/offers/compare'],

    ['POST', '/salaries'],
    ['GET', '/salaries/stats'],

    ['GET', '/metadata/roles'],
    ['GET', '/metadata/cities'],
    ['GET', '/metadata/experience-levels'],

    ['GET', '/forum/posts'],
    ['POST', '/forum/posts'],
    ['GET', '/forum/posts/:id'],
    ['POST', '/forum/posts/:id/comments'],

    ['POST', '/feature-requests'],
    ['GET', '/feature-requests'],
    ['POST', '/feature-requests/:id/vote'],

    ['GET', '/health'],
];

/** Fastify param names differ per route (:id vs :postId). Compare structurally. */
const normalise = (path: string) => path.replace(/:[A-Za-z0-9_]+/g, ':param');

async function collectRoutes(): Promise<Set<string>> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const registered = new Set<string>();
    app.addHook('onRoute', (route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const m of methods) registered.add(`${m} ${normalise(route.url)}`);
    });

    // Mirrors app.ts. Plugins are skipped so no DB/Redis connection is needed.
    await app.register(async (api) => {
        await api.register(healthRoutes);
        await api.register(authRoutes, { prefix: '/auth' });
        await api.register(userRoutes, { prefix: '/users' });
        await api.register(offerRoutes, { prefix: '/offers' });
        await api.register(analysisRoutes);
        await api.register(metadataRoutes, { prefix: '/metadata' });
        await api.register(featureRequestRoutes, { prefix: '/feature-requests' });
        await api.register(negotiationRoutes);
        await api.register(benefitsRoutes);
        await api.register(comparisonRoutes);
        await api.register(correctionRoutes);
        await api.register(salaryRoutes);
        await api.register(careerRoutes);
        await api.register(forumRoutes, { prefix: '/forum' });
    }, { prefix: '/api/v1' });

    await app.ready();
    await app.close();
    return registered;
}

describe('frontend↔backend route contract', () => {
    it('serves every endpoint the frontend calls', async () => {
        const registered = await collectRoutes();

        const missing = FRONTEND_ENDPOINTS
            .map(([method, path]) => `${method} /api/v1${normalise(path)}`)
            .filter((key) => !registered.has(key));

        expect(missing, `frontend calls routes the backend does not serve:\n  ${missing.join('\n  ')}`)
            .toEqual([]);
    });

    it('registers the salary routes under the plural resource path', async () => {
        const registered = await collectRoutes();
        // The specific break: these were /salary, so the Explorer 404'd on both.
        expect(registered.has('POST /api/v1/salaries')).toBe(true);
        expect(registered.has('GET /api/v1/salaries/stats')).toBe(true);
    });

    it('does not serve /offers/:id/analyze — the frontend constant for it was removed', async () => {
        const registered = await collectRoutes();
        expect(registered.has('GET /api/v1/offers/:param/analyze')).toBe(false);
        expect(registered.has('POST /api/v1/offers/:param/analyze')).toBe(false);
    });
});

describe('analysis response shape', () => {
    /**
     * Keys ResultsPage reads. A path-only contract check passes happily while the page
     * throws on `undefined.map()`, which is exactly what happened with negotiationTips.
     */
    const REQUIRED_KEYS = [
        'score',
        'scoreLabel',
        'scoringMethod',
        'extractedData',
        'redFlags',
        'salaryComparison',
        'negotiationSuggestions',
        'benefits',
        'takeHome',
        'metadata',
        'expiresAt',
        'ocrConfidence',
    ] as const;

    it('AnalysisResponse declares every key the results view depends on', () => {
        // Type-level guard: this literal must satisfy AnalysisResponse, so dropping a
        // field from the type breaks compilation here as well as failing the assertion.
        const sample: AnalysisResponse = {
            score: 72,
            scoreLabel: 'good',
            scoringMethod: 'standard',
            lowConfidence: false,
            redFlagsDiscarded: 0,
            offerStatus: 'COMPLETED',
            expiresAt: null,
            ocrConfidence: null,
            extractedData: {} as never,
            redFlags: [],
            salaryComparison: {} as never,
            negotiationSuggestions: [],
            benefits: [],
            takeHome: null,
            metadata: { analysisVersion: '1.0', modelUsed: 'test', processingNote: null },
        };

        for (const key of REQUIRED_KEYS) {
            expect(sample, `AnalysisResponse is missing "${key}", which ResultsPage reads`)
                .toHaveProperty(key);
        }
    });
});

/**
 * Drawer panel contracts.
 *
 * The three results-page drawers repeated the same bug class the tests above were written
 * for — correct path, wrong shape — and the path-only check passed for all three:
 *
 *   - CareerTimeline required `milestone.skills`; the endpoint returns no such field, so
 *     `skills.map()` threw and (with no error boundary) white-screened the whole page.
 *   - BenefitsPanel read `data.benefits` and `b.value`; the service returns `breakdown`
 *     and `monetaryValue`, so the panel always claimed "no benefits data found".
 *   - CorrectionsPanel read `data.fields` off a response that is an array, and POSTed
 *     `{ fields: {...} }` against a schema that requires `{ corrections: [...] }`.
 *
 * Scope note: these assert the shapes produced by real in-repo code (the mock AI provider,
 * the pure calculator, the request schema). The live Gemini career-path shape is defined by
 * a prompt and cannot be pinned here — the mock is what the integration harness runs
 * against, so drift between mock and frontend is what this catches.
 */
describe('career path response shape', () => {
    it('returns timeline/skillsToLearn/potentialRoles, and no per-milestone skills', async () => {
        const { MockAiProvider } = await import('@/providers/ai/mock.ai.js');
        const path = await new MockAiProvider().generateCareerPath({
            role: 'Software Engineer',
            companyType: 'startup',
            industry: 'Technology',
        });

        expect(Array.isArray(path.timeline)).toBe(true);
        expect(Array.isArray(path.skillsToLearn)).toBe(true);
        expect(Array.isArray(path.potentialRoles)).toBe(true);

        for (const milestone of path.timeline) {
            // What CareerTimeline renders.
            expect(milestone).toHaveProperty('year');
            expect(milestone).toHaveProperty('title');
            expect(milestone).toHaveProperty('focus');
            expect(milestone).toHaveProperty('salaryRange');
            // The field the component used to require. Asserted absent so that if it is
            // ever added, this failure is a prompt to render it rather than a page crash.
            expect(milestone).not.toHaveProperty('skills');
        }
    });
});

describe('benefits breakdown row shape', () => {
    it('names the amount field monetaryValue, not value', async () => {
        const { calculateBenefitValues } = await import('@/modules/benefits/benefits.calculator.js');

        const rows = calculateBenefitValues(
            [{ name: 'Health Insurance', value: '₹5 lakh', details: '', category: 'insurance' } as never],
            { baseSalary: { amount: 1_200_000, period: 'annual' }, currency: 'INR' } as never,
        );

        expect(rows).toHaveLength(1);
        // Keys BenefitsPanel reads off every row.
        for (const key of ['name', 'category', 'monetaryValue', 'details', 'isQuantifiable']) {
            expect(rows[0], `benefits breakdown row is missing "${key}"`).toHaveProperty(key);
        }
        expect(rows[0]).not.toHaveProperty('value');
    });
});

describe('corrections request shape', () => {
    it('accepts { corrections: [{ field, correctedValue }] } and rejects { fields }', async () => {
        const { applyCorrectionSchema } = await import('@/modules/correction/correction.schema.js');

        const valid = applyCorrectionSchema.body.safeParse({
            corrections: [{ field: 'extractedData.role', correctedValue: 'Backend Engineer' }],
        });
        expect(valid.success, 'the shape CorrectionsPanel now sends must validate').toBe(true);

        // The shape the panel used to send.
        expect(applyCorrectionSchema.body.safeParse({ fields: { role: 'Backend Engineer' } }).success)
            .toBe(false);
        // Empty submissions are rejected server-side, which is why the panel disables Save
        // until at least one field actually changes.
        expect(applyCorrectionSchema.body.safeParse({ corrections: [] }).success).toBe(false);
    });
});
