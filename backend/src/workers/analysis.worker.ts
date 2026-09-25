import { Worker, Job } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { createAiProvider, describeSelection, type AiProviderSelection } from '@/providers/ai/ai.factory.js';
import { redactSelection } from '@/providers/ai/request-override.js';
import { config } from '@/config/index.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { SalaryService } from '@/modules/salary/salary.service.js';
import { detectRedFlags, mergeRedFlags } from '@/modules/analysis/redflag.rules.js';
import { formatUsage } from '@/providers/ai/usage.js';
import { calculateTakeHome, annualBasicFrom } from '@/modules/takehome/takehome.calculator.js';
import { checkBenefits, bareBenefitsFlag } from '@/modules/benefits/benefits.checklist.js';
import { calculateScore } from '@/modules/analysis/score.rubric.js';

const salaryService = new SalaryService();

/**
 * Overwrite the stored job payload with the key removed.
 *
 * Never throws: losing an analysis because the scrub failed would be a worse outcome than a
 * key lingering in Redis for an hour, and the caller has no way to recover from it either.
 * A failure is logged loudly instead.
 */
async function scrubJobKey(job: Job, selection: AiProviderSelection): Promise<void> {
    if (!selection.apiKey) return;

    try {
        await job.updateData({ ...job.data, aiSelection: redactSelection(selection) });
    } catch (err) {
        console.error(
            `[Analysis] Could not scrub the API key from job ${job.id} payload. `
            + 'It will expire with the job.', err,
        );
    }
}

console.log('[Analysis Worker] Configured AI provider:', config.AI_PROVIDER);
console.log('[Analysis Worker] GEMINI_API_KEY present:', !!config.GEMINI_API_KEY);
console.log('[Analysis Worker] NODE_ENV:', config.NODE_ENV);

/**
 * Normalize AI response to match DB schema expectations.
 * Different models may return varying structures.
 */
/**
 * Coerce a field that should be a list into one.
 *
 * `(raw.benefits || []).map(...)` threw `.map is not a function` in production when the
 * model returned `benefits` as an object instead of an array — killing the whole job and
 * marking the offer FAILED. Observed live, and nondeterministically: the same prompt
 * produced an array on one request and an object on the next.
 *
 * ponytail: this is damage control, not a fix. The real fix is Phase 1 — put the schema
 * in the prompt, set responseSchema, and validate with Zod so the shape is known before
 * we reach this function.
 */
function asArray(value: unknown, field: string): any[] {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    console.warn(
        `[Analysis] AI returned "${field}" as ${typeof value}, expected array — coercing to empty.`,
    );
    return [];
}

/**
 * Coerce a field that should be text into a string, or null.
 *
 * Objects and arrays become null rather than "[object Object]" — a wrong-but-plausible
 * string is worse than an absent one, because it reaches the UI looking like real data.
 */
function asText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
}

function normalizeAiResult(raw: any): AnalysisResult {
    // Normalize benefits — models sometimes return string[] instead of Benefit[]
    const benefits = asArray(raw.benefits, 'benefits').map((b: any) => {
        if (typeof b === 'string') {
            return { name: b, value: null, details: null, isStandard: true };
        }
        // Coerce to strings. Downstream, BenefitsService calls name.toLowerCase(), which
        // threw a 500 when the model returned a non-string name. Intermittent, because it
        // depends on the shape the model happens to choose that request.
        return {
            name: asText(b?.name) ?? 'Unknown',
            value: asText(b?.value),
            details: asText(b?.details),
            isStandard: typeof b?.isStandard === 'boolean' ? b.isStandard : true,
        };
    });

    // Normalize red flags
    const redFlags = asArray(raw.redFlags, 'redFlags').map((f: any) => ({
        type: f.type || 'other',
        severity: f.severity || 'medium',
        title: f.title || 'Unnamed flag',
        explanation: f.explanation || '',
        matchedText: f.matchedText || '',
        suggestion: f.suggestion || '',
    }));

    // Normalize negotiation suggestions
    const negotiationSuggestions = asArray(raw.negotiationSuggestions, 'negotiationSuggestions').map((s: any) => ({
        component: s.component || 'General',
        currentValue: s.currentValue || '',
        suggestedAsk: s.suggestedAsk || '',
        rationale: s.rationale || '',
        priority: s.priority || 'medium',
    }));

    return {
        extractedData: raw.extractedData || {},
        redFlags,
        salaryComparison: raw.salaryComparison || {
            marketRange: { p25: 0, p50: 0, p75: 0, p90: 0 },
            offerPercentile: 50,
            roleUsed: 'unknown',
            roleMatchConfidence: 0,
            locationUsed: 'unknown',
            dataSource: 'ai_estimated',
            disclaimer: 'Salary comparison data unavailable from AI response',
        },
        negotiationSuggestions,
        benefits,

        metadata: raw.metadata || {
            analysisVersion: '1.0',
            modelUsed: 'unknown',
            processingNote: 'Metadata missing from AI response',
        },
    };
}

