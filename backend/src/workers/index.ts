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
}

setupRepeatableJobs().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    await ocrWorker.close();
    await analysisWorker.close();
    await cleanupWorker.close();
    process.exit(0);
});
