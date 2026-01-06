import 'dotenv/config';
import express, { Application } from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { pollingScheduler } from './services/polling.service.js';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use(routes);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Mode: Polling-based (no webhooks)`);
  logger.info(`Polling interval: ${config.polling.intervalHours} hours`);
  logger.info(`Health check available at http://localhost:${config.port}/health`);
  logger.info(`Manual sync endpoint: POST http://localhost:${config.port}/sync/manual`);

  // Start polling scheduler
  pollingScheduler.start();
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  
  // Stop polling scheduler
  pollingScheduler.stop();
  
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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
