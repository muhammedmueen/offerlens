/**
 * Seed script for Red Flag Vectors
 * Run with: npm run seed:redflag
 */

import { redFlagVectorService } from "../src/services/red-flag-vector.service";

async function main() {
    console.log("=== Red Flag Vector Seeding ===");
    console.log("This will generate embeddings for bad clause patterns");
    console.log("Requires OPENAI_API_KEY to be set\n");

    if (!process.env.OPENAI_API_KEY) {
        console.error("ERROR: OPENAI_API_KEY not set in environment");
        process.exit(1);
    }

    try {
        await redFlagVectorService.seedBadClauses();
        console.log("\n✅ Seeding complete!");
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }

    process.exit(0);
}

main();
