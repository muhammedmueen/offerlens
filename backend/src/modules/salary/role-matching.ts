import { ROLES, EXPERIENCE, REFERENCE_FAMILIES, type ReferenceFamily } from '@/db/seed-data.js';

/**
 * Fuzzy role, city and experience matching (Phase 5.2). Pure, no I/O.
 *
 * Every keyword is tested as a WHOLE WORD or phrase (`\b...\b`), never as a substring, so `hr`
 * does not fire inside "Throughput" and `sde` does not fire inside a longer word. All patterns
 * are alternations of literals with `\b`, so they are linear on model-supplied text.
 */
export { REFERENCE_FAMILIES, type ReferenceFamily };

export interface RoleMatch {
    /** A seed label (ROLES[].name), or null when nothing matched. */
    canonical: string | null;
    /** 1 = a seed label, 0.9 = synonym table, 0.75 = keyword rule, 0 = no match (matcher only). */
    confidence: number;
    /** Reference roles to query. Empty when the role has no reference data. */
    referenceFamilies: readonly ReferenceFamily[];
    /** Lowercase value that crowdsourced rows are stored and looked up under. */
    crowdKey: string;
}

export interface ExperienceBracket { label: string; minYears: number; maxYears: number }

const MAX_INPUT = 120;

export function normaliseRole(raw: string): string {
    return raw
        .slice(0, MAX_INPUT)
        .toLowerCase()
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/[-_/.,|:&]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Exact seed labels and synonyms (post-normalisation, whole string) ──
const SEED_BY_NORMALISED = new Map(ROLES.map((r) => [normaliseRole(r.name), r.name]));

const SYNONYMS: Record<string, string[]> = {
    'Software Engineer': [
        'sde', 'sde 1', 'sde i', 'sde1', 'sde 2', 'sde ii', 'sde2', 'swe', 'swe 1', 'swe 2',
        'software developer', 'software dev', 'software development engineer',
        'software development engineer 1', 'software development engineer 2',
        'software engineer 1', 'software engineer i', 'software engineer 2', 'software engineer ii',
        'software developer 1', 'software developer 2', 'associate software engineer',
        'associate software developer', 'junior software engineer', 'junior software developer',
        'jr software engineer', 'trainee software engineer', 'software engineer trainee',
        'graduate engineer trainee', 'get', 'developer', 'programmer', 'application developer',
        'analyst programmer', 'programmer analyst', 'systems engineer', 'system engineer',
        'associate engineer', 'member of technical staff', 'mts', 'mts 1', 'mts 2',
    ],
    'Senior Software Engineer': [
        'senior software engineer', 'sr software engineer', 'senior swe', 'sr swe', 'senior sde',
        'sr sde', 'sde 3', 'sde iii', 'sde3', 'software engineer 3', 'software engineer iii',
        'senior software developer', 'sr software developer', 'senior member of technical staff',
        'smts', 'mts 3',
    ],
    'Staff Software Engineer': [
        'staff software engineer', 'staff engineer', 'lead software engineer', 'lead engineer',
        'tech lead', 'technical lead', 'sde 4', 'lead member of technical staff',
    ],
    'Principal Software Engineer': [
        'principal software engineer', 'principal engineer', 'principal member of technical staff',
        'software architect', 'sde 5',
    ],
};
const SYNONYM_TO_CANONICAL = new Map(
    Object.entries(SYNONYMS).flatMap(([canonical, list]) => list.map((s) => [s, canonical] as const)),
);

// ── Keyword rules ──
/** `word*` means a left-anchored prefix (`data scien*` matches scientist and science). */
function wordRegex(literals: string[]): RegExp {
    const alts = literals.map((l) => (l.endsWith('*') ? l.slice(0, -1) : `${l}\\b`));
    return new RegExp(`\\b(?:${alts.join('|')})`);
}

const RULES = {
    engineeringManager: wordRegex(['engineering manager', 'eng manager', 'development manager', 'head of engineering']),
    dataScientist: wordRegex(['data scien*', 'machine learning', 'ml engineer', 'ai engineer', 'applied scientist', 'research scientist', 'nlp']),
    dataEngineer: wordRegex(['data engineer', 'etl', 'big data', 'analytics engineer']),
    devops: wordRegex(['devops', 'sre', 'site reliability', 'platform engineer', 'cloud engineer', 'infrastructure engineer', 'release engineer']),
    mobile: wordRegex(['android', 'ios', 'mobile', 'flutter', 'react native']),
    fullStack: wordRegex(['full stack', 'fullstack', 'mern', 'mean stack']),
    backend: wordRegex(['back end', 'backend', 'server side']),
    frontend: wordRegex(['front end', 'frontend', 'ui developer', 'ui engineer', 'react developer', 'angular developer']),
    qa: wordRegex(['qa', 'sdet', 'software development engineer in test', 'test engineer', 'quality assurance', 'tester', 'testing']),
};

const NON_TECH_GUARD = wordRegex([
    'sales', 'marketing', 'product manager', 'product owner', 'designer', 'recruiter', 'hr',
    'account executive', 'business development',
]);
const GENERIC_TECH = wordRegex(['software', 'sde', 'swe', 'developer', 'programmer', 'mts']);

const SENIORITY: Array<[RegExp, string]> = [
    [wordRegex(['principal', 'distinguished']), 'Principal Software Engineer'],
    [wordRegex(['staff', 'lead', 'architect']), 'Staff Software Engineer'],
    [wordRegex(['senior', 'sr', 'iii', '3']), 'Senior Software Engineer'],
];

const GENERIC_FAMILIES: readonly ReferenceFamily[] =
    ['Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Mobile Engineer'];

function keywordRole(s: string): string | null {
    if (RULES.engineeringManager.test(s)) return 'Engineering Manager';
    if (RULES.dataScientist.test(s)) return 'Data Scientist';
    if (RULES.dataEngineer.test(s)) return 'Data Engineer';
    if (RULES.devops.test(s)) return 'DevOps Engineer';
    if (RULES.mobile.test(s)) return 'Mobile Engineer';
    if (RULES.fullStack.test(s)) return 'Full Stack Engineer';
    const be = RULES.backend.test(s);
    const fe = RULES.frontend.test(s);
    if (be && fe) return 'Full Stack Engineer';
    if (be) return 'Backend Engineer';
    if (fe) return 'Frontend Engineer';
    if (RULES.qa.test(s)) return 'QA Engineer';
    if (GENERIC_TECH.test(s)) {
        // A bare "engineer" is deliberately not enough; this needs software/developer/sde/etc.
        return SENIORITY.find(([re]) => re.test(s))?.[1] ?? 'Software Engineer';
    }
    return null;
}

function familiesFor(canonical: string | null): readonly ReferenceFamily[] {
    if (!canonical) return [];
    if ((REFERENCE_FAMILIES as readonly string[]).includes(canonical)) return [canonical as ReferenceFamily];
    if (/^(Senior |Staff |Principal )?Software Engineer$/.test(canonical)) return GENERIC_FAMILIES;
    return [];
}

export function matchRole(raw: string): RoleMatch {
    const s = normaliseRole(raw);
    const result = (canonical: string | null, confidence: number): RoleMatch => ({
        canonical,
        confidence,
        referenceFamilies: familiesFor(canonical),
        // The stored value today: lowercased and trimmed, not the punctuation-stripped form.
        crowdKey: (canonical ?? raw.slice(0, MAX_INPUT)).toLowerCase().trim(),
    });

    const seed = SEED_BY_NORMALISED.get(s);
    if (seed) return result(seed, 1);

    const synonym = SYNONYM_TO_CANONICAL.get(s);
    if (synonym) return result(synonym, 0.9);

    if (!s || NON_TECH_GUARD.test(s)) return result(null, 0);

    const keyword = keywordRole(s);
    return keyword ? result(keyword, 0.75) : result(null, 0);
}

// ── Cities ──
const CITY_ALIASES: Record<string, string[]> = {
    bangalore: ['bangalore', 'bengaluru', 'bengalooru'],
    mumbai: ['mumbai', 'bombay', 'navi mumbai', 'thane'],
    'delhi ncr': ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'ghaziabad', 'faridabad'],
    hyderabad: ['hyderabad', 'secunderabad'],
    pune: ['pune', 'pimpri'],
    chennai: ['chennai', 'madras'],
};
const CITY_PATTERNS = Object.entries(CITY_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => ({ canonical, alias, re: new RegExp(`\\b${alias}\\b`) })));

