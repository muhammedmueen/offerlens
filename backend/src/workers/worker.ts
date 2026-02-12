import { Worker, WorkerOptions } from 'bullmq';
import { config } from '@/config/index.js';

export const connection = {
    host: new URL(config.REDIS_URL).hostname,
    port: parseInt(new URL(config.REDIS_URL).port || '6379'),
    password: new URL(config.REDIS_URL).password,
};

export const defaultWorkerOptions: WorkerOptions = {
    connection,
    concurrency: 5,
};
