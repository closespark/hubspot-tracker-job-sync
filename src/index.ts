import 'dotenv/config';
import express, { Application } from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import webhookRoutes from './routes/webhook.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use(webhookRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Health check available at http://localhost:${config.port}/health`);
  logger.info(`Webhook endpoint available at http://localhost:${config.port}/webhook`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
