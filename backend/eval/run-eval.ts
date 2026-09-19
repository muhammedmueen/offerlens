/**
 * Extraction accuracy harness (Phase 0c).
 *
 *   npm run eval                # whole corpus, one pass
 *   npm run eval -- --runs 3    # three passes, averaged, with the spread reported
 *   npm run eval -- --limit 4   # first 4 cases, for a quick loop
 *   npm run eval -- --case 09-crore-notation
 *   npm run eval -- --save      # write eval/results/<timestamp>.json
 *
 * Calls the AI provider DIRECTLY rather than going through the API. That is
 * deliberate: this measures extraction quality in isolation, without a database, a
 * queue, or the worker's normalisation in the way.
 *
 * Needs GEMINI_API_KEY. Without one it exercises MockAiProvider, which returns fixed
 * data — useful for checking the harness runs, useless as a measurement.
 *
 * ── WHY --runs EXISTS ────────────────────────────────────────────────────────
 * The model is not deterministic. Two consecutive passes over the same 17 cases gave
 * red-flag F1 of 76.7% and 71.2%, and `base := CTC` counts of 4 and 5. A single pass
 * therefore cannot detect an improvement smaller than about five points — the change
 * disappears into the noise, and worse, noise in the favourable direction reads as
 * progress.
 *
 * With `--runs N` every figure is reported as a mean with its observed range, and the
 * range is the honest answer to "how big does a change have to be before I believe it".
 */
import 'dotenv/config';
import { config } from '@/config/index.js';
import { GeminiAiProvider } from '@/providers/ai/gemini.ai.js';
import { MockAiProvider } from '@/providers/ai/mock.ai.js';
import type { AiProvider } from '@/providers/ai/ai.provider.js';
import { DEFAULT_GEMINI_MODEL } from '@/config/constants.js';
import { CORPUS, type EvalCase } from './corpus.js';
import { detectRedFlags, mergeRedFlags } from '@/modules/analysis/redflag.rules.js';
import type { RedFlag } from '@/modules/analysis/analysis.types.js';
import {
    companyMatches, textMatches, numberMatches, scoreSet,
    annualiseBase, assertsBaseEqualsTotal, durationMatches, commonCaseIds,
    STRUCTURED_FIELDS, CONTEXT_FIELDS, type FieldName,
} from './score.js';
import fs from 'node:fs';
import path from 'node:path';

// Targets from the plan: >90% on structured fields, >75% on nuanced ones.
const TARGET_STRUCTURED = 0.90;
const TARGET_NUANCED = 0.75;

interface CaseResult {
    id: string;
    probes: string;
    error: string | null;
    fields: Partial<Record<FieldName, boolean>>;
    /**
     * Reported separately from `fields` on purpose.
     *
     * Folding these into the structured/nuanced headline would make the numbers
     * incomparable with every result already saved under eval/results. They are new
     * signal, so they get their own line rather than silently moving the baseline.
     */
    diagnostics: {
        baseSalary: boolean;
        /** Whether base was asserted equal to totalCTC on a letter that states no basic. */
        baseEqualsCtcUnstated: boolean;
        componentsF1: number;
        componentsMissed: string[];
    };
    benefitsF1: number;
    benefitsMissed: string[];
    benefitsSpurious: string[];
    /**
     * Model-only vs rules-only vs merged, so a red-flag regression can be attributed.
     * Without the split, a drop looks the same whether the prompt changed or a rule did.
     */
    redFlagSplit: { aiOnlyF1: number; rulesOnlyF1: number; rulesFired: string[] };
    redFlagsF1: number;
    redFlagsMissed: string[];
    redFlagsSpurious: string[];
    /** Which top-level keys the model actually returned — diagnoses shape mismatch. */
    returnedKeys: string[];
}

