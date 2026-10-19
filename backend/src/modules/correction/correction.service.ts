import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses, type Analysis } from '@/db/schema/analyses.js';
import { corrections } from '@/db/schema/corrections.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { cacheDelete } from '@/shared/cache.js';
import { careerPathCacheKey } from '@/modules/career/career.service.js';
import { validateCorrection, setNestedValue } from './correctable-fields.js';
import { calculateTakeHome, annualBasicFrom } from '@/modules/takehome/takehome.calculator.js';
import { calculateScore } from '@/modules/analysis/score.rubric.js';
import { checkBenefits } from '@/modules/benefits/benefits.checklist.js';
import { optionalStage } from '@/shared/stage.js';
import type { SalaryComparison } from '@/modules/analysis/analysis.types.js';

interface CorrectionInput {
    field: string;
    correctedValue: unknown;
}

/** Fields whose correction changes the career narrative/progression (COR-2 cache trigger). */
const CAREER_RELEVANT_FIELDS = new Set(['extractedData.role', 'extractedData.location']);

/** Partial shape of the stored analysis row we overlay + recompute onto. */
type AnalysisUpdate = Partial<Pick<Analysis,
    'extractedData' | 'takeHome' | 'score' | 'scoreLabel' | 'scoringMethod' | 'scoreBreakdown' | 'salaryComparison'
>>;

export class CorrectionService {
    async applyCorrections(offerId: string, userId: string, items: CorrectionInput[]) {
        // Verify offer ownership
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed before submitting corrections', 400);
        }

        // Get analysis to check original values + as the source of truth we overlay onto.
        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        // Validate every item BEFORE any write (the allowlist is a security boundary — an
        // unchecked field would let setNestedValue write an arbitrary jsonb key).
        const validated = items.map((item) => ({
            field: item.field,
            correctedValue: validateCorrection(item.field, item.correctedValue),
        }));

        // Build the overlaid extractedData by applying each genuinely-changed correction onto a
        // deep clone, tracking which audit rows to upsert and which fields actually changed.
        let extractedData = analysis.extractedData;
        const toPersist: Array<{ field: string; originalValue: unknown; correctedValue: string | number | null }> = [];
        const changedFields = new Set<string>();

        for (const item of validated) {
            const originalValue = this.getNestedValue(extractedData, this.relativePath(item.field));

            // No-op skip: compare against the (progressively overlaid) corrected snapshot, so
            // re-saving an already-applied value is correctly a no-op.
            if (JSON.stringify(originalValue) === JSON.stringify(item.correctedValue)) {
                continue;
            }

            extractedData = setNestedValue(extractedData, this.relativePath(item.field), item.correctedValue);
            toPersist.push({ field: item.field, originalValue: originalValue ?? null, correctedValue: item.correctedValue });
            changedFields.add(item.field);
        }

        if (changedFields.size === 0) {
            return { changed: false, correctionsApplied: 0, totalSubmitted: items.length };
        }

        // Targeted deterministic recompute (design §2). Wrapped in optionalStage so a malformed
        // stored row degrades to "corrected input shown, derived numbers unchanged" rather than
        // a 500 — the same fail-soft the worker and getAnalysis already use.
        const recompute = optionalStage(
            'correction recompute',
            () => this.recomputeDerived(analysis, extractedData, changedFields),
            {} as AnalysisUpdate,
        );

        await db.transaction(async (tx) => {
            await tx.update(analyses)
                .set({ extractedData, ...recompute })
                .where(eq(analyses.offerId, offerId));

            for (const row of toPersist) {
                await tx.insert(corrections)
                    .values({
                        offerId,
                        userId,
                        field: row.field,
                        originalValue: row.originalValue,
                        correctedValue: row.correctedValue,
                    })
                    .onConflictDoUpdate({
                        target: [corrections.offerId, corrections.field],
                        set: { userId, originalValue: row.originalValue, correctedValue: row.correctedValue, createdAt: new Date() },
                    });
            }
        });

        // COR-2: only drop the career cache when a field the career path depends on changed.
        // A totalCTC/notice/probation correction leaves the cache (and its credit) alone; a
        // later regeneration reads the corrected role/location from extractedData for free.
        if ([...changedFields].some((f) => CAREER_RELEVANT_FIELDS.has(f))) {
            await cacheDelete(careerPathCacheKey(offerId));
        }

