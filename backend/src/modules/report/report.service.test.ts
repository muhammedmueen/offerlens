import { describe, it, expect, vi, beforeEach } from 'vitest';

// A recording stand-in for pdfkit: every chained call is a no-op and `text` is captured.
const texts: string[] = [];
vi.mock('pdfkit', () => {
    const doc: object = new Proxy({}, {
        get: (_t, prop) => {
            if (prop === 'then') return undefined; // not a thenable, or `await` would hang
            if (prop === 'y') return 0;
            if (prop === 'text') return (t: string) => { texts.push(String(t)); return doc; };
            return () => doc;
        },
    });
    return { default: class { constructor() { return doc; } } };
});

let analysisRow: Record<string, unknown>;
vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({
    db: {
        query: {
            offers: { findFirst: async () => ({ id: 'o1', status: 'COMPLETED' }) },
            analyses: { findFirst: async () => analysisRow },
        },
    },
}));

const { ReportService } = await import('./report.service.js');
const { ATTRIBUTION_TEXT, SO_SURVEY_URL, ODBL_URL } = await import('@/modules/salary/reference-source.js');

const analysisWith = (salaryComparison: Record<string, unknown>) => ({
    score: 70, scoreLabel: 'good', scoringMethod: 'standard',
    extractedData: { companyName: 'Acme', role: 'Backend Engineer', location: 'Pune', employmentType: 'full-time', compensation: null },
    redFlags: [], negotiationSuggestions: [], benefits: [],
    salaryComparison: {
        marketRange: { p25: 1, p50: 2, p75: 3, p90: 4 }, roleUsed: 'Backend Engineer', roleMatchConfidence: 0.75,
        locationUsed: 'India (national)', disclaimer: 'Modelled from public surveys, not offers in your city.',
        ...salaryComparison,
    },
});

beforeEach(() => { texts.length = 0; });

describe('ReportService salary section', () => {
    it('prints the ODbL attribution and both links for a public_survey benchmark', async () => {
        analysisRow = analysisWith({ dataSource: 'public_survey', offerPercentile: 55 });
        await new ReportService().generatePDF('o1');
        expect(texts).toContain(ATTRIBUTION_TEXT);
        expect(texts.some((t) => t.includes(SO_SURVEY_URL))).toBe(true);
        expect(texts.some((t) => t.includes(ODBL_URL))).toBe(true);
        expect(texts).toContain('Your Offer Percentile: 55th');
    });

    it('adds the PLFS citation and link, and the adjusted location, only when a city factor was used (5.1b)', async () => {
        const { PLFS_CITATION_TEXT, PLFS_URL } = await import('@/modules/salary/city-adjustment.js');
        analysisRow = analysisWith({
            dataSource: 'public_survey', offerPercentile: 55, locationUsed: 'India (national), adjusted for Pune',
            cityAdjustment: { source: 'plfs_2023_24', city: 'pune', cityLabel: 'Pune', factor: 1.03, plfsSampleSize: 87, period: '2023-24' },
        });
        await new ReportService().generatePDF('o1');
        expect(texts).toContain(ATTRIBUTION_TEXT);   // the ODbL text still applies
        expect(texts).toContain(PLFS_CITATION_TEXT);
        expect(texts.some((t) => t.includes(PLFS_URL))).toBe(true);
        expect(texts).toContain('Location: India (national), adjusted for Pune');

        texts.length = 0;
        analysisRow = analysisWith({ dataSource: 'public_survey', offerPercentile: 55 });
        await new ReportService().generatePDF('o1');
        expect(texts).not.toContain(PLFS_CITATION_TEXT);
    });
    it('omits the percentile line when it is null, and the attribution for other sources', async () => {
        analysisRow = analysisWith({ dataSource: 'crowdsourced', offerPercentile: null });
        await new ReportService().generatePDF('o1');
        expect(texts.some((t) => t.includes('Your Offer Percentile'))).toBe(false);
        expect(texts.some((t) => t.includes('nullth'))).toBe(false);
        expect(texts).not.toContain(ATTRIBUTION_TEXT);
    });

    it('prints no attribution for an AI estimate', async () => {
        analysisRow = analysisWith({ dataSource: 'ai_estimated', offerPercentile: 50 });
        await new ReportService().generatePDF('o1');
        expect(texts).not.toContain(ATTRIBUTION_TEXT);
    });
});
