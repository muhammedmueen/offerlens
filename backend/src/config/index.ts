import 'dotenv/config';
import { envSchema, type Env } from './env.schema.js';

function loadConfig(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formatted = result.error.issues
            .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        console.error(`\n❌ Invalid environment variables:\n${formatted}\n`);
        process.exit(1);
    }

    return result.data;
}

export const config = loadConfig();