        return {
            changed: true,
            correctionsApplied: changedFields.size,
            totalSubmitted: items.length,
        };
    }

    /**
     * Recompute the derived figures that are pure, deterministic functions of the corrected
     * extractedData (design §2). Only a totalCTC change triggers a recompute; role/location
     * corrections cannot be re-benchmarked honestly from stored data (the full weighted sample
     * is not persisted), so they overlay only and just invalidate the career cache.
     */
    private recomputeDerived(analysis: Analysis, extractedData: any, changedFields: Set<string>): AnalysisUpdate {
        if (!changedFields.has('extractedData.compensation.totalCTC')) return {};

        const compensation = extractedData?.compensation;

        // takeHome — clean arithmetic. baseSalary is NOT correctable but MUST still be supplied:
        // a null basic changes PF treatment and widens the range, so dropping it would silently
        // produce a different number than the worker did for the same basic.
        const takeHome = calculateTakeHome({
            totalCtc: compensation?.totalCTC ?? null,
            annualBasic: annualBasicFrom(compensation?.baseSalary),
        });

        const update: AnalysisUpdate = { takeHome };

        // score — reconstruct ScoreInput purely from stored columns + the corrected CTC.
        const stored = (analysis.salaryComparison ?? {}) as SalaryComparison;
        const storedBreakdown = analysis.scoreBreakdown as { components?: unknown; note?: string | null } | null;

        const offerPercentile = this.reRankPercentile(stored, compensation?.totalCTC ?? null);

        // Unscored branch: the stored salary was never ranked, so leave the score as stored and
        // do not touch salaryComparison. We must early-return BEFORE constructing salarySource —
        // 'ai_estimated' is not assignable to BenchmarkSource, so tsc would reject it.
        if (offerPercentile === null) {
            return update;
        }

        const salarySource = stored.dataSource === 'crowdsourced' ? 'crowdsourced' : 'public_survey';

        const scoring = calculateScore({
            redFlags: (analysis.redFlags ?? []) as any,
            benefits: (analysis.benefits ?? []) as any,
            benefitsChecklist: checkBenefits((analysis.benefits ?? []) as any),
            extractedData,
            offerPercentile,
            salarySource,
            salaryScope: stored.benchmarkScope,
            // Read the withheld reason FLAT: toSalaryComparison stores it as the reason string
            // ('no_experience_rows'), not a { reason } object, so .reason would be undefined and
            // silently defeat the withheld guard.
            salaryWithheld: stored.percentileWithheld ?? undefined,
        });

        update.score = scoring.score;
        update.scoreLabel = scoring.label;
        update.scoringMethod = scoring.method;
        // Write back in the { components, note } envelope the worker stores and getAnalysis reads
        // (storedBreakdown?.components / ?.note) — never a bare components array.
        update.scoreBreakdown = { components: scoring.components, note: scoring.note };
        update.salaryComparison = { ...stored, offerPercentile };
        void storedBreakdown;

        return update;
    }

    /**
     * Re-rank the corrected CTC against the stored four-point marketRange, or null if the stored
     * salary was never ranked (so salary stays unscored, as the worker left it).
     *
     * ponytail: this is a 4-point piecewise-linear interpolation of the worker's full-sample
     * `weightedPercentileRank`. Ceiling: the percentile is approximate on a CTC correction and a
     * corrected score can differ by a few points from a full re-benchmark. Upgrade path: persist
     * the weighted reference sample (or extract deriveFromExtracted() from the worker and re-run
     * the real rank).
     */
    private reRankPercentile(stored: SalaryComparison, correctedCtc: number | null): number | null {
        if (correctedCtc === null || !Number.isFinite(correctedCtc)) return null;
        // Only re-rank a real benchmark that was actually scored. AI estimates, null percentiles
        // and withheld rows stay unscored — inventing a salary sub-score from a range we never
        // ranked against is the exact failure scoreSalary guards against.
        if (stored.dataSource === 'ai_estimated') return null;
        if (stored.offerPercentile === null || stored.offerPercentile === undefined) return null;
        if (stored.percentileWithheld) return null;

        const r = stored.marketRange;
        if (!r) return null;
        const points: Array<[number, number]> = [[r.p25, 25], [r.p50, 50], [r.p75, 75], [r.p90, 90]];
        // Degenerate / non-increasing stored range → cannot interpolate honestly.
        for (let i = 1; i < points.length; i++) {
            if (!(points[i][0] > points[i - 1][0]) || points[i - 1][0] <= 0) return null;
        }

        if (correctedCtc <= points[0][0]) return points[0][1];
        if (correctedCtc >= points[points.length - 1][0]) return points[points.length - 1][1];
        for (let i = 1; i < points.length; i++) {
            const [x0, y0] = points[i - 1];
            const [x1, y1] = points[i];
            if (correctedCtc <= x1) {
                const t = (correctedCtc - x0) / (x1 - x0);
                return Math.max(0, Math.min(100, y0 + t * (y1 - y0)));
            }
        }
        return points[points.length - 1][1];
    }

    /** The six allowlisted paths are rooted at the analysis row (`extractedData.x`); the overlay
     * clone IS the extractedData object, so strip the leading `extractedData.`. */
    private relativePath(field: string): string {
        return field.startsWith('extractedData.') ? field.slice('extractedData.'.length) : field;
    }

    async getCorrections(offerId: string, userId: string) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });

        const result = await db.query.corrections.findMany({
            where: eq(corrections.offerId, offerId),
            orderBy: (c, { desc }) => [desc(c.createdAt)],
        });

        return result;
    }

    private getNestedValue(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            // Handle array indexing like redFlags[0]
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                current = current?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
            } else {
                current = current?.[part];
            }
            if (current === undefined) return undefined;
        }

        return current;
    }
}
