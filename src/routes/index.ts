import express, { Request, Response, Router } from 'express';
import { pollingScheduler } from '../services/polling.service.js';
import { logger } from '../utils/logger.js';

const router: Router = express.Router();

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'polling',
  });
});

// Manual sync trigger endpoint (for admin/testing)
router.post('/sync/manual', async (_req: Request, res: Response) => {
  logger.info('Manual sync triggered via API');

  // Trigger sync asynchronously
  pollingScheduler.triggerManualSync().catch(error => {
    logger.error('Error in manual sync', error);
  });

  res.status(202).json({
    status: 'accepted',
    message: 'Manual sync initiated',
    timestamp: new Date().toISOString(),
  });
});

export default router;
