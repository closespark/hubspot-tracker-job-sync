import { trackerClient } from '../clients/tracker.js';
import { hubspotClient } from '../clients/hubspot.js';
import { TrackerEventType, HubSpotJobProperties } from '../types/index.js';
import { matchJobToDeal } from './match.service.js';
import { logger } from '../utils/logger.js';

export class JobSyncService {
  /**
   * Sync a Tracker job to HubSpot and match it to a Deal
   */
  async syncJob(jobId: string, eventType: TrackerEventType): Promise<void> {
    logger.info(`Syncing job ${jobId} for event ${eventType}`);

    try {
      // Step 1: Fetch full job record from Tracker
      const job = await trackerClient.getJob(jobId);

      // Step 2: Map Tracker job to HubSpot Job properties
      const jobProperties: HubSpotJobProperties = {
        tracker_job_id: job.id,
        job_name: job.name,
        job_status: job.status,
        job_created_date_tracker: job.createdDate,
      };

      // Step 3: Upsert Job in HubSpot
      const hubspotJobId = await hubspotClient.upsertJob(jobProperties);

      // Step 4: Match Job to Deal using canonical algorithm
      await this.matchAndAssociateJobToDeal(hubspotJobId, job);

      logger.info(`Successfully synced job ${jobId} to HubSpot job ${hubspotJobId}`);
    } catch (error) {
      logger.error(`Failed to sync job ${jobId}`, error);
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

      // Get company names for all deals (for disambiguation)
      const companiesMap = new Map<string, string>();
      for (const deal of deals) {
        const companies = await hubspotClient.getDealCompanies(deal.id);
        if (companies.length > 0) {
          // Use the first company's name
          companiesMap.set(deal.id, companies[0].properties.name);
        }
      }

      // Run the canonical matching algorithm
      const matchResult = await matchJobToDeal(job, deals, companiesMap);

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
