import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export function validateWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If webhook secret is configured, validate it
  if (config.webhook.secret) {
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature || signature !== config.webhook.secret) {
      logger.warn('Invalid webhook signature');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  next();
}
