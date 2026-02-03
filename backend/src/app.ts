import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import { requestLogger, errorHandler, notFoundHandler, sanitizeInput } from './middleware';
import logger from './utils/logger';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration with whitelist
  // Requirements: 1.5
  const corsOrigins = config.corsOrigin.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: `${config.upload.maxFileSizeMB}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.upload.maxFileSizeMB}mb` }));

  // Request logging
  app.use(requestLogger);

  // Input sanitization (before routes)
  // Requirements: 6.3, 6.4
  app.use(sanitizeInput);

  // API routes
  const routes = require('./routes').default;
  app.use('/api/v1', routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
};

export const startServer = (app: Application) => {
  const server = app.listen(config.port, () => {
    logger.info(`🚀 Server running on http://${config.host}:${config.port}`);
    logger.info(`📝 Environment: ${config.env}`);
    logger.info(`🔒 CORS enabled for: ${config.corsOrigin}`);
  });

  // Graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
};
