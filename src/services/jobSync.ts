import { trackerClient } from '../clients/tracker.js';
import { hubspotClient } from '../clients/hubspot.js';
import { HubSpotJobProperties, SyncResult } from '../types/index.js';
import { matchJobToDeal } from './match.service.js';
import { logger } from '../utils/logger.js';

export class JobSyncService {
  /**
   * Sync all jobs from Tracker to HubSpot (polling-based)
   */
  async syncAllJobs(): Promise<SyncResult> {
    logger.info('Starting full job sync from Tracker to HubSpot');

    const result: SyncResult = {
      jobsProcessed: 0,
      jobsCreated: 0,
      jobsUpdated: 0,
      jobsMatched: 0,
      errors: [],
    };

    try {
      // Fetch all jobs from Tracker with pagination
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const jobs = await trackerClient.listJobs(limit, offset);

        if (jobs.length === 0) {
          hasMore = false;
          break;
        }

        logger.info(`Processing batch of ${jobs.length} jobs (offset: ${offset})`);

        for (const job of jobs) {
          try {
            await this.syncJob(job);
            result.jobsProcessed++;
          } catch (error) {
            const errorMsg = `Failed to sync job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            logger.error(errorMsg, error);
            result.errors.push(errorMsg);
          }
        }

        offset += limit;
        hasMore = jobs.length === limit; // If we got a full batch, there might be more
      }

      logger.info(`Job sync completed: ${result.jobsProcessed} processed, ${result.errors.length} errors`);
      return result;
    } catch (error) {
      logger.error('Fatal error during job sync', error);
      throw error;
    }
  }

  /**
   * Sync a single Tracker job to HubSpot and match it to a Deal
   */
  private async syncJob(job: any): Promise<void> {
    logger.debug(`Syncing job ${job.id} (${job.name})`);

    try {
      // Map Tracker job to HubSpot Job properties
      const jobProperties: HubSpotJobProperties = {
        tracker_job_id: job.id,
        job_name: job.name,
        job_status: job.status,
        job_created_date_tracker: job.createdDate,
      };

      // Add optional fields if present
      if (job.jobType) {
        jobProperties.job_type = job.jobType;
      }
      if (job.engagementDirector) {
        jobProperties.engagement_director = job.engagementDirector;
      }
      if (job.jobValue !== undefined) {
        jobProperties.job_value = String(job.jobValue);
      }
      if (job.jobOwner) {
        jobProperties.job_owner = job.jobOwner;
      }

      // Upsert Job in HubSpot
      const hubspotJobId = await hubspotClient.upsertJob(jobProperties);

      // Match Job to Deal and create associations
      await this.matchAndAssociateJobToDeal(hubspotJobId, job);

      logger.info(`Successfully synced job ${job.id} to HubSpot job ${hubspotJobId}`);
    } catch (error) {
      logger.error(`Failed to sync job ${job.id}`, error);
      throw error;
    }
  }

  /**
   * Match a Job to a Deal and create associations
   */
  private async matchAndAssociateJobToDeal(
    hubspotJobId: string,
    job: any
  ): Promise<void> {
    try {
      logger.debug(`Matching job ${job.id} (${job.name}) to deals`);

      // Search for deals by name
      const deals = await hubspotClient.searchDealsByName(job.name);

      if (deals.length === 0) {
        logger.warn(`No deals found for job ${job.id} with name "${job.name}"`);
        return;
      }

      // Run the canonical matching algorithm (exact match only)
      const matchResult = await matchJobToDeal(job, deals);

      if (!matchResult.matched) {
        if (matchResult.confidence === 'ambiguous') {
          logger.warn(
            `Ambiguous match for job ${job.id}: ${matchResult.reason}`,
            matchResult.candidateDeals
          );
        } else {
          logger.info(`No match found for job ${job.id}: ${matchResult.reason}`);
        }
        return;
      }

      // We have a match! Create associations
      const dealId = matchResult.dealId!;

      logger.info(
        `Matched job ${job.id} to deal ${dealId} with confidence: ${matchResult.confidence}`
      );

      // Associate Job with Deal
      await hubspotClient.associateJobToDeal(hubspotJobId, dealId);

      // Associate Job with the same Company as the Deal
      const dealCompanies = await hubspotClient.getDealCompanies(dealId);
      if (dealCompanies.length > 0) {
        await hubspotClient.associateJobToCompany(hubspotJobId, dealCompanies[0].id);
        logger.info(`Associated job ${job.id} with company ${dealCompanies[0].id}`);
      }

      logger.info(`Successfully matched and associated job ${job.id} to deal ${dealId}`);
    } catch (error) {
      logger.error(`Failed to match job ${job.id} to deal`, error);
      // Don't throw - we still want the job to be created even if matching fails
    }
  }
}

export const jobSyncService = new JobSyncService();
