import { Client } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/objects/models/Filter';
import { config } from '../config';
import { HubSpotJobProperties, HubSpotPlacementProperties } from '../types';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

export class HubSpotClient {
  private client: Client;
  private readonly JOB_OBJECT_TYPE = 'tracker_jobs';
  private readonly PLACEMENT_OBJECT_TYPE = 'tracker_placements';

  constructor() {
    this.client = new Client({ accessToken: config.hubspot.accessToken });
  }

  async upsertJob(properties: HubSpotJobProperties): Promise<string> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Upserting job with tracker_job_id: ${properties.tracker_job_id}`);

        try {
          // Try to find existing job by tracker_job_id
          const searchResponse = await this.client.crm.objects.searchApi.doSearch(this.JOB_OBJECT_TYPE, {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'tracker_job_id',
                    operator: FilterOperatorEnum.Eq,
                    value: properties.tracker_job_id,
                  },
                ],
              },
            ],
            limit: 1,
            after: '',
            sorts: [],
            properties: [],
          });

          if (searchResponse.results && searchResponse.results.length > 0) {
            // Update existing job
            const existingJobId = searchResponse.results[0].id;
            logger.debug(`Updating existing job with HubSpot ID: ${existingJobId}`);
            
            await this.client.crm.objects.basicApi.update(
              this.JOB_OBJECT_TYPE,
              existingJobId,
              { properties }
            );
            
            logger.info(`Updated job ${properties.tracker_job_id} in HubSpot`);
            return existingJobId;
          } else {
            // Create new job
            logger.debug(`Creating new job for tracker_job_id: ${properties.tracker_job_id}`);
            
            const createResponse = await this.client.crm.objects.basicApi.create(
              this.JOB_OBJECT_TYPE,
              { properties, associations: [] }
            );
            
            logger.info(`Created job ${properties.tracker_job_id} in HubSpot with ID: ${createResponse.id}`);
            return createResponse.id;
          }
        } catch (error: any) {
          logger.error(`Error upserting job ${properties.tracker_job_id}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.upsertJob(${properties.tracker_job_id})`
    );
  }

  async upsertPlacement(properties: HubSpotPlacementProperties): Promise<string> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Upserting placement with tracker_placement_id: ${properties.tracker_placement_id}`);

        try {
          // Try to find existing placement by tracker_placement_id
          const searchResponse = await this.client.crm.objects.searchApi.doSearch(this.PLACEMENT_OBJECT_TYPE, {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'tracker_placement_id',
                    operator: FilterOperatorEnum.Eq,
                    value: properties.tracker_placement_id,
                  },
                ],
              },
            ],
            limit: 1,
            after: '',
            sorts: [],
            properties: [],
          });

          if (searchResponse.results && searchResponse.results.length > 0) {
            // Update existing placement
            const existingPlacementId = searchResponse.results[0].id;
            logger.debug(`Updating existing placement with HubSpot ID: ${existingPlacementId}`);
            
            await this.client.crm.objects.basicApi.update(
              this.PLACEMENT_OBJECT_TYPE,
              existingPlacementId,
              { properties }
            );
            
            logger.info(`Updated placement ${properties.tracker_placement_id} in HubSpot`);
            return existingPlacementId;
          } else {
            // Create new placement
            logger.debug(`Creating new placement for tracker_placement_id: ${properties.tracker_placement_id}`);
            
            const createResponse = await this.client.crm.objects.basicApi.create(
              this.PLACEMENT_OBJECT_TYPE,
              { properties, associations: [] }
            );
            
            logger.info(`Created placement ${properties.tracker_placement_id} in HubSpot with ID: ${createResponse.id}`);
            return createResponse.id;
          }
        } catch (error: any) {
          logger.error(`Error upserting placement ${properties.tracker_placement_id}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.upsertPlacement(${properties.tracker_placement_id})`
    );
  }

  async createAssociation(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
    associationTypeId: number
  ): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Creating association from ${fromObjectType}:${fromObjectId} to ${toObjectType}:${toObjectId}`);

        try {
          await this.client.crm.associations.batchApi.create(fromObjectType, toObjectType, {
            inputs: [
              {
                _from: { id: fromObjectId },
                to: { id: toObjectId },
                type: associationTypeId.toString(),
              },
            ],
          });
          
          logger.info(`Created association from ${fromObjectType}:${fromObjectId} to ${toObjectType}:${toObjectId}`);
        } catch (error: any) {
          // Association might already exist, which is fine
          if (error.response?.status === 409) {
            logger.debug(`Association already exists, skipping`);
          } else {
            throw error;
          }
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.createAssociation(${fromObjectType}:${fromObjectId} -> ${toObjectType}:${toObjectId})`
    );
  }

  async searchJobByTrackerId(trackerId: string): Promise<string | null> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Searching for job with tracker_job_id: ${trackerId}`);

        const searchResponse = await this.client.crm.objects.searchApi.doSearch(this.JOB_OBJECT_TYPE, {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'tracker_job_id',
                  operator: FilterOperatorEnum.Eq,
                  value: trackerId,
                },
              ],
            },
          ],
          limit: 1,
          after: '',
          sorts: [],
          properties: [],
        });

        if (searchResponse.results && searchResponse.results.length > 0) {
          return searchResponse.results[0].id;
        }

        return null;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.searchJobByTrackerId(${trackerId})`
    );
  }
}

export const hubspotClient = new HubSpotClient();