/** Canonical lowercase metro for a free-text location, or null. Leftmost alias wins, longer on a tie. */
export function canonicalCity(raw: string): string | null {
    const s = raw.slice(0, MAX_INPUT).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    let best: { index: number; len: number; canonical: string } | null = null;
    for (const { canonical, alias, re } of CITY_PATTERNS) {
        const m = re.exec(s);
        if (!m) continue;
        if (!best || m.index < best.index || (m.index === best.index && alias.length > best.len)) {
            best = { index: m.index, len: alias.length, canonical };
        }
    }
    return best?.canonical ?? null;
}

export function isIndianMetro(raw: string): boolean {
    return canonicalCity(raw) !== null;
}

// ── Experience ──
/**
 * Bracket for the upload form's experience label (the letter carries no years). Brackets are
 * half-open (min <= years < max) because the seed brackets share endpoints.
 */
export function bracketFromLabel(label: string | null | undefined): ExperienceBracket | null {
    if (!label) return null;
    const text = label.slice(0, MAX_INPUT).trim().toLowerCase();

    const exact = EXPERIENCE.find((b) => b.label.toLowerCase() === text);
    if (exact) return exact;

    const m = /(\d+)\s*[-–]\s*(\d+)/.exec(text) ?? /(\d+)\s*\+/.exec(text);
    if (!m) return null;
    const years = Number(m[1]);
    return EXPERIENCE.find((b) => years >= b.minYears && years < b.maxYears) ?? null;
}
