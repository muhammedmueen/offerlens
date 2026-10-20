import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { ATTRIBUTION_TEXT, SO_SURVEY_URL, ODBL_URL } from '@/modules/salary/reference-source.js';
import { PLFS_CITATION_TEXT, PLFS_URL } from '@/modules/salary/city-adjustment.js';
import { hasUsableRange } from '@/modules/salary/benchmark-comparison.js';
import { ordinal } from '@/shared/ordinal.js';
import { fileURLToPath } from 'node:url';

// SEC-2: pdfkit's built-in Helvetica only encodes WinAnsi, so ₹ and → printed as junk. DejaVu Sans
// (Bitstream Vera licence, see assets/fonts/LICENSE-DejaVu.txt) has both. Resolved from this file so
// it works from src (vitest/tsx) and dist (the build copies assets/ to dist/assets/).
const FONT_REGULAR = fileURLToPath(new URL('../../../assets/fonts/DejaVuSans.ttf', import.meta.url));
const FONT_BOLD = fileURLToPath(new URL('../../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url));

// ponytail: strips colour emoji (Emoji_Presentation, astral pictographs, their joiners/selectors),
// which no embedded font renders. Ceiling: any other character DejaVu lacks (Devanagari, CJK, ...)
// still prints as an empty box. Upgrade path: test each code point against the embedded font's
// glyph coverage (fontkit hasGlyphForCodePoint) or register a fallback font.
// The joiner / selector / keycap marks are separate alternatives, not class members:
// eslint no-misleading-character-class rejects combining characters inside [...].
const UNRENDERABLE = /\p{Emoji_Presentation}|\u200D|\uFE0E|\uFE0F|\u20E3|(?=\p{Extended_Pictographic})[^\0-\uFFFF]/gu;

/** Deep-copies AI-provided data with every string stripped of characters the PDF font cannot draw. */
export function sanitiseForPdf<T>(value: T): T {
    if (typeof value === 'string') {
        const out = value.replace(UNRENDERABLE, '');
        return (out === value ? value : out.replace(/ {2,}/g, ' ').trim()) as T;
    }
    if (Array.isArray(value)) return value.map(sanitiseForPdf) as T;
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitiseForPdf(v)])) as T;
    }
    return value;
}

// SEC-9: lakh grouping for rupees only, the same rule as comparison.matrix.ts formatMoney.
const formatAmount = (amount: number, currency: string | null | undefined) =>
    amount.toLocaleString((currency || 'INR').toUpperCase() === 'INR' ? 'en-IN' : 'en-US');

