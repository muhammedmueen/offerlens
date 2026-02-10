import { getAIProvider } from "../lib/ai-provider";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

// Red flag detection result
export interface RedFlagMatch {
    id: string;
    category: string;
    severity: "high" | "medium" | "low";
    matchedText: string;
    sampleText: string;
    similarityScore: number;
    llmVerdict?: {
        isConfirmed: boolean;
        explanation: string;
    };
}

/**
 * Red Flag Vector Service - Vector-optimized detection
 * 
 * Flow:
 * 1. Chunk offer text into paragraphs
 * 2. Generate embedding for each chunk
 * 3. Query pgvector for similar "bad clauses" (cosine similarity > 0.80)
 * 4. Only send suspicious paragraphs to LLM for final verdict (cost optimization)
 * 
 * Uses AI provider abstraction (supports Google AI, OpenAI)
 */
export class RedFlagVectorService {
    private aiProvider = getAIProvider();

    /**
     * Main detection method using vector search
     */
    async detectRedFlags(offerText: string): Promise<RedFlagMatch[]> {
        logger.info("[RedFlagVector] Starting vector-based detection");

        // Step 1: Chunk text into paragraphs
        const chunks = this.chunkText(offerText);
        logger.info(`[RedFlagVector] Split into ${chunks.length} chunks`);

        const matches: RedFlagMatch[] = [];

        // Step 2: Process each chunk
        for (const chunk of chunks) {
            // Skip very short chunks
            if (chunk.length < 50) continue;

            // Generate embedding for this chunk
            const embedding = await this.generateEmbedding(chunk);
            if (!embedding) continue;

            // Query pgvector for similar bad clauses
            const similarClauses = await this.findSimilarBadClauses(embedding, 0.80);

            for (const clause of similarClauses) {
                matches.push({
                    id: clause.id,
                    category: clause.category,
                    severity: clause.severity as "high" | "medium" | "low",
                    matchedText: chunk,
                    sampleText: clause.sampleText,
                    similarityScore: clause.similarity,
                });
            }
        }

        logger.info(`[RedFlagVector] Found ${matches.length} potential matches`);

        // Step 3: LLM verification for high-severity matches only (cost optimization)
        const highSeverityMatches = matches.filter(m => m.severity === "high");
        if (highSeverityMatches.length > 0 && highSeverityMatches.length <= 5) {
            logger.info(`[RedFlagVector] Verifying ${highSeverityMatches.length} high-severity matches with LLM`);
            await this.verifyWithLLM(highSeverityMatches);
        }

        // Filter out false positives (if LLM rejected them)
        return matches.filter(m =>
            m.severity !== "high" ||
            !m.llmVerdict ||
            m.llmVerdict.isConfirmed
        );
    }

    /**
     * Split text into meaningful chunks
     */
    private chunkText(text: string): string[] {
        // Split by paragraphs (double newline or numbered sections)
        const paragraphs = text
            .split(/\n\n+|\d+\.\s+/)
            .map(p => p.trim())
            .filter(p => p.length > 30); // Filter out very short paragraphs

        return paragraphs;
    }

    /**
     * Generate embedding using AI provider
     */
    private async generateEmbedding(text: string): Promise<number[] | null> {
        try {
            return await this.aiProvider.generateEmbedding(text);
        } catch (error) {
            logger.error("[RedFlagVector] Embedding generation failed", { error });
            return null;
        }
    }

    /**
     * Query pgvector for similar bad clauses
     */
    private async findSimilarBadClauses(
        embedding: number[],
        threshold: number
    ): Promise<Array<{ id: string; category: string; severity: string; sampleText: string; similarity: number }>> {
        try {
            // Use raw query for pgvector cosine similarity
            const vectorString = `[${embedding.join(",")}]`;

            const results = await prisma.$queryRaw<Array<{
                id: string;
                category: string;
                severity: string;
                sample_text: string;
                similarity: number;
            }>>`
        SELECT 
          id,
          category,
          severity,
          sample_text,
          1 - (embedding <=> ${vectorString}::vector) as similarity
        FROM red_flag_vectors
        WHERE 1 - (embedding <=> ${vectorString}::vector) > ${threshold}
        ORDER BY similarity DESC
        LIMIT 5
      `;

            return results.map((r: { id: string; category: string; severity: string; sample_text: string; similarity: number }) => ({
                id: r.id,
                category: r.category,
                severity: r.severity,
                sampleText: r.sample_text,
                similarity: r.similarity,
            }));
        } catch (error) {
            logger.error("[RedFlagVector] Vector search failed", { error });
            return [];
        }
    }

