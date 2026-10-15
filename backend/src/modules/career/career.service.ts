import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { createAiProvider, type AiProviderSelection } from '@/providers/ai/ai.factory.js';
import { cacheGetJson, cacheSetJson } from '@/shared/cache.js';
import { CAREER_PATH_CACHE_TTL_SECONDS } from '@/config/constants.js';
import type { Tier } from '@/config/plans.js';
import { release, reserve } from '@/modules/quota/quota.service.js';
import { SalaryService } from '@/modules/salary/salary.service.js';
import { pickBenchmarkCity } from '@/modules/salary/benchmark-comparison.js';
import { containsPayFigure } from '@/providers/ai/career.prompt.js';

/**
 * One cached career NARRATIVE per offer. Invalidated by CorrectionService when the offer's
 * extracted data is corrected — the only event that changes the inputs. v2: the narrative no
 * longer carries pay figures (5.5), and the pay table is recomputed on every open, never cached.
 */
export function careerPathCacheKey(offerId: string): string {
    return `career-path:v2:${offerId}`;
}

interface Narrative { timeline: Array<{ year: unknown; title: unknown; focus: unknown }>; skillsToLearn: string[]; potentialRoles: string[] }

/**
 * Whitelists the model's output to the shape the UI reads. Any other key (a stray salaryRange,
 * salaryBands, ...) is dropped by construction. Shape hygiene only: it does not inspect prose;
 * `hasPayFigure` does that. Null = not a usable narrative (treated like the provider's own soft error).
 */
export function toNarrative(raw: unknown): Narrative | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.timeline)) return null;
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
        timeline: r.timeline
            .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
            .map((m) => ({ year: m.year, title: m.title, focus: m.focus })),
        skillsToLearn: strs(r.skillsToLearn),
        potentialRoles: strs(r.potentialRoles),
    };
}

/**
 * The no-pay-figures guarantee is the prompt's instruction + the key whitelist above + this scan of
 * every prose field. A heuristic, not a proof (see `containsPayFigure` for what it misses).
 */
export function hasPayFigure(n: Narrative): boolean {
    return [...n.timeline.flatMap((m) => [m.year, m.title, m.focus]), ...n.skillsToLearn, ...n.potentialRoles]
        .some((x) => typeof x === 'string' && containsPayFigure(x));
}

export class CareerService {
    private salary = new SalaryService();

    constructor(private fastify: FastifyInstance) { }

    /**
     * The career path for an offer. A cache hit is free; a miss costs one unit of the daily
     * career cap (task 4.3), given back if generation fails. Redis fails soft, so during an
     * outage every open is a miss and costs a unit.
     */
    async generatePath(offerId: string, userId: string, tier: Tier, selection: AiProviderSelection = {}) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });

        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed first', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extracted = analysis.extractedData as AnalysisResult['extractedData'];
        if (!extracted.role) {
            throw new AppError(ERROR_CODES.INVALID_INPUT, 'Cannot generate career path: Role not identified in offer', 400);
        }

        // The pay table is deterministic and never cached (the narrative holds no figures, so
        // nothing can contradict a fresh table). getProgression never throws.
        const ctx = offer.userContext as Record<string, unknown> | null;
        const str = (v: unknown) => (typeof v === 'string' ? v : null);
        const role = extracted.role;
        const progression = () => this.salary.getProgression({
            role,
            location: pickBenchmarkCity(extracted.location, str(ctx?.city)),
            currency: extracted.compensation?.currency,
            experienceLevel: str(ctx?.experienceLevel),
        });

        const key = careerPathCacheKey(offerId);
        const hit = await cacheGetJson<Narrative>(key);
        if (hit !== null) return { ...hit, progression: await progression() };

        // Throws QuotaExceededError (429) before any AI call or progression read.
        const reservation = await reserve(db, { type: 'user', id: userId, tier }, 'career');

        // Task 7: industry and companyType are extracted from the letter (no longer hardcoded
        // to 'Technology' / 'Unknown'). Built per call so a development provider override is
        // honoured. Falls through to the configured default when the selection is empty.
        let raw: unknown;
        let progressionResult: Awaited<ReturnType<typeof progression>>;
        try {
            const ai = createAiProvider(selection, {
                userId: offer.userId,
                guestId: offer.guestId,
                offerId,
            });
            // ponytail: the progression runs concurrently with the AI call, so it adds no latency
            // on a miss. It re-reads on every open (up to 6 Redis gets, 2 indexed queries).
            [raw, progressionResult] = await Promise.all([
                ai.generateCareerPath({
                    role: extracted.role,
                    companyType: extracted.companyType || 'Unknown',
                    industry: extracted.industry || 'Unknown',
                }),
                progression(),
            ]);
        } catch (error) {
            await release(db, reservation);
            throw error;
        }

        // The provider reports failure as `{ timeline: [], ..., error }` rather than throwing.
        // That is not a career path: give the unit back and don't cache it. The progression
        // still renders, so the user keeps the part that does not need the model.
        const soft = !!raw && typeof raw === 'object' && 'error' in raw && (raw as { error?: unknown }).error;
        let narrative = soft ? null : toNarrative(raw);
        // A narrative that carries a pay figure is dropped like an unusable one; the table stays.
        // The text is not logged: it is model output about a user's offer.
        if (narrative && hasPayFigure(narrative)) {
            console.warn('[Career] narrative dropped: pay figure in prose');
            narrative = null;
        } else if (!narrative && !soft) {
            console.warn('[Career] malformed narrative');
        }
        if (!narrative) {
            await release(db, reservation);
            return soft
                ? { ...(raw as object), progression: progressionResult }
                : { timeline: [], skillsToLearn: [], potentialRoles: [], error: 'Career path generation returned an unusable result', progression: progressionResult };
        }

        await cacheSetJson(key, narrative, CAREER_PATH_CACHE_TTL_SECONDS);
        return { ...narrative, progression: progressionResult };
    }
}
