/**
 * Run one deterministic stage of the analysis pipeline, surviving its failure (task 15).
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * The analysis worker calls the model first and the deterministic stages afterwards. Only the
 * salary benchmark lookup had a `try/catch`, so a throw anywhere in the benefits checklist or
 * the tax calculator failed the whole analysis — *after* the AI call had been made and paid
 * for, and after the one expensive, rate-limited, non-idempotent step had already succeeded.
 * The user saw `FAILED` and had to upload again, spending a second call to redo work that had
 * already been done.
 *
 * ── WHAT IS AND IS NOT OPTIONAL ───────────────────────────────────────────────
 * Only stages whose absence the product already handles are wrapped:
 *
 *   - take-home is nullable and absent whenever the letter gives no CTC
 *   - the benefits checklist is nullable and its section is null-guarded in the UI
 *   - per-field confidence has a defined empty shape
 *
 * `detectRedFlags` and `calculateScore` are deliberately NOT wrapped. A score computed without
 * the 30-point red flag component is not a degraded score, it is a wrong one, and publishing a
 * wrong headline number is worse than failing the analysis. They stay load-bearing.
 *
 * ── WHY NOT A NEW "DEGRADED" COLUMN ───────────────────────────────────────────
 * Because the fallbacks are states the schema and the UI already represent. A missing checklist
 * makes the rubric mark benefits unscored and redistribute the weight, which sets
 * `scoringMethod: 'fallback'` and surfaces a note naming what could not be scored — machinery
 * that exists for absent salary data and works the same way here. `scoringMethod` cannot double
 * as a "something crashed" flag, since nearly every analysis is already `'fallback'` for want of
 * salary submissions, so inventing a signal that points at the same field would say nothing.
 */
export function optionalStage<T>(name: string, compute: () => T, fallback: T): T {
    try {
        return compute();
    } catch (error) {
        // console.error, not warn: nothing here should ever throw, so every occurrence is a bug
        // that has been papered over to save the analysis. It needs to be findable in the log.
        console.error(
            `[Stage] "${name}" threw and was skipped — the analysis continues without it. `
            + 'This is a bug, not an expected condition:',
            error,
        );
        return fallback;
    }
}
