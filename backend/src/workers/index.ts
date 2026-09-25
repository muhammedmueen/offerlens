import { ocrWorker } from './ocr.worker.js';
import { analysisWorker } from './analysis.worker.js';
import { cleanupWorker } from './cleanup.worker.js';
import { Queue } from 'bullmq';
import { connection } from './worker.js';

console.log('🚀 Workers started...');

// Schedule cleanup job if not exists
const maintenanceQueue = new Queue('maintenance-queue', { connection });

async function setupRepeatableJobs() {
    await maintenanceQueue.add('cleanup-expired', {}, {
        repeat: {
            every: 60 * 60 * 1000, // Every hour
        }
    });

    // Task 21a. Every minute against a 5-minute staleness threshold, so a user waits at
    // most ~6 minutes for an error instead of forever. Cheap: one indexed UPDATE that
    // touches nothing on a healthy system.
    await maintenanceQueue.add('reap-stuck', {}, {
        repeat: {
            every: 60 * 1000,
        }
    });
}

setupRepeatableJobs().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    await ocrWorker.close();
    await analysisWorker.close();
    await cleanupWorker.close();
    process.exit(0);
});
