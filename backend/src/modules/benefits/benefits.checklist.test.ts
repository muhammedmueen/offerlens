import { describe, it, expect } from 'vitest';
import { checkBenefits, bareBenefitsFlag, CORE_BENEFITS } from './benefits.checklist.js';
import type { Benefit } from '@/modules/analysis/analysis.types.js';
import { CORPUS } from '../../../eval/corpus.js';

const b = (name: string, details = ''): Benefit => ({
    name, value: null, details: details || null, isStandard: true,
});

/** The corpus benefit lists, as the ground truth annotates them. */
const corpusBenefits = (id: string): Benefit[] => {
    const found = CORPUS.find((c) => c.id === id);
    if (!found) throw new Error(`corpus case ${id} not found`);
    return found.expected.benefits.map((name) => b(name));
};

const flagsFor = (benefits: Benefit[], employmentType?: string) =>
    bareBenefitsFlag(checkBenefits(benefits), employmentType);

describe('detecting the three core benefits', () => {
    it('recognises provident fund under its many names', () => {
        for (const name of ['Provident Fund', 'EPF', 'employer PF contribution', '401(k) plan']) {
            expect(checkBenefits([b(name)]).core.find((e) => e.key === 'retirement')?.present, name)
                .toBe(true);
        }
    });

    it('recognises health cover under its many names', () => {
        for (const name of ['Medical Insurance', 'Group Mediclaim', 'health cover', 'Employee State Insurance']) {
            expect(checkBenefits([b(name)]).core.find((e) => e.key === 'health')?.present, name)
                .toBe(true);
        }
    });

    it('reads details as well as the name', () => {
        // The model often puts the substance in details: "Group cover" named, the word
        // "medical" only appearing in the description.
        const checklist = checkBenefits([b('Group cover', 'medical insurance, ₹5,00,000 floater')]);
        expect(checklist.core.find((e) => e.key === 'health')?.present).toBe(true);
    });

    it('explains why each missing benefit matters', () => {
        // A gap with no explanation tells the user nothing actionable.
        const checklist = checkBenefits([]);
        for (const entry of checklist.core) {
            expect(entry.present).toBe(false);
            expect(entry.why?.length ?? 0, entry.key).toBeGreaterThan(40);
        }
    });

    it('omits the explanation when a benefit is present', () => {
        const entry = checkBenefits([b('Provident Fund')]).core.find((e) => e.key === 'retirement');
        expect(entry?.why).toBeUndefined();
    });
});

/**
 * The precision half, and the reason the threshold is two-of-three rather than three-of-three.
 *
 * These expectations come from the corpus's own `redFlagTypes`, annotated before this module
 * existed. A checklist that flagged them would be contradicting ground truth it did not write.
 */
describe('does NOT flag ordinary offers that omit one thing', () => {
    it('leaves case 02 alone — insurance and PF, no leave stated', () => {
        expect(flagsFor(corpusBenefits('02-service-company-bond'))).toBeNull();
    });

    it('leaves case 08 alone — leave and PF, no health cover', () => {
        expect(flagsFor(corpusBenefits('08-monthly-salary'))).toBeNull();
    });

    it('leaves case 09 alone — cover and leave, no PF', () => {
        expect(flagsFor(corpusBenefits('09-crore-notation'))).toBeNull();
    });

    it('leaves the complete offers alone', () => {
        for (const id of ['01-indian-product-clean', '04-us-offer-at-will', '07-ocr-damaged',
            '11-ambiguous-title', '13-tabular-layout', '15-variable-heavy', '17-deliberately-clean']) {
            expect(flagsFor(corpusBenefits(id)), id).toBeNull();
        }
    });
});

describe('DOES flag substantially bare offers', () => {
    it('flags case 05 — provident fund and nothing else', () => {
        expect(flagsFor(corpusBenefits('05-red-flag-heavy'))?.type).toBe('missing_benefit');
    });

    it('flags case 06 — no benefits named at all', () => {
        expect(flagsFor(corpusBenefits('06-minimal-offer'))?.type).toBe('missing_benefit');
    });

    it('flags case 03 — perks but no cover and no retirement', () => {
        expect(flagsFor(corpusBenefits('03-startup-vague-equity'))?.type).toBe('missing_benefit');
    });

    it('flags an empty benefits list', () => {
        expect(flagsFor([])?.type).toBe('missing_benefit');
    });
});

