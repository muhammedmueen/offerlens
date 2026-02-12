import { Queue } from 'bullmq';
import { config } from '@/config/index.js';

// Connection config for BullMQ
const connection = {
    host: new URL(config.REDIS_URL).hostname,
    port: parseInt(new URL(config.REDIS_URL).port || '6379'),
    password: new URL(config.REDIS_URL).password,
};

export const ocrQueue = new Queue('ocr-queue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: { age: 3600, count: 100 }, // Keep for 1 hour
        removeOnFail: { age: 24 * 3600 }, // Keep failed for 24h
    },
});

export const analysisQueue = new Queue('analysis-queue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600 },
    },
});
