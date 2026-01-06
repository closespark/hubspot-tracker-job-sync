import { jobSyncService } from './jobSync.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class PollingScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the polling scheduler
   */
  start(): void {
    if (!config.polling.enabled) {
      logger.info('Polling is disabled via configuration');
      return;
    }

    if (this.intervalId) {
      logger.warn('Polling scheduler already running');
      return;
    }

    const intervalMs = config.polling.intervalHours * 60 * 60 * 1000;
    logger.info(`Starting polling scheduler with interval: ${config.polling.intervalHours} hours`);

    // Run immediately on start
    this.runSync().catch(error => {
      logger.error('Error in initial sync run', error);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runSync().catch(error => {
        logger.error('Error in scheduled sync run', error);
      });
    }, intervalMs);

    logger.info('Polling scheduler started successfully');
  }

  /**
   * Stop the polling scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Polling scheduler stopped');
    }
  }

  /**
   * Run a sync cycle
   */
  private async runSync(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync already in progress, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('=== Starting scheduled sync cycle ===');

      const result = await jobSyncService.syncAllJobs();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      logger.info('=== Sync cycle completed ===', {
        duration: `${duration}s`,
        jobsProcessed: result.jobsProcessed,
        jobsCreated: result.jobsCreated,
        jobsUpdated: result.jobsUpdated,
        jobsMatched: result.jobsMatched,
        errors: result.errors.length,
      });

      if (result.errors.length > 0) {
        logger.warn(`Sync completed with ${result.errors.length} errors`, result.errors);
      }
    } catch (error) {
      logger.error('Fatal error during sync cycle', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Trigger a manual sync run (for admin/testing purposes)
   */
  async triggerManualSync(): Promise<void> {
    logger.info('Manual sync triggered');
    await this.runSync();
  }
}

export const pollingScheduler = new PollingScheduler();