describe('framing changes for non-permanent engagements', () => {
    it('reframes rather than suppresses for a contract', () => {
        // Statutory benefits genuinely do not apply, which is lawful — and is the single most
        // important thing such a candidate has to price in, so it is still raised.
        const flag = flagsFor([], 'contract')!;
        expect(flag.type).toBe('missing_benefit');
        expect(flag.severity).toBe('medium');
        expect(flag.explanation).toContain('not permanent employment');
        expect(flag.suggestion).toContain('Price the gap');
    });

    it('treats an internship the same way', () => {
        expect(flagsFor([], 'intern')?.severity).toBe('medium');
    });

    it('treats permanent employment as high severity', () => {
        const flag = flagsFor([], 'full-time')!;
        expect(flag.severity).toBe('high');
        expect(flag.title).toBe('Standard benefits are missing');
    });
});

describe('the flag itself', () => {
    it('names what is missing instead of quoting a letter that says nothing', () => {
        // There is no verbatim quote for an absence. The worker applies its hallucination guard
        // only to model-supplied flags, so this is not dropped for failing to be one.
        const flag = flagsFor([b('Provident Fund')])!;
        expect(flag.matchedText).toContain('Not mentioned in the letter');
        expect(flag.matchedText.toLowerCase()).toContain('health');
        expect(flag.matchedText.toLowerCase()).toContain('leave');
    });

    it('always carries an actionable suggestion', () => {
        expect(flagsFor([])!.suggestion.length).toBeGreaterThan(30);
    });
});

describe('notable benefits are reported but never flagged', () => {
    it('reports gratuity as absent without raising anything', () => {
        // Statutory after five years regardless, so its omission is informative, not alarming.
        const benefits = [b('Provident Fund'), b('Medical Insurance'), b('Paid Leave')];
        const checklist = checkBenefits(benefits);

        expect(checklist.notable.find((e) => e.key === 'gratuity')?.present).toBe(false);
        expect(checklist.isBare).toBe(false);
        expect(bareBenefitsFlag(checklist)).toBeNull();
    });

    it('recognises the notable ones when present', () => {
        const checklist = checkBenefits([b('Group Term Life'), b('Flexible Work Arrangement')]);
        expect(checklist.notable.find((e) => e.key === 'life')?.present).toBe(true);
        expect(checklist.notable.find((e) => e.key === 'flexibility')?.present).toBe(true);
    });
});

describe('robustness against AI-derived input', () => {
    it('survives a non-array', () => {
        expect(() => checkBenefits(undefined as never)).not.toThrow();
        expect(checkBenefits(undefined as never).corePresent).toBe(0);
    });

    it('survives null entries and missing fields', () => {
        const messy = [null, { name: undefined }, { details: 'provident fund' }] as never;
        const checklist = checkBenefits(messy);
        expect(checklist.core.find((e) => e.key === 'retirement')?.present).toBe(true);
    });

    it('keeps the core list at three, since each addition costs precision', () => {
        // Guard on a deliberate design decision: a fourth core benefit raises the
        // false-positive rate on ordinary offers that omit exactly one thing.
        expect(CORE_BENEFITS).toHaveLength(3);
    });
});

describe('keyword matching is whole-word (MONEY-4)', () => {
    const has = (benefits: Benefit[], key: string) =>
        checkBenefits(benefits).core.find((e) => e.key === key)?.present;

    it.each([
        ['Laptop', 'leave'],
        ['Joining bonus, paid upfront', 'retirement'],
        ['Relocation, company residence for 30 days', 'health'],
        ['Provision for gratuity', 'health'],
        ['Term life insurance', 'health'],
    ])('%s is not %s', (name, key) => {
        expect(has([b(name)], key)).toBe(false);
    });

    it('a letter naming only a laptop and an upfront bonus is bare and flagged', () => {
        const checklist = checkBenefits([b('Laptop'), b('Joining bonus, paid upfront')]);
        expect(checklist.corePresent).toBe(0);
        expect(checklist.isBare).toBe(true);
        expect(bareBenefitsFlag(checklist, 'full-time')?.title).toBe('Standard benefits are missing');
    });

    it.each([
        ['PF', 'retirement'], ['Provident Fund', 'retirement'], ['EPF', 'retirement'], ['NPS', 'retirement'],
        ['health insurance', 'health'], ['medical cover', 'health'], ['group mediclaim', 'health'],
        ['Group insurance', 'health'], ['ESI', 'health'], ['ESIC cover', 'health'], ['EPFO contribution', 'retirement'],
        ['paid time off', 'leave'], ['PTO', 'leave'], ['earned leave', 'leave'],
    ])('%s still counts as %s', (name, key) => {
        expect(has([b(name)], key)).toBe(true);
    });
});
