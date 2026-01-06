import { trackerClient } from '../clients/tracker';
import { hubspotClient } from '../clients/hubspot';
import { TrackerEventType, HubSpotJobProperties, TrackerOpportunity } from '../types';
import { ASSOCIATION_TYPES } from '../config/associations';
import { logger } from '../utils/logger';

export class JobSyncService {
  async syncOpportunity(opportunityId: string, eventType: TrackerEventType): Promise<void> {
    logger.info(`Syncing opportunity ${opportunityId} for event ${eventType}`);

    try {
      // Fetch full opportunity record from Tracker
      const opportunity = await trackerClient.getOpportunity(opportunityId);

      // Map Tracker opportunity to HubSpot Job properties
      const jobProperties: HubSpotJobProperties = {
        tracker_job_id: opportunity.id,
        job_title: opportunity.title,
        job_description: opportunity.description || '',
        job_status: opportunity.status,
        created_at: opportunity.createdAt,
        updated_at: opportunity.updatedAt,
      };

      // Upsert Job in HubSpot
      const hubspotJobId = await hubspotClient.upsertJob(jobProperties);

      // Create associations if IDs are provided
      await this.createAssociations(hubspotJobId, opportunity);

      logger.info(`Successfully synced opportunity ${opportunityId} to HubSpot job ${hubspotJobId}`);
    } catch (error) {
      logger.error(`Failed to sync opportunity ${opportunityId}`, error);
      throw error;
    }
  }

  private async createAssociations(jobId: string, opportunity: TrackerOpportunity): Promise<void> {
    const associationPromises: Promise<void>[] = [];

    // Associate with Deal if dealId exists
    if (opportunity.dealId) {
      logger.debug(`Associating job ${jobId} with deal ${opportunity.dealId}`);
      associationPromises.push(
        hubspotClient.createAssociation(
          'tracker_jobs',
          jobId,
          'deals',
          opportunity.dealId,
          ASSOCIATION_TYPES.CUSTOM_TO_DEAL
        ).catch((error) => {
          logger.warn(`Failed to associate job with deal ${opportunity.dealId}`, error);
        })
      );
    }

    // Associate with Company if companyId exists
    if (opportunity.companyId) {
      logger.debug(`Associating job ${jobId} with company ${opportunity.companyId}`);
      associationPromises.push(
        hubspotClient.createAssociation(
          'tracker_jobs',
          jobId,
          'companies',
          opportunity.companyId,
          ASSOCIATION_TYPES.CUSTOM_TO_COMPANY
        ).catch((error) => {
          logger.warn(`Failed to associate job with company ${opportunity.companyId}`, error);
        })
      );
    }

    // Associate with Ticket if ticketId exists
    if (opportunity.ticketId) {
      logger.debug(`Associating job ${jobId} with ticket ${opportunity.ticketId}`);
      associationPromises.push(
        hubspotClient.createAssociation(
          'tracker_jobs',
          jobId,
          'tickets',
          opportunity.ticketId,
          ASSOCIATION_TYPES.CUSTOM_TO_TICKET
        ).catch((error) => {
          logger.warn(`Failed to associate job with ticket ${opportunity.ticketId}`, error);
        })
      );
    }

    await Promise.all(associationPromises);
  }
}

export const jobSyncService = new JobSyncService();
