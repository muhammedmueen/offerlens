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

export class ReportService {
    async generatePDF(offerId: string): Promise<PDFKit.PDFDocument> {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed before generating report', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extracted = analysis.extractedData as AnalysisResult['extractedData'];
        const redFlags = analysis.redFlags as AnalysisResult['redFlags'];
        const salary = analysis.salaryComparison as AnalysisResult['salaryComparison'];
        const suggestions = analysis.negotiationSuggestions as AnalysisResult['negotiationSuggestions'];
        const benefits = analysis.benefits as AnalysisResult['benefits'];

        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        // --- Header ---
        doc.fontSize(24).font('Helvetica-Bold').text('OfferLens Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#666')
            .text(`Generated on ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, { align: 'center' });
        doc.moveDown(1);

        // --- Score Badge ---
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text('Overall Score');
        doc.moveDown(0.3);
        const scoreColor = this.getScoreColor(analysis.score);
        doc.fontSize(36).font('Helvetica-Bold').fillColor(scoreColor)
            .text(`${analysis.score}/100`, { continued: true });
        doc.fontSize(14).fillColor('#666')
            .text(`  ${analysis.scoreLabel.toUpperCase()}`, { baseline: 'middle' } as any);
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
                ? `${extracted.compensation.currency} ${extracted.compensation.baseSalary.amount.toLocaleString()} (${extracted.compensation.baseSalary.period})`
                : 'Not stated in the letter'],
            ['Total CTC', extracted.compensation?.totalCTC
                ? `${extracted.compensation.currency} ${extracted.compensation.totalCTC.toLocaleString()}`
                : 'Not extracted'],
        ];
        summaryItems.forEach(([label, value]) => {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text(`${label}: `, { continued: true });
            doc.font('Helvetica').fillColor('#555').text(value as string);
        });
        doc.moveDown(1);

        // --- Red Flags ---
        if (redFlags && redFlags.length > 0) {
            this.addSection(doc, `Red Flags (${redFlags.length})`);
            redFlags.forEach((flag, i) => {
                const sevColor = flag.severity === 'high' ? '#DC2626' : flag.severity === 'medium' ? '#F59E0B' : '#6B7280';
                doc.fontSize(10).font('Helvetica-Bold').fillColor(sevColor)
                    .text(`${i + 1}. [${flag.severity.toUpperCase()}] ${flag.title}`);
                doc.fontSize(9).font('Helvetica').fillColor('#555')
                    .text(flag.explanation);
                doc.fontSize(9).font('Helvetica-Oblique').fillColor('#2563EB')
                    .text(`💡 ${flag.suggestion}`);
                doc.moveDown(0.5);
            });
        }

        // --- Salary Comparison ---
        if (salary) {
            this.addSection(doc, 'Salary Comparison');
            doc.fontSize(10).font('Helvetica').fillColor('#333');
            doc.text(`Role Used: ${salary.roleUsed} (${Math.round(salary.roleMatchConfidence * 100)}% match)`);
            doc.text(`Location: ${salary.locationUsed}`);
            // Null when the letter states no CTC to rank: omit the line rather than print "nullth".
            if (typeof salary.offerPercentile === 'number') {
                doc.text(`Your Offer Percentile: ${salary.offerPercentile}th`);
            }
            doc.moveDown(0.3);
            doc.text(`Market Range: P25=${salary.marketRange.p25.toLocaleString()} | P50=${salary.marketRange.p50.toLocaleString()} | P75=${salary.marketRange.p75.toLocaleString()} | P90=${salary.marketRange.p90.toLocaleString()}`);
            if (salary.disclaimer) {
                doc.fontSize(8).fillColor('#999').text(salary.disclaimer);
            }
            // ODbL attribution beside every displayed survey benchmark. Plain text, 9 pt #333:
            // the grey disclaimer above is too faint for a legal notice.
            if (salary.dataSource === 'public_survey') {
                doc.moveDown(0.3);
                doc.fontSize(9).font('Helvetica').fillColor('#333').text(ATTRIBUTION_TEXT);
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
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
                    .text(`${i + 1}. ${tip.component} (Priority: ${tip.priority})`);
                doc.fontSize(9).font('Helvetica').fillColor('#555')
                    .text(`Current: ${tip.currentValue} → Suggested: ${tip.suggestedAsk}`);
                doc.fontSize(9).fillColor('#666').text(tip.rationale);
                doc.moveDown(0.5);
            });
        }

        // --- Benefits ---
        if (benefits && benefits.length > 0) {
            this.addSection(doc, 'Benefits');
            benefits.forEach(b => {
                doc.fontSize(10).font('Helvetica').fillColor('#333')
                    .text(`• ${b.name}${b.value ? `: ${b.value}` : ''}`);
                if (b.details) {
                    doc.fontSize(9).fillColor('#666').text(`  ${b.details}`);
                }
            });
        }

        // --- Footer ---
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#999')
            .text('This report was generated by OfferLens AI. Data is for informational purposes only.', { align: 'center' });
        doc.text('OfferLens does not guarantee accuracy of market data or AI analysis.', { align: 'center' });

        return doc;
    }

    private addSection(doc: PDFKit.PDFDocument, title: string) {
        doc.moveDown(0.5);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#1F2937').text(title);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').stroke();
        doc.moveDown(0.5);
    }

    private getScoreColor(score: number): string {
        if (score >= 90) return '#059669'; // green
        if (score >= 75) return '#2563EB'; // blue
        if (score >= 60) return '#F59E0B'; // amber
        if (score >= 40) return '#EA580C'; // orange
        return '#DC2626'; // red
    }
}
