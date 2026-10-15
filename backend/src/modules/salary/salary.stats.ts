/**
 * Pure salary statistics (Phase 5: 5.3 outlier rejection and recency weighting).
 *
 * No I/O, so it is tested without a database. Reference and crowdsourced rows are summarised by
 * SEPARATE calls here and are never concatenated into one array.
 */

/** Minimum rows (after outlier rejection) before a benchmark is reported. Defined once, here. */
export const MIN_SAMPLE_SIZE = 10;
/** Rejection threshold, in (robust) standard deviations. */
export const OUTLIER_SIGMA = 3;
/** Lower bound on the robust sigma, in log space (about 5%). Covers MAD = 0 and near-zero MAD. */
export const SIGMA_FLOOR = 0.05;

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000;

export interface WeightedValue { value: number; weight: number }

export interface Summary {
    marketRange: { p25: number; p50: number; p75: number; p90: number };
    offerPercentile: number | null;
    /** Row count after outlier rejection, not the weight sum. */
    sampleSize: number;
}

/** 5.3 recency weight: 1 / (1 + monthsOld * 0.1). 1 for a brand-new row, 0.5 at ten months. */
export function recencyWeight(createdAtMs: number, nowMs: number): number {
    const monthsOld = Math.max(0, (nowMs - createdAtMs) / MS_PER_MONTH);
    return 1 / (1 + monthsOld * 0.1);
}

function median(sorted: number[]): number {
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 5.3: reject values more than 3 sigma from the centre.
 *
 * ponytail: a literal mean/stddev test can never fire at n <= 10 (max z-score is (n-1)/sqrt(n),
 * 2.85 at n = 10), and one huge value inflates sigma and hides itself. So sigma is the robust one
 * (1.4826 * MAD around the median), in log space because CTC is roughly lognormal. Ceiling: it
 * ignores experience, so a very senior high earner is judged against the same spread as a junior;
 * Phase B partial pooling is the upgrade path.
 */
export function rejectOutliers<T extends WeightedValue>(items: T[]): T[] {
    const usable = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
    if (usable.length === 0) return [];

    const logs = usable.map((i) => Math.log(i.value)).sort((a, b) => a - b);
    const centre = median(logs);
    const mad = median(logs.map((x) => Math.abs(x - centre)).sort((a, b) => a - b));
    const sigma = Math.max(1.4826 * mad, SIGMA_FLOOR);

    return usable.filter((i) => Math.abs(Math.log(i.value) - centre) <= OUTLIER_SIGMA * sigma);
}

/**
 * Weighted percentile of a list sorted ascending by value. The plotting position of item i is
 * (weight before i + weight_i / 2) / total; the result interpolates between neighbours and clamps
 * outside the first and last positions. With equal weights it is the midpoint quantile.
 */
export function weightedPercentile(sortedAsc: WeightedValue[], p: number): number {
    const total = sortedAsc.reduce((s, i) => s + i.weight, 0);
    const t = p / 100;

    let before = 0;
    let prev: { pos: number; value: number } | null = null;
    for (const item of sortedAsc) {
        const pos = (before + item.weight / 2) / total;
        if (t <= pos) {
            if (!prev) return item.value;
            const frac = (t - prev.pos) / (pos - prev.pos);
            return prev.value + (item.value - prev.value) * frac;
        }
        prev = { pos, value: item.value };
        before += item.weight;
    }
    return prev!.value;
}

/** 0-100 rank of `value`: weight strictly below plus half the weight equal. Empty gives 50. */
export function weightedPercentileRank(sortedAsc: WeightedValue[], value: number): number {
    const total = sortedAsc.reduce((s, i) => s + i.weight, 0);
    if (sortedAsc.length === 0 || total === 0) return 50;

    let below = 0;
    let equal = 0;
    for (const i of sortedAsc) {
        if (i.value < value) below += i.weight;
        else if (i.value === value) equal += i.weight;
    }
    return Math.round(((below + equal / 2) / total) * 100);
}

/**
 * Summarise ONE source's rows. The sample-size floor applies AFTER rejection, so a poisoned set
 * cannot pass on its raw count.
 */
export function summarise(
    items: WeightedValue[],
    offerCtc: number | null,
    opts: { rejectOutliers: boolean },
): Summary | null {
    const kept = (opts.rejectOutliers ? rejectOutliers(items) : [...items]).sort((a, b) => a.value - b.value);
    if (kept.length < MIN_SAMPLE_SIZE) return null;

    const at = (p: number) => Math.round(weightedPercentile(kept, p));
    return {
        marketRange: { p25: at(25), p50: at(50), p75: at(75), p90: at(90) },
        offerPercentile:
            offerCtc !== null && Number.isFinite(offerCtc) && offerCtc > 0
                ? weightedPercentileRank(kept, offerCtc)
                : null,
        sampleSize: kept.length,
    };
}
