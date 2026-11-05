import { FastifyInstance } from 'fastify';
import { AnalysisService } from './analysis.service.js';
import { getAnalysisSchema } from './analysis.schema.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { loadAuthorizedOffer } from '@/shared/access/offer-guard.js';

export async function analysisRoutes(fastify: FastifyInstance) {
    const analysisService = new AnalysisService(fastify);

    fastify.get('/offers/:id/analysis', {
        schema: getAnalysisSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };

            // Previously unauthenticated — the full analysis was readable by ID.
            await loadAuthorizedOffer(id, req);

            const analysis = await analysisService.getAnalysis(id);

            if (!analysis) {
                // Check if offer exists and is processing?
                // For now just 404 or 202 if processing?
                // Spec says: Poll endpoint returns status. This is specific analysis endpoint.
                // If offer exists but analysis doesn't -> 404 Analysis not found (or Not Ready).
                throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);
            }

            return reply.send({
                success: true,
                data: analysis,
            });
        }
    });

    fastify.get('/offers/:id/report', {
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };

            // Previously unauthenticated. The roadmap specified this as registered-only
            // (GUEST_RESTRICTED); it is now owner-or-owning-guest, which is stricter
            // than the original spec and consistent with the other offer routes.
            await loadAuthorizedOffer(id, req);

            // Lazy load ReportService to avoid circular dependency if any
            const { ReportService } = await import('@/modules/report/report.service.js');
            const reportService = new ReportService();

            const doc = await reportService.generatePDF(id);

            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `attachment; filename="offer-analysis-${id}.pdf"`);

            // reply.send, not doc.pipe(reply.raw): raw skips every header set above and by the
            // plugins, including CORS, so a cross-origin browser could not read the PDF.
            doc.end();
            return reply.send(doc);
        }
    });
}
