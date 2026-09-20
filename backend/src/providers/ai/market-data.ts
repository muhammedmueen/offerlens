/**
 * Render market data for the negotiation prompt, with its provenance attached
 * (Phase 1 task 6).
 *
 * The distinction matters more here than anywhere else in the product. This output is an
 * email a candidate may actually send to an employer, and "the market median for this role
 * is ₹28,00,000" is a checkable claim. If that number came from a language model's
 * impression rather than from submissions, the candidate is walking into a negotiation
 * carrying a fabricated statistic — and if the employer knows the real range, the whole
 * approach collapses.
 *
 * So the prompt is told which it is, and told to write differently in each case: cite the
 * figure when it is real, argue from the offer's own terms when it is not.
 *
 * Lives in its own module rather than inside a provider, because it is prompt text and
 * applies to every provider equally. It was in `gemini.ai.ts` when Gemini was the only one.
 */
export function describeMarketData(marketData: unknown): string {
    const md = marketData as {
        dataSource?: string;
        marketRange?: { p25?: number; p50?: number; p75?: number; p90?: number };
        offerPercentile?: number;
        disclaimer?: string | null;
        roleUsed?: string;
        locationUsed?: string;
    } | null | undefined;

    if (!md || !md.marketRange) {
        return [
            'Market Data: NONE AVAILABLE.',
            'Do not cite salary benchmarks, percentiles, or "market rates" as fact. Build the',
            'case from the terms of this offer alone — its structure, its risks, and the',
            "candidate's contribution.",
        ].join('\n            ');
    }

    const isReal = md.dataSource === 'crowdsourced';
    const range = md.marketRange;

    if (isReal) {
        return [
            `Market Data (VERIFIED — from real submissions for ${md.roleUsed ?? 'this role'} in ${md.locationUsed ?? 'this city'}):`,
            `  25th percentile: ${range.p25}`,
            `  Median:          ${range.p50}`,
            `  75th percentile: ${range.p75}`,
            `  90th percentile: ${range.p90}`,
            `  This offer sits at roughly the ${md.offerPercentile ?? '?'}th percentile.`,
            md.disclaimer ? `  Provenance: ${md.disclaimer}` : '',
            'You MAY cite these figures in the email as market data, because they come from',
            'real submissions. Reference the percentile position directly — it is the',
            'strongest argument available.',
        ].filter(Boolean).join('\n            ');
    }

    return [
        'Market Data (AI ESTIMATE — NOT verified against real submissions):',
        `  Rough range: ${range.p25} to ${range.p90}, midpoint around ${range.p50}.`,
        'CRITICAL: do NOT present these numbers as market data, benchmarks, or research in',
        'the email. They are an impression, not evidence, and the employer may know the real',
        'range. Write the case from the offer\'s own terms instead — the components, the',
        'risks, the restrictive clauses. If the candidate should reference market rates, tell',
        'them to research and insert their own figure rather than supplying one.',
    ].join('\n            ');
}