export const analysisWorker = new Worker(
    'analysis-queue',
    async (job: Job) => {
        const { offerId, text, model, aiSelection } = job.data as {
            offerId: string;
            text: string;
            model?: string;
            aiSelection?: AiProviderSelection;
        };

        const selection: AiProviderSelection = aiSelection ?? {};
        console.log(
            `[Analysis] Processing job ${job.id} for offer ${offerId} `
            + `with ${describeSelection(selection)}, model: ${model || 'default'}`,
        );

        // Analysis wall-clock, measured here rather than derived from offer.updatedAt.
        // `processingTimeMs` used to be `Date.now() - offer.updatedAt`, marked "Approx" — but
        // offers.updatedAt is defaultNow() with no $onUpdate and nothing sets it, so it is
        // frozen at insert. That expression measured time since the upload was accepted,
        // including queue wait and OCR, and every stored value has been wrong rather than
        // approximate.
        const startedAt = Date.now();

        try {
            // Fetch offer for user context
            const offer = await db.query.offers.findFirst({
                where: eq(offers.id, offerId),
            });

            if (!offer) throw new Error('Offer not found');

            // AI Analysis - use model from job data
            const context = offer.userContext as any; // Cast to OfferContext
            // Built per job rather than once at module load, so the provider a request asked
            // for survives the queue hop. With an empty selection this is the configured
            // default, which is what every normal upload gets.
            const aiProvider = createAiProvider(selection);
            const rawResult = await aiProvider.analyzeOffer(text, context, model || undefined);

            // Normalize AI result — models may return varying structures
            const result = normalizeAiResult(rawResult);

            // Hallucination Guard (Simple version: checks if extracted company names etc appear in text approximately)
            // Implementation plan says: verify matchedText in RedFlags against raw text.
            // We will trust the provider for now or add simple verification here.
            // Let's implement simple check if red flags have matched text in raw text.

            const verifiedRedFlags = asArray(result.redFlags, 'redFlags').filter(flag => {
                if (!flag.matchedText) return false;
                // Simple includes check, case insensitive, simplified whitespace
                const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
                const normalizedMatch = flag.matchedText.toLowerCase().replace(/\s+/g, ' ');
                return normalizedText.includes(normalizedMatch) || normalizedText.includes(normalizedMatch.substring(0, 50));
                // If match is long, maybe it was truncated?
            });

            const discardedCount = (result.redFlags?.length || 0) - verifiedRedFlags.length;

            // ── Task 8: deterministic red flags ───────────────────────────────
            //
            // Runs over the letter text directly. The model's flags moved between runs on
            // identical input (76.7% then 71.2% F1 on consecutive eval runs); a clause
            // either restricts the candidate or it does not, so the well-known ones are
            // now matched in code and cannot be missed.
            //
            // Union, deduped by type, rules winning a tie — the model still catches
            // phrasings the rules do not know, notably `other` and flags that require
            // inference rather than a quote. Measured separately, rules score 75.6% F1 with
            // essentially no false positives and the model 71-77% with several, so neither
            // is redundant.
            //
            // Applied AFTER the hallucination guard on purpose: rule quotes are verbatim
            // slices of `text` by construction, so putting them through a guard that looks
            // for them in `text` would only risk its 50-character prefix heuristic
            // misfiring on a quote that is correct by definition.
            const ruleFlags = detectRedFlags(text);

            // ── Task 12: standard benefits checklist ──────────────────────────
            //
            // Absence is a set difference against a list, not a language problem. The model was
            // measurably bad at it — over three eval passes it invented `missing_benefit` on
            // letters that DO name cover (cases 01, 02, 08) and missed it on letters that are
            // genuinely bare (03, 05, 06).
            //
            // So the checklist owns this flag type outright: `suppress` drops the model's
            // version even when the checklist raises nothing, because "we checked the list and
            // it is fine" is a verdict, not silence.
            const benefitsChecklist = checkBenefits(result.benefits);
            const bareFlag = bareBenefitsFlag(
                benefitsChecklist,
                result.extractedData?.employmentType,
            );

            const deterministicFlags = [
                ...ruleFlags,
                ...(bareFlag ? [{ ...bareFlag, ruleId: 'benefits-checklist' }] : []),
            ];

            const mergedRedFlags = mergeRedFlags(deterministicFlags, verifiedRedFlags, {
                suppress: ['missing_benefit'],
            });

            if (deterministicFlags.length > 0) {
                console.log(
                    `[Analysis] Deterministic flags (${deterministicFlags.length}): `
                    + deterministicFlags.map((f) => f.ruleId).join(', '),
                );
            }
            console.log(
                `[Analysis] Benefits checklist: ${benefitsChecklist.corePresent}/3 core present`
                + (benefitsChecklist.isBare ? ' — flagged as bare' : ''),
            );

            // ── Task 2: replace the AI's guessed benchmark with real submissions ──
            //
            // Prefer what the letter says over what the user typed on the upload form:
            // the letter is evidence, the form is a claim. Fall back to the form when
            // extraction found nothing.
            const benchRole = result.extractedData?.role || context?.role || null;
            const benchCity = result.extractedData?.location || context?.city || null;
            const offerCtc = result.extractedData?.compensation?.totalCTC ?? null;

            let usedRealSalaryData = false;

            if (benchRole && benchCity) {
                try {
                    const benchmark = await salaryService.getBenchmark(benchRole, benchCity, offerCtc);
                    if (benchmark) {
                        result.salaryComparison = {
                            marketRange: benchmark.marketRange,
                            offerPercentile: benchmark.offerPercentile ?? result.salaryComparison.offerPercentile,
                            roleUsed: benchmark.roleUsed,
                            roleMatchConfidence: 1, // Exact role+city match, not a fuzzy one.
                            locationUsed: benchmark.locationUsed,
                            dataSource: 'crowdsourced',
                            disclaimer: `Based on ${benchmark.sampleSize} verified submission`
                                + `${benchmark.sampleSize === 1 ? '' : 's'} for this role and city.`,
                        };
                        usedRealSalaryData = true;
                        console.log(`[Analysis] Using crowdsourced salary data (n=${benchmark.sampleSize}) for ${benchRole} / ${benchCity}`);
                    }
                } catch (err) {
                    // A benchmark lookup failure must not lose the whole analysis. Keep the
                    // AI estimate and carry on.
                    console.warn('[Analysis] Salary benchmark lookup failed, keeping AI estimate:', err);
                }
            }

            if (!usedRealSalaryData) {
                // Guarantee the label is honest regardless of what the model claimed.
                result.salaryComparison.dataSource = 'ai_estimated';
                if (!result.salaryComparison.disclaimer) {
                    result.salaryComparison.disclaimer =
                        'Estimated from general market knowledge — not benchmarked against verified submissions.';
                }
            }

            // ── Task 9: deterministic take-home ───────────────────────────────
            //
            // Replaces a figure the model used to guess. It answered plausibly — roughly 82% of
            // gross — which is about right at 24 LPA and wrong at 8 or 80, with nothing in the
            // output to say which. Tax is arithmetic, so it is arithmetic now.
            //
            // `annualBasicFrom` returns null when the letter never stated basic, which is most
            // of them. The calculator then excludes PF and says so in its assumptions rather
            // than inventing a basic-to-CTC ratio.
            const takeHome = calculateTakeHome({
                totalCtc: result.extractedData?.compensation?.totalCTC ?? null,
                annualBasic: annualBasicFrom(result.extractedData?.compensation?.baseSalary),
            });

            if (takeHome) {
                console.log(
                    `[Analysis] Take-home: ₹${takeHome.netMonthly.high.toLocaleString('en-IN')}/mo`
                    + (takeHome.isExact ? '' : ` to ₹${takeHome.netMonthly.low.toLocaleString('en-IN')}/mo`)
                    + `  (tax ₹${takeHome.tax.totalTax.toLocaleString('en-IN')}, `
                    + `effective ${(takeHome.tax.effectiveRate * 100).toFixed(1)}%)`,
                );
            }

            // ── Task 10: weighted scoring rubric ──────────────────────────────
            //
            // Replaces the interim `70 ± adjustments` formula. That baseline of 70 meant a
            // letter with nothing wrong and nothing good scored "good" by default, and the
            // result was unexplainable — a 55 gave no way to say which part was weak.
            //
            // 30 flags / 30 salary / 20 benefits / 10 growth / 10 transparency, per decision 7.
            // The percentile is passed as null unless it came from real submissions, which makes
            // the rubric redistribute salary's weight instead of scoring an invented number.
            const scoring = calculateScore({
                redFlags: mergedRedFlags,
                benefitsChecklist,
                extractedData: result.extractedData,
                benefits: result.benefits,
                offerPercentile: usedRealSalaryData
                    ? result.salaryComparison.offerPercentile
                    : null,
            });

            const { score, label, method: scoringMethod } = scoring;

            console.log(
                `[Analysis] Score ${score} (${label}, ${scoringMethod}): `
                + scoring.components
                    .map((c) => `${c.key} ${c.value ?? '—'}@${c.weight}%`)
                    .join(', '),
            );

            // Save to DB
            await db.transaction(async (tx) => {
                await tx.insert(analyses).values({
                    offerId,
                    score,
                    scoreLabel: label,
                    scoringMethod,
                    extractedData: result.extractedData,
                    redFlags: mergedRedFlags,
                    salaryComparison: result.salaryComparison || {},
                    negotiationSuggestions: result.negotiationSuggestions || [],
                    benefits: result.benefits || [],
                    takeHome,
                    // Stored so the score can be explained later, not just displayed.
                    scoreBreakdown: { components: scoring.components, note: scoring.note },
                    aiMetadata: result.metadata,
                    lowConfidence: false, // Calculate from AI metadata if possible
                    redFlagsDiscarded: discardedCount,
                    processingTimeMs: Date.now() - startedAt,
                });

                await tx.update(offers).set({ status: 'COMPLETED' }).where(eq(offers.id, offerId));
            });

            // Scrub any caller-supplied API key from the stored job payload.
            //
            // BullMQ keeps completed job data (removeOnComplete: { age: 3600 }), so a key
            // that arrived in the payload would sit in Redis for an hour after the request
            // that supplied it had finished. That would make "we do not store your key" false
            // in the one place nobody looks. Done in a finally-style position so it runs on
            // the success path; the failure path is handled in the catch below.
            await scrubJobKey(job, selection);

            const usage = result.metadata?.usage;
            console.log(
                `[Analysis] Job ${job.id} completed. Score: ${score}`
                + (usage ? `  ${formatUsage(usage)}` : '  (provider reported no usage)'),
            );
        } catch (error: any) {
            // Failed jobs are retained even longer (removeOnFail: { age: 24h }), so scrubbing
            // matters more here, not less.
            await scrubJobKey(job, selection);

            console.error(`[Analysis] Job ${job.id} failed:`, error);

            // Detect rate limit errors
            let failureReason = error.message || 'Analysis failed';

            if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('quota')) {
                failureReason = 'RATE_LIMIT: API rate limit exceeded. Please wait a few minutes and try again, or switch to a different model.';
                console.error(`[Analysis] Rate limit hit for offer ${offerId}`);
            } else if (error.message?.includes('400') || error.message?.includes('invalid')) {
                failureReason = 'INVALID_REQUEST: The AI model encountered an error processing your offer. Please try a different model.';
            } else if (error.message?.includes('500') || error.message?.includes('internal')) {
                failureReason = 'AI_ERROR: The AI service encountered an internal error. Please try again.';
            }

            await db.update(offers).set({
                status: 'FAILED',
                failureReason: failureReason
            }).where(eq(offers.id, offerId));
            throw error;
        }
    },
    defaultWorkerOptions
);
