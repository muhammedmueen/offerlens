const rules = new Intl.PluralRules('en', { type: 'ordinal' });
const SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/** 1 -> "1st", 22 -> "22nd", 111 -> "111th". Callers pass an integer (round first). */
export function ordinal(n: number): string {
    return `${n}${SUFFIX[rules.select(n)] ?? 'th'}`;
}
