import express, { Request, Response, Router } from 'express';
import { WebhookPayload, TrackerEventType } from '../types';
import { jobSyncService } from '../services/jobSync';
import { placementSyncService } from '../services/placementSync';
import { idempotencyStore } from '../utils/idempotency';
import { logger } from '../utils/logger';
import { validateWebhook } from '../middleware/validateWebhook';

const router: Router = express.Router();

router.post('/webhook', validateWebhook, async (req: Request, res: Response) => {
  const payload: WebhookPayload = req.body;

  logger.info(`Received webhook event: ${payload.eventType} (ID: ${payload.eventId})`);

  try {
    // Check idempotency
    if (await idempotencyStore.hasProcessed(payload.eventId)) {
      const processedEvent = await idempotencyStore.getProcessedEvent(payload.eventId);
      logger.info(`Event ${payload.eventId} already processed at ${processedEvent?.processedAt}`);
      res.status(200).json({ 
        status: 'already_processed',
        processedAt: processedEvent?.processedAt 
      });
      return;
    }

    // Process the webhook based on event type
    await processWebhookEvent(payload);

    // Mark as successfully processed
    await idempotencyStore.markAsProcessed(payload.eventId, 'success');

    logger.info(`Successfully processed event ${payload.eventId}`);
    res.status(200).json({ status: 'success', eventId: payload.eventId });
  } catch (error) {
    logger.error(`Error processing webhook event ${payload.eventId}`, error);

    // Mark as failed
    await idempotencyStore.markAsProcessed(
      payload.eventId,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    );

    res.status(500).json({ 
      status: 'error',
      eventId: payload.eventId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

async function processWebhookEvent(payload: WebhookPayload): Promise<void> {
  switch (payload.eventType) {
    case TrackerEventType.OPPORTUNITY_CREATED:
    case TrackerEventType.OPPORTUNITY_UPDATED:
      if (!payload.data.opportunityId) {
        throw new Error('opportunityId is required for Opportunity events');
      }
      await jobSyncService.syncOpportunity(payload.data.opportunityId, payload.eventType);
      break;

    case TrackerEventType.OPPORTUNITY_RESOURCE_CREATED:
    case TrackerEventType.OPPORTUNITY_RESOURCE_UPDATED:
      if (!payload.data.opportunityResourceId) {
        throw new Error('opportunityResourceId is required for OpportunityResource events');
      }
      await placementSyncService.syncOpportunityResource(
        payload.data.opportunityResourceId,
        payload.eventType
      );
      break;

    default:
      logger.warn(`Unknown event type: ${payload.eventType}`);
      throw new Error(`Unsupported event type: ${payload.eventType}`);
  }
}

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
