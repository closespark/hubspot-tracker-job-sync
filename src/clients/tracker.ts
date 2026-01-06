import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TrackerOpportunity, TrackerOpportunityResource } from '../types';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

export class TrackerClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.tracker.apiUrl,
      headers: {
        'Authorization': `Bearer ${config.tracker.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getOpportunity(opportunityId: string): Promise<TrackerOpportunity> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Fetching opportunity ${opportunityId} from Tracker`);
        const response = await this.client.get<TrackerOpportunity>(`/opportunities/${opportunityId}`);
        logger.debug(`Successfully fetched opportunity ${opportunityId}`);
        return response.data;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.getOpportunity(${opportunityId})`
    );
  }

  async getOpportunityResource(resourceId: string): Promise<TrackerOpportunityResource> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Fetching opportunity resource ${resourceId} from Tracker`);
        const response = await this.client.get<TrackerOpportunityResource>(`/opportunity-resources/${resourceId}`);
        logger.debug(`Successfully fetched opportunity resource ${resourceId}`);
        return response.data;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.getOpportunityResource(${resourceId})`
    );
  }
}

export const trackerClient = new TrackerClient();
