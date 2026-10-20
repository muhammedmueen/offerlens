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
import { calculateTakeHome, annualBasicFrom, annualVariableFrom } from '@/modules/takehome/takehome.calculator.js';
import { calculateScore } from '@/modules/analysis/score.rubric.js';
import { checkBenefits } from '@/modules/benefits/benefits.checklist.js';
import { optionalStage } from '@/shared/stage.js';
import type { SalaryComparison } from '@/modules/analysis/analysis.types.js';
import { hasUsableRange } from '@/modules/salary/benchmark-comparison.js';

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
        // a null basic turns the figure into an upper bound and variablePay is taken out of the
        // monthly figure, so dropping either would silently produce a different number than the
        // worker did for the same offer.
        const takeHome = calculateTakeHome({
            totalCtc: compensation?.totalCTC ?? null,
            annualBasic: annualBasicFrom(compensation?.baseSalary),
            annualVariable: annualVariableFrom(compensation?.variablePay),
        });

        const update: AnalysisUpdate = { takeHome };

        // score — reconstruct ScoreInput purely from stored columns + the corrected CTC.
        const stored = (analysis.salaryComparison ?? {}) as SalaryComparison;
        const storedBreakdown = analysis.scoreBreakdown as { components?: unknown; note?: string | null } | null;

        // SEC-1: anchor the re-rank on the worker's own (CTC, rank) point. Each correction
        // overwrites the row's CTC and percentile, so capture that point once (first correction:
        // the pre-overlay CTC + stored percentile) and reuse it, or successive corrections drift.
        const storedCtc = (analysis.extractedData as any)?.compensation?.totalCTC ?? null;
        // A persisted anchor is read back from jsonb, so only trust it if both fields are finite;
        // a malformed one would otherwise feed NaN into the re-rank and the score.
        const persisted = stored.rankAnchor;
        const validPersisted = persisted
            && Number.isFinite(persisted.ctc) && Number.isFinite(persisted.percentile)
            ? persisted : null;
        const rankAnchor = validPersisted
            ?? (typeof storedCtc === 'number' && Number.isFinite(storedCtc) && typeof stored.offerPercentile === 'number'
                ? { ctc: storedCtc, percentile: stored.offerPercentile }
                : null);
        const offerPercentile = this.reRankPercentile(stored, compensation?.totalCTC ?? null, rankAnchor);

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
        update.salaryComparison = { ...stored, offerPercentile, ...(rankAnchor ? { rankAnchor } : {}) };
        void storedBreakdown;

        return update;
    }

    /**
     * Re-rank the corrected CTC against the stored four-point marketRange, or null if the stored
     * salary was never ranked (so salary stays unscored, as the worker left it).
     *
     * Below p25 the line runs from (0, 0th) to (p25, 25th); above p90 the p75->p90 slope is
     * extended, capped at 99. The result is an integer in [0, 99], monotonic in the CTC, and never
     * clamped to a band edge (MONEY-6 / SEC-1: the old clamp to 25..90 could raise the score on a
     * down-correction).
     *
     * Anchored on the worker's point (anchor.ctc, anchor.percentile), which came from the real
     * full-sample rank and is persisted as salaryComparison.rankAnchor on the first correction:
     * a CTC below the anchor returns min(line, anchor), above it max(line, anchor). So a CTC below
     * the letter's can never rank above what the worker stored, and reverting to the letter's CTC
     * returns the worker's rank exactly. Both halves are non-decreasing and meet at the anchor, so
     * the result is one fixed, monotonic function of the CTC for the life of the row, whatever
     * order the corrections come in.
     *
     * ponytail: a 4-point piecewise-linear stand-in for the worker's full-sample
     * `weightedPercentileRank`. Ceiling: inside a band the true rank lies between the band's end
     * percentiles, so the error is at most 25 points (p25-p50, p50-p75) or 15 (p75-p90); below p25
     * at most 25 (true rank in [0, 25]); above p90 at most 10 (true rank in [90, 100], output in
     * [90, 99]). The anchor can flatten the curve near the stored CTC (a small move off the stored
     * point returns the stored rank until the line crosses it), which errs on the stored side and
     * stays within the same bounds. Smooth samples are typically within a few points. Upgrade
     * path: persist the weighted reference sample (or extract deriveFromExtracted() from the
     * worker and re-run the real rank).
     */
    private reRankPercentile(
        stored: SalaryComparison,
        correctedCtc: number | null,
        anchor: { ctc: number; percentile: number } | null,
    ): number | null {
        if (correctedCtc === null || !Number.isFinite(correctedCtc)) return null;
        // Only re-rank a real benchmark that was actually scored. AI estimates, null percentiles
        // and withheld rows stay unscored — inventing a salary sub-score from a range we never
        // ranked against is the exact failure scoreSalary guards against.
        if (stored.dataSource === 'ai_estimated') return null;
        if (stored.offerPercentile === null || stored.offerPercentile === undefined) return null;
        if (stored.percentileWithheld) return null;

        const r = stored.marketRange;
        // MONEY-2: a null (or legacy zero) quartile means there is no range to rank against.
        if (!hasUsableRange(r)) return null;
        const { p25, p75, p90 } = r;
        const points: Array<[number, number]> = [[p25, 25], [r.p50, 50], [p75, 75], [p90, 90]];
        // Degenerate / non-increasing stored range → cannot interpolate honestly.
        for (let i = 1; i < points.length; i++) {
            if (!(points[i][0] > points[i - 1][0])) return null;
        }

        const c = Math.max(0, correctedCtc);
        let raw: number;
        if (c <= p25) {
            raw = (25 * c) / p25;
        } else if (c > p90) {
            raw = 90 + ((c - p90) * (90 - 75)) / (p90 - p75);
        } else {
            raw = 90;
            for (let i = 1; i < points.length; i++) {
                const [x0, y0] = points[i - 1];
                const [x1, y1] = points[i];
                if (c <= x1) {
                    raw = y0 + ((c - x0) / (x1 - x0)) * (y1 - y0);
                    break;
                }
            }
        }
        // SEC-1: anchor on the worker's rank. No anchor (no stored CTC) → the plain line.
        if (anchor) {
            if (c < anchor.ctc) raw = Math.min(raw, anchor.percentile);
            else if (c > anchor.ctc) raw = Math.max(raw, anchor.percentile);
            else raw = anchor.percentile;
        }
        return Math.min(99, Math.max(0, Math.round(raw)));
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
