import { buildApp } from './app.js';
import { config } from '@/config/index.js';

const app = buildApp();

const start = async () => {
    try {
        await app.listen({ port: config.PORT, host: '0.0.0.0' });
        console.log(`🚀 Server listening at http://0.0.0.0:${config.PORT}`);
        console.log(`📚 Swagger documentation at http://0.0.0.0:${config.PORT}/api/v1/docs`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

// Graceful shutdown handled by plugins (onClose hooks)

start();