export class ReportService {
    async generatePDF(offerId: string): Promise<PDFKit.PDFDocument> {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed before generating report', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extracted = sanitiseForPdf(analysis.extractedData as AnalysisResult['extractedData']);
        const redFlags = sanitiseForPdf(analysis.redFlags as AnalysisResult['redFlags']);
        const salary = sanitiseForPdf(analysis.salaryComparison as AnalysisResult['salaryComparison']);
        const suggestions = sanitiseForPdf(analysis.negotiationSuggestions as AnalysisResult['negotiationSuggestions']);
        const benefits = sanitiseForPdf(analysis.benefits as AnalysisResult['benefits']);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.registerFont('Body', FONT_REGULAR);
        doc.registerFont('Body-Bold', FONT_BOLD);

        // --- Header ---
        doc.fontSize(24).font('Body-Bold').text('OfferLens Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Body').fillColor('#666')
            .text(`Generated on ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, { align: 'center' });
        doc.moveDown(1);

        // --- Score Badge ---
        doc.fontSize(14).font('Body-Bold').fillColor('#000').text('Overall Score');
        doc.moveDown(0.3);
        const scoreColor = this.getScoreColor(analysis.score);
        doc.fontSize(36).font('Body-Bold').fillColor(scoreColor)
            .text(`${analysis.score}/100`, { continued: true });
        doc.fontSize(14).fillColor('#666')
            .text(`  ${sanitiseForPdf(analysis.scoreLabel).toUpperCase()}`, { baseline: 'middle' } as any);
        if (analysis.scoringMethod === 'fallback') {
            doc.fontSize(9).fillColor('#999').text('(Estimated score — limited data available)');
        }
        doc.moveDown(1);

        // --- Offer Summary ---
        this.addSection(doc, 'Offer Summary');
        const summaryItems = [
            ['Company', extracted.companyName || 'Not extracted'],
            ['Role', extracted.role || 'Not extracted'],
            ['Location', extracted.location || 'Not extracted'],
            ['Employment Type', extracted.employmentType || 'Not specified'],
            // "Not stated in the letter" rather than "Not extracted": basic being absent is
            // usually the letter's choice, not an extraction failure, and blaming the tool for
            // it misleads the reader about what is missing.
            ['Base Salary', extracted.compensation?.baseSalary?.amount
                ? `${extracted.compensation.currency} ${formatAmount(extracted.compensation.baseSalary.amount, extracted.compensation.currency)} (${extracted.compensation.baseSalary.period})`
                : 'Not stated in the letter'],
            ['Total CTC', extracted.compensation?.totalCTC
                ? `${extracted.compensation.currency} ${formatAmount(extracted.compensation.totalCTC, extracted.compensation.currency)}`
                : 'Not extracted'],
        ];
        summaryItems.forEach(([label, value]) => {
            doc.fontSize(10).font('Body-Bold').fillColor('#333').text(`${label}: `, { continued: true });
            doc.font('Body').fillColor('#555').text(value as string);
        });
        doc.moveDown(1);

        // --- Red Flags ---
        if (redFlags && redFlags.length > 0) {
            this.addSection(doc, `Red Flags (${redFlags.length})`);
            redFlags.forEach((flag, i) => {
                const sevColor = flag.severity === 'high' ? '#DC2626' : flag.severity === 'medium' ? '#F59E0B' : '#6B7280';
                doc.fontSize(10).font('Body-Bold').fillColor(sevColor)
                    .text(`${i + 1}. [${flag.severity.toUpperCase()}] ${flag.title}`);
                doc.fontSize(9).font('Body').fillColor('#555')
                    .text(flag.explanation);
                // Upright, not oblique: only the regular and bold faces are embedded.
                doc.fontSize(9).font('Body').fillColor('#2563EB')
                    .text(`Tip: ${flag.suggestion}`);
                doc.moveDown(0.5);
            });
        }

        // --- Salary Comparison ---
        if (salary) {
            this.addSection(doc, 'Salary Comparison');
            doc.fontSize(10).font('Body').fillColor('#333');
            doc.text(`Role Used: ${salary.roleUsed} (${Math.round(salary.roleMatchConfidence * 100)}% match)`);
            doc.text(`Location: ${salary.locationUsed}`);
            // Omitted when null (no CTC to rank) and for an AI estimate (MONEY-2): the model's
            // self-reported percentile is not a rank, and stored rows hold an invented 50.
            if (typeof salary.offerPercentile === 'number' && Number.isFinite(salary.offerPercentile)
                && salary.dataSource !== 'ai_estimated') {
                doc.text(`Your Offer Percentile: ${ordinal(Math.round(salary.offerPercentile))}`);
            }
            doc.moveDown(0.3);
            const range = salary.marketRange;
            if (hasUsableRange(range)) {
                // Benchmarks are INR (the page's SalaryBar shows them as ₹ en-IN), whatever the offer's currency.
                doc.text(`Market Range: P25=${formatAmount(range.p25, 'INR')} | P50=${formatAmount(range.p50, 'INR')} | P75=${formatAmount(range.p75, 'INR')} | P90=${formatAmount(range.p90, 'INR')}`);
            }
            if (salary.disclaimer) {
                doc.fontSize(8).fillColor('#999').text(salary.disclaimer);
            }
            // ODbL attribution beside every displayed survey benchmark. Plain text, 9 pt #333:
            // the grey disclaimer above is too faint for a legal notice.
            if (salary.dataSource === 'public_survey') {
                doc.moveDown(0.3);
                doc.fontSize(9).font('Body').fillColor('#333').text(ATTRIBUTION_TEXT);
                doc.text(`Survey: ${SO_SURVEY_URL}`);
                doc.text(`Licence: ${ODBL_URL}`);
                // 5.1b: the PLFS citation beside every number that used a city factor (same 9 pt #333).
                if (salary.cityAdjustment) {
                    doc.text(PLFS_CITATION_TEXT);
                    doc.text(`Survey: ${PLFS_URL}`);
                }
            }
            doc.moveDown(1);
        }

        // --- Negotiation Tips ---
        if (suggestions && suggestions.length > 0) {
            this.addSection(doc, 'Negotiation Tips');
            suggestions.forEach((tip, i) => {
                doc.fontSize(10).font('Body-Bold').fillColor('#333')
                    .text(`${i + 1}. ${tip.component} (Priority: ${tip.priority})`);
                doc.fontSize(9).font('Body').fillColor('#555')
                    .text(`Current: ${tip.currentValue} → Suggested: ${tip.suggestedAsk}`);
                doc.fontSize(9).fillColor('#666').text(tip.rationale);
                doc.moveDown(0.5);
            });
        }

        // --- Benefits ---
        if (benefits && benefits.length > 0) {
            this.addSection(doc, 'Benefits');
            benefits.forEach(b => {
                doc.fontSize(10).font('Body').fillColor('#333')
                    .text(`• ${b.name}${b.value ? `: ${b.value}` : ''}`);
                if (b.details) {
                    doc.fontSize(9).fillColor('#666').text(`  ${b.details}`);
                }
            });
        }

        // --- Footer ---
        doc.moveDown(2);
        doc.fontSize(8).font('Body').fillColor('#999')
            .text('This report was generated by OfferLens AI. Data is for informational purposes only.', { align: 'center' });
        doc.text('OfferLens does not guarantee accuracy of market data or AI analysis.', { align: 'center' });

        return doc;
    }

    private addSection(doc: PDFKit.PDFDocument, title: string) {
        doc.moveDown(0.5);
        doc.fontSize(14).font('Body-Bold').fillColor('#1F2937').text(title);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').stroke();
        doc.moveDown(0.5);
    }

    // SEC-9: the same bands and hexes as the page's gauge (frontend/src/components/charts/ScoreGauge.tsx).
    private getScoreColor(score: number): string {
        if (score >= 70) return '#15803D'; // green-700
        if (score >= 40) return '#B45309'; // amber-700
        return '#B91C1C'; // red-700
    }
}
