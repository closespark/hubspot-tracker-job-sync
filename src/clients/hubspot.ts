import { Client } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/objects/models/Filter';
import { config } from '../config/index.js';
import { HubSpotJobProperties, HubSpotDeal, HubSpotCompany, HubSpotPlacementProperties, HubSpotContactProperties } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export class HubSpotClient {
  private client: Client;

  constructor() {
    this.client = new Client({ accessToken: config.hubspot.accessToken });
  }

  /**
   * Upsert a Job custom object in HubSpot
   * Uses tracker_job_id as the unique identifier
   */
  async upsertJob(properties: HubSpotJobProperties): Promise<string> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Upserting job with tracker_job_id: ${properties.tracker_job_id}`);

        try {
          // Try to find existing job by tracker_job_id
          const searchResponse = await this.client.crm.objects.searchApi.doSearch(
            config.hubspot.jobObjectType,
            {
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: config.hubspot.jobIdProperty,
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
            }
          );

          if (searchResponse.results && searchResponse.results.length > 0) {
            // Update existing job
            const existingJobId = searchResponse.results[0].id;
            logger.debug(`Updating existing job with HubSpot ID: ${existingJobId}`);

            await this.client.crm.objects.basicApi.update(
              config.hubspot.jobObjectType,
              existingJobId,
              { properties }
            );

            logger.info(`Updated job ${properties.tracker_job_id} in HubSpot`);
            return existingJobId;
          } else {
            // Create new job
            logger.debug(`Creating new job for tracker_job_id: ${properties.tracker_job_id}`);

            const createResponse = await this.client.crm.objects.basicApi.create(
              config.hubspot.jobObjectType,
              { properties, associations: [] }
            );

            logger.info(
              `Created job ${properties.tracker_job_id} in HubSpot with ID: ${createResponse.id}`
            );
            return createResponse.id;
          }
        } catch (error: unknown) {
          logger.error(`Error upserting job ${properties.tracker_job_id}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.upsertJob(${properties.tracker_job_id})`
    );
  }

  /**
   * Search for deals by name and service line
   * Filters for eligible deals: Retained Search, Closed Won, Awaiting Job Creation
   */
  async searchDealsByName(dealName: string): Promise<HubSpotDeal[]> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Searching for deals with name: ${dealName}`);

        try {
          const searchResponse = await this.client.crm.deals.searchApi.doSearch({
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: config.hubspot.dealNameProperty,
                    operator: FilterOperatorEnum.ContainsToken,
                    value: dealName,
                  },
                  {
                    propertyName: config.hubspot.dealServiceLineProperty,
                    operator: FilterOperatorEnum.Eq,
                    value: config.hubspot.dealServiceLineRetainedValue,
                  },
                  {
                    propertyName: config.hubspot.dealStageProperty,
                    operator: FilterOperatorEnum.Eq,
                    value: config.hubspot.dealStageClosedWonValue,
                  },
                  {
                    propertyName: config.hubspot.dealJobSyncStatusProperty,
                    operator: FilterOperatorEnum.Eq,
                    value: config.hubspot.dealJobSyncStatusAwaitingValue,
                  },
                ],
              },
            ],
            properties: [
              config.hubspot.dealNameProperty,
              config.hubspot.dealServiceLineProperty,
              config.hubspot.dealCreatedDateProperty,
              config.hubspot.dealStageProperty,
              config.hubspot.dealJobSyncStatusProperty,
            ],
            limit: 100,
            after: '',
            sorts: [],
          });

          logger.debug(`Found ${searchResponse.results?.length || 0} deals`);

          return (searchResponse.results || []).map(result => ({
            id: result.id,
            properties: result.properties as HubSpotDeal['properties'],
          }));
        } catch (error: unknown) {
          logger.error(`Error searching deals by name: ${dealName}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.searchDealsByName(${dealName})`
    );
  }

  /**
   * Get associated companies for a deal
   */
  async getDealCompanies(dealId: string): Promise<HubSpotCompany[]> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Getting companies for deal ${dealId}`);

        try {
          const associations = await this.client.crm.associations.batchApi.read(
            'deals',
            'companies',
            {
              inputs: [{ id: dealId }],
            }
          );

          if (!associations.results || associations.results.length === 0) {
            logger.debug(`No companies associated with deal ${dealId}`);
            return [];
          }

          const companyIds = associations.results[0]?.to?.map((assoc: { id: string }) => assoc.id) || [];

          // Fetch company details
          const companies: HubSpotCompany[] = [];
          for (const companyId of companyIds) {
            const company = await this.client.crm.companies.basicApi.getById(companyId, [
              config.hubspot.companyNameProperty,
            ]);

            companies.push({
              id: company.id,
              properties: {
                name: company.properties.name || '',
              },
            });
          }

          logger.debug(`Found ${companies.length} companies for deal ${dealId}`);
          return companies;
        } catch (error: unknown) {
          logger.warn(`Error getting companies for deal ${dealId}`, error);
          return [];
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.getDealCompanies(${dealId})`
    );
  }

  /**
   * Create association between Job and Deal
   */
  async associateJobToDeal(jobId: string, dealId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating job ${jobId} with deal ${dealId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.jobObjectType,
            'deals',
            {
              inputs: [
                {
                  _from: { id: jobId },
                  to: { id: dealId },
                  type: 'custom_to_deal',
                },
              ],
            }
          );

          logger.info(`Associated job ${jobId} with deal ${dealId}`);
        } catch (error: unknown) {
          // Association might already exist, which is fine
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associateJobToDeal(${jobId}, ${dealId})`
    );
  }

  /**
   * Associate Job with Company (same as Deal's company)
   */
  async associateJobToCompany(jobId: string, companyId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating job ${jobId} with company ${companyId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.jobObjectType,
            'companies',
            {
              inputs: [
                {
                  _from: { id: jobId },
                  to: { id: companyId },
                  type: 'custom_to_company',
                },
              ],
            }
          );

          logger.info(`Associated job ${jobId} with company ${companyId}`);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associateJobToCompany(${jobId}, ${companyId})`
    );
  }

  /**
   * Upsert a Placement custom object in HubSpot
   * Uses placement_id_tracker as the unique identifier
   */
  async upsertPlacement(properties: HubSpotPlacementProperties): Promise<string> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Upserting placement with placement_id_tracker: ${properties.placement_id_tracker}`);

        try {
          // Try to find existing placement by placement_id_tracker
          const searchResponse = await this.client.crm.objects.searchApi.doSearch(
            config.hubspot.placementObjectType,
            {
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: config.hubspot.placementIdProperty,
                      operator: FilterOperatorEnum.Eq,
                      value: properties.placement_id_tracker,
                    },
                  ],
                },
              ],
              limit: 1,
              after: '',
              sorts: [],
              properties: [],
            }
          );

          if (searchResponse.results && searchResponse.results.length > 0) {
            // Update existing placement
            const existingPlacementId = searchResponse.results[0].id;
            logger.debug(`Updating existing placement with HubSpot ID: ${existingPlacementId}`);

            await this.client.crm.objects.basicApi.update(
              config.hubspot.placementObjectType,
              existingPlacementId,
              { properties }
            );

            logger.info(`Updated placement ${properties.placement_id_tracker} in HubSpot`);
            return existingPlacementId;
          } else {
            // Create new placement
            logger.debug(`Creating new placement for placement_id_tracker: ${properties.placement_id_tracker}`);

            const createResponse = await this.client.crm.objects.basicApi.create(
              config.hubspot.placementObjectType,
              { properties, associations: [] }
            );

            logger.info(
              `Created placement ${properties.placement_id_tracker} in HubSpot with ID: ${createResponse.id}`
            );
            return createResponse.id;
          }
        } catch (error: unknown) {
          logger.error(`Error upserting placement ${properties.placement_id_tracker}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.upsertPlacement(${properties.placement_id_tracker})`
    );
  }

  /**
   * Upsert a Contact (for placed candidates)
   * Uses candidate_id_tracker or email as the unique identifier
   */
  async upsertContact(properties: HubSpotContactProperties): Promise<string> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Upserting contact with candidate_id_tracker: ${properties.candidate_id_tracker}`);

        try {
          // Try to find existing contact by candidate_id_tracker
          const searchResponse = await this.client.crm.contacts.searchApi.doSearch({
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'candidate_id_tracker',
                    operator: FilterOperatorEnum.Eq,
                    value: properties.candidate_id_tracker,
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
            // Update existing contact
            const existingContactId = searchResponse.results[0].id;
            logger.debug(`Updating existing contact with HubSpot ID: ${existingContactId}`);

            await this.client.crm.contacts.basicApi.update(existingContactId, { properties });

            logger.info(`Updated contact ${properties.candidate_id_tracker} in HubSpot`);
            return existingContactId;
          } else {
            // Create new contact
            logger.debug(`Creating new contact for candidate_id_tracker: ${properties.candidate_id_tracker}`);

            const createResponse = await this.client.crm.contacts.basicApi.create({
              properties,
              associations: [],
            });

            logger.info(
              `Created contact ${properties.candidate_id_tracker} in HubSpot with ID: ${createResponse.id}`
            );
            return createResponse.id;
          }
        } catch (error: unknown) {
          logger.error(`Error upserting contact ${properties.candidate_id_tracker}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.upsertContact(${properties.candidate_id_tracker})`
    );
  }

  /**
   * Associate Placement with Job
   */
  async associatePlacementToJob(placementId: string, jobId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating placement ${placementId} with job ${jobId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.placementObjectType,
            config.hubspot.jobObjectType,
            {
              inputs: [
                {
                  _from: { id: placementId },
                  to: { id: jobId },
                  type: 'custom_to_custom',
                },
              ],
            }
          );

          logger.info(`Associated placement ${placementId} with job ${jobId}`);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associatePlacementToJob(${placementId}, ${jobId})`
    );
  }

  /**
   * Associate Placement with Deal
   */
  async associatePlacementToDeal(placementId: string, dealId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating placement ${placementId} with deal ${dealId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.placementObjectType,
            'deals',
            {
              inputs: [
                {
                  _from: { id: placementId },
                  to: { id: dealId },
                  type: 'custom_to_deal',
                },
              ],
            }
          );

          logger.info(`Associated placement ${placementId} with deal ${dealId}`);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associatePlacementToDeal(${placementId}, ${dealId})`
    );
  }

  /**
   * Associate Placement with Company
   */
  async associatePlacementToCompany(placementId: string, companyId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating placement ${placementId} with company ${companyId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.placementObjectType,
            'companies',
            {
              inputs: [
                {
                  _from: { id: placementId },
                  to: { id: companyId },
                  type: 'custom_to_company',
                },
              ],
            }
          );

          logger.info(`Associated placement ${placementId} with company ${companyId}`);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associatePlacementToCompany(${placementId}, ${companyId})`
    );
  }

  /**
   * Associate Placement with Contact (placed candidate)
   */
  async associatePlacementToContact(placementId: string, contactId: string): Promise<void> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Associating placement ${placementId} with contact ${contactId}`);

        try {
          await this.client.crm.associations.batchApi.create(
            config.hubspot.placementObjectType,
            'contacts',
            {
              inputs: [
                {
                  _from: { id: placementId },
                  to: { id: contactId },
                  type: 'custom_to_contact',
                },
              ],
            }
          );

          logger.info(`Associated placement ${placementId} with contact ${contactId}`);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 409) {
              logger.debug(`Association already exists, skipping`);
              return;
            }
          }
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.associatePlacementToContact(${placementId}, ${contactId})`
    );
  }

  /**
   * Get Job ID by tracker_job_id
   */
  async getJobIdByTrackerJobId(trackerJobId: string): Promise<string | null> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Finding HubSpot Job ID for tracker_job_id: ${trackerJobId}`);

        try {
          const searchResponse = await this.client.crm.objects.searchApi.doSearch(
            config.hubspot.jobObjectType,
            {
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: config.hubspot.jobIdProperty,
                      operator: FilterOperatorEnum.Eq,
                      value: trackerJobId,
                    },
                  ],
                },
              ],
              limit: 1,
              after: '',
              sorts: [],
              properties: [],
            }
          );

          if (searchResponse.results && searchResponse.results.length > 0) {
            const jobId = searchResponse.results[0].id;
            logger.debug(`Found HubSpot Job ID: ${jobId} for tracker_job_id: ${trackerJobId}`);
            return jobId;
          }

          logger.debug(`No HubSpot Job found for tracker_job_id: ${trackerJobId}`);
          return null;
        } catch (error: unknown) {
          logger.error(`Error finding job by tracker_job_id: ${trackerJobId}`, error);
          throw error;
        }
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `HubSpot.getJobIdByTrackerJobId(${trackerJobId})`
    );
  }
}

export const hubspotClient = new HubSpotClient();