    /**
     * Verify matches with LLM (targeted, cost-effective)
     */
    private async verifyWithLLM(matches: RedFlagMatch[]): Promise<void> {
        for (const match of matches) {
            const prompt = `Analyze this clause from a job offer letter. Is it a genuine concern or false alarm?

Category: ${match.category}
Clause from offer: "${match.matchedText.slice(0, 500)}"
Known bad pattern: "${match.sampleText.slice(0, 300)}"

Return JSON with:
{
  "isConfirmed": boolean (true if this is a genuine concern),
  "explanation": "Brief reason why this is/isn't a concern"
}`;

            try {
                const content = await this.aiProvider.generateCompletion(prompt, {
                    maxTokens: 150,
                    temperature: 0,
                    json: true,
                });

                if (content) {
                    match.llmVerdict = JSON.parse(content);
                }
            } catch (error) {
                logger.error("[RedFlagVector] LLM verification failed", { error });
                // Keep match as unverified (don't filter it out)
            }
        }
    }

    /**
     * Seed the red flag vectors database with known bad clauses
     * This should be run once to populate the golden set
     */
    async seedBadClauses(): Promise<void> {
        logger.info("[RedFlagVector] Starting to seed bad clauses");

        // Known bad clause patterns
        const badClauses = [
            {
                category: "non_compete",
                severity: "high",
                sampleText: "Employee agrees not to work for any competitor or engage in any competing business within a 50-mile radius for a period of 2 years following termination of employment.",
            },
            {
                category: "non_compete",
                severity: "high",
                sampleText: "For 18 months after leaving the company, you may not directly or indirectly be employed by, consult with, or provide services to any business that competes with the Company.",
            },
            {
                category: "ip_assignment",
                severity: "high",
                sampleText: "All inventions, ideas, discoveries, and works of authorship conceived by Employee during or outside of working hours, whether or not related to the Company's business, shall be the sole property of the Company.",
            },
            {
                category: "ip_assignment",
                severity: "medium",
                sampleText: "Employee assigns to the Company all rights, title, and interest in any intellectual property created during the course of employment.",
            },
            {
                category: "clawback",
                severity: "high",
                sampleText: "If the Employee voluntarily leaves the Company within 12 months of receiving the sign-on bonus, the full amount of the bonus must be repaid to the Company.",
            },
            {
                category: "clawback",
                severity: "medium",
                sampleText: "Relocation assistance is provided as a loan and will be forgiven over 24 months. Early departure requires prorated repayment.",
            },
            {
                category: "at_will",
                severity: "medium",
                sampleText: "Employment with the Company is 'at will' meaning either party may terminate the relationship at any time for any reason or no reason at all.",
            },
            {
                category: "arbitration",
                severity: "medium",
                sampleText: "Any disputes arising from this agreement shall be resolved exclusively through binding arbitration, waiving the right to a jury trial.",
            },
            {
                category: "non_disclosure",
                severity: "low",
                sampleText: "Employee agrees to maintain the confidentiality of all proprietary information indefinitely, even after termination of employment.",
            },
            {
                category: "non_solicit",
                severity: "medium",
                sampleText: "For one year following termination, Employee shall not solicit, recruit, or hire any employee of the Company or attempt to induce any customer to reduce or cease business with the Company.",
            },
        ];

        logger.info(`[RedFlagVector] Seeding ${badClauses.length} bad clauses`);

        for (const clause of badClauses) {
            // Check if already exists
            const existing = await prisma.redFlagVector.findFirst({
                where: { sampleText: clause.sampleText },
            });

            if (existing) {
                logger.info(`[RedFlagVector] Skipping existing: ${clause.category}`);
                continue;
            }

            // Generate embedding
            const embedding = await this.generateEmbedding(clause.sampleText);
            if (!embedding) continue;

            // Insert with raw query (Prisma doesn't support vector type directly)
            const vectorString = `[${embedding.join(",")}]`;

            await prisma.$executeRaw`
        INSERT INTO red_flag_vectors (id, category, severity, sample_text, embedding, created_at)
        VALUES (
          gen_random_uuid(),
          ${clause.category},
          ${clause.severity},
          ${clause.sampleText},
          ${vectorString}::vector,
          NOW()
        )
      `;

            logger.info(`[RedFlagVector] Seeded: ${clause.category} (${clause.severity})`);
        }

        logger.info("[RedFlagVector] Seeding complete");
    }
}

export const redFlagVectorService = new RedFlagVectorService();
