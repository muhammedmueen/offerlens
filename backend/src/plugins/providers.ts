import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { config } from '@/config/index.js';
import { OcrProvider } from '@/providers/ocr/ocr.provider.js';
import { createOcrProvider } from '@/providers/ocr/ocr.factory.js';
import { MockOcrProvider } from '@/providers/ocr/mock.ocr.js';
import { AiProvider } from '@/providers/ai/ai.provider.js';
import { createAiProvider, describeSelection, type AiProviderSelection } from '@/providers/ai/ai.factory.js';
import { resolveAiOverride, aiOverrideAllowed, redactSelection } from '@/providers/ai/request-override.js';
import { StorageProvider } from '@/providers/storage/storage.provider.js';
import { LocalStorageProvider } from '@/providers/storage/local.storage.js';

declare module 'fastify' {
    interface FastifyInstance {
        ocr: OcrProvider;
        /**
         * The server-configured provider, for code with no request in scope.
         *
         * Request handlers should prefer `createAiProvider(req.aiSelection)`, so a
         * development override is honoured.
         */
        ai: AiProvider;
        storage: StorageProvider;
    }

    interface FastifyRequest {
        /**
         * Which provider, model and key this request should use.
         *
         * A plain object rather than a built provider, deliberately: it costs nothing for the
         * many requests that never call AI, it is what has to travel to the worker in the job
         * payload anyway, and constructing an SDK client per request would be waste.
         *
         * Empty unless a development override is in play, in which case
         * `createAiProvider({})` falls through to the configured default.
         */
        aiSelection: AiProviderSelection;
    }
}

const providersPlugin: FastifyPluginAsync = async (fastify) => {
    // ── OCR ──
    // One factory, shared with the OCR worker, selects the provider from OCR_PROVIDER + creds.
    const ocrProvider: OcrProvider = createOcrProvider();

    if (ocrProvider instanceof MockOcrProvider) {
        fastify.log.warn(
            'Using Mock OCR Provider. Set OCR_PROVIDER=azure (+ AZURE_DOC_INTELLIGENCE_ENDPOINT/_KEY) '
            + 'for images and scanned PDFs, or OCR_PROVIDER=google (+ GOOGLE_CLOUD_CREDENTIALS) for images.',
        );
    } else {
        fastify.log.info({ provider: ocrProvider.name }, 'OCR provider initialised');
    }

    // ── AI ──
    //
    // Built through the factory so provider choice is one env var rather than a code change.
    // This instance is the default; handlers build their own when a request overrides it.
    const aiProvider = createAiProvider();
    fastify.log.info(
        { provider: aiProvider.constructor.name, configured: config.AI_PROVIDER },
        'AI provider initialised',
    );

    if (aiOverrideAllowed()) {
        // Loud on purpose. This is the switch that lets a request name its own API key, and
        // nobody should discover it is on by reading the source.
        fastify.log.warn(
            'X-AI-Provider / X-AI-Model / X-AI-Key request overrides are ENABLED. '
            + 'Development only — refused in production regardless of configuration.',
        );
    }

    // Declared with NO default value, deliberately.
    //
    // Fastify refuses a reference-type default at runtime — `FST_ERR_DEC_REFERENCE_TYPE` —
    // because one object would be shared by every request, so a mutation in one request
    // would leak into the next. It rejected a frozen empty object too, which is the right
    // call: the guard is about the shape, not about whether this particular placeholder
    // happened to be safe.
    //
    // The onRequest hook below assigns a fresh object per request, and it runs before any
    // handler, so nothing ever observes this undefined.
    fastify.decorateRequest('aiSelection');

    fastify.addHook('onRequest', async (request) => {
        request.aiSelection = resolveAiOverride(request.headers);

        if (request.aiSelection.provider || request.aiSelection.model) {
            // Redacted: the log would otherwise carry a caller's API key to wherever logs go.
            request.log.info(
                { aiSelection: redactSelection(request.aiSelection) },
                `AI override in effect: ${describeSelection(request.aiSelection)}`,
            );
        }
    });

    // ── Storage ──
    const storageProvider = new LocalStorageProvider();

    fastify.decorate('ocr', ocrProvider);
    fastify.decorate('ai', aiProvider);
    fastify.decorate('storage', storageProvider);
};

export default fp(providersPlugin, {
    name: 'providers',
});
