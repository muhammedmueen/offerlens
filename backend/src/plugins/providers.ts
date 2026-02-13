import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { config } from '@/config/index.js';
import { OcrProvider } from '@/providers/ocr/ocr.provider.js';
import { GoogleVisionOcrProvider } from '@/providers/ocr/google-vision.ocr.js';
import { MockOcrProvider } from '@/providers/ocr/mock.ocr.js';
import { AiProvider } from '@/providers/ai/ai.provider.js';
import { GeminiAiProvider } from '@/providers/ai/gemini.ai.js';
import { MockAiProvider } from '@/providers/ai/mock.ai.js';
import { StorageProvider } from '@/providers/storage/storage.provider.js';
import { LocalStorageProvider } from '@/providers/storage/local.storage.js';

declare module 'fastify' {
    interface FastifyInstance {
        ocr: OcrProvider;
        ai: AiProvider;
        storage: StorageProvider;
    }
}

const providersPlugin: FastifyPluginAsync = async (fastify) => {
    // OCR Provider
    // OCR Provider
    // Use Real Provider if credentials exist, otherwise Mock
    const ocrProvider = config.GOOGLE_CLOUD_CREDENTIALS
        ? new GoogleVisionOcrProvider()
        : new MockOcrProvider();

    if (ocrProvider instanceof MockOcrProvider) {
        fastify.log.warn('Using Mock OCR Provider (Set GOOGLE_CLOUD_CREDENTIALS to use real Vision API)');
    } else {
        fastify.log.info('Using Google Cloud Vision OCR Provider');
    }

    // AI Provider
    // Use Real Provider if API key exists, otherwise Mock
    const aiProvider = config.GEMINI_API_KEY
        ? new GeminiAiProvider()
        : new MockAiProvider();

    if (aiProvider instanceof MockAiProvider) {
        fastify.log.warn('Using Mock AI Provider (Set GEMINI_API_KEY to use real Gemini API)');
    } else {
        fastify.log.info('Using Google Gemini AI Provider');
    }

    // Storage Provider
    const storageProvider = new LocalStorageProvider(); // Always local for Phase 1

    fastify.decorate('ocr', ocrProvider);
    fastify.decorate('ai', aiProvider);
    fastify.decorate('storage', storageProvider);
};

export default fp(providersPlugin, {
    name: 'providers',
});
