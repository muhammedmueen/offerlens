import { describe, it, expect, vi } from 'vitest';

// SEC-2 / SEC-9: renders a real PDF (real pdfkit, no mock) and reads it back with pdfjs, the
// same library the upload pipeline uses, so the assertions see what a PDF viewer would show.
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

const { ReportService, sanitiseForPdf } = await import('./report.service.js');

async function render(): Promise<{ raw: string; text: string }> {
    const doc = await new ReportService().generatePDF('o1');
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));
    doc.end();
    await done;
    const bytes = Buffer.concat(chunks);

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false });
    const pdf = await loading.promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        text += (content.items as Array<{ str?: string; hasEOL?: boolean }>)
            .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join('');
    }
    await loading.destroy();
    // Font dictionaries are not inside compressed streams, so the raw bytes name the fonts used.
    return { raw: bytes.toString('latin1'), text };
}

describe('ReportService PDF rendering (SEC-2, SEC-9)', () => {
    it('embeds DejaVu Sans, prints ₹ and → intact, and no emoji', async () => {
        analysisRow = {
            score: 72, scoreLabel: 'good', scoringMethod: 'standard',
            extractedData: {
                companyName: 'Acme 🚀', role: 'Backend Engineer', location: 'Pune', employmentType: 'full-time',
                compensation: { currency: 'INR', baseSalary: { amount: 600000, period: 'annual' }, totalCTC: 1200000 },
            },
            redFlags: [{
                type: 'bond', severity: 'high', title: 'Service bond', explanation: 'A ₹5 lakh bond for 2 years.',
                matchedText: '', suggestion: 'Ask to remove the bond 👍🏽',
            }],
            salaryComparison: null,
            negotiationSuggestions: [{
                component: 'Base', currentValue: '₹12 LPA', suggestedAsk: '₹15 LPA', rationale: 'Market rate.', priority: 'high',
            }],
            benefits: [{ name: 'Insurance', value: '₹5 lakh', details: null }],
        };
        const { raw, text } = await render();

        // (a) the embedded TrueType font, not the built-in WinAnsi Helvetica
        expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+DejaVuSans\b/);
        expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+DejaVuSans-Bold\b/);
        expect(raw).not.toContain('Helvetica');

        // (b) ₹ and → come back as themselves, not the WinAnsi fallback junk
        expect(text).toContain('Current: ₹12 LPA → Suggested: ₹15 LPA');
        expect(text).toContain('A ₹5 lakh bond for 2 years.');
        expect(text).toContain('Insurance: ₹5 lakh');
        expect(text).not.toContain('Ø=Ü');
        expect(text).not.toContain(' ¹');

        // (c) no emoji reaches the PDF; the suggestion carries a plain label
        expect(text).toContain('Tip: Ask to remove the bond');
        expect(text).toContain('Company: Acme');
        expect(text).not.toMatch(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u);

        // (d) en-IN lakh grouping for INR
        expect(text).toContain('Total CTC: INR 12,00,000');
        expect(text).toContain('Base Salary: INR 6,00,000 (annual)');
    });

    it('groups non-INR amounts the en-US way', async () => {
        analysisRow = {
            score: 50, scoreLabel: 'fair', scoringMethod: 'standard',
            extractedData: { companyName: 'Acme', role: 'Dev', location: 'NYC', employmentType: 'full-time',
                compensation: { currency: 'USD', baseSalary: null, totalCTC: 1200000 } },
            redFlags: [], salaryComparison: null, negotiationSuggestions: [], benefits: [],
        };
        const { text } = await render();
        expect(text).toContain('Total CTC: USD 1,200,000');
    });

    it('(e) uses the gauge bands: 72 is green, 40-69 amber, below 40 red', () => {
        const color = (s: number) => new ReportService()['getScoreColor'](s);
        expect(color(72)).toBe('#15803D'); // ScoreGauge.tsx ≥70
        expect(color(70)).toBe('#15803D');
        expect(color(69)).toBe('#B45309');
        expect(color(40)).toBe('#B45309');
        expect(color(39)).toBe('#B91C1C');
    });

    it('sanitiseForPdf strips emoji but keeps ₹, →, •, ©, ™ and accents', () => {
        expect(sanitiseForPdf({ a: ['💡 Ask ₹12 LPA → x', '• © ™ é ✓'], b: 3, c: null }))
            .toEqual({ a: ['Ask ₹12 LPA → x', '• © ™ é ✓'], b: 3, c: null });
        expect(sanitiseForPdf('Team 👨‍💻 in 🇮🇳 ❤️ 1️⃣')).toBe('Team in ❤ 1');
    });
});
