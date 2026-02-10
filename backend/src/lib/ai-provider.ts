/**
 * AI Provider Abstraction Layer
 * Supports: OpenAI, Google AI (Gemini)
 * 
 * Configure via environment variable:
 * AI_PROVIDER=openai | google
 */

import { logger } from "../utils/logger";

// Embedding result type
export interface EmbeddingResult {
    embedding: number[];
    model: string;
}

// LLM completion result
export interface CompletionResult {
    content: string;
    model: string;
}

// Provider interface
interface AIProvider {
    name: string;
    generateEmbedding(text: string): Promise<number[] | null>;
    generateCompletion(prompt: string, options?: { maxTokens?: number; temperature?: number; json?: boolean }): Promise<string | null>;
}

// --- OpenAI Provider ---
class OpenAIProvider implements AIProvider {
    name = "openai";
    private client: any = null;

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            // Lazy import to avoid issues when not using OpenAI
            import("openai").then(({ default: OpenAI }) => {
                this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            });
        }
    }

    async generateEmbedding(text: string): Promise<number[] | null> {
        if (!this.client) {
            // Try to initialize again
            const { default: OpenAI } = await import("openai");
            this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
        if (!this.client) return null;

        try {
            const response = await this.client.embeddings.create({
                model: "text-embedding-ada-002",
                input: text.slice(0, 8000),
            });
            return response.data[0]?.embedding || null;
        } catch (error) {
            logger.error("[OpenAI] Embedding failed", { error });
            return null;
        }
    }

    async generateCompletion(prompt: string, options?: { maxTokens?: number; temperature?: number; json?: boolean }): Promise<string | null> {
        if (!this.client) {
            const { default: OpenAI } = await import("openai");
            this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
        if (!this.client) return null;

        try {
            const response = await this.client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: options?.maxTokens || 500,
                temperature: options?.temperature || 0,
                ...(options?.json ? { response_format: { type: "json_object" } } : {}),
            });
            return response.choices[0]?.message?.content || null;
        } catch (error) {
            logger.error("[OpenAI] Completion failed", { error });
            return null;
        }
    }
}

// --- Google AI (Gemini) Provider ---
class GoogleAIProvider implements AIProvider {
    name = "google";
    private client: any = null;
    private embeddingModel: any = null;
    private completionModel: any = null;

    constructor() {
        this.initialize();
    }

    private async initialize() {
        if (process.env.GOOGLE_AI_API_KEY) {
            try {
                const { GoogleGenerativeAI } = await import("@google/generative-ai");
                this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
                this.embeddingModel = this.client.getGenerativeModel({ model: "text-embedding-004" });
                this.completionModel = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
                logger.info("[Google AI] Initialized successfully");
            } catch (error) {
                logger.error("[Google AI] Failed to initialize", { error });
            }
        }
    }

    async generateEmbedding(text: string): Promise<number[] | null> {
        if (!this.embeddingModel) {
            await this.initialize();
        }
        if (!this.embeddingModel) return null;

        try {
            const result = await this.embeddingModel.embedContent(text.slice(0, 8000));
            return result.embedding?.values || null;
        } catch (error) {
            logger.error("[Google AI] Embedding failed", { error });
            return null;
        }
    }

    async generateCompletion(prompt: string, options?: { maxTokens?: number; temperature?: number; json?: boolean }): Promise<string | null> {
        if (!this.completionModel) {
            await this.initialize();
        }
        if (!this.completionModel) return null;

        try {
            // Add JSON instruction if needed
            let finalPrompt = prompt;
            if (options?.json) {
                finalPrompt = prompt + "\n\nRespond with valid JSON only. No markdown, no code blocks, just the JSON object.";
            }

            const result = await this.completionModel.generateContent({
                contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    maxOutputTokens: options?.maxTokens || 500,
                    temperature: options?.temperature || 0,
                },
            });

            const response = result.response;
            let text = response.text();

            // Clean JSON response if needed
            if (options?.json && text) {
                // Remove markdown code blocks if present
                text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            }

            return text || null;
        } catch (error) {
            logger.error("[Google AI] Completion failed", { error });
            return null;
        }
    }
}

// --- Provider Factory ---
let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
    if (cachedProvider) return cachedProvider;

    const providerName = process.env.AI_PROVIDER || "google"; // Default to Google

    switch (providerName.toLowerCase()) {
        case "openai":
            if (!process.env.OPENAI_API_KEY) {
                logger.warn("[AI] OpenAI selected but OPENAI_API_KEY not set");
            }
            cachedProvider = new OpenAIProvider();
            break;

        case "google":
        default:
            if (!process.env.GOOGLE_AI_API_KEY) {
                logger.warn("[AI] Google AI selected but GOOGLE_AI_API_KEY not set");
            }
            cachedProvider = new GoogleAIProvider();
            break;
    }

    logger.info(`[AI] Using provider: ${cachedProvider.name}`);
    return cachedProvider;
}

// Export singleton instance
export const aiProvider = getAIProvider();
