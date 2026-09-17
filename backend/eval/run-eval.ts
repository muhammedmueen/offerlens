/**
 * Extraction accuracy harness (Phase 0c).
 *
 *   npm run eval              # whole corpus
 *   npm run eval -- --limit 4 # first 4 cases, for a quick loop
 *   npm run eval -- --case 09-crore-notation
 *   npm run eval -- --save    # write eval/results/<timestamp>.json
 *
 * Calls the AI provider DIRECTLY rather than going through the API. That is
 * deliberate: this measures extraction quality in isolation, without a database, a
 * queue, or the worker's normalisation in the way. Phase 1 changes the prompt and the
 * schema, and this is the number that should move.
 *
 * Needs GEMINI_API_KEY. Without one it exercises MockAiProvider, which returns fixed
 * data — useful for checking the harness runs, useless as a measurement.
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
    annualiseBase, assertsBaseEqualsTotal, durationMatches,
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

async function main() {
    const cases = pickCases();
    const usingReal = Boolean(config.GEMINI_API_KEY);
    const provider: AiProvider = usingReal ? new GeminiAiProvider() : new MockAiProvider();

    console.log('='.repeat(72));
    console.log('  OfferLens — extraction accuracy eval');
    console.log('='.repeat(72));
    console.log(`  provider : ${provider.constructor.name}${usingReal ? '' : '  *** MOCK — numbers are meaningless ***'}`);
    console.log(`  model    : ${DEFAULT_GEMINI_MODEL}`);
    console.log(`  cases    : ${cases.length} of ${CORPUS.length}`);
    console.log(`  corpus   : SYNTHETIC — a regression baseline, not an accuracy claim`);
    console.log('');

    const results: CaseResult[] = [];
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

    const scored = results.filter((r) => !r.error);

    console.log('\n' + '-'.repeat(72));
    console.log('  PER-FIELD ACCURACY');
    console.log('-'.repeat(72));

    const allFields: FieldName[] = [...STRUCTURED_FIELDS, ...CONTEXT_FIELDS];
    const fieldRate = (f: FieldName) => mean(scored.map((r) => (r.fields[f] ? 1 : 0)));

    for (const f of allFields) {
        const tag = STRUCTURED_FIELDS.includes(f) ? 'structured' : 'context';
        console.log(`  ${f.padEnd(18)} ${pct(fieldRate(f)).padStart(7)}   (${tag})`);
    }
    console.log(`  ${'benefits (F1)'.padEnd(18)} ${pct(mean(scored.map((r) => r.benefitsF1))).padStart(7)}   (nuanced)`);
    console.log(`  ${'red flags (F1)'.padEnd(18)} ${pct(mean(scored.map((r) => r.redFlagsF1))).padStart(7)}   (nuanced, MERGED — what the worker stores)`);
    console.log(`  ${'  ├ model only'.padEnd(18)} ${pct(mean(scored.map((r) => r.redFlagSplit.aiOnlyF1))).padStart(7)}   varies run to run`);
    console.log(`  ${'  └ rules only'.padEnd(18)} ${pct(mean(scored.map((r) => r.redFlagSplit.rulesOnlyF1))).padStart(7)}   deterministic (task 8)`);

    console.log('\n' + '-'.repeat(72));
    console.log('  COMPENSATION DIAGNOSTICS  (not folded into the targets below)');
    console.log('-'.repeat(72));
    const baseRate = mean(scored.map((r) => (r.diagnostics.baseSalary ? 1 : 0)));
    const invented = scored.filter((r) => r.diagnostics.baseEqualsCtcUnstated);
    console.log(`  ${'base salary'.padEnd(18)} ${pct(baseRate).padStart(7)}   correct`);
    console.log(`  ${'components (F1)'.padEnd(18)} ${pct(mean(scored.map((r) => r.diagnostics.componentsF1))).padStart(7)}   stated cash components retained`);
    console.log(`  ${'base := CTC'.padEnd(18)} ${String(invented.length).padStart(7)}   case(s) asserting base = CTC where no basic is stated`);
    if (invented.length) {
        console.log(`      ${invented.map((r) => r.id).join(', ')}`);
    }

    const structuredScore = mean(STRUCTURED_FIELDS.map(fieldRate));
    const nuancedScore = mean([
        mean(scored.map((r) => r.benefitsF1)),
        mean(scored.map((r) => r.redFlagsF1)),
    ]);

    console.log('\n' + '-'.repeat(72));
    console.log('  AGAINST TARGETS');
    console.log('-'.repeat(72));
    const verdict = (actual: number, target: number) =>
        `${pct(actual).padStart(7)}  target ${pct(target)}  ${actual >= target ? 'PASS' : 'FAIL'}`;
    console.log(`  structured (company, role, CTC)   ${verdict(structuredScore, TARGET_STRUCTURED)}`);
    console.log(`  nuanced (benefits, clauses)       ${verdict(nuancedScore, TARGET_NUANCED)}`);

    if (results.some((r) => r.error)) {
        console.log(`\n  ${results.filter((r) => r.error).length} case(s) errored and were excluded from scoring.`);
    }

    // Shape diagnosis. If the model is answering with different key names, per-field
    // accuracy collapses for a reason that has nothing to do with comprehension.
    const shapes = new Map<string, number>();
    for (const r of scored) {
        const key = r.returnedKeys.slice().sort().join(',') || '(none)';
        shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
    console.log('\n' + '-'.repeat(72));
    console.log('  RESPONSE SHAPES RETURNED (expected: benefits,extractedData,metadata,…)');
    console.log('-'.repeat(72));
    for (const [keys, count] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(count).padStart(2)}x  ${keys.slice(0, 100)}`);
    }

    const worst = scored
        .filter((r) => r.redFlagsMissed.length || r.benefitsMissed.length || r.diagnostics.componentsMissed.length)
        .slice(0, 6);
    if (worst.length) {
        console.log('\n' + '-'.repeat(72));
        console.log('  WHAT WAS MISSED (first few)');
        console.log('-'.repeat(72));
        for (const r of worst) {
            console.log(`  ${r.id}`);
            if (r.redFlagsMissed.length) console.log(`      flags missed   : ${r.redFlagsMissed.join(', ')}`);
            if (r.redFlagsSpurious.length) console.log(`      flags invented : ${r.redFlagsSpurious.join(', ')}`);
            if (r.benefitsMissed.length) console.log(`      benefits missed: ${r.benefitsMissed.slice(0, 6).join(', ')}`);
            if (r.diagnostics.componentsMissed.length) {
                console.log(`      components missed: ${r.diagnostics.componentsMissed.join(', ')}`);
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
            structuredScore,
            nuancedScore,
            results,
        }, null, 2));
        console.log(`\n  saved: ${path.relative(process.cwd(), file)}`);
    }

    console.log('');
    // Deliberately exit 0 regardless. This is a measurement, not a gate — a failing
    // score before Phase 1 is the expected reading, and a red build would train people
    // to ignore it.
    process.exit(0);
}

main().catch((err) => {
    console.error('\nharness error:', err);
    process.exit(1);
});
