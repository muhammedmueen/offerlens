import { createHash } from 'node:crypto';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './analysis.prompt.js';
import { GEMINI_RESPONSE_SCHEMA } from '@/modules/analysis/analysis.zod.js';

/**
 * Which revision of the model contract produced an analysis (plan task 17).
 *
 * ── WHY A HAND-BUMPED NUMBER ALONE IS NOT ENOUGH ──────────────────────────────
 * `analysisVersion` already existed and was already useless. It was a field in the response
 * schema described to the model as `Always "1.0"`, so every analysis ever stored reports 1.0
 * — through Phase 1's complete prompt rewrite, the switch to a strict response schema, and
 * three providers. A model cannot know which revision of a prompt it was handed, and nobody
 * remembered to bump a constant that lived in a schema description.
 *
 * So the version has two halves:
 *
 *   PROMPT_REVISION   — bumped deliberately, says what changed and why in the git history
 *   PROMPT_FINGERPRINT — derived, cannot go stale
 *
 * The fingerprint is what makes this trustworthy. Edit the system instruction, the worked
 * example, the response schema or any fixed sentence in the prompt builder and it changes on
 * the next boot whether anyone remembered to bump the revision or not. Two eval runs with the
 * same version string really did see the same contract.
 *
 * ── WHAT IT COVERS, AND WHAT IT DOES NOT ──────────────────────────────────────
 * Covered: the system instruction, everything `buildAnalysisPrompt` contributes that is not
 * request-specific, and the response schema.
 *
 * NOT covered: the deterministic stages after the model replies — the red flag rules, the
 * benefits checklist, the tax calculator, the scoring rubric, the confidence assessment.
 * Those change the stored analysis without changing this string. Fingerprinting them would
 * mean hashing half the codebase; the honest boundary is "the contract with the model", and
 * `scoringMethod` and `scoreBreakdown` already record the rubric's own behaviour.
 */

/**
 * Bump when the prompt or response schema changes in a way worth naming.
 *
 * 2.0 — Phase 1 replaced a four-line prompt and no schema with the system instruction, the
 *       worked example and a strict response schema. Everything stored before this was
 *       labelled 1.0 by the model regardless of which of those two contracts produced it.
 */
export const PROMPT_REVISION = '2.0';

/**
 * Fed to the prompt builder in place of an offer letter.
 *
 * Plain text on purpose: it passes through `sanitisePromptText` like any letter would, and
 * anything containing control characters or delimiter lookalikes would trip the sanitiser's
 * warning on every boot.
 */
const FINGERPRINT_SENTINEL = 'PROMPT FINGERPRINT SENTINEL';

function computeFingerprint(): string {
    // Rendered with a sentinel rather than hashing the source constants, so the fixed
    // sentences written inline in `buildAnalysisPrompt` are covered too. No context is
    // passed, so the optional candidate-context block is absent from the material — that
    // block's own wording is therefore not fingerprinted, which is the one known gap.
    const material = [
        SYSTEM_INSTRUCTION,
        buildAnalysisPrompt(FINGERPRINT_SENTINEL),
        JSON.stringify(GEMINI_RESPONSE_SCHEMA),
    ].join('\u0000');

    // 8 hex characters. This distinguishes revisions of one prompt in one codebase, it is not
    // a collision-resistance problem.
    return createHash('sha256').update(material).digest('hex').slice(0, 8);
}

export const PROMPT_FINGERPRINT = computeFingerprint();

/** e.g. `2.0+1a2b3c4d`. Written to `analyses.ai_metadata.analysisVersion`. */
export const PROMPT_VERSION = `${PROMPT_REVISION}+${PROMPT_FINGERPRINT}`;
