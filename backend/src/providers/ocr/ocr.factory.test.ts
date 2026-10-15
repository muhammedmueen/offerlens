import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable config the tests drive. Each provider module is mocked to a trivial class so
// construction needs no real credentials or SDK.
const { cfg } = vi.hoisted(() => ({
    cfg: {
        OCR_PROVIDER: 'mock' as string,
        AZURE_DOC_INTELLIGENCE_ENDPOINT: undefined as string | undefined,
        AZURE_DOC_INTELLIGENCE_KEY: undefined as string | undefined,
        GOOGLE_CLOUD_CREDENTIALS: undefined as string | undefined,
    },
}));

vi.mock('@/config/index.js', () => ({ get config() { return cfg; } }));
vi.mock('./azure-doc-intelligence.ocr.js', () => ({
    AzureDocumentIntelligenceOcrProvider: class { readonly name = 'azure-doc-intelligence' as const; },
}));
vi.mock('./google-vision.ocr.js', () => ({
    GoogleVisionOcrProvider: class { readonly name = 'google-vision' as const; },
}));
vi.mock('./mock.ocr.js', () => ({
    MockOcrProvider: class { readonly name = 'mock' as const; },
}));

const load = () => import('./ocr.factory.js');

beforeEach(() => {
    cfg.OCR_PROVIDER = 'mock';
    cfg.AZURE_DOC_INTELLIGENCE_ENDPOINT = undefined;
    cfg.AZURE_DOC_INTELLIGENCE_KEY = undefined;
    cfg.GOOGLE_CLOUD_CREDENTIALS = undefined;
    vi.restoreAllMocks();
});

describe('createOcrProvider', () => {
    it('defaults to the mock', async () => {
        const { createOcrProvider } = await load();
        expect(createOcrProvider().name).toBe('mock');
    });

    it('builds Azure when OCR_PROVIDER=azure and endpoint+key are present', async () => {
        cfg.OCR_PROVIDER = 'azure';
        cfg.AZURE_DOC_INTELLIGENCE_ENDPOINT = 'https://x.cognitiveservices.azure.com';
        cfg.AZURE_DOC_INTELLIGENCE_KEY = 'k';
        const { createOcrProvider } = await load();
        expect(createOcrProvider().name).toBe('azure-doc-intelligence');
    });

    it('builds Google when OCR_PROVIDER=google and credentials are present', async () => {
        cfg.OCR_PROVIDER = 'google';
        cfg.GOOGLE_CLOUD_CREDENTIALS = '/path/key.json';
        const { createOcrProvider } = await load();
        expect(createOcrProvider().name).toBe('google-vision');
    });

    it('falls back to mock with a loud warning when azure is named but key is missing', async () => {
        cfg.OCR_PROVIDER = 'azure';
        cfg.AZURE_DOC_INTELLIGENCE_ENDPOINT = 'https://x.cognitiveservices.azure.com';
        // no key
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { createOcrProvider } = await load();
        expect(createOcrProvider().name).toBe('mock');
        expect(warn).toHaveBeenCalled();
    });

    it('falls back to mock with a loud warning when google is named but creds are missing', async () => {
        cfg.OCR_PROVIDER = 'google';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { createOcrProvider } = await load();
        expect(createOcrProvider().name).toBe('mock');
        expect(warn).toHaveBeenCalled();
    });
});