function arg(name: string): string | null {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? (process.argv[i + 1] ?? '') : null;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function pickCases(): EvalCase[] {
    const only = arg('case');
    if (only) {
        const found = CORPUS.filter((c) => c.id.includes(only));
        if (found.length === 0) throw new Error(`No case matching "${only}"`);
        return found;
    }
    const limit = arg('limit');
    return limit ? CORPUS.slice(0, Number(limit)) : CORPUS;
}

/**
 * Pass count. Defaults to 1 so the quick iteration loop stays cheap; anything you intend
 * to quote should use 3 or more, and the report says so when it only has one sample.
 */
function passCount(): number {
    const raw = arg('runs');
    if (raw === null) return 1;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--runs must be a positive integer, got "${raw}"`);
    }
    return n;
}

async function evaluateCase(provider: AiProvider, c: EvalCase): Promise<CaseResult> {
    const base: CaseResult = {
        id: c.id, probes: c.probes, error: null, fields: {},
        diagnostics: {
            baseSalary: false, baseEqualsCtcUnstated: false,
            componentsF1: 0, componentsMissed: [],
        },
        benefitsF1: 0, benefitsMissed: [], benefitsSpurious: [],
        redFlagSplit: { aiOnlyF1: 0, rulesOnlyF1: 0, rulesFired: [] },
        redFlagsF1: 0, redFlagsMissed: [], redFlagsSpurious: [],
        returnedKeys: [],
    };

    let raw: any;
    try {
        raw = await provider.analyzeOffer(c.text, undefined, DEFAULT_GEMINI_MODEL);
    } catch (err: any) {
        return { ...base, error: String(err?.message ?? err).slice(0, 160) };
    }

    base.returnedKeys = raw && typeof raw === 'object' ? Object.keys(raw) : [];

    // Read through the shape the code expects. If the model answered with different key
    // names, these are all undefined — which is the point: that is a real failure of the
    // contract, not a scoring artefact.
    const ex = raw?.extractedData ?? {};
    const comp = ex?.compensation ?? {};

    base.fields.companyName = companyMatches(c.expected.companyName, ex.companyName);
    base.fields.role = textMatches(c.expected.role, ex.role);
    base.fields.location = textMatches(c.expected.location, ex.location);
    base.fields.totalCTC = numberMatches(c.expected.totalCTC, comp.totalCTC);
    base.fields.currency = textMatches(c.expected.currency, comp.currency);
    // durationMatches, not textMatches: a letter writing "three months" against ground
    // truth of "3 months" is the same answer, and scoring it as a miss understated both
    // of these fields.
    base.fields.noticePeriod = durationMatches(c.expected.noticePeriod, ex.noticePeriod);
    base.fields.probationPeriod = durationMatches(c.expected.probationPeriod, ex.probationPeriod);

    const annualBase = annualiseBase(comp?.baseSalary);
    base.diagnostics.baseSalary = numberMatches(c.expected.baseSalary, annualBase);
    base.diagnostics.baseEqualsCtcUnstated = assertsBaseEqualsTotal(
        c.expected.baseSalary, c.expected.totalCTC, annualBase,
    );

    // Union of otherComponents names and variablePay.type: a joining bonus filed under
    // either one counts. This asks whether the component survived, not where it landed.
    const componentNames = [
        ...(Array.isArray(comp?.otherComponents) ? comp.otherComponents.map((x: any) => x?.name) : []),
        comp?.variablePay?.type,
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);
    const components = scoreSet(c.expected.statedComponents, componentNames);
    base.diagnostics.componentsF1 = components.f1;
    base.diagnostics.componentsMissed = components.missed;

    const benefits = scoreSet(c.expected.benefits, raw?.benefits);
    base.benefitsF1 = benefits.f1;
    base.benefitsMissed = benefits.missed;
    base.benefitsSpurious = benefits.spurious;

    // Red flags are scored on the MERGED set, because that is what the worker stores and
    // therefore what a user sees. The model-only and rules-only figures are also reported,
    // so a regression can be attributed to one or the other rather than guessed at.
    const aiFlags: RedFlag[] = Array.isArray(raw?.redFlags) ? raw.redFlags : [];
    const ruleFlags = detectRedFlags(c.text);
    const merged = mergeRedFlags(ruleFlags, aiFlags);

    const flags = scoreSet(c.expected.redFlagTypes, merged.map((f) => f?.type ?? ''));
    base.redFlagsF1 = flags.f1;
    base.redFlagsMissed = flags.missed;
    base.redFlagsSpurious = flags.spurious;

    base.redFlagSplit = {
        aiOnlyF1: scoreSet(c.expected.redFlagTypes, aiFlags.map((f: any) => f?.type ?? '')).f1,
        rulesOnlyF1: scoreSet(c.expected.redFlagTypes, ruleFlags.map((f) => f.type)).f1,
        rulesFired: ruleFlags.map((f) => f.ruleId),
    };

    return base;
}

function mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** A figure observed across N passes. */
interface Metric {
    mean: number;
    min: number;
    max: number;
    /** max - min. The size of a change this measurement cannot distinguish from noise. */
    spread: number;
}

function metric(values: number[]): Metric {
    if (values.length === 0) return { mean: 0, min: 0, max: 0, spread: 0 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { mean: mean(values), min, max, spread: max - min };
}

// ── Reporting ───────────────────────────────────────────────────────────────

/** One completed sweep of the corpus. */
type Pass = CaseResult[];

/** Set by main() once all passes are in. Every aggregate below reads through it. */
let COMMON: Set<string> = new Set();

const scoredOf = (pass: Pass) => pass.filter((r) => !r.error && COMMON.has(r.id));

const fieldRate = (pass: Pass, f: FieldName) =>
    mean(scoredOf(pass).map((r) => (r.fields[f] ? 1 : 0)));

const structuredOf = (pass: Pass) => mean(STRUCTURED_FIELDS.map((f) => fieldRate(pass, f)));

const nuancedOf = (pass: Pass) => mean([
    mean(scoredOf(pass).map((r) => r.benefitsF1)),
    mean(scoredOf(pass).map((r) => r.redFlagsF1)),
]);

/**
 * How often each case failed a given check, across all passes.
 *
 * This is the point of running more than once. A failure in 3 of 3 passes is a bug worth
 * chasing; a failure in 1 of 3 is the model guessing, and chasing it wastes a day.
 */
function failureFrequency(
    passes: Pass[],
    pick: (r: CaseResult) => string[],
): Map<string, Map<string, number>> {
    const byCase = new Map<string, Map<string, number>>();
    for (const pass of passes) {
        for (const result of scoredOf(pass)) {
            for (const item of pick(result)) {
                const perItem = byCase.get(result.id) ?? new Map<string, number>();
                perItem.set(item, (perItem.get(item) ?? 0) + 1);
                byCase.set(result.id, perItem);
            }
        }
    }
    return byCase;
}

async function main() {
    const cases = pickCases();
    const runs = passCount();
    const usingReal = Boolean(config.GEMINI_API_KEY);
    const provider: AiProvider = usingReal ? new GeminiAiProvider() : new MockAiProvider();

    console.log('='.repeat(72));
    console.log('  OfferLens — extraction accuracy eval');
    console.log('='.repeat(72));
    console.log(`  provider : ${provider.constructor.name}${usingReal ? '' : '  *** MOCK — numbers are meaningless ***'}`);
    console.log(`  model    : ${DEFAULT_GEMINI_MODEL}`);
    console.log(`  cases    : ${cases.length} of ${CORPUS.length}`);
    console.log(`  passes   : ${runs}   (${cases.length * runs} model call${cases.length * runs === 1 ? '' : 's'})`);
    console.log(`  corpus   : ${CORPUS.length - 1} synthetic + 1 real — a regression baseline, not an accuracy claim`);
    if (runs === 1) {
        console.log('');
        console.log('  NOTE: one pass only. The model is not deterministic — repeat passes have');
        console.log('        differed by ~5 points on identical input. Use --runs 3 for any number');
        console.log('        you intend to quote or compare against a previous result.');
    }
    console.log('');

    const passes: Pass[] = [];

    for (let pass = 1; pass <= runs; pass++) {
        if (runs > 1) console.log(`  ── pass ${pass} of ${runs} ${'─'.repeat(40)}`);
        const results: Pass = [];

        for (const c of cases) {
            process.stdout.write(`  ${c.id.padEnd(28)} `);
            const r = await evaluateCase(provider, c);
            results.push(r);

            if (r.error) {
                console.log(`ERROR  ${r.error}`);
                continue;
            }
            const hits = Object.values(r.fields).filter(Boolean).length;
            const total = Object.keys(r.fields).length;
            console.log(
                `fields ${hits}/${total}   benefits F1 ${r.benefitsF1.toFixed(2)}   flags F1 ${r.redFlagsF1.toFixed(2)}`,
            );
        }

        passes.push(results);
        if (runs > 1) {
            // Progress only, over this pass's own successes. The comparable figures come
            // after every pass is in, restricted to cases they all completed.
            const ok = results.filter((r) => !r.error);
            console.log(`  pass ${pass}: ${ok.length}/${results.length} scored\n`);
        }
    }

    // Restrict scoring to cases every pass completed, so all passes share a denominator.
    COMMON = commonCaseIds(passes);
    const dropped = cases.length - COMMON.size;

    console.log('-'.repeat(72));
    console.log(`  SCORED: ${COMMON.size} of ${cases.length} case(s) — those completed in all ${runs} pass(es)`);
    if (dropped > 0) {
        const byPass = passes.map((p, i) => `pass ${i + 1}: ${p.filter((r) => r.error).length} errored`).join(', ');
        console.log(`  EXCLUDED: ${dropped} case(s) errored in at least one pass  (${byPass})`);

        const reasons = new Set(passes.flat().filter((r) => r.error).map((r) => r.error!));
        for (const reason of [...reasons].slice(0, 3)) {
            console.log(`      ${reason}`);
        }
    }
    console.log('-'.repeat(72));

    if (COMMON.size === 0) {
        console.log('\n  Nothing completed in every pass. No numbers to report.');
        console.log('  On a free-tier key, run fewer passes or space them out — the quota drains');
        console.log('  as the run proceeds and later passes fail outright.\n');
        process.exit(0);
    }

    // A comparison built on a thin slice of the corpus is not a comparison. Say so rather
    // than printing a confident range over whatever survived.
    const coverage = COMMON.size / cases.length;
    const usable = coverage >= 0.8;
    if (!usable) {
        console.log('');
        console.log(`  WARNING: only ${pct(coverage)} of the selected cases completed in every pass.`);
        console.log('           The figures below describe that subset, not the corpus, and must');
        console.log('           NOT be compared against a previous result. Re-run when the quota');
        console.log('           has recovered.');
    }
    console.log('');

    /** Mean, with the observed range when there is more than one sample. */
    const show = (m: Metric) =>
        runs === 1
            ? pct(m.mean).padStart(7)
            : `${pct(m.mean).padStart(7)}  [${pct(m.min)} – ${pct(m.max)}]`;

    const across = (fn: (pass: Pass) => number) => metric(passes.map(fn));

    console.log('-'.repeat(72));
    console.log(`  PER-FIELD ACCURACY${runs > 1 ? '   mean [min – max] over ' + runs + ' passes' : ''}`);
    console.log('-'.repeat(72));

    for (const f of [...STRUCTURED_FIELDS, ...CONTEXT_FIELDS]) {
        const tag = STRUCTURED_FIELDS.includes(f) ? 'structured' : 'context';
        console.log(`  ${f.padEnd(18)} ${show(across((p) => fieldRate(p, f)))}   (${tag})`);
    }

    const benefitsMetric = across((p) => mean(scoredOf(p).map((r) => r.benefitsF1)));
    const mergedMetric = across((p) => mean(scoredOf(p).map((r) => r.redFlagsF1)));
    const aiOnlyMetric = across((p) => mean(scoredOf(p).map((r) => r.redFlagSplit.aiOnlyF1)));
    const rulesOnlyMetric = across((p) => mean(scoredOf(p).map((r) => r.redFlagSplit.rulesOnlyF1)));

    console.log(`  ${'benefits (F1)'.padEnd(18)} ${show(benefitsMetric)}   (nuanced)`);
    console.log(`  ${'red flags (F1)'.padEnd(18)} ${show(mergedMetric)}   (nuanced, MERGED — what the worker stores)`);
    console.log(`  ${'  ├ model only'.padEnd(18)} ${show(aiOnlyMetric)}   varies run to run`);
    console.log(`  ${'  └ rules only'.padEnd(18)} ${show(rulesOnlyMetric)}   deterministic (task 8)`);

    // Self-check. The rule engine is pure, so its score cannot legitimately move between
    // passes over the same corpus. If it does, either a rule reads something non-
    // deterministic or the harness is mixing passes up.
    if (runs > 1 && rulesOnlyMetric.spread > 1e-9) {
        console.log('');
        console.log(`  WARNING: rules-only F1 moved by ${pct(rulesOnlyMetric.spread)} across passes.`);
        console.log('           The rule engine is pure and must score identically every pass.');
        console.log('           Something is wrong in the rules or in this harness, not in the model.');
    }

    console.log('\n' + '-'.repeat(72));
    console.log('  COMPENSATION DIAGNOSTICS  (not folded into the targets below)');
    console.log('-'.repeat(72));
    console.log(`  ${'base salary'.padEnd(18)} ${show(across((p) => mean(scoredOf(p).map((r) => (r.diagnostics.baseSalary ? 1 : 0)))))}   correct`);
    console.log(`  ${'components (F1)'.padEnd(18)} ${show(across((p) => mean(scoredOf(p).map((r) => r.diagnostics.componentsF1))))}   stated cash components retained`);

    const inventedBase = failureFrequency(
        passes,
        (r) => (r.diagnostics.baseEqualsCtcUnstated ? ['base := CTC'] : []),
    );
    const inventedMetric = across((p) => scoredOf(p).filter((r) => r.diagnostics.baseEqualsCtcUnstated).length);
    console.log(`  ${'base := CTC'.padEnd(18)} ${inventedMetric.mean.toFixed(1).padStart(7)}   case(s) on average asserting base = CTC where no basic is stated`);
    if (inventedBase.size > 0) {
        const listed = [...inventedBase.entries()]
            .map(([id, items]) => `${id} (${items.get('base := CTC')}/${runs})`)
            .join(', ');
        console.log(`      ${listed}`);
    }

    const structuredMetric = across(structuredOf);
    const nuancedMetric = across(nuancedOf);

    console.log('\n' + '-'.repeat(72));
    console.log('  AGAINST TARGETS');
    console.log('-'.repeat(72));
    const verdict = (m: Metric, target: number) =>
        `${show(m)}  target ${pct(target)}  ${m.mean >= target ? 'PASS' : 'FAIL'}`;
    console.log(`  structured (company, role, CTC)   ${verdict(structuredMetric, TARGET_STRUCTURED)}`);
    console.log(`  nuanced (benefits, clauses)       ${verdict(nuancedMetric, TARGET_NUANCED)}`);

    if (runs > 1) {
        // The actionable output. Anything smaller than this is indistinguishable from the
        // model having a different day.
        const noise = Math.max(structuredMetric.spread, nuancedMetric.spread);
        console.log('');
        console.log(`  Noise floor over ${runs} passes: ${pct(noise)}.`);
        console.log(`  Treat a change below that as unmeasured, not as an improvement.`);
    }

    // Shape diagnosis. If the model is answering with different key names, per-field
    // accuracy collapses for a reason that has nothing to do with comprehension.
    const shapes = new Map<string, number>();
    for (const r of passes.flat().filter((x) => !x.error && COMMON.has(x.id))) {
        const key = r.returnedKeys.slice().sort().join(',') || '(none)';
        shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
    console.log('\n' + '-'.repeat(72));
    console.log('  RESPONSE SHAPES RETURNED (expected: benefits,extractedData,metadata,…)');
    console.log('-'.repeat(72));
    for (const [keys, count] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(count).padStart(2)}x  ${keys.slice(0, 100)}`);
    }

    // ── What was missed, with how often ─────────────────────────────────────
    //
    // The frequency is the useful part. "3/3" is a bug; "1/3" is the model guessing and
    // is not worth a day of work.
    const flagsMissed = failureFrequency(passes, (r) => r.redFlagsMissed);
    const flagsInvented = failureFrequency(passes, (r) => r.redFlagsSpurious);
    const benefitsMissed = failureFrequency(passes, (r) => r.benefitsMissed);
    const componentsMissed = failureFrequency(passes, (r) => r.diagnostics.componentsMissed);

    const affected = [...new Set([
        ...flagsMissed.keys(), ...flagsInvented.keys(),
        ...benefitsMissed.keys(), ...componentsMissed.keys(),
    ])].sort();

    if (affected.length > 0) {
        console.log('\n' + '-'.repeat(72));
        console.log(`  WHAT WAS MISSED${runs > 1 ? '   (n/' + runs + ' = failed in n passes; 1/' + runs + ' is noise)' : ''}`);
        console.log('-'.repeat(72));

        const render = (items: Map<string, number> | undefined) =>
            items
                ? [...items.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, n]) => (runs > 1 ? `${label} (${n}/${runs})` : label))
                    .join(', ')
                : '';

        for (const id of affected.slice(0, 8)) {
            console.log(`  ${id}`);
            const lines: Array<[string, string]> = [
                ['flags missed     ', render(flagsMissed.get(id))],
                ['flags invented   ', render(flagsInvented.get(id))],
                ['benefits missed  ', render(benefitsMissed.get(id))],
                ['components missed', render(componentsMissed.get(id))],
            ];
            for (const [label, value] of lines) {
                if (value) console.log(`      ${label}: ${value}`);
            }
        }
    }

    if (hasFlag('save')) {
        const dir = path.join(import.meta.dirname, 'results');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(file, JSON.stringify({
            timestamp: new Date().toISOString(),
            provider: provider.constructor.name,
            model: DEFAULT_GEMINI_MODEL,
            caseCount: cases.length,
            runs,
            // Which cases the figures actually describe. A saved result whose `scoredCases`
            // is below `caseCount` is not comparable with one that covered everything.
            scoredCases: COMMON.size,
            comparable: usable,
            // Means, for comparing against another saved result...
            structuredScore: structuredMetric.mean,
            nuancedScore: nuancedMetric.mean,
            // ...and the spread, so whoever compares knows how big a difference has to be
            // before it means anything.
            spread: {
                structured: structuredMetric.spread,
                nuanced: nuancedMetric.spread,
                redFlagsMerged: mergedMetric.spread,
                redFlagsModelOnly: aiOnlyMetric.spread,
            },
            perPass: passes.map((p) => ({
                structuredScore: structuredOf(p),
                nuancedScore: nuancedOf(p),
            })),
            passes,
        }, null, 2));
        console.log(`\n  saved: ${path.relative(process.cwd(), file)}`);
    }

    console.log('');
    // Deliberately exit 0 regardless. This is a measurement, not a gate — a red build
    // would train people to ignore it.
    process.exit(0);
}

main().catch((err) => {
    console.error('\nharness error:', err);
    process.exit(1);
});
