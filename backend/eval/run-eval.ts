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
import {
    companyMatches, textMatches, numberMatches, scoreSet,
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
    benefitsF1: number;
    benefitsMissed: string[];
    benefitsSpurious: string[];
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
        benefitsF1: 0, benefitsMissed: [], benefitsSpurious: [],
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
    base.fields.noticePeriod = textMatches(c.expected.noticePeriod, ex.noticePeriod);
    base.fields.probationPeriod = textMatches(c.expected.probationPeriod, ex.probationPeriod);

    const benefits = scoreSet(c.expected.benefits, raw?.benefits);
    base.benefitsF1 = benefits.f1;
    base.benefitsMissed = benefits.missed;
    base.benefitsSpurious = benefits.spurious;

    const flags = scoreSet(
        c.expected.redFlagTypes,
        Array.isArray(raw?.redFlags) ? raw.redFlags.map((f: any) => f?.type ?? '') : [],
    );
    base.redFlagsF1 = flags.f1;
    base.redFlagsMissed = flags.missed;
    base.redFlagsSpurious = flags.spurious;

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
    console.log(`  ${'red flags (F1)'.padEnd(18)} ${pct(mean(scored.map((r) => r.redFlagsF1))).padStart(7)}   (nuanced)`);

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
        .filter((r) => r.redFlagsMissed.length || r.benefitsMissed.length)
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
