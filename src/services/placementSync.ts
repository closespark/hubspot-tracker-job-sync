import { trackerClient } from '../clients/tracker';
import { hubspotClient } from '../clients/hubspot';
import { TrackerEventType, HubSpotPlacementProperties } from '../types';
import { ASSOCIATION_TYPES } from '../config/associations';
import { logger } from '../utils/logger';

export class PlacementSyncService {
  async syncOpportunityResource(resourceId: string, eventType: TrackerEventType): Promise<void> {
    logger.info(`Syncing opportunity resource ${resourceId} for event ${eventType}`);

    try {
      // Fetch full opportunity resource record from Tracker
      const resource = await trackerClient.getOpportunityResource(resourceId);

      // Map Tracker opportunity resource to HubSpot Placement properties
      const placementProperties: HubSpotPlacementProperties = {
        tracker_placement_id: resource.id,
        placement_status: resource.status,
        candidate_name: resource.candidateName || '',
        start_date: resource.startDate || '',
        end_date: resource.endDate || '',
        rate: resource.rate || 0,
        created_at: resource.createdAt,
        updated_at: resource.updatedAt,
      };

      // Upsert Placement in HubSpot
      const hubspotPlacementId = await hubspotClient.upsertPlacement(placementProperties);

      // Associate placement with its parent job
      await this.associateWithJob(hubspotPlacementId, resource.opportunityId);

      logger.info(`Successfully synced opportunity resource ${resourceId} to HubSpot placement ${hubspotPlacementId}`);
    } catch (error) {
      logger.error(`Failed to sync opportunity resource ${resourceId}`, error);
      throw error;
    }
  }

  private async associateWithJob(placementId: string, opportunityId: string): Promise<void> {
    try {
      // First, we need to find the HubSpot Job ID from the Tracker opportunity ID
      logger.debug(`Finding HubSpot job for tracker opportunity ${opportunityId}`);
      
      const jobId = await hubspotClient.searchJobByTrackerId(opportunityId);

      if (jobId) {
        logger.debug(`Associating placement ${placementId} with job ${jobId}`);
        await hubspotClient.createAssociation(
          'tracker_placements',
          placementId,
          'tracker_jobs',
          jobId,
          ASSOCIATION_TYPES.CUSTOM_TO_CUSTOM
        );
      } else {
        logger.warn(`Could not find HubSpot job for tracker opportunity ${opportunityId}`);
      }
    } catch (error) {
      logger.warn(`Failed to associate placement with job for opportunity ${opportunityId}`, error);
    }
  }
}

export const placementSyncService = new PlacementSyncService();
