import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '@/config/index.js';
import * as schema from './schema/index.js';

// Global connection specific to serverless/long-running environments
// prevents creating multiple connection pools in hot-reload dev
const globalForDb = globalThis as unknown as {
    conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(config.DATABASE_URL);

if (config.NODE_ENV !== 'production') globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export { conn }; // export raw connection for graceful shutdown
